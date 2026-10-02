import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import PlaybookPage from "../../src/components/playbook/PlaybookPage";
import { downloadRetainedEdition, writePublicEdition } from "../../src/lib/playbook/artifacts";
import { createPlaybookEdition, readPublicArchive } from "../../src/lib/playbook/bundle";
import {
  PLAYBOOK_POLL_INTERVAL_MS,
  PlaybookStore,
  playbookVersionPath,
  validatePlaybookEdition,
} from "../../src/lib/playbook/cache";
import { publicFixtureCatalog, publicFixtureSearch } from "../../src/lib/playbook/fixture";
import { encodeJson, parseManifest, sha256 } from "../../src/lib/playbook/manifest";
import {
  adoptionDecision,
  deployContent,
  type ReleaseReader,
  resolveRelease,
  type SourceRelease,
} from "../../src/lib/playbook/release";
import { assertPublicCatalog } from "../../src/lib/playbook/schema";
import {
  buildPlaybookIndex,
  queryPlaybookSearch,
  tokenizePlaybookText,
} from "../../src/lib/playbook/search";
import { handlePlaybookRequest } from "../../src/server/public-api/playbook";
import { makeArchive, makePublicBundle } from "./playbook-fixture";

const roots: string[] = [];
async function temp() {
  const root = await mkdtemp(join(tmpdir(), "playbook-test-"));
  roots.push(root);
  return root;
}
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("playbook-public-contract", () => {
  test("validates the complete public catalog and rejects internal fields, relationships and schema", () => {
    const bundle = makePublicBundle();
    expect(
      validatePlaybookEdition(bundle.edition).catalog.topic_details[0].policy_skills[0].resources
    ).toHaveLength(1);
    expect(() => parseManifest({ ...bundle.manifest, schemaVersion: 2 })).toThrow();
    const privateCatalog = structuredClone(publicFixtureCatalog);
    privateCatalog.snapshot.projects[0].visibility = "private";
    expect(() => assertPublicCatalog(privateCatalog)).toThrow();
    const invalid = structuredClone(publicFixtureCatalog);
    invalid.topic_details[0].policy_skills[0].frontmatter.secret = "never publish";
    expect(() => assertPublicCatalog(invalid)).toThrow("Internal field");
    const metadata = structuredClone(publicFixtureCatalog);
    metadata.project_details[0].doc_metadata.push({ key: "Repo Path", value: "/private/checkout" });
    expect(() => assertPublicCatalog(metadata)).toThrow("Internal metadata");
    const relation = structuredClone(publicFixtureCatalog);
    relation.topic_details[0].policy_skills[0].summary.policy_dependencies = ["private-rule"];
    expect(() => assertPublicCatalog(relation)).toThrow();
  });
  test("rejects bad digests, traversal, links and duplicate tar entries without extraction", () => {
    const bundle = makePublicBundle();
    expect(() =>
      readPublicArchive(bundle.archive, {
        ...bundle.manifest,
        bundle: { ...bundle.manifest.bundle, sha256: "0".repeat(64) },
      })
    ).toThrow("integrity");
    for (const entry of [
      { path: "../catalog.json", content: "{}" },
      { path: "catalog.json", content: "{}", kind: "2" },
    ]) {
      const archive = makeArchive([entry]);
      expect(() =>
        readPublicArchive(archive, {
          ...bundle.manifest,
          bundle: { ...bundle.manifest.bundle, size: archive.length, sha256: sha256(archive) },
        })
      ).toThrow("Unsafe");
    }
    const archive = makeArchive([...bundle.files, bundle.files[0]]);
    expect(() =>
      readPublicArchive(archive, {
        ...bundle.manifest,
        bundle: { ...bundle.manifest.bundle, size: archive.length, sha256: sha256(archive) },
      })
    ).toThrow("Unsafe");
  });
  test("rejects nested internal key variants without excluding ordinary public fields", () => {
    for (const key of ["repoPath", "API-Key", "accessToken", "private.key", "Thread ID"])
      for (const target of ["frontmatter", "stack"]) {
        const catalog = structuredClone(publicFixtureCatalog);
        const nested = { public: [{ [key]: "must remain private" }] };
        if (target === "frontmatter")
          catalog.topic_details[0].policy_skills[0].frontmatter.extra = nested;
        else catalog.project_details[0].stack = nested;
        expect(() => assertPublicCatalog(catalog)).toThrow("Internal field");
      }
    const catalog = structuredClone(publicFixtureCatalog);
    catalog.topic_details[0].policy_skills[0].frontmatter.metadata = { code: "public sample" };
    expect(assertPublicCatalog(catalog)).toEqual(catalog);
  });
  test("rejects resource paths that collide with generated SKILL.md or other files", () => {
    for (const paths of [["SKILL.md"], ["SKILL.md/foo"], ["scripts", "scripts/verify.sh"]]) {
      const catalog = structuredClone(publicFixtureCatalog);
      catalog.topic_details[0].policy_skills[0].resources = paths.map((path) => ({
        path,
        kind: "text",
        content: "public resource",
      }));
      expect(() => assertPublicCatalog(catalog)).toThrow("resource path collision");
    }
  });
  test("renders package Mermaid as inert code in Topic and Policy SSR", () => {
    const catalog = structuredClone(publicFixtureCatalog);
    const markdown = "\n```mermaid\ngraph TD; A-->B;\nclick A call packageCallback()\n```";
    catalog.topic_details[0].sections[0].markdown += markdown;
    catalog.topic_details[0].policy_skills[0].instruction_markdown += markdown;
    const { edition } = makePublicBundle("v3.0.0", "100", catalog);
    for (const path of ["topics/delivery", "policies/safe-release"]) {
      const html = renderToStaticMarkup(createElement(PlaybookPage, { edition, path }));
      expect(html).toContain("packageCallback()");
      expect(html).toContain("<pre");
      expect(html).not.toContain("mermaid-container");
      expect(html).not.toContain("<svg");
    }
  });
  test("accepts known public Policy search pages and real anchors with one complete canonical document", () => {
    const search = structuredClone(publicFixtureSearch);
    search.documents.push(
      {
        ...search.documents[0],
        id: "policy:safe-release",
        route: "/policies/safe-release/",
        body: "summary",
      },
      {
        ...search.documents[0],
        id: "policy-install",
        kind: "section",
        route: "/policies/safe-release/",
        section_id: "installation",
      },
      {
        ...search.documents[0],
        id: "policy-resources",
        kind: "section",
        route: "/policies/safe-release/#resources",
      }
    );
    const { edition } = makePublicBundle("v3.0.0", "100", publicFixtureCatalog, search);
    expect(validatePlaybookEdition(edition)).toEqual(edition);
    const policy = edition.search.documents.filter(
      (document) => document.id === "policy:safe-release"
    );
    expect(policy).toHaveLength(1);
    expect(policy[0].body).toBe(
      publicFixtureCatalog.topic_details[0].policy_skills[0].instruction_markdown
    );
    expect(
      edition.search.documents.find((document) => document.id === "policy-install")?.route
    ).toBe("/playbook/policies/safe-release/#installation");
    for (const route of ["/policies/private-rule/", "/policies/safe-release/#missing"]) {
      const invalid = structuredClone(search);
      invalid.documents[invalid.documents.length - 1].route = route;
      expect(() => makePublicBundle("v3.0.0", "100", publicFixtureCatalog, invalid)).toThrow(
        "Search references"
      );
    }
    const collision = structuredClone(publicFixtureSearch);
    collision.documents[0].id = "policy:safe-release";
    expect(() => makePublicBundle("v3.0.0", "100", publicFixtureCatalog, collision)).toThrow(
      "Conflicting Policy"
    );
  });
  test("sanitizes Markdown, preserves anchors and renders useful SSR without fetching", () => {
    const catalog = structuredClone(publicFixtureCatalog);
    catalog.topic_details[0].sections[0].markdown +=
      '\n<script>alert("package")</script><img src="x" onerror="bad()" />\n[Reference][project]\n\n[project]: /projects/sample-project#architecture\n\n<a href="/topics/delivery#release">HTML reference</a>';
    const { edition } = makePublicBundle("v3.0.0", "100", catalog);
    const html = renderToStaticMarkup(
      createElement(PlaybookPage, { edition, path: "topics/delivery" })
    );
    expect(html).toContain("稳定发布");
    expect(html).toContain('id="release"');
    expect(html).toContain("/playbook/projects/sample-project/#architecture");
    expect(html).toContain('href="/playbook/topics/delivery/#release"');
    expect(
      html.match(/href="\/playbook\/projects\/sample-project\/#architecture"/gu)?.length
    ).toBeGreaterThanOrEqual(2);
    expect(html).not.toContain("<script");
    expect(html).not.toContain("onerror");
  });
});

