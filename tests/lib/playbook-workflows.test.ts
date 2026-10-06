import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { load } from "js-yaml";
import {
  createEdgeoneCacheConfig,
  findEdgeoneCacheRule,
} from "../../scripts/prepare-edgeone-pwa-config";
import { withoutDeploymentCredentials } from "../../src/lib/playbook/child-env";
import { getPublicStaticCacheControl } from "../../src/lib/public-static-cache-policy";

type WorkflowStep = {
  name?: string;
  uses?: string;
  if?: string;
  run?: string;
  with?: Record<string, unknown>;
  env?: Record<string, unknown>;
};

type ReleaseJob = {
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
    const release = load(await readFile(".github/workflows/release.yml", "utf8")) as {
      concurrency: {
        group: string;
        "cancel-in-progress": boolean;
        queue: string;
      };
      jobs: {
        prepare: ReleaseJob;
        publish_frontend: ReleaseJob;
        deploy_frontend_edgeone: ReleaseJob;
        publish_image: ReleaseJob;
        publish_backend: ReleaseJob;
      };
    };
    expect(update.on.schedule[0].cron).toBe("17 * * * *");
    expect(update.on.workflow_dispatch.inputs.mode.default).toBe("reconcile");
    const lock = {
      group: "blog26-edgeone-production",
      "cancel-in-progress": false,
      queue: "max",
    };
    expect(release.concurrency).toEqual(lock);
    expect(update.jobs.production.concurrency).toEqual(lock);
    expect(rollback.jobs.rollback.concurrency).toEqual(lock);
    expect(release.jobs.deploy_frontend_edgeone.concurrency).toBeUndefined();
    expect(release.jobs.publish_image.concurrency).toBeUndefined();
    expect(release.jobs.publish_backend.concurrency).toBeUndefined();
    expect(release.jobs.publish_image.needs).toEqual([
      "prepare",
      "prepare_public_content",
      "publish_frontend",
      "deploy_frontend_edgeone",
    ]);
    expect(release.jobs.publish_backend.needs).toEqual([
      "prepare",
      "publish_frontend",
      "deploy_frontend_edgeone",
    ]);
    expect(update.jobs.production.if).toContain("PLAYBOOK_INTEGRATION_ENABLED == 'true'");
    const updateStep = update.jobs.production.steps.find(
      (step) => step.run === "bun scripts/playbook-content-update.ts"
    );
    expect(updateStep?.env?.PLAYBOOK_INTEGRATION_ENABLED).toBe(
      "$" + "{{ vars.PLAYBOOK_INTEGRATION_ENABLED }}"
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
    const applicationReleaseGuard = release.jobs.prepare.steps?.find(
      (step) => step.name === "Require Playbook integration for application releases"
    );
    expect(applicationReleaseGuard?.if).toContain("vars.PLAYBOOK_INTEGRATION_ENABLED != 'true'");
    expect(applicationReleaseGuard?.if).toContain("steps.intent.outputs.should_release == 'true'");
    expect(applicationReleaseGuard?.if).toContain(
      "steps.intent.outputs.frontend_release == 'true' || steps.intent.outputs.backend_release == 'true'"
    );
    expect(applicationReleaseGuard?.shell).toBe("bash");
    expect(applicationReleaseGuard?.run).toContain("exit 1");
    expect(applicationReleaseGuard?.run).toContain(
      "Application releases require PLAYBOOK_INTEGRATION_ENABLED=true"
    );
    expect(release.jobs.publish_image.if).toContain(
      "always() && needs.prepare.result == 'success'"
    );
    expect(release.jobs.publish_backend.if).toContain(
      "always() && needs.prepare.result == 'success'"
    );
    const updateScript = await readFile("scripts/playbook-content-update.ts", "utf8");
    expect(updateScript).toContain('process.env.PLAYBOOK_INTEGRATION_ENABLED === "true"');
    expect(updateScript).toContain("Initial Playbook edition must be deployed through");

    for (const job of [
      release.jobs.prepare,
      release.jobs.publish_frontend,
      release.jobs.deploy_frontend_edgeone,
      update.jobs.production,
      rollback.jobs.rollback,
    ]) {
      const checkout = job.steps?.find((step) => step.uses === "actions/checkout@v7");
      expect(checkout?.with?.["persist-credentials"]).toBe(false);
    }
  });
  test("image builds consume the deployed frontend edition as an immutable input", async () => {
    const release = load(await readFile(".github/workflows/release.yml", "utf8")) as {
      jobs: { publish_image: ReleaseJob };
    };
    const seed = release.jobs.publish_image.steps?.find(
      (step) => step.name === "Download deployed Playbook console seed for image build"
    );
    expect(seed?.uses).toBe("actions/download-artifact@v8");
    expect(seed?.with).toEqual({
      name: "playbook-console-seed-deployed",
      path: "./site/generated",
    });

    const dockerfile = await readFile("Dockerfile", "utf8");
    expect(dockerfile).toContain("ARG PLAYBOOK_REQUIRED=false");
    expect(dockerfile).toContain("ARG PLAYBOOK_EDITION_INPUT_PATH=");
    expect(dockerfile).toContain("ENV PLAYBOOK_REQUIRED=$" + "{PLAYBOOK_REQUIRED}");
    expect(dockerfile).toContain(
      "ENV PLAYBOOK_EDITION_INPUT_PATH=$" + "{PLAYBOOK_EDITION_INPUT_PATH}"
    );

    const prepare = await readFile("scripts/prepare-playbook-edition.ts", "utf8");
    expect(prepare).toContain("PLAYBOOK_EDITION_INPUT_PATH");
    expect(prepare).toContain("validatePlaybookEdition(JSON.parse");
    expect(prepare).toContain("downloadRetainedEdition(inputEdition, manifestUrl, destination)");
    expect(prepare).toContain("const edition = inputSeed");

    const initial = await readFile("scripts/fetch-initial-playbook.ts", "utf8");
    expect(initial).toContain("GITHUB_OUTPUT");
    expect(initial).toContain("bundle_dir=" + "$" + "{directory}");
  });
  test("private source reads use the scoped PAT secret without minting GitHub Apps", async () => {
    const updateText = await readFile(".github/workflows/playbook-content-update.yml", "utf8");
    const rollbackText = await readFile(".github/workflows/playbook-content-rollback.yml", "utf8");
    const releaseText = await readFile(".github/workflows/release.yml", "utf8");
    const update = load(updateText) as { jobs: { production: ReleaseJob } };
    const rollback = load(rollbackText) as { jobs: { rollback: ReleaseJob } };
    const release = load(releaseText) as {
      jobs: {
        publish_frontend: ReleaseJob;
        publish_image: ReleaseJob;
        publish_backend: ReleaseJob;
      };
    };
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
    for (const job of [
      release.jobs.publish_frontend,
      release.jobs.publish_image,
      release.jobs.publish_backend,
    ]) {
      expect(
        job.steps?.some(
          (step) =>
            step.run === "bun scripts/fetch-initial-playbook.ts" &&
            step.env?.GH_TOKEN === sourceTokenSecret
        )
      ).toBe(true);
    }
    for (const source of [updateText, rollbackText, releaseText]) {
      expect(source).not.toContain("create-github-app-token");
      expect(source).not.toContain("PLAYBOOK_SOURCE_APP_");
    }
  });
  test("the public pointer is fixed in code and is not a GitHub Actions setting", async () => {
    const schemaText = await readFile("src/lib/playbook/schema.ts", "utf8");
    const updateText = await readFile(".github/workflows/playbook-content-update.yml", "utf8");
    const releaseText = await readFile(".github/workflows/release.yml", "utf8");
    const update = load(updateText) as { jobs: { production: ReleaseJob } };
    const release = load(releaseText) as {
      jobs: { publish_image: ReleaseJob };
    };
    const updateStep = update.jobs.production.steps?.find(
      (step) => step.run === "bun scripts/playbook-content-update.ts"
    );
    const seedStep = release.jobs.publish_image.steps?.find(
      (step) => step.name === "Prepare the exact Playbook console seed for image build"
    );

    expect(schemaText).toContain(
      'PLAYBOOK_PUBLIC_POINTER_URL = "https://ivanli.cc/_content/playbook/manifest.json"'
    );
    expect(updateStep?.env).not.toHaveProperty("PLAYBOOK_MANIFEST_URL");
    expect(seedStep?.env).not.toHaveProperty("PLAYBOOK_MANIFEST_URL");
    for (const [file, expectedConsumer] of [
      ["scripts/fetch-initial-playbook.ts", "readPublicPointer(PLAYBOOK_PUBLIC_POINTER_URL)"],
      ["scripts/prepare-playbook-edition.ts", "const manifestUrl = PLAYBOOK_PUBLIC_POINTER_URL"],
      [
        "scripts/prepare-console-playbook-seed.ts",
        "options.manifestUrl || PLAYBOOK_PUBLIC_POINTER_URL",
      ],
      ["scripts/playbook-content-update.ts", "const manifestUrl = PLAYBOOK_PUBLIC_POINTER_URL"],
      ["src/lib/playbook/cache.ts", "sync(manifestUrl = PLAYBOOK_PUBLIC_POINTER_URL)"],
    ]) {
      const source = await readFile(file, "utf8");
      expect(source).toContain(expectedConsumer);
      expect(source).not.toContain("process.env.PLAYBOOK_MANIFEST_URL");
    }
  });
  test("initial application bootstrap uses the latest ready stable release without a pinned ID", async () => {
    const releaseText = await readFile(".github/workflows/release.yml", "utf8");
    const release = load(releaseText) as {
      jobs: {
        publish_frontend: ReleaseJob;
        publish_image: ReleaseJob;
        publish_backend: ReleaseJob;
      };
    };
    const initialScript = await readFile("scripts/fetch-initial-playbook.ts", "utf8");
    const sourceTokenSecret = "$" + "{{ secrets.PLAYBOOK_SOURCE_TOKEN }}";
    expect(initialScript).toMatch(/resolveRelease\(reader,\s*\{\s*mode: "reconcile"/u);
    for (const job of [
      release.jobs.publish_frontend,
      release.jobs.publish_image,
      release.jobs.publish_backend,
    ]) {
      const initialStep = job.steps?.find(
        (step) => step.run === "bun scripts/fetch-initial-playbook.ts"
      );
      expect(initialStep?.env).toEqual({ GH_TOKEN: sourceTokenSecret });
    }
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
