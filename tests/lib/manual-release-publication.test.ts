import { describe, expect, test } from "bun:test";
import { chmod, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import contractJson from "../../.github/release-contract.json";
import { bytesDigest, fileDigest, sealDirectory } from "../../src/lib/release/artifacts";
import { GitHubError, GitHubRelease } from "../../src/lib/release/github";
import { initialLedger, reserveRelease } from "../../src/lib/release/ledger";
import { contractSchema, digest } from "../../src/lib/release/policy";
import { publishProducts } from "../../src/lib/release/publication";

describe("immutable prerelease publication adapter", () => {
  test("partial asset upload resumes exact bytes with prerelease flags and mapped image tag", async () => {
    const contract = contractSchema.parse(contractJson);
    const root = await mkdtemp(join(tmpdir(), "release-publish-"));
    const entry = {
      ...reserveRelease(initialLedger(contract), {
        sourceSha: "b".repeat(40),
        policyDigest: "c".repeat(64),
        evidenceDigest: "d".repeat(64),
        actor: "owner",
        impact: "minor",
        preparationRunId: 1,
        version: "2.8.0-alpha.1+Build.001",
      }).entry,
      mergeSha: "e".repeat(40),
    };
    const imageBytes = "frozen OCI manifest fixture";
    await writeFile(join(root, "frontend.tar.gz"), "static frozen bytes");
    await writeFile(join(root, "image.oci.tar"), "image frozen bytes");
    const manifest = {
      schemaVersion: 1,
      identity: entry.id,
      productVersion: entry.version,
      sourceSha: entry.mergeSha,
      staticSha256: await fileDigest(join(root, "frontend.tar.gz")),
      imageSha256: await fileDigest(join(root, "image.oci.tar")),
      imageDigest: `sha256:${bytesDigest(Buffer.from(imageBytes))}`,
      staticBuildVersion: "fixture-static",
      imageBuildVersion: "fixture-image",
      playbookEdition: "f".repeat(64),
    };
    await writeFile(join(root, "release-manifest.json"), JSON.stringify(manifest));
    const sealed = await sealDirectory(root, entry, "products");
    const frozen = {
      ...entry,
      products: {
        runId: 1,
        artifactId: 1,
        artifactName: `release-${entry.id}-products`,
        manifestDigest: digest(sealed),
        archiveDigest: `sha256:${"1".repeat(64)}`,
        staticSha256: manifest.staticSha256,
        imageSha256: manifest.imageSha256,
        imageDigest: manifest.imageDigest,
      },
    };
    // A fake registry executable exercises command arguments without Docker or registry writes.
    const registry = await mkdtemp(join(tmpdir(), "release-registry-"));
    const executable = join(registry, "skopeo");
    await writeFile(
      executable,
      `#!/usr/bin/env bun\nimport { existsSync, readFileSync, writeFileSync, appendFileSync } from "node:fs";\nconst root = ${JSON.stringify(registry)};\nif (process.argv[2] === "copy") { appendFileSync(root + "/copies", JSON.stringify(process.argv.slice(2)) + "\\n"); writeFileSync(root + "/registry", ${JSON.stringify(imageBytes)}); }\nelse if (existsSync(root + "/registry")) process.stdout.write(readFileSync(root + "/registry"));\nelse { process.stderr.write("MANIFEST_UNKNOWN"); process.exit(1); }\n`
    );
    await chmod(executable, 0o755);
    const previousPath = process.env.PATH;
    process.env.PATH = `${registry}:${previousPath}`;
    let tagExists = false;
    let release: Record<string, unknown> | undefined;
    const assets: { id: number; name: string; state: string; digest: string }[] = [];
    const requests: unknown[] = [];
    let fail = true;
    const github = new GitHubRelease(contract, "github-actions", {
      request(endpoint, method = "GET", payload) {
        if (endpoint.includes("/git/matching-refs/tags/v?"))
          return [
            tagExists
              ? [
                  {
                    ref: `refs/tags/v${entry.version}`,
                    object: { sha: entry.mergeSha, type: "commit" },
                  },
                ]
              : [],
          ];
        if (endpoint.endsWith("/git/refs") && method === "POST") {
          tagExists = true;
          requests.push(payload);
          return {};
        }
        if (endpoint.includes("/releases/tags/")) {
          if (!release) throw new GitHubError(404);
          return release;
        }
        if (endpoint.endsWith("/releases") && method === "POST") {
          requests.push(payload);
          release = {
            ...JSON.parse(JSON.stringify(payload)),
            id: 10,
            author: { login: "github-actions[bot]" },
          };
          return release;
        }
        if (endpoint.includes("/assets?")) return [assets];
        if (method === "PATCH" && release) {
          requests.push(payload);
          Object.assign(release, payload);
          return release;
        }
        throw new Error(`Unexpected request ${method} ${endpoint}`);
      },
      command(args) {
        const path = args[3];
        if (args[0] !== "release" || args[1] !== "upload" || !path)
          throw new Error("Unexpected publication command");
        const name = basename(path);
        if (name === "release-manifest.json" && fail) {
          fail = false;
          throw new Error("injected second asset failure");
        }
        const expected = sealed.files[name];
        if (!expected) throw new Error("Upload is outside frozen products");
        assets.push({
          id: assets.length + 1,
          name,
          state: "uploaded",
          digest: `sha256:${expected}`,
        });
        return "";
      },
    });
    try {
      await expect(publishProducts(github, frozen, root)).rejects.toThrow("second asset failure");
      expect(assets.map((asset) => asset.name)).toEqual(["frontend.tar.gz"]);
      expect((await publishProducts(github, frozen, root)).imageDigest).toBe(manifest.imageDigest);
      await publishProducts(github, frozen, root);
      expect(assets).toHaveLength(2);
      const copies = (await readFile(join(registry, "copies"), "utf8")).trim().split("\n");
      expect(copies).toHaveLength(1);
      expect(copies[0]).toContain("docker://ghcr.io/ivanli-cn/blog-26:v2.8.0-alpha.1_Build.001");
      expect(copies[0]).not.toContain(":latest");
      expect(requests).toContainEqual(
        expect.objectContaining({ prerelease: true, make_latest: "false", draft: true })
      );
      expect(requests).toContainEqual({ draft: false, make_latest: "false" });
      expect(release?.prerelease).toBe(true);
    } finally {
      process.env.PATH = previousPath;
    }
  });
});