function sourceReader(bundles: ReturnType<typeof makePublicBundle>[]): ReleaseReader {
  const releases: SourceRelease[] = bundles.map((bundle, i) => ({
    id: Number(bundle.manifest.source.releaseId),
    tag_name: bundle.manifest.source.tag,
    draft: false,
    prerelease: false,
    published_at: bundle.manifest.source.publishedAt,
    assets: [
      {
        id: i * 2 + 1,
        name: "playbook-public-manifest.json",
        size: encodeJson(bundle.manifest).length,
      },
      { id: i * 2 + 2, name: "playbook-public.tar.gz", size: bundle.archive.length },
    ],
  }));
  return {
    list: async () => releases,
    release: async (id) => {
      const release = releases.find((item) => String(item.id) === id);
      if (!release) throw new Error("Unknown fixture release");
      return release;
    },
    commit: async () => "a".repeat(40),
    asset: async (id) =>
      id % 2
        ? Buffer.from(encodeJson(bundles[(id - 1) / 2].manifest))
        : bundles[id / 2 - 1].archive,
  };
}
describe("playbook-dispatch-and-reconcile", () => {
  test("selects highest ready SemVer and does not trust notification parameters", async () => {
    const bundles = [makePublicBundle("v3.9.0", "99"), makePublicBundle("v3.10.0", "100")];
    const reader = sourceReader(bundles);
    expect((await resolveRelease(reader, { mode: "reconcile" }))?.manifest.source.tag).toBe(
      "v3.10.0"
    );
    const input = {
      mode: "release" as const,
      source_repository: bundles[1].manifest.source.repository,
      source_release_id: "100",
      source_tag: "v3.10.0",
      source_sha: "a".repeat(40),
      bundle_sha256: bundles[1].manifest.bundle.sha256,
    };
    expect((await resolveRelease(reader, input))?.manifest.source.releaseId).toBe("100");
    await expect(resolveRelease(reader, { ...input, source_sha: "b".repeat(40) })).rejects.toThrow(
      "identity mismatch"
    );
    await expect(
      resolveRelease(reader, { ...input, source_repository: "attacker/repo" })
    ).rejects.toThrow();
    await expect(
      resolveRelease(reader, { mode: "reconcile", source_tag: "v3.10.0" })
    ).rejects.toThrow();
    for (const state of ["draft", "prerelease"] as const) {
      const release = await reader.release("100");
      await expect(
        resolveRelease({ ...reader, release: async () => ({ ...release, [state]: true }) }, input)
      ).rejects.toThrow("not stable");
    }
  });
  test("skips duplicates and late releases, rejects republished content", () => {
    const current = makePublicBundle();
    expect(adoptionDecision(current.manifest, current.edition.edition)).toBe("duplicate");
    expect(
      adoptionDecision(makePublicBundle("v2.9.0", "99").manifest, current.edition.edition)
    ).toBe("older");
    expect(() =>
      adoptionDecision(
        { ...current.manifest, bundle: { ...current.manifest.bundle, sha256: "0".repeat(64) } },
        current.edition.edition
      )
    ).toThrow();
    expect(() =>
      adoptionDecision(
        {
          ...current.manifest,
          source: { ...current.manifest.source, publishedAt: "2026-09-02T00:00:00Z" },
        },
        current.edition.edition
      )
    ).toThrow();
  });
});

