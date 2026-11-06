import { expect, test } from "bun:test";
import { chmod, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import contractJson from "../../.github/release-contract.json";
import { bytesDigest } from "../../src/lib/release/artifacts";
import { GitHubRelease } from "../../src/lib/release/github";
import { initialLedger, type ReleaseEntry, reserveRelease } from "../../src/lib/release/ledger";
import { contractSchema } from "../../src/lib/release/policy";
import { assertProductionOwner } from "../../src/lib/release/publication";

async function fixture(
  run: (context: {
    check(): Promise<void>;
    prior: ReleaseEntry;
    setVersion(body: string, status?: number): void;
    setPointer(body: string): void;
    removeImage(): Promise<void>;
  }) => Promise<void>,
  requirePinnedLabels = false
) {
  const contract = contractSchema.parse({
    ...contractJson,
    bootstrap: { ...contractJson.bootstrap, version: "4.1.6" },
  });
  const reserved = reserveRelease(initialLedger(contract), {
    sourceSha: "b".repeat(40),
    policyDigest: "c".repeat(64),
    evidenceDigest: "d".repeat(64),
    actor: "owner",
    impact: "patch",
    preparationRunId: 1,
    version: "4.1.7",
  }).entry;
  const manifest = "known frozen image manifest";
  const imageDigest = `sha256:${bytesDigest(Buffer.from(manifest))}`;
  const prior: ReleaseEntry = {
    ...reserved,
    stage: "complete",
    mergeSha: "e".repeat(40),
    latestVerified: true,
    products: {
      runId: 1,
      artifactId: 1,
      artifactName: `release-${reserved.id}-products`,
      manifestDigest: "1".repeat(64),
      archiveDigest: `sha256:${"2".repeat(64)}`,
      staticSha256: "3".repeat(64),
      imageSha256: "4".repeat(64),
      imageDigest,
    },
  };
  const entry = { ...reserved, version: "4.1.8", mergeSha: "f".repeat(40) };
  const ledger = { ...initialLedger(contract), entries: [prior] };
  const root = await mkdtemp(join(tmpdir(), "production-owner-"));
  const executable = join(root, "skopeo");
  await writeFile(
    executable,
    `#!/usr/bin/env bun\nif(process.argv.includes("--raw"))process.stdout.write(${JSON.stringify(manifest)});else { if (${requirePinnedLabels} && process.argv.at(-1) !== ${JSON.stringify(`docker://${contract.products.image.repository}@${imageDigest}`)}) { process.stderr.write("Labels must describe the inspected immutable manifest"); process.exit(1); } process.stdout.write(${JSON.stringify(JSON.stringify({ "org.opencontainers.image.version": prior.version, "org.opencontainers.image.revision": prior.mergeSha }))}); }\n`
  );
  await chmod(executable, 0o755);
  const oldPath = process.env.PATH;
  const oldSite = process.env.PUBLIC_SITE_URL;
  const oldFetch = globalThis.fetch;
  process.env.PATH = `${root}:${oldPath}`;
  process.env.PUBLIC_SITE_URL = "https://production-owner.invalid/";
  let versionBody = "";
  let versionStatus = 200;
  let pointerBody = JSON.stringify({
    schemaVersion: 1,
    source: { repository: "IvanLi-CN/style-playbook-skills", tag: "v2.4.7" },
    rendererCommit: prior.mergeSha,
    editionDigest: "a".repeat(64),
  });
  globalThis.fetch = (async (url: string | URL | Request) =>
    String(url).endsWith("version.json")
      ? new Response([204, 205].includes(versionStatus) ? null : versionBody, {
          status: versionStatus,
        })
      : new Response(pointerBody)) as typeof fetch;
  try {
    await run({
      check: () =>
        assertProductionOwner(new GitHubRelease(contract, "github-actions"), ledger, entry),
      prior,
      setVersion(body, status = 200) {
        versionBody = body;
        versionStatus = status;
      },
      setPointer(body) {
        pointerBody = body;
      },
      async removeImage() {
        await writeFile(
          executable,
          '#!/usr/bin/env bun\nprocess.stderr.write("MANIFEST_UNKNOWN");process.exit(1);\n'
        );
      },
    });
  } finally {
    process.env.PATH = oldPath;
    if (oldSite === undefined) delete process.env.PUBLIC_SITE_URL;
    else process.env.PUBLIC_SITE_URL = oldSite;
    globalThis.fetch = oldFetch;
  }
}

test("empty version metadata recovers only with matching completed image and renderer", async () => {
  await fixture(async ({ check }) => {
    await expect(check()).resolves.toBeUndefined();
  });
});

test("ownership labels are read from the exact inspected manifest digest", async () => {
  await fixture(async ({ check }) => {
    await expect(check()).resolves.toBeUndefined();
  }, true);
});

for (const status of [201, 204, 205, 206]) {
  test(`empty HTTP ${status} metadata cannot enter HTTP 200 recovery`, async () => {
    await fixture(async ({ check, setVersion }) => {
      setVersion("", status);
      await expect(check()).rejects.toThrow();
    });
  });
}

test("empty metadata cannot authorize an unknown renderer", async () => {
  await fixture(async ({ check, setPointer }) => {
    setPointer(JSON.stringify({ rendererCommit: "9".repeat(40), editionDigest: "a".repeat(64) }));
    await expect(check()).rejects.toThrow();
  });
});

test("empty metadata requires the frozen image digest, not just its version labels", async () => {
  await fixture(async ({ check, prior }) => {
    if (!prior.products) throw new Error("Fixture frozen products are missing");
    prior.products.imageDigest = `sha256:${"9".repeat(64)}`;
    await expect(check()).rejects.toThrow();
  });
});

test("empty metadata requires a completed stable release", async () => {
  await fixture(async ({ check, prior }) => {
    prior.stage = "published";
    await expect(check()).rejects.toThrow();
  });
});

test("empty metadata requires verified latest promotion", async () => {
  await fixture(async ({ check, prior }) => {
    prior.latestVerified = false;
    await expect(check()).rejects.toThrow();
  });
});

test("empty metadata rejects a malformed Playbook pointer", async () => {
  await fixture(async ({ check, setPointer }) => {
    setPointer(JSON.stringify({ rendererCommit: "e".repeat(40) }));
    await expect(check()).rejects.toThrow();
  });
});

test("empty metadata cannot recover without an independently verified image", async () => {
  await fixture(async ({ check, removeImage }) => {
    await removeImage();
    await expect(check()).rejects.toThrow();
  });
});

test("nonempty malformed metadata remains a hard failure", async () => {
  await fixture(async ({ check, setVersion }) => {
    setVersion("invalid");
    await expect(check()).rejects.toThrow();
  });
});

test("valid version metadata preserves the existing owner check", async () => {
  await fixture(async ({ check, prior, setVersion }) => {
    setVersion(
      JSON.stringify({
        productVersion: prior.version,
        sourceSha: prior.mergeSha,
        buildVersion: "fixture",
      })
    );
    await expect(check()).resolves.toBeUndefined();
  });
});

test("valid metadata from a newer product cannot be replaced", async () => {
  await fixture(async ({ check, prior, setVersion }) => {
    setVersion(
      JSON.stringify({
        productVersion: "4.1.9",
        sourceSha: prior.mergeSha,
        buildVersion: "fixture",
      })
    );
    await expect(check()).rejects.toThrow();
  });
});

test("the explicit unversioned bootstrap exception remains unchanged", async () => {
  await fixture(async ({ check, setVersion, setPointer }) => {
    setVersion("", 404);
    setPointer(JSON.stringify({ rendererCommit: contractJson.bootstrap.sourceSha }));
    await expect(check()).resolves.toBeUndefined();
  });
});
