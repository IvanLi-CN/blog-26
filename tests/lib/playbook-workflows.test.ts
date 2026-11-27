import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  createEdgeoneCacheConfig,
  findEdgeoneCacheRule,
} from "../../scripts/prepare-edgeone-pwa-config";
import { withoutDeploymentCredentials } from "../../src/lib/playbook/child-env";
import {
  assertPlaybookRendererCapabilities,
  assertPlaybookRendererCompatibility,
  PLAYBOOK_PUBLIC_PACKAGE_CAPABILITIES,
  PLAYBOOK_RENDERER_CAPABILITY_PATH,
} from "../../src/lib/playbook/renderer-capability";
import { parseSupplementSyncEndpoint } from "../../src/lib/playbook/supplement";
import { getPublicStaticCacheControl } from "../../src/lib/public-static-cache-policy";

describe("playbook deployment boundaries", () => {
  test("content updates gate the dual-visibility package on the deployed renderer", () => {
    expect(() => assertPlaybookRendererCapabilities({})).toThrow(
      "does not support the current public package"
    );
    expect(() =>
      assertPlaybookRendererCapabilities(PLAYBOOK_PUBLIC_PACKAGE_CAPABILITIES)
    ).not.toThrow();
  });
  test("content updates reject missing and incompatible deployed renderer capabilities", async () => {
    const root = await mkdtemp(join(tmpdir(), "playbook-renderer-capabilities-"));
    const capabilityPath = join(root, PLAYBOOK_RENDERER_CAPABILITY_PATH);
    try {
      await expect(assertPlaybookRendererCompatibility(root)).rejects.toThrow(
        "incompatible with the current public package"
      );
      await mkdir(dirname(capabilityPath), { recursive: true });
      await writeFile(
        capabilityPath,
        JSON.stringify({ public_catalog_schema_version: 1, supplement_schema_version: 1 })
      );
      await expect(assertPlaybookRendererCompatibility(root)).rejects.toThrow(
        "incompatible with the current public package"
      );
      await writeFile(capabilityPath, JSON.stringify(PLAYBOOK_PUBLIC_PACKAGE_CAPABILITIES));
      await expect(assertPlaybookRendererCompatibility(root)).resolves.toBeUndefined();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
  test("image builders accept an exact Playbook edition as an immutable input", async () => {
    // The native build consumes the immutable edition; Docker only packages its bytes.
    const bundle = await readFile("scripts/runtime-bundle.ts", "utf8");
    expect(bundle).toContain("PLAYBOOK_REQUIRED");
    expect(bundle).toContain('run("bun", ["run", "build:compiled"], repo, env)');
    const dockerfile = await readFile("Dockerfile", "utf8");
    expect(dockerfile).toContain("COPY --chown=0:0 app/ ./");
    expect(dockerfile).not.toContain("RUN bun");

    const prepare = await readFile("scripts/prepare-playbook-edition.ts", "utf8");
    expect(prepare).toContain("PLAYBOOK_EDITION_INPUT_PATH");
    expect(prepare).toContain("validatePlaybookEdition(parseJson");
    expect(prepare).toContain("{ stripInternalMetadata: true }");
    expect(prepare).toContain("downloadRetainedEdition(inputEdition, manifestUrl, destination)");
    expect(prepare).toContain("const edition = inputSeed");
    expect(prepare).toContain("mergePlaybookSupplement(edition, supplement)");
    expect(prepare).toContain(
      "Ignoring invalid optional Playbook supplement; public edition remains usable"
    );

    const initial = await readFile("scripts/fetch-initial-playbook.ts", "utf8");
    expect(initial).toContain("GITHUB_OUTPUT");
    expect(initial).toContain("bundle_dir=" + "$" + "{directory}");
  });
  test("private supplements stay out of frozen public and backend artifacts", async () => {
    const releaseInputs = await readFile("src/lib/release/inputs.ts", "utf8");
    expect(releaseInputs).not.toContain("PLAYBOOK_SUPPLEMENT_DIR");
    expect(releaseInputs).not.toContain("playbook-private-supplement.json");

    const prepare = await readFile("scripts/prepare-playbook-edition.ts", "utf8");
    const frozenBranch = prepare.slice(
      prepare.indexOf("if (process.env.PLAYBOOK_FROZEN_INPUT_DIR)"),
      prepare.indexOf("const snapshotPath = resolve(")
    );
    expect(frozenBranch).not.toContain("supplement");

    const backendDist = await readFile("scripts/prepare-backend-dist.sh", "utf8");
    expect(backendDist).not.toContain("playbook-private-supplement.json");
    expect(backendDist).toContain('copy_file "scripts/migrate-assistant-discussions.ts"');
  });
  test("supplement sync endpoints require credential-free HTTPS", () => {
    expect(
      parseSupplementSyncEndpoint("https://console.example.test/api/admin/supplement").href
    ).toBe("https://console.example.test/api/admin/supplement");
    expect(() =>
      parseSupplementSyncEndpoint("http://console.example.test/api/admin/supplement")
    ).toThrow("HTTPS");
    expect(() =>
      parseSupplementSyncEndpoint("https://user:password@console.example.test/api/admin/supplement")
    ).toThrow("credential-free HTTPS");
  });
  test("the public pointer is fixed in code and is not a GitHub Actions setting", async () => {
    const schemaText = await readFile("src/lib/playbook/schema.ts", "utf8");

    expect(schemaText).toContain(
      'PLAYBOOK_PUBLIC_POINTER_URL = "https://ivanli.cc/_content/playbook/manifest.json"'
    );
    for (const [file, expectedConsumer] of [
      ["scripts/fetch-initial-playbook.ts", "readPublicPointer(PLAYBOOK_PUBLIC_POINTER_URL)"],
      ["scripts/prepare-playbook-edition.ts", "const manifestUrl = PLAYBOOK_PUBLIC_POINTER_URL"],
      [
        "scripts/prepare-console-playbook-seed.ts",
        "options.manifestUrl || PLAYBOOK_PUBLIC_POINTER_URL",
      ],
      ["src/lib/playbook/cache.ts", "manifestUrl = PLAYBOOK_PUBLIC_POINTER_URL"],
    ]) {
      const source = await readFile(file, "utf8");
      expect(source).toContain(expectedConsumer);
      expect(source).not.toContain("process.env.PLAYBOOK_MANIFEST_URL");
    }
  });
  test("initial application bootstrap uses the latest ready stable release without a pinned ID", async () => {
    const initialScript = await readFile("scripts/fetch-initial-playbook.ts", "utf8");
    expect(initialScript).toMatch(/resolveRelease\(reader,\s*\{\s*mode: "reconcile"/u);
    expect(initialScript).toContain('mode: "release"');
    expect(initialScript).toContain(
      "Ignoring invalid optional Playbook supplement; public bundle remains usable"
    );
    expect(initialScript).toContain(
      "await rm(supplementDirectory, { recursive: true, force: true })"
    );
    expect(initialScript).not.toContain("Published Playbook supplement assets are invalid");
  });
  test("pointer revalidates, version files are immutable and package resources cannot execute", () => {
    const digest = "a".repeat(64);
    const root = `_content/playbook/v3.0.0/${digest}`;
    const config = createEdgeoneCacheConfig("", [
      "index.html",
      "playbook/index.html",
      "playbook/topics/delivery/index.html",
      "_content/playbook/manifest.json",
      `${root}/catalog.json`,
      `${root}/policies/release/SKILL.md`,
    ]);
    expect(
      findEdgeoneCacheRule(config, "/_content/playbook/manifest.json")?.headers[0].value
    ).toContain("must-revalidate");
    expect(findEdgeoneCacheRule(config, `/${root}/catalog.json`)?.headers[0].value).toContain(
      "immutable"
    );
    const resourceHeaders = findEdgeoneCacheRule(
      config,
      `/${root}/policies/release/SKILL.md`
    )?.headers;
    expect(resourceHeaders).toContainEqual({ key: "Content-Disposition", value: "attachment" });
    expect(resourceHeaders).toContainEqual({
      key: "Content-Type",
      value: "text/plain; charset=utf-8",
    });
    expect(getPublicStaticCacheControl(`/${root}/catalog.json`, "catalog.json")).toContain(
      "immutable"
    );
  });
  test("renderer child processes cannot inherit deployment credentials", () => {
    const env = withoutDeploymentCredentials(
      {
        PATH: "/bin",
        EDGEONE_API_TOKEN: "edge-token",
        EDGEONE_PROJECT_NAME: "blog",
        GH_TOKEN: "github-token",
        GITHUB_TOKEN: "github-actions-token",
      },
      { PUBLIC_SITE_URL: "https://ivanli.cc" }
    );
    expect(env).toEqual({ PATH: "/bin", PUBLIC_SITE_URL: "https://ivanli.cc" });
  });
  test("GitHub source reads can receive only their scoped source token", async () => {
    const source = await readFile("src/lib/playbook/github.ts", "utf8");
    expect(source).toContain(
      "env: { ...withoutDeploymentCredentials(process.env), GH_TOKEN: token }"
    );
    expect(source).not.toContain("env: { ...process.env, GH_TOKEN: token }");
  });
});