describe("playbook-build-deploy-adapter", () => {
  test("rebuilds after a renderer changes and only deploys the current input", async () => {
    let current = makePublicBundle("v3.0.0", "100").edition.edition;
    const next = makePublicBundle("v3.1.0", "101");
    const renderers: string[] = [];
    let deployed = "";
    const outcome = await deployContent(
      {
        current: async () => current,
        build: async (_manifest, renderer) => {
          renderers.push(renderer);
          if (renderers.length === 1) current = { ...current, rendererCommit: "c".repeat(40) };
          return { ...next.edition.edition, rendererCommit: renderer };
        },
        deploy: async (edition) => {
          deployed = edition.rendererCommit;
        },
        verify: async () => {
          /* Successful mock operation. */
        },
      },
      next.manifest,
      { automaticUpdatesEnabled: true }
    );
    expect(outcome).toBe("deployed");
    expect(renderers).toEqual(["b".repeat(40), "c".repeat(40)]);
    expect(deployed).toBe("c".repeat(40));
  });
  test("paused updates and explicit rollback enforce production boundaries", async () => {
    const next = makePublicBundle();
    let calls = 0;
    const adapter = {
      current: async () => next.edition.edition,
      build: async () => {
        calls++;
        return next.edition.edition;
      },
      deploy: async () => {
        /* Successful mock operation. */
      },
      verify: async () => {
        /* Successful mock operation. */
      },
    };
    expect(await deployContent(adapter, next.manifest, { automaticUpdatesEnabled: false })).toBe(
      "paused"
    );
    await expect(
      deployContent(adapter, next.manifest, { rollback: true, automaticUpdatesEnabled: true })
    ).rejects.toThrow("Pause");
    expect(calls).toBe(0);
    expect(
      await deployContent(adapter, next.manifest, {
        rollback: true,
        automaticUpdatesEnabled: false,
      })
    ).toBe("deployed");
  });
  test("build failure never calls deployment", async () => {
    let deployed = false;
    const current = makePublicBundle();
    await expect(
      deployContent(
        {
          current: async () => current.edition.edition,
          build: async () => {
            throw new Error("failed build");
          },
          deploy: async () => {
            deployed = true;
          },
          verify: async () => {
            /* Successful mock operation. */
          },
        },
        makePublicBundle("v3.1.0", "101").manifest,
        { automaticUpdatesEnabled: true }
      )
    ).rejects.toThrow("failed build");
    expect(deployed).toBe(false);
  });
});

