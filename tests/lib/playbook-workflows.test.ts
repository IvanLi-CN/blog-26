import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { load } from "js-yaml";
import {
  createEdgeoneCacheConfig,
  findEdgeoneCacheRule,
} from "../../scripts/prepare-edgeone-pwa-config";
import { getPublicStaticCacheControl } from "../../src/lib/public-static-cache-policy";

describe("playbook deployment boundaries", () => {
  test("all production jobs share the same lock and automatic updates start disabled", async () => {
    const update = load(
      await readFile(".github/workflows/playbook-content-update.yml", "utf8")
    ) as {
      on: { schedule: { cron: string }[] };
      jobs: { production: { if: string; concurrency: object } };
    };
    const rollback = load(
      await readFile(".github/workflows/playbook-content-rollback.yml", "utf8")
    ) as { jobs: { rollback: { concurrency: object } } };
    const release = load(await readFile(".github/workflows/release.yml", "utf8")) as {
      jobs: { deploy_frontend_edgeone: { concurrency: object } };
    };
    expect(update.on.schedule[0].cron).toBe("17 * * * *");
    const lock = { group: "blog26-edgeone-production", "cancel-in-progress": false };
    expect(update.jobs.production.concurrency).toEqual(lock);
    expect(rollback.jobs.rollback.concurrency).toEqual(lock);
    expect(release.jobs.deploy_frontend_edgeone.concurrency).toEqual(lock);
    expect(update.jobs.production.if).toContain("PLAYBOOK_CONTENT_UPDATES_ENABLED == 'true'");
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
});
