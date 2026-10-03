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
  with?: Record<string, unknown>;
};

type ReleaseJob = {
  concurrency?: object;
  steps?: WorkflowStep[];
  needs?: unknown;
  if?: string;
};

describe("playbook deployment boundaries", () => {
  test("all production jobs share the same lock and automatic updates start disabled", async () => {
    const update = load(
      await readFile(".github/workflows/playbook-content-update.yml", "utf8")
    ) as {
      on: { schedule: { cron: string }[] };
      jobs: { production: { if: string; concurrency: object; steps: WorkflowStep[] } };
    };
    const rollback = load(
      await readFile(".github/workflows/playbook-content-rollback.yml", "utf8")
    ) as { jobs: { rollback: { concurrency: object; steps: WorkflowStep[] } } };
    const release = load(await readFile(".github/workflows/release.yml", "utf8")) as {
      jobs: {
        prepare: ReleaseJob;
        publish_frontend: ReleaseJob;
        deploy_frontend_edgeone: ReleaseJob;
        publish_image: ReleaseJob;
        publish_backend: ReleaseJob;
      };
    };
    expect(update.on.schedule[0].cron).toBe("17 * * * *");
    const lock = { group: "blog26-edgeone-production", "cancel-in-progress": false };
    expect(update.jobs.production.concurrency).toEqual(lock);
    expect(rollback.jobs.rollback.concurrency).toEqual(lock);
    expect(release.jobs.deploy_frontend_edgeone.concurrency).toEqual(lock);
    expect(release.jobs.publish_image.concurrency).toEqual(lock);
    expect(release.jobs.publish_backend.concurrency).toEqual(lock);
    expect(release.jobs.publish_image.needs).toEqual([
      "prepare",
      "publish_frontend",
      "deploy_frontend_edgeone",
    ]);
    expect(release.jobs.publish_backend.needs).toEqual([
      "prepare",
      "publish_frontend",
      "deploy_frontend_edgeone",
    ]);
    expect(update.jobs.production.if).toContain("PLAYBOOK_CONTENT_UPDATES_ENABLED == 'true'");

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
    expect(prepare).toContain(
      "Playbook edition input does not match the current renderer or snapshot"
    );
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