describe("playbook-artifact-verification", () => {
  test("renderer and article snapshot changes create different immutable identities; artifacts reproduce", async () => {
    const bundle = makePublicBundle();
    const files = readPublicArchive(bundle.archive, bundle.manifest);
    expect(
      createPlaybookEdition(files, bundle.manifest, "c".repeat(40), "{}\n").edition.editionDigest
    ).not.toBe(bundle.edition.edition.editionDigest);
    expect(
      createPlaybookEdition(files, bundle.manifest, "b".repeat(40), '{"posts":[]}\n').edition
        .editionDigest
    ).not.toBe(bundle.edition.edition.editionDigest);
    const root = await temp();
    await writeFile(join(root, "playbook-public.tar.gz"), bundle.archive);
    await writeFile(join(root, "playbook-public-manifest.json"), encodeJson(bundle.manifest));
    await writePublicEdition(root, bundle.edition, root, "{}\n");
    const fetcher = async (url: string) =>
      new Response(await readFile(join(root, new URL(url).pathname)));
    const adopted = await downloadRetainedEdition(
      bundle.edition.edition,
      "https://blog.test/_content/playbook/manifest.json",
      join(root, "retained"),
      fetcher
    );
    expect(adopted.edition.editionDigest).toBe(bundle.edition.edition.editionDigest);
    expect(
      await readFile(
        join(
          root,
          playbookVersionPath(bundle.edition.edition),
          "policies/safe-release/scripts/verify.sh"
        ),
        "utf8"
      )
    ).toContain("echo verify");
  });
});

