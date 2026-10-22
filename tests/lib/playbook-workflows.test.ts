import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { load } from "js-yaml";
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

type WorkflowStep = {
  name?: string;
  uses?: string;
  if?: string;
  run?: string;
  with?: Record<string, unknown>;
  env?: Record<string, unknown>;
};

type WorkflowJob = {
  concurrency?: object;
  steps?: WorkflowStep[];
  needs?: unknown;
  if?: string;
};

describe("playbook deployment boundaries", () => {
  test("all production jobs share the same lock and automatic updates follow integration", async () => {
    const update = load(
      await readFile(".github/workflows/playbook-content-update.yml", "utf8")
    ) as {
      on: {
        schedule: { cron: string }[];
        workflow_dispatch: { inputs: { mode: { default: string } } };
      };
      jobs: { production: { if: string; concurrency: object; steps: WorkflowStep[] } };
    };
    const rollback = load(
      await readFile(".github/workflows/playbook-content-rollback.yml", "utf8")
    ) as { jobs: { rollback: { concurrency: object; steps: WorkflowStep[] } } };
    expect(update.on.schedule[0].cron).toBe("17 * * * *");
    expect(update.on.workflow_dispatch.inputs.mode.default).toBe("reconcile");
    const lock = {
      group: "blog26-edgeone-production",
      "cancel-in-progress": false,
      queue: "max",
    };
    expect(update.jobs.production.concurrency).toEqual(lock);
    expect(rollback.jobs.rollback.concurrency).toEqual(lock);
    expect(update.jobs.production.if).toContain("PLAYBOOK_INTEGRATION_ENABLED == 'true'");
    const updateStep = update.jobs.production.steps.find(
      (step) => step.run === "bun scripts/playbook-content-update.ts"
    );
    expect(updateStep?.env?.PLAYBOOK_INTEGRATION_ENABLED).toBe(
      "$" + "{{ vars.PLAYBOOK_INTEGRATION_ENABLED }}"
    );
    expect(updateStep?.env?.PLAYBOOK_SUPPLEMENT_SYNC_TOKEN).toBe(
      "$" + "{{ secrets.PLAYBOOK_SUPPLEMENT_SYNC_TOKEN }}"
    );
    expect(updateStep?.env?.PLAYBOOK_SUPPLEMENT_SYNC_URL).toBe(
      "$" + "{{ vars.PLAYBOOK_SUPPLEMENT_SYNC_URL || '' }}"
    );
    const rollbackPause = rollback.jobs.rollback.steps?.find(
      (step) => step.name === "Require paused automatic updates"
    );
    expect(rollbackPause?.env?.ENABLED).toBe("$" + "{{ vars.PLAYBOOK_INTEGRATION_ENABLED }}");
    expect(rollbackPause?.run).toBe('test "$ENABLED" != true');
    const rollbackStep = rollback.jobs.rollback.steps?.find(
      (step) => step.run === "bun scripts/playbook-content-update.ts"
    );
    expect(rollbackStep?.env?.PLAYBOOK_INTEGRATION_ENABLED).toBe(
      "$" + "{{ vars.PLAYBOOK_INTEGRATION_ENABLED }}"
    );
    expect(rollbackStep?.env?.PLAYBOOK_SUPPLEMENT_SYNC_TOKEN).toBe(
      "$" + "{{ secrets.PLAYBOOK_SUPPLEMENT_SYNC_TOKEN }}"
    );
    expect(rollbackStep?.env?.PLAYBOOK_SUPPLEMENT_SYNC_URL).toBe(
      "$" + "{{ vars.PLAYBOOK_SUPPLEMENT_SYNC_URL || '' }}"
    );
    const updateScript = await readFile("scripts/playbook-content-update.ts", "utf8");
    expect(updateScript).toContain('process.env.PLAYBOOK_INTEGRATION_ENABLED === "true"');
    expect(updateScript).toContain("Initial Playbook edition must be deployed through");
    expect(updateScript).toContain("/api/admin/playbook/supplement");
    expect(updateScript).toContain("PLAYBOOK_SUPPLEMENT_SYNC_TOKEN");
    expect(updateScript).toContain('supplementStatus = "invalid"');
    expect(updateScript).toContain("supplementStatus =");
    expect(updateScript).toContain('"unavailable"');
    expect(updateScript).toContain("Ignoring invalid optional Playbook supplement");
    expect(updateScript).toContain("existing overlay remains deployed");
    expect(updateScript).not.toContain("Playbook supplement verification failed");
    expect(updateScript).toContain("shouldSyncSupplement(current, selected.manifest)");
    expect(updateScript).toContain('supplementStatus === "invalid"');
    expect(updateScript).toContain("public pointer is unavailable");
    expect(updateScript).toContain(
      "Playbook supplement sync deferred; public edition remains deployed"
    );
    expect(updateScript).toContain(
      "Ignoring optional Playbook supplement after merge failure; public edition remains deployed"
    );
    expect(updateScript).toContain("currentSourceMatches");
    expect(updateScript).toContain("supplementStaged = true");
    expect(updateScript).toContain("supplementSynced = syncResult.currentSourceMatches");
    expect(updateScript).toContain("assertPlaybookRendererCompatibility");
    expect(updateScript).toContain("createPlaybookEdition");
    expect(updateScript).toContain("mergePlaybookSupplement(publicEdition, supplementEnvelope)");
    expect(PLAYBOOK_RENDERER_CAPABILITY_PATH).toBe(
      "src/lib/playbook/public-package-capabilities.json"
    );

    for (const job of [update.jobs.production, rollback.jobs.rollback]) {
      const checkout = job.steps?.find((step) => step.uses === "actions/checkout@v7");
      expect(checkout?.with?.["persist-credentials"]).toBe(false);
    }
  });
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
    const dockerfile = await readFile("Dockerfile", "utf8");
    expect(dockerfile).toContain("ARG PLAYBOOK_REQUIRED=false");
    expect(dockerfile).toContain("ARG PLAYBOOK_EDITION_INPUT_PATH=");
    expect(dockerfile).toContain("ENV PLAYBOOK_REQUIRED=$" + "{PLAYBOOK_REQUIRED}");
    expect(dockerfile).toContain(
      "ENV PLAYBOOK_EDITION_INPUT_PATH=$" + "{PLAYBOOK_EDITION_INPUT_PATH}"
    );

    const prepare = await readFile("scripts/prepare-playbook-edition.ts", "utf8");
    expect(prepare).toContain("PLAYBOOK_EDITION_INPUT_PATH");
    expect(prepare).toContain("validatePlaybookEdition(parseJson");
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
  test("private source reads use the scoped PAT secret without minting GitHub Apps", async () => {
    const updateText = await readFile(".github/workflows/playbook-content-update.yml", "utf8");
    const rollbackText = await readFile(".github/workflows/playbook-content-rollback.yml", "utf8");
    const update = load(updateText) as { jobs: { production: WorkflowJob } };
    const rollback = load(rollbackText) as { jobs: { rollback: WorkflowJob } };
    const sourceTokenSecret = "$" + "{{ secrets.PLAYBOOK_SOURCE_TOKEN }}";

    expect(
      update.jobs.production.steps?.find(
        (step) => step.run === "bun scripts/playbook-content-update.ts"
      )?.env?.GH_TOKEN
    ).toBe(sourceTokenSecret);
    expect(
      rollback.jobs.rollback.steps?.find(
        (step) => step.run === "bun scripts/playbook-content-update.ts"
      )?.env?.GH_TOKEN
    ).toBe(sourceTokenSecret);
    for (const source of [updateText, rollbackText]) {
      expect(source).not.toContain("create-github-app-token");
      expect(source).not.toContain("PLAYBOOK_SOURCE_APP_");
    }
  });
  test("the public pointer is fixed in code and is not a GitHub Actions setting", async () => {
    const schemaText = await readFile("src/lib/playbook/schema.ts", "utf8");
    const updateText = await readFile(".github/workflows/playbook-content-update.yml", "utf8");
    const update = load(updateText) as { jobs: { production: WorkflowJob } };
    const updateStep = update.jobs.production.steps?.find(
      (step) => step.run === "bun scripts/playbook-content-update.ts"
    );

    expect(schemaText).toContain(
      'PLAYBOOK_PUBLIC_POINTER_URL = "https://ivanli.cc/_content/playbook/manifest.json"'
    );
    expect(updateStep?.env).not.toHaveProperty("PLAYBOOK_MANIFEST_URL");
    for (const [file, expectedConsumer] of [
      ["scripts/fetch-initial-playbook.ts", "readPublicPointer(PLAYBOOK_PUBLIC_POINTER_URL)"],
      ["scripts/prepare-playbook-edition.ts", "const manifestUrl = PLAYBOOK_PUBLIC_POINTER_URL"],
      [
        "scripts/prepare-console-playbook-seed.ts",
        "options.manifestUrl || PLAYBOOK_PUBLIC_POINTER_URL",
      ],
      ["scripts/playbook-content-update.ts", "const manifestUrl = PLAYBOOK_PUBLIC_POINTER_URL"],
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