describe("playbook-cache-http-ssr", () => {
  test("starts immediately, polls at 300 seconds and stops with a controlled scheduler", async () => {
    const root = await temp();
    const next = makePublicBundle();
    let tick = () => {
      /* No scheduled task before start. */
    };
    let interval = 0;
    let cancelled = false;
    const store = new PlaybookStore(
      root,
      async (url) =>
        url.endsWith("manifest.json")
          ? Response.json(next.edition.edition)
          : new Response(
              encodeJson(url.endsWith("catalog.json") ? next.edition.catalog : next.edition.search)
            ),
      (run, ms) => {
        tick = run;
        interval = ms;
        return () => {
          cancelled = true;
        };
      }
    );
    store.start();
    await store.sync();
    expect(store.current?.edition.source.tag).toBe("v3.0.0");
    expect(interval).toBe(300_000);
    tick();
    await store.sync();
    store.stop();
    expect(cancelled).toBe(true);
  });
  test("restores compatible persisted content and does not overwrite it with the image seed", async () => {
    const root = await temp();
    const current = makePublicBundle();
    const next = makePublicBundle("v3.1.0", "101");
    const store = new PlaybookStore(root);
    await store.adopt(current.edition);
    await store.adopt(next.edition);
    const seed = join(root, "seed.json");
    await writeFile(seed, encodeJson(current.edition));
    const restored = new PlaybookStore(root);
    await restored.load(seed);
    expect(restored.current?.edition.source.tag).toBe("v3.1.0");
    const response = await handlePlaybookRequest(
      new Request(
        `https://console.test/api/public/playbook/search-index?edition=${current.edition.edition.editionDigest}`
      ),
      "/playbook/search-index",
      restored
    );
    expect(response.status).toBe(200);
    expect(sha256(await response.text())).toBe(
      current.edition.edition.files.find((file) => file.path === "search-documents.json")?.sha256
    );
    expect(
      (
        await handlePlaybookRequest(
          new Request(
            `https://console.test/api/public/playbook/search-index?edition=${"0".repeat(64)}`
          ),
          "/playbook/search-index",
          restored
        )
      ).status
    ).toBe(409);
    const resource = await handlePlaybookRequest(
      new Request(
        `https://console.test/api/public/playbook/resource?edition=${current.edition.edition.editionDigest}&policy=safe-release&path=scripts%2Fverify.sh`
      ),
      "/playbook/resource",
      restored
    );
    expect(resource.headers.get("content-type")).toContain("text/plain");
    expect(await resource.text()).toContain("echo verify");
  });
  test("sync is single-flight, adopts whole editions and keeps old data on incompatible downloads", async () => {
    const root = await temp();
    const current = makePublicBundle();
    const next = makePublicBundle("v3.1.0", "101");
    let fail = false;
    let requests = 0;
    const store = new PlaybookStore(root, async (url) => {
      requests++;
      if (fail) return Response.json({ schemaVersion: 2 });
      if (url.endsWith("manifest.json")) return Response.json(next.edition.edition);
      return new Response(
        encodeJson(url.endsWith("catalog.json") ? next.edition.catalog : next.edition.search)
      );
    });
    await store.adopt(current.edition);
    await Promise.all([store.sync(), store.sync()]);
    expect(requests).toBe(3);
    expect(store.current?.edition.source.tag).toBe("v3.1.0");
    expect(store.getEdition(current.edition.edition.editionDigest)).toBeDefined();
    fail = true;
    await expect(store.sync()).rejects.toThrow();
    expect(store.current?.edition.source.tag).toBe("v3.1.0");
    expect(PLAYBOOK_POLL_INTERVAL_MS).toBe(300_000);
  });
  test("console follows a verified published rollback pointer and persists both editions", async () => {
    const root = await temp();
    const oldCatalog = structuredClone(publicFixtureCatalog);
    oldCatalog.topic_details[0].sections[0].markdown = "Restored stable content";
    const rollback = makePublicBundle("v3.0.0", "100", oldCatalog);
    const newer = makePublicBundle("v3.1.0", "101");
    let requests = 0;
    const store = new PlaybookStore(root, async (url) => {
      requests++;
      if (url.endsWith("manifest.json")) return Response.json(rollback.edition.edition);
      return new Response(
        encodeJson(
          url.endsWith("catalog.json") ? rollback.edition.catalog : rollback.edition.search
        )
      );
    });
    await store.adopt(newer.edition);
    await store.sync();
    expect(store.current?.edition.source.tag).toBe("v3.0.0");
    const html = renderToStaticMarkup(
      createElement(PlaybookPage, { edition: store.current, path: "topics/delivery" })
    );
    expect(html).toContain("Restored stable content");
    expect(requests).toBe(3);
    const restored = new PlaybookStore(root);
    await restored.load(join(root, "missing-seed.json"));
    expect(restored.current?.edition).toEqual(rollback.edition.edition);
    expect(restored.getEdition(newer.edition.edition.editionDigest)?.edition).toEqual(
      newer.edition.edition
    );
  });
});
test("Chinese, English and independent Policy documents use the upstream tokenization strategy", () => {
  const { edition } = makePublicBundle();
  const index = buildPlaybookIndex(edition.search);
  expect(tokenizePlaybookText("Ａstro 发布_git-workflow")).toEqual([
    "Astro",
    "发",
    "布",
    "git",
    "workflow",
  ]);
  expect(queryPlaybookSearch(index, "发布").some((result) => result.type === "topic")).toBe(true);
  expect(queryPlaybookSearch(index, "Astro").some((result) => result.type === "experience")).toBe(
    true
  );
  expect(
    queryPlaybookSearch(index, "Safe Release").some(
      (result) => result.type === "policy" && result.href?.includes("/playbook/policies/")
    )
  ).toBe(true);
});
