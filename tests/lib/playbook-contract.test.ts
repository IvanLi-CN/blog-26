import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadInitialPlaybookEdition } from "../../scripts/prepare-console-playbook-seed";
import PlaybookPage from "../../src/components/playbook/PlaybookPage";
import {
  downloadRetainedEdition,
  readPublicPointer,
  writePublicEdition,
} from "../../src/lib/playbook/artifacts";
import {
  createPlaybookEdition,
  parseSupplementFiles,
  readPlaybookEdition,
  readPublicArchive,
  readSupplementArchive,
} from "../../src/lib/playbook/bundle";
import {
  PLAYBOOK_POLL_INTERVAL_MS,
  PlaybookStore,
  playbookVersionPath,
  validatePlaybookEdition,
} from "../../src/lib/playbook/cache";
import { publicFixtureCatalog, publicFixtureSearch } from "../../src/lib/playbook/fixture";
import { readBounded, SourceResponseLimitError } from "../../src/lib/playbook/github";
import {
  computeEditionDigest,
  encodeJson,
  encodePlaybookRawFiles,
  fileRecord,
  parseManifest,
  samePlaybookEdition,
  sha256,
} from "../../src/lib/playbook/manifest";
import {
  adoptionDecision,
  deployContent,
  PlaybookSupplementInvalidError,
  PlaybookSupplementUnavailableError,
  type ReleaseReader,
  readSupplementAsset,
  resolveRelease,
  type SourceRelease,
  shouldSyncSupplement,
} from "../../src/lib/playbook/release";
import { assertPublicCatalog, PLAYBOOK_MAX_BUNDLE_BYTES } from "../../src/lib/playbook/schema";
import {
  buildPlaybookIndex,
  createPlaybookSearchPages,
  queryPlaybookSearch,
  tokenizePlaybookText,
} from "../../src/lib/playbook/search";
import {
  mergePlaybookSupplement,
  readPlaybookSupplement,
  searchPlaybookAdmin,
  validatePlaybookSupplement,
} from "../../src/lib/playbook/supplement";
import type { PlaybookManifest } from "../../src/lib/playbook/types";
import { handlePlaybookRequest } from "../../src/server/public-api/playbook";
import {
  makeArchive,
  makeCanonicalGzip,
  makePublicBundle,
  makeRustSupplementBundle,
  makeSupplementBundle,
} from "./playbook-fixture";

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
    expect(() =>
      parseManifest({ ...bundle.manifest, files: [...bundle.manifest.files].reverse() })
    ).toThrow("sorted");
    expect(() =>
      validatePlaybookEdition({
        ...bundle.edition,
        edition: {
          ...bundle.edition.edition,
          files: [...bundle.edition.edition.files].reverse(),
        },
      })
    ).toThrow();
    const privateCatalog = structuredClone(publicFixtureCatalog);
    privateCatalog.snapshot.projects[0].catalog_visibility = "private" as never;
    expect(() => assertPublicCatalog(privateCatalog)).toThrow();
    const missingVisibility = structuredClone(publicFixtureCatalog);
    Reflect.deleteProperty(missingVisibility.snapshot.projects[0], "catalog_visibility");
    Reflect.deleteProperty(missingVisibility.project_details[0].item, "catalog_visibility");
    expect(() => assertPublicCatalog(missingVisibility)).toThrow();
    const unknownVisibility = structuredClone(publicFixtureCatalog);
    Reflect.set(unknownVisibility.snapshot.projects[0], "catalog_visibility", "internal");
    Reflect.set(unknownVisibility.project_details[0].item, "catalog_visibility", "internal");
    expect(() => assertPublicCatalog(unknownVisibility)).toThrow();
    const invalid = structuredClone(publicFixtureCatalog);
    invalid.topic_details[0].policy_skills[0].frontmatter.secret = "never publish";
    expect(() => assertPublicCatalog(invalid)).toThrow("Internal field");
    const metadata = structuredClone(publicFixtureCatalog);
    metadata.project_details[0].doc_metadata.push({ key: "Repo Path", value: "/private/checkout" });
    expect(() => assertPublicCatalog(metadata)).toThrow("Internal metadata");
    const relation = structuredClone(publicFixtureCatalog);
    relation.topic_details[0].policy_skills[0].summary.policy_dependencies = ["private-rule"];
    expect(() => assertPublicCatalog(relation)).toThrow();
    const duplicateProject = structuredClone(publicFixtureCatalog);
    duplicateProject.topic_details[0].item.related_projects.push({
      ...duplicateProject.topic_details[0].item.related_projects[0],
    });
    duplicateProject.topic_details[0].item.project_count = 2;
    duplicateProject.snapshot.topics[0] = duplicateProject.topic_details[0].item;
    expect(() => assertPublicCatalog(duplicateProject)).toThrow("Duplicate playbook identity");
    const mismatchedProject = structuredClone(publicFixtureCatalog);
    mismatchedProject.topic_details[0].item.related_projects[0].name = "Wrong project";
    mismatchedProject.snapshot.topics[0] = mismatchedProject.topic_details[0].item;
    expect(() => assertPublicCatalog(mismatchedProject)).toThrow("project references");
  });
  test("rejects duplicate JSON object keys at the package boundary", () => {
    const publicBundle = makePublicBundle();
    const duplicateCatalog = publicBundle.files[0].content.replace(
      '"generated_at": "2026-09-01T00:00:00Z",',
      '"generated_at": "2026-09-01T00:00:00Z",\n  "generated_at": "2026-09-01T00:00:00Z",'
    );
    const publicFiles = [
      { path: "catalog.json", content: duplicateCatalog },
      publicBundle.files[1],
    ];
    const publicArchive = makeArchive(publicFiles);
    const publicManifest: PlaybookManifest = {
      ...publicBundle.manifest,
      bundle: {
        ...publicBundle.manifest.bundle,
        size: publicArchive.length,
        sha256: sha256(publicArchive),
      },
      files: publicFiles.map((file) => fileRecord(file.path, file.content)),
    };
    expect(() =>
      createPlaybookEdition(
        readPublicArchive(publicArchive, publicManifest),
        publicManifest,
        "b".repeat(40),
        "{}\n"
      )
    ).toThrow("Duplicate JSON object key");

    const supplementBundle = makeSupplementBundle();
    const duplicateSupplementCatalog = supplementBundle.files[0].content.replace(
      '"generated_at": "2026-09-01T00:00:00Z",',
      '"generated_at": "2026-09-01T00:00:00Z",\n  "generated_at": "2026-09-01T00:00:00Z",'
    );
    expect(() =>
      parseSupplementFiles(
        new Map([
          ["catalog.json", Buffer.from(duplicateSupplementCatalog)],
          ["search-documents.json", Buffer.from(supplementBundle.files[1].content)],
        ])
      )
    ).toThrow("Duplicate JSON object key");
  });
  test("rejects invalid UTF-8 in public and supplement projections", () => {
    const corruptJson = (content: string) => {
      const bytes = Buffer.from(content);
      const marker = Buffer.from('"generated_at": "');
      const start = bytes.indexOf(marker);
      if (start < 0) throw new Error("Fixture has no generated_at field");
      bytes[start + marker.length] = 0xff;
      return bytes;
    };
    const publicBundle = makePublicBundle();
    expect(() =>
      createPlaybookEdition(
        new Map([
          ["catalog.json", corruptJson(publicBundle.files[0].content)],
          ["search-documents.json", Buffer.from(publicBundle.files[1].content)],
        ]),
        publicBundle.manifest,
        "b".repeat(40),
        "{}\n"
      )
    ).toThrow("valid UTF-8");

    const supplementBundle = makeSupplementBundle();
    expect(() =>
      parseSupplementFiles(
        new Map([
          ["catalog.json", corruptJson(supplementBundle.files[0].content)],
          ["search-documents.json", Buffer.from(supplementBundle.files[1].content)],
        ])
      )
    ).toThrow("valid UTF-8");
  });
  test("compatibly reads the legacy public catalog without changing body bytes", () => {
    const legacy = structuredClone(publicFixtureCatalog);
    const body = legacy.project_details[0].sections[0].markdown;
    Reflect.set(legacy.snapshot.projects[0], "visibility", null);
    Reflect.deleteProperty(legacy.snapshot.projects[0], "catalog_visibility");
    Reflect.deleteProperty(legacy.snapshot.projects[0], "source_visibility");
    Reflect.set(legacy.project_details[0].item, "visibility", null);
    Reflect.deleteProperty(legacy.project_details[0].item, "catalog_visibility");
    Reflect.deleteProperty(legacy.project_details[0].item, "source_visibility");
    Reflect.deleteProperty(legacy.snapshot.topics[0], "catalog_visibility");
    Reflect.deleteProperty(legacy.topic_details[0].item, "catalog_visibility");
    Reflect.deleteProperty(legacy.project_details[0], "preamble");
    Reflect.deleteProperty(legacy.topic_details[0], "preamble");

    const normalized = assertPublicCatalog(legacy);
    expect(normalized.snapshot.projects[0].catalog_visibility).toBe("public");
    expect(normalized.snapshot.projects[0].source_visibility).toBe("public");
    expect(normalized.snapshot.topics[0].catalog_visibility).toBe("public");
    expect(normalized.project_details[0].preamble).toBe("");
    expect(normalized.topic_details[0].preamble).toBe("");
    expect(normalized.project_details[0].sections[0].markdown).toBe(body);
  });
  test("retains legacy file identities while downloading and restoring an edition", async () => {
    const legacyCatalog = structuredClone(publicFixtureCatalog);
    Reflect.set(legacyCatalog.snapshot.projects[0], "visibility", null);
    Reflect.deleteProperty(legacyCatalog.snapshot.projects[0], "catalog_visibility");
    Reflect.deleteProperty(legacyCatalog.snapshot.projects[0], "source_visibility");
    Reflect.set(legacyCatalog.project_details[0].item, "visibility", null);
    Reflect.deleteProperty(legacyCatalog.project_details[0].item, "catalog_visibility");
    Reflect.deleteProperty(legacyCatalog.project_details[0].item, "source_visibility");
    Reflect.deleteProperty(legacyCatalog.snapshot.topics[0], "catalog_visibility");
    Reflect.deleteProperty(legacyCatalog.topic_details[0].item, "catalog_visibility");
    Reflect.deleteProperty(legacyCatalog.project_details[0], "preamble");
    Reflect.deleteProperty(legacyCatalog.topic_details[0], "preamble");
    const catalogBytes = Buffer.from(encodeJson(legacyCatalog));
    const searchBytes = Buffer.from(encodeJson(publicFixtureSearch));
    const archive = makeArchive([
      { path: "catalog.json", content: catalogBytes.toString("utf8") },
      { path: "search-documents.json", content: searchBytes.toString("utf8") },
    ]);
    const manifest: PlaybookManifest = {
      schemaVersion: 1,
      source: {
        repository: "IvanLi-CN/style-playbook-skills",
        releaseId: "100",
        tag: "v3.0.0",
        commit: "a".repeat(40),
        publishedAt: "2026-09-01T00:00:00Z",
      },
      bundle: { name: "playbook-public.tar.gz", size: archive.length, sha256: sha256(archive) },
      files: [
        fileRecord("catalog.json", catalogBytes),
        fileRecord("search-documents.json", searchBytes),
      ],
    };
    const sourceEdition = createPlaybookEdition(
      new Map([
        ["catalog.json", catalogBytes],
        ["search-documents.json", searchBytes],
      ]),
      manifest,
      "b".repeat(40),
      "{}\n"
    );
    const fetcher = async (url: string) => {
      const pathname = new URL(url).pathname;
      if (pathname.endsWith("catalog.json")) return new Response(catalogBytes);
      if (pathname.endsWith("search-documents.json")) return new Response(searchBytes);
      if (pathname.endsWith("public-snapshot.json")) return new Response("{}\n");
      if (pathname.endsWith("playbook-public.tar.gz")) return new Response(archive);
      if (pathname.endsWith("playbook-public-manifest.json"))
        return new Response(encodeJson(manifest));
      throw new Error(`Unexpected retained artifact: ${url}`);
    };
    const root = await temp();
    const retained = await downloadRetainedEdition(
      sourceEdition.edition,
      "https://blog.test/_content/playbook/manifest.json",
      join(root, "retained"),
      fetcher
    );
    expect(retained.legacyCatalog).toBe(true);
    expect(retained.edition).toEqual(sourceEdition.edition);
    expect(retained.catalog.snapshot.projects[0].catalog_visibility).toBe("public");
    await rm(join(root, "retained/catalog.json"));
    await rm(join(root, "retained/search-documents.json"));
    const publishedRoot = join(root, "published");
    await writePublicEdition(publishedRoot, retained, join(root, "retained"), "{}\n");
    const publishedDirectory = join(
      publishedRoot,
      playbookVersionPath(sourceEdition.edition).slice(1)
    );
    expect(await readFile(join(publishedDirectory, "catalog.json"))).toEqual(catalogBytes);
    expect(await readFile(join(publishedDirectory, "search-documents.json"))).toEqual(searchBytes);
    const store = new PlaybookStore(join(root, "cache"));
    await store.adopt(retained);
    const restored = new PlaybookStore(join(root, "cache"));
    await restored.load(join(root, "missing-seed.json"));
    expect(restored.current?.edition).toEqual(sourceEdition.edition);

    const persistedPath = join(root, "cache/state.json");
    const persisted = JSON.parse(await readFile(persistedPath, "utf8"));
    persisted.current.catalog.snapshot.projects[0].description = "Tampered legacy content";
    persisted.current.catalog.project_details[0].item.description = "Tampered legacy content";
    await writeFile(persistedPath, encodeJson(persisted));
    const tampered = new PlaybookStore(join(root, "cache"));
    await tampered.load(join(root, "missing-seed.json"));
    expect(tampered.current).toBeUndefined();
  });
  test("rejects bad digests, traversal, links and duplicate tar entries without extraction", () => {
    const bundle = makePublicBundle();
    expect(() =>
      readPublicArchive(bundle.archive, {
        ...bundle.manifest,
        bundle: { ...bundle.manifest.bundle, sha256: "0".repeat(64) },
      })
    ).toThrow("integrity");
    for (const { entry, error } of [
      { entry: { path: "../catalog.json", content: "{}" }, error: "Unsafe" },
      { entry: { path: "catalog.json", content: "{}", kind: "2" }, error: "canonical" },
    ]) {
      const archive = makeArchive([entry]);
      expect(() =>
        readPublicArchive(archive, {
          ...bundle.manifest,
          bundle: { ...bundle.manifest.bundle, size: archive.length, sha256: sha256(archive) },
        })
      ).toThrow(error);
    }
    const archive = makeArchive([...bundle.files, bundle.files[0]]);
    expect(() =>
      readPublicArchive(archive, {
        ...bundle.manifest,
        bundle: { ...bundle.manifest.bundle, size: archive.length, sha256: sha256(archive) },
      })
    ).toThrow("Unsafe");
    const oneBlockTerminator = gunzipSync(bundle.archive).subarray(0, -512);
    const oneBlockArchive = makeCanonicalGzip(oneBlockTerminator);
    expect(() =>
      readPublicArchive(oneBlockArchive, {
        ...bundle.manifest,
        bundle: {
          ...bundle.manifest.bundle,
          size: oneBlockArchive.length,
          sha256: sha256(oneBlockArchive),
        },
      })
    ).toThrow("two zero blocks");
    const concatenatedArchive = Buffer.concat([bundle.archive, bundle.archive]);
    expect(() =>
      readPublicArchive(concatenatedArchive, {
        ...bundle.manifest,
        bundle: {
          ...bundle.manifest.bundle,
          size: concatenatedArchive.length,
          sha256: sha256(concatenatedArchive),
        },
      })
    ).toThrow("one gzip member");
    const nonUstarTar = gunzipSync(bundle.archive);
    nonUstarTar[257] = 0x78;
    const nonUstarArchive = makeCanonicalGzip(nonUstarTar);
    expect(() =>
      readPublicArchive(nonUstarArchive, {
        ...bundle.manifest,
        bundle: {
          ...bundle.manifest.bundle,
          size: nonUstarArchive.length,
          sha256: sha256(nonUstarArchive),
        },
      })
    ).toThrow("ustar");
  });
  test("rejects non-deterministic archive metadata and mismatched source timestamps", () => {
    const publicBundle = makePublicBundle();
    const sourceTimestamp = 1_735_689_600;
    const archive = makeArchive(publicBundle.files, sourceTimestamp);
    const manifest = {
      ...publicBundle.manifest,
      bundle: { ...publicBundle.manifest.bundle, size: archive.length, sha256: sha256(archive) },
    };
    expect(readPublicArchive(archive, manifest, sourceTimestamp)).toBeInstanceOf(Map);
    expect(() => readPublicArchive(archive, manifest, sourceTimestamp + 1)).toThrow("timestamp");

    const supplement = makeSupplementBundle();
    const supplementArchive = makeArchive(supplement.files, sourceTimestamp);
    const supplementManifest = {
      ...supplement.manifest,
      bundle: {
        ...supplement.manifest.bundle,
        size: supplementArchive.length,
        sha256: sha256(supplementArchive),
      },
    };
    expect(
      readSupplementArchive(supplementArchive, supplementManifest, sourceTimestamp)
    ).toBeInstanceOf(Map);
    const nonDeterministicArchive = makeArchive(
      supplement.files.map((file) => ({ ...file, mode: "0000600\0" })),
      sourceTimestamp
    );
    expect(() =>
      readSupplementArchive(
        nonDeterministicArchive,
        {
          ...supplementManifest,
          bundle: {
            ...supplementManifest.bundle,
            size: nonDeterministicArchive.length,
            sha256: sha256(nonDeterministicArchive),
          },
        },
        sourceTimestamp
      )
    ).toThrow("metadata");

    const canonicalFiles = [
      { path: "catalog.json", content: "catalog" },
      { path: "search-documents.json", content: "search" },
    ];
    const canonicalArchive = makeArchive(canonicalFiles);
    const canonicalManifest = {
      ...publicBundle.manifest,
      files: canonicalFiles.map((file) => fileRecord(file.path, file.content)),
      bundle: {
        ...publicBundle.manifest.bundle,
        size: canonicalArchive.length,
        sha256: sha256(canonicalArchive),
      },
    };
    const swappedArchive = makeArchive([...canonicalFiles].reverse());
    expect(() =>
      readPublicArchive(swappedArchive, {
        ...canonicalManifest,
        bundle: {
          ...canonicalManifest.bundle,
          size: swappedArchive.length,
          sha256: sha256(swappedArchive),
        },
      })
    ).toThrow("canonical order");

    const nonZeroPaddingTar = gunzipSync(canonicalArchive);
    nonZeroPaddingTar[512 + canonicalFiles[0].content.length] = 1;
    const nonZeroPaddingArchive = makeCanonicalGzip(nonZeroPaddingTar);
    expect(() =>
      readPublicArchive(nonZeroPaddingArchive, {
        ...canonicalManifest,
        bundle: {
          ...canonicalManifest.bundle,
          size: nonZeroPaddingArchive.length,
          sha256: sha256(nonZeroPaddingArchive),
        },
      })
    ).toThrow("padding");

    const nonCanonicalPathArchive = makeArchive([
      { path: "./catalog.json", content: "catalog" },
      { path: "search-documents.json", content: "search" },
    ]);
    expect(() =>
      readPublicArchive(nonCanonicalPathArchive, {
        ...canonicalManifest,
        bundle: {
          ...canonicalManifest.bundle,
          size: nonCanonicalPathArchive.length,
          sha256: sha256(nonCanonicalPathArchive),
        },
      })
    ).toThrow("Unsafe");

    for (const offset of [8, 9]) {
      const nonCanonicalGzipHeader = Buffer.from(canonicalArchive);
      nonCanonicalGzipHeader[offset] = offset === 8 ? 0 : 3;
      expect(() =>
        readPublicArchive(nonCanonicalGzipHeader, {
          ...canonicalManifest,
          bundle: {
            ...canonicalManifest.bundle,
            size: nonCanonicalGzipHeader.length,
            sha256: sha256(nonCanonicalGzipHeader),
          },
        })
      ).toThrow("gzip format");
    }
  });
  test("rejects nested internal key variants without excluding ordinary public fields", () => {
    for (const key of [
      "repoPath",
      "API-Key",
      "accessToken",
      "private.key",
      "Thread ID",
      "sourceUrl",
      "repository-URL",
      "Manifest.Dir",
      "sessionLog",
      "githubToken",
      "DEPLOYTOKEN",
      "authorization",
      "credential",
      "clientSecret",
      "token",
    ])
      for (const target of ["frontmatter", "stack"]) {
        const catalog = structuredClone(publicFixtureCatalog);
        const nested = { public: [{ [key]: "must remain private" }] };
        if (target === "frontmatter")
          catalog.topic_details[0].policy_skills[0].frontmatter.extra = nested;
        else catalog.project_details[0].stack = nested;
        expect(() => assertPublicCatalog(catalog)).toThrow("Internal field");
      }
    const catalog = structuredClone(publicFixtureCatalog);
    catalog.topic_details[0].policy_skills[0].frontmatter.public_url_hosts = ["github.com"];
    catalog.topic_details[0].policy_skills[0].frontmatter["allowed-tools"] = ["Read"];
    expect(assertPublicCatalog(catalog)).toEqual(catalog);
    expect(catalog.snapshot.topics[0].token).toBe("可靠交付");
    const metadata = structuredClone(publicFixtureCatalog);
    metadata.project_details[0].doc_metadata.push({
      key: "Github Token",
      value: "must not publish",
    });
    expect(() => assertPublicCatalog(metadata)).toThrow("Internal metadata");
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
  test("accepts independent visibility fields and validates the supplement overlay", () => {
    const publicCatalog = structuredClone(publicFixtureCatalog);
    publicCatalog.snapshot.projects[0].source = "private";
    publicCatalog.snapshot.projects[0].source_visibility = "private";
    publicCatalog.project_details[0].item = publicCatalog.snapshot.projects[0];
    expect(assertPublicCatalog(publicCatalog).snapshot.projects[0].source).toBe("private");

    const supplement = makeSupplementBundle();
    const files = readSupplementArchive(supplement.archive, supplement.manifest);
    const parsed = parseSupplementFiles(files);
    expect(parsed.catalog.snapshot.projects[0].catalog_visibility).toBe("private");
    expect(parsed.catalog.private_source_metadata[0].source).toContain("private-project");
    expect(parsed.catalog.relation_edges).toHaveLength(1);
    const publicProjectSupplement = structuredClone(parsed.catalog);
    publicProjectSupplement.snapshot.projects[0].catalog_visibility = "public" as never;
    publicProjectSupplement.project_details[0].item.catalog_visibility = "public" as never;
    expect(() =>
      validatePlaybookSupplement({
        manifest: supplement.manifest,
        catalog: publicProjectSupplement,
        search: parsed.search,
      })
    ).toThrow();
    const publicTopicSupplement = structuredClone(parsed.catalog);
    publicTopicSupplement.snapshot.topics[0].catalog_visibility = "public" as never;
    publicTopicSupplement.topic_details[0].item.catalog_visibility = "public" as never;
    expect(() =>
      validatePlaybookSupplement({
        manifest: supplement.manifest,
        catalog: publicTopicSupplement,
        search: parsed.search,
      })
    ).toThrow();
    expect(() =>
      parseSupplementFiles(
        new Map([
          [
            "catalog.json",
            Buffer.from(
              encodeJson({
                ...parsed.catalog,
                relation_edges: parsed.catalog.relation_edges.concat(parsed.catalog.relation_edges),
              })
            ),
          ],
          ["search-documents.json", Buffer.from(encodeJson(parsed.search))],
        ])
      )
    ).toThrow("Duplicate playbook identity");
    const relationMismatch = structuredClone(parsed.catalog);
    relationMismatch.snapshot.topics[0].related_projects = [];
    relationMismatch.snapshot.topics[0].project_count = 0;
    relationMismatch.topic_details[0].item.related_projects = [];
    relationMismatch.topic_details[0].item.project_count = 0;
    expect(() =>
      validatePlaybookSupplement({
        manifest: supplement.manifest,
        catalog: relationMismatch,
        search: parsed.search,
      })
    ).toThrow("does not match Topic related_projects");
    const internal = makeSupplementBundle();
    const internalCatalog = JSON.parse(internal.files[0].content);
    internalCatalog.project_details[0].stack = { repoPath: "/private/checkout" };
    expect(() =>
      validatePlaybookSupplement({
        manifest: internal.manifest,
        catalog: internalCatalog,
        search: JSON.parse(internal.files[1].content),
      })
    ).toThrow("Internal field");
  });
  test("accepts supplement bytes serialized by the Rust upstream exporter", () => {
    const bundle = makeRustSupplementBundle();
    const files = readSupplementArchive(bundle.archive, bundle.manifest);
    const parsed = parseSupplementFiles(files);
    const supplement = validatePlaybookSupplement({ manifest: bundle.manifest, ...parsed }, files);
    expect(parsed.catalog.topic_details[0]?.item.related_projects).toEqual([
      { slug: "source-private-project", name: "Source Private Project" },
      { slug: "catalog-private-project", name: "Catalog Private Project" },
    ]);
    expect(supplement.catalog.snapshot.projects[0]?.slug).toBe("catalog-private-project");
  });
  test("merges supplement relations without changing public body bytes", () => {
    const publicCatalog = structuredClone(publicFixtureCatalog);
    publicCatalog.snapshot.topics[0].project_count = 0;
    publicCatalog.snapshot.topics[0].related_projects = [];
    publicCatalog.topic_details[0].item.project_count = 0;
    publicCatalog.topic_details[0].item.related_projects = [];
    const publicBundle = makePublicBundle("v3.0.0", "100", publicCatalog);
    const baseSupplementBundle = makeSupplementBundle();
    const supplementCatalog = JSON.parse(baseSupplementBundle.files[0].content);
    supplementCatalog.relation_edges.push({
      topic_slug: "delivery",
      project_slug: "sample-project",
      project_name: "Sample Project",
    });
    const supplementSearch = JSON.parse(baseSupplementBundle.files[1].content);
    const supplementBundle = makeSupplementBundle(
      "v3.0.0",
      "100",
      supplementCatalog,
      supplementSearch
    );
    const supplement = validatePlaybookSupplement({
      manifest: supplementBundle.manifest,
      catalog: supplementCatalog,
      search: supplementSearch,
    });
    const before = publicBundle.edition.catalog.topic_details[0].sections.map((section) => ({
      id: section.id,
      markdown: section.markdown,
    }));
    const merged = mergePlaybookSupplement(publicBundle.edition, supplement);
    const topic = merged.catalog.topic_details.find((detail) => detail.item.slug === "delivery");
    expect(
      topic?.sections.map((section) => ({ id: section.id, markdown: section.markdown }))
    ).toEqual(before);
    expect(topic?.item.related_projects).toContainEqual({
      slug: "sample-project",
      name: "Sample Project",
    });
    expect(merged.catalog.snapshot.projects.map((project) => project.slug)).toContain(
      "private-project"
    );
    expect(merged.catalog.private_source_metadata[0]?.source).toBe(
      "https://github.com/example/private-project"
    );
    expect(searchPlaybookAdmin(merged, "私有主题").map((result) => result.document.id)).toContain(
      "page:topic:private-topic"
    );
  });
  test("rejects supplement identity and relation boundary mismatches", () => {
    const publicBundle = makePublicBundle();
    const supplementBundle = makeSupplementBundle("v3.1.0", "101");
    const supplement = validatePlaybookSupplement({
      manifest: supplementBundle.manifest,
      catalog: JSON.parse(supplementBundle.files[0].content),
      search: JSON.parse(supplementBundle.files[1].content),
    });
    expect(() => mergePlaybookSupplement(publicBundle.edition, supplement)).toThrow(
      "source identity"
    );
    const invalid = validatePlaybookSupplement({
      manifest: makeSupplementBundle().manifest,
      catalog: JSON.parse(makeSupplementBundle().files[0].content),
      search: JSON.parse(makeSupplementBundle().files[1].content),
    });
    invalid.catalog.relation_edges[0].project_slug = "missing-project";
    expect(() => mergePlaybookSupplement(publicBundle.edition, invalid)).toThrow("unknown object");
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
      const codeBlocks = html.match(/<pre\b[^>]*>[\s\S]*?<\/pre>/g) ?? [];
      expect(codeBlocks.some((block) => block.includes("packageCallback()"))).toBe(true);
      expect(codeBlocks.every((block) => !block.includes("<svg"))).toBe(true);
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
  test("keeps versioned Playbook links stable when Markdown URL mapping runs twice", () => {
    const catalog = structuredClone(publicFixtureCatalog);
    catalog.topic_details[0].sections[0].markdown +=
      "\n[Reference][project]\n\n[project]: /projects/sample-project#architecture";
    const { edition } = makePublicBundle("v3.0.0", "100", catalog);
    const html = renderToStaticMarkup(
      createElement(PlaybookPage, { edition, path: "topics/delivery", versioned: true })
    );
    const versionedHref = `/playbook/editions/${edition.edition.source.tag}/${edition.edition.source.releaseId}/${edition.edition.editionDigest}/projects/sample-project/#architecture`;
    expect(html).toContain(`href="${versionedHref}"`);
    expect(html).not.toContain("Unsupported public playbook route");
  });
  test("renders only useful visitor information and keeps edition identity out of Playbook UI", () => {
    const catalog = structuredClone(publicFixtureCatalog);
    catalog.topic_details[0].doc_metadata = [
      { key: "schema_version", value: "3" },
      { key: "status", value: "stale" },
      { key: "last_verified", value: "2026-09-01" },
      { key: "routing", value: "native-app" },
    ];
    const project = catalog.project_details[0];
    project.doc_metadata = [
      { key: "status", value: "current" },
      { key: "confidence", value: "high" },
    ];
    const { edition } = makePublicBundle("v3.0.0", "100", catalog);
    const topicHtml = renderToStaticMarkup(
      createElement(PlaybookPage, { edition, path: "topics/delivery" })
    );
    const projectHtml = renderToStaticMarkup(
      createElement(PlaybookPage, { edition, path: "projects/sample-project" })
    );
    const indexHtml = renderToStaticMarkup(createElement(PlaybookPage, { edition, path: "" }));
    const groupHtml = renderToStaticMarkup(
      createElement(PlaybookPage, { edition, path: "topics" })
    );
    expect(topicHtml).toContain("内容已过时");
    expect(projectHtml).not.toContain("内容已过时");
    for (const html of [indexHtml, groupHtml, topicHtml, projectHtml]) {
      expect(html).not.toContain("内容版本 v3.0.0");
      expect(html).not.toContain("schema_version");
      expect(html).not.toContain("last_verified");
      expect(html).not.toContain("confidence");
      expect(html).not.toContain("native-app");
    }
  });
});

function sourceReader(
  bundles: ReturnType<typeof makePublicBundle>[],
  supplements: (ReturnType<typeof makeSupplementBundle> | undefined)[] = []
): ReleaseReader {
  const releases: SourceRelease[] = bundles.map((bundle, i) => {
    const supplement = supplements[i];
    return {
      id: Number(bundle.manifest.source.releaseId),
      tag_name: bundle.manifest.source.tag,
      draft: false,
      prerelease: false,
      published_at: bundle.manifest.source.publishedAt,
      assets: [
        {
          id: i * 4 + 1,
          name: "playbook-public-manifest.json",
          size: Buffer.byteLength(encodeJson(bundle.manifest)),
          digest: `sha256:${sha256(encodeJson(bundle.manifest))}`,
        },
        {
          id: i * 4 + 2,
          name: "playbook-public.tar.gz",
          size: bundle.archive.length,
          digest: `sha256:${bundle.manifest.bundle.sha256}`,
        },
        ...(supplement
          ? [
              {
                id: i * 4 + 3,
                name: "playbook-private-supplement-manifest.json",
                size: Buffer.byteLength(encodeJson(supplement.manifest)),
                digest: `sha256:${sha256(encodeJson(supplement.manifest))}`,
              },
              {
                id: i * 4 + 4,
                name: "playbook-private-supplement.tar.gz",
                size: supplement.archive.length,
                digest: `sha256:${supplement.manifest.bundle.sha256}`,
              },
            ]
          : []),
      ],
    };
  });
  const bytes = new Map<number, Uint8Array>();
  bundles.forEach((bundle, i) => {
    bytes.set(i * 4 + 1, Buffer.from(encodeJson(bundle.manifest)));
    bytes.set(i * 4 + 2, bundle.archive);
    const supplement = supplements[i];
    if (supplement) {
      bytes.set(i * 4 + 3, Buffer.from(encodeJson(supplement.manifest)));
      bytes.set(i * 4 + 4, supplement.archive);
    }
  });
  return {
    list: async () => releases,
    release: async (id) => {
      const release = releases.find((item) => String(item.id) === id);
      if (!release) throw new Error("Unknown fixture release");
      return release;
    },
    commit: async () => "a".repeat(40),
    commitTimestamp: async () => 0,
    asset: async (id) => {
      const asset = bytes.get(id);
      if (!asset) throw new Error(`Unknown fixture asset ${id}`);
      return asset;
    },
  };
}
describe("playbook-dispatch-and-reconcile", () => {
  test("rejects oversized bundle metadata before downloading the asset", async () => {
    const bundle = makePublicBundle();
    const base = sourceReader([bundle]);
    const release = await base.release("100");
    let downloads = 0;
    const reader: ReleaseReader = {
      ...base,
      release: async () => ({
        ...release,
        assets: release.assets.map((asset) =>
          asset.name === "playbook-public.tar.gz"
            ? { ...asset, size: PLAYBOOK_MAX_BUNDLE_BYTES + 1 }
            : asset
        ),
      }),
      asset: async (id) => {
        downloads++;
        return base.asset(id);
      },
    };
    await expect(
      resolveRelease(reader, {
        mode: "release",
        source_repository: bundle.manifest.source.repository,
        source_release_id: bundle.manifest.source.releaseId,
        source_tag: bundle.manifest.source.tag,
        source_sha: bundle.manifest.source.commit,
        bundle_sha256: bundle.manifest.bundle.sha256,
      })
    ).rejects.toThrow("assets are not ready");
    expect(downloads).toBe(0);
  });

  test("bounds streaming source responses", async () => {
    const createOversizedStream = () =>
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new Uint8Array(5));
          controller.close();
        },
      });
    await expect(readBounded(createOversizedStream(), 4)).rejects.toBeInstanceOf(
      SourceResponseLimitError
    );
    await expect(readBounded(createOversizedStream(), 4)).rejects.toThrow("4-byte limit");
  });

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
  test("requires and verifies both package identities for a notified dual release", async () => {
    const publicBundle = makePublicBundle();
    const supplement = makeSupplementBundle();
    const reader = sourceReader([publicBundle], [supplement]);
    const publicManifestBytes = encodeJson(publicBundle.manifest);
    const supplementManifestBytes = encodeJson(supplement.manifest);
    const input = {
      mode: "release" as const,
      source_repository: publicBundle.manifest.source.repository,
      source_release_id: publicBundle.manifest.source.releaseId,
      source_tag: publicBundle.manifest.source.tag,
      source_sha: publicBundle.manifest.source.commit,
      bundle_sha256: publicBundle.manifest.bundle.sha256,
      manifest_sha256: sha256(publicManifestBytes),
      bundle_asset_id: "2",
      bundle_asset_digest: `sha256:${publicBundle.manifest.bundle.sha256}`,
      bundle_asset_size: String(publicBundle.archive.length),
      manifest_asset_id: "1",
      manifest_asset_digest: `sha256:${sha256(publicManifestBytes)}`,
      manifest_asset_size: String(Buffer.byteLength(publicManifestBytes)),
      supplement_bundle_sha256: supplement.manifest.bundle.sha256,
      supplement_manifest_sha256: sha256(supplementManifestBytes),
      supplement_bundle_asset_id: "4",
      supplement_bundle_asset_digest: `sha256:${supplement.manifest.bundle.sha256}`,
      supplement_bundle_asset_size: String(supplement.archive.length),
      supplement_manifest_asset_id: "3",
      supplement_manifest_asset_digest: `sha256:${sha256(supplementManifestBytes)}`,
      supplement_manifest_asset_size: String(Buffer.byteLength(supplementManifestBytes)),
    };
    const selected = await resolveRelease(reader, input);
    expect(selected.supplement?.manifest.bundle.name).toBe("playbook-private-supplement.tar.gz");
    expect(selected.supplementStatus).toBe("valid");
    const publicOnlyInput = { ...input };
    for (const field of [
      "supplement_bundle_sha256",
      "supplement_manifest_sha256",
      "supplement_bundle_asset_id",
      "supplement_bundle_asset_digest",
      "supplement_bundle_asset_size",
      "supplement_manifest_asset_id",
      "supplement_manifest_asset_digest",
      "supplement_manifest_asset_size",
    ] as const)
      delete publicOnlyInput[field];
    const selectedWithoutSupplementIdentity = await resolveRelease(reader, publicOnlyInput);
    expect(selectedWithoutSupplementIdentity.supplement?.manifest.bundle.name).toBe(
      "playbook-private-supplement.tar.gz"
    );
    expect(selectedWithoutSupplementIdentity.supplementStatus).toBe("valid");
    const mismatchedSupplement = await resolveRelease(reader, {
      ...input,
      supplement_bundle_sha256: "0".repeat(64),
    });
    expect(mismatchedSupplement.supplement).toBeUndefined();
    expect(mismatchedSupplement.supplementStatus).toBe("unavailable");
    const incompleteSupplement = await resolveRelease(reader, {
      ...input,
      supplement_manifest_asset_id: undefined,
    });
    expect(incompleteSupplement.supplement).toBeUndefined();
    expect(incompleteSupplement.supplementStatus).toBe("unavailable");
    await expect(
      resolveRelease(reader, { ...input, manifest_sha256: "0".repeat(64) })
    ).rejects.toThrow("Public asset identity mismatch");
  });
  test("keeps the public release usable when supplement assets are incomplete", async () => {
    const bundle = makePublicBundle();
    const base = sourceReader([bundle]);
    const release = await base.release(bundle.manifest.source.releaseId);
    const reader: ReleaseReader = {
      ...base,
      release: async () => ({
        ...release,
        assets: [
          ...release.assets,
          {
            id: 3,
            name: "playbook-private-supplement-manifest.json",
            size: 1,
          },
        ],
      }),
    };
    const selected = await resolveRelease(reader, {
      mode: "release",
      source_repository: bundle.manifest.source.repository,
      source_release_id: bundle.manifest.source.releaseId,
      source_tag: bundle.manifest.source.tag,
      source_sha: bundle.manifest.source.commit,
      bundle_sha256: bundle.manifest.bundle.sha256,
    });
    expect(selected?.manifest.source.releaseId).toBe(bundle.manifest.source.releaseId);
    expect(selected?.supplement).toBeUndefined();
    expect(selected?.supplementStatus).toBe("invalid");

    const selectedWithUnavailableSupplement = await resolveRelease(reader, {
      mode: "release",
      source_repository: bundle.manifest.source.repository,
      source_release_id: bundle.manifest.source.releaseId,
      source_tag: bundle.manifest.source.tag,
      source_sha: bundle.manifest.source.commit,
      bundle_sha256: bundle.manifest.bundle.sha256,
      supplement_bundle_sha256: "0".repeat(64),
    });
    expect(selectedWithUnavailableSupplement?.manifest.source.releaseId).toBe(
      bundle.manifest.source.releaseId
    );
    expect(selectedWithUnavailableSupplement?.supplement).toBeUndefined();
    expect(selectedWithUnavailableSupplement?.supplementStatus).toBe("invalid");

    const selectedWithoutSupplementAssets = await resolveRelease(reader, {
      mode: "release",
      source_repository: bundle.manifest.source.repository,
      source_release_id: bundle.manifest.source.releaseId,
      source_tag: bundle.manifest.source.tag,
      source_sha: bundle.manifest.source.commit,
      bundle_sha256: bundle.manifest.bundle.sha256,
      supplement_bundle_sha256: "0".repeat(64),
    });
    expect(selectedWithoutSupplementAssets?.supplement).toBeUndefined();
    expect(selectedWithoutSupplementAssets?.supplementStatus).toBe("invalid");
  });
  test("preserves the existing supplement when optional asset reads are temporarily unavailable", async () => {
    const publicBundle = makePublicBundle();
    const supplement = makeSupplementBundle();
    const base = sourceReader([publicBundle], [supplement]);
    const reader: ReleaseReader = {
      ...base,
      asset: async (id, maxBytes) => {
        if (id === 3) throw new Error("temporary GitHub source failure");
        return base.asset(id, maxBytes);
      },
    };
    const selected = await resolveRelease(reader, {
      mode: "release",
      source_repository: publicBundle.manifest.source.repository,
      source_release_id: publicBundle.manifest.source.releaseId,
      source_tag: publicBundle.manifest.source.tag,
      source_sha: publicBundle.manifest.source.commit,
      bundle_sha256: publicBundle.manifest.bundle.sha256,
    });
    expect(selected.supplement).toBeUndefined();
    expect(selected.supplementStatus).toBe("unavailable");
    await expect(
      readSupplementAsset(reader, 3, supplement.archive.length, "Supplement manifest asset")
    ).rejects.toBeInstanceOf(PlaybookSupplementUnavailableError);
  });
  test("invalidates oversized optional assets instead of preserving the old supplement", async () => {
    const publicBundle = makePublicBundle();
    const supplement = makeSupplementBundle();
    const base = sourceReader([publicBundle], [supplement]);
    const reader: ReleaseReader = {
      ...base,
      asset: async (id, maxBytes) => {
        if (id === 3) throw new SourceResponseLimitError(`response exceeds ${maxBytes ?? 0}`);
        return base.asset(id, maxBytes);
      },
    };
    const selected = await resolveRelease(reader, {
      mode: "release",
      source_repository: publicBundle.manifest.source.repository,
      source_release_id: publicBundle.manifest.source.releaseId,
      source_tag: publicBundle.manifest.source.tag,
      source_sha: publicBundle.manifest.source.commit,
      bundle_sha256: publicBundle.manifest.bundle.sha256,
    });
    expect(selected.supplement).toBeUndefined();
    expect(selected.supplementStatus).toBe("invalid");
    await expect(
      readSupplementAsset(reader, 3, supplement.archive.length, "Supplement manifest asset")
    ).rejects.toBeInstanceOf(PlaybookSupplementInvalidError);
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
  test("only syncs a supplement for the adopted public source", () => {
    const current = makePublicBundle("v3.0.0", "100");
    const older = makePublicBundle("v2.9.0", "99");

    expect(shouldSyncSupplement(current.edition.edition, current.manifest)).toBe(true);
    expect(shouldSyncSupplement(current.edition.edition, older.manifest)).toBe(false);
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
          const edition = { ...next.edition.edition, rendererCommit: renderer };
          edition.editionDigest = computeEditionDigest(edition);
          return edition;
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
  test("rebuilds when a source-distinct pointer changes despite an identical digest", async () => {
    const first = makePublicBundle("v3.0.0", "100");
    const concurrent = makePublicBundle("v3.1.0", "101");
    const next = makePublicBundle("v3.2.0", "102");
    expect(first.edition.edition.editionDigest).toBe(concurrent.edition.edition.editionDigest);
    let current = first.edition.edition;
    const retainedSources: string[] = [];
    let deployedPrevious = "";
    const outcome = await deployContent(
      {
        current: async () => current,
        build: async (_manifest, _renderer, retained) => {
          if (!retained) throw new Error("Missing retained edition");
          retainedSources.push(retained.source.tag);
          if (retainedSources.length === 1) current = concurrent.edition.edition;
          return {
            ...next.edition.edition,
            previous: { tag: retained.source.tag, editionDigest: retained.editionDigest },
          };
        },
        deploy: async (edition) => {
          deployedPrevious = edition.previous?.tag || "";
        },
        verify: async () => {
          /* Successful mock operation. */
        },
      },
      next.manifest,
      { automaticUpdatesEnabled: true }
    );
    expect(outcome).toBe("deployed");
    expect(retainedSources).toEqual(["v3.0.0", "v3.1.0"]);
    expect(deployedPrevious).toBe("v3.1.0");
  });
  test("paused updates and explicit rollback enforce production boundaries", async () => {
    const current = makePublicBundle("v3.1.0", "101");
    const previous = makePublicBundle("v3.0.0", "100");
    let calls = 0;
    const adapter = {
      current: async () => current.edition.edition,
      build: async () => {
        calls++;
        return previous.edition.edition;
      },
      deploy: async () => {
        /* Successful mock operation. */
      },
      verify: async () => {
        /* Successful mock operation. */
      },
    };
    expect(
      await deployContent(adapter, previous.manifest, { automaticUpdatesEnabled: false })
    ).toBe("paused");
    await expect(
      deployContent(adapter, previous.manifest, { rollback: true, automaticUpdatesEnabled: true })
    ).rejects.toThrow("Pause");
    expect(calls).toBe(0);
    expect(
      await deployContent(adapter, previous.manifest, {
        rollback: true,
        automaticUpdatesEnabled: false,
      })
    ).toBe("deployed");
  });
  test("retries an already deployed rollback without rebuilding or redeploying", async () => {
    const target = makePublicBundle("v3.0.0", "100");
    let builds = 0;
    let deployments = 0;
    let verifications = 0;
    const outcome = await deployContent(
      {
        current: async () => target.edition.edition,
        build: async () => {
          builds++;
          return target.edition.edition;
        },
        deploy: async () => {
          deployments++;
        },
        verify: async () => {
          verifications++;
        },
      },
      target.manifest,
      { rollback: true, automaticUpdatesEnabled: false }
    );
    expect(outcome).toBe("deployed");
    expect(builds).toBe(0);
    expect(deployments).toBe(0);
    expect(verifications).toBe(1);
  });
  test("explicit rollback rejects a newer target and rechecks identity after build", async () => {
    const current = makePublicBundle("v3.0.0", "100");
    const newer = makePublicBundle("v3.1.0", "101");
    let buildCalls = 0;
    await expect(
      deployContent(
        {
          current: async () => current.edition.edition,
          build: async () => {
            buildCalls++;
            return newer.edition.edition;
          },
          deploy: async () => {
            /* Successful mock operation. */
          },
          verify: async () => {
            /* Successful mock operation. */
          },
        },
        newer.manifest,
        { rollback: true, automaticUpdatesEnabled: false }
      )
    ).rejects.toThrow("older than");
    expect(buildCalls).toBe(0);

    const target = makePublicBundle("v3.0.0", "100");
    let latest = makePublicBundle("v3.2.0", "102").edition.edition;
    const conflictingTarget = makePublicBundle("v3.0.0", "999").edition.edition;
    let deployed = false;
    await expect(
      deployContent(
        {
          current: async () => latest,
          build: async () => {
            latest = conflictingTarget;
            return target.edition.edition;
          },
          deploy: async () => {
            deployed = true;
          },
          verify: async () => {
            /* Successful mock operation. */
          },
        },
        target.manifest,
        { rollback: true, automaticUpdatesEnabled: false }
      )
    ).rejects.toThrow("older than");
    expect(deployed).toBe(false);
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
  test("rejects build output with mismatched source or package identity", async () => {
    const current = makePublicBundle();
    const next = makePublicBundle("v3.1.0", "101");
    const mutations = [
      (edition: typeof next.edition.edition) => ({
        ...edition,
        source: { ...edition.source, commit: "c".repeat(40) },
      }),
      (edition: typeof next.edition.edition) => ({
        ...edition,
        bundle: { ...edition.bundle, size: edition.bundle.size + 1 },
      }),
      (edition: typeof next.edition.edition) => ({
        ...edition,
        files: edition.files.map((file) =>
          file.path === "catalog.json" ? { ...file, sha256: "0".repeat(64) } : file
        ),
      }),
      (edition: typeof next.edition.edition) => {
        const mutated = {
          ...edition,
          contentSnapshotIdentity: sha256('{"posts":[] }\n'),
          files: edition.files.map((file) =>
            file.path === "public-snapshot.json"
              ? { ...file, sha256: sha256('{"posts":[] }\n') }
              : file
          ),
        };
        mutated.editionDigest = computeEditionDigest(mutated);
        return mutated;
      },
      (edition: typeof next.edition.edition) => ({
        ...edition,
        generatedAt: "2026-09-02T00:00:00Z",
      }),
    ];
    for (const mutate of mutations) {
      let deployed = false;
      await expect(
        deployContent(
          {
            current: async () => current.edition.edition,
            build: async () => mutate(next.edition.edition),
            deploy: async () => {
              deployed = true;
            },
            verify: async () => {
              /* Successful mock operation. */
            },
          },
          next.manifest,
          { automaticUpdatesEnabled: true }
        )
      ).rejects.toThrow("Build identity");
      expect(deployed).toBe(false);
    }
  });
});

describe("playbook-artifact-verification", () => {
  test("local archive readers enforce the carried source timestamp", async () => {
    const root = await temp();
    const publicBundle = makePublicBundle();
    await writeFile(join(root, "playbook-public-manifest.json"), encodeJson(publicBundle.manifest));
    await writeFile(join(root, "playbook-public.tar.gz"), publicBundle.archive);
    await writeFile(join(root, ".playbook-source-timestamp"), "1\n");
    await expect(readPlaybookEdition(root, "b".repeat(40), "{}\n")).rejects.toThrow("timestamp");
    await writeFile(join(root, ".playbook-source-timestamp"), "\n");
    await expect(readPlaybookEdition(root, "b".repeat(40), "{}\n")).rejects.toThrow(
      "Invalid source commit timestamp"
    );

    const supplementRoot = join(root, "supplement");
    const supplement = makeSupplementBundle();
    await mkdir(supplementRoot, { recursive: true });
    await writeFile(
      join(supplementRoot, "playbook-private-supplement-manifest.json"),
      encodeJson(supplement.manifest)
    );
    await writeFile(join(supplementRoot, "playbook-private-supplement.tar.gz"), supplement.archive);
    await expect(readPlaybookSupplement(supplementRoot, 1)).rejects.toThrow("timestamp");
  });

  test("initial console seed uses the same public snapshot as the static edition", async () => {
    const root = await temp();
    const bundle = makePublicBundle();
    await writeFile(join(root, "playbook-public-manifest.json"), encodeJson(bundle.manifest));
    await writeFile(join(root, "playbook-public.tar.gz"), bundle.archive);
    const snapshot = '{"posts":[{"slug":"same-snapshot"}]}\n';
    const snapshotPath = join(root, "public-snapshot.json");
    await writeFile(snapshotPath, snapshot);
    const expected = createPlaybookEdition(
      readPublicArchive(bundle.archive, bundle.manifest),
      bundle.manifest,
      "b".repeat(40),
      snapshot
    );
    const seeded = await loadInitialPlaybookEdition({
      bundleDir: root,
      readPointer: async () => undefined,
      rendererCommit: "b".repeat(40),
      snapshotPath,
    });
    expect(seeded?.edition.editionDigest).toBe(expected.edition.editionDigest);
    expect(seeded?.edition.contentSnapshotIdentity).toBe(expected.edition.contentSnapshotIdentity);
  });

  test("combined release console seed prefers the frontend edition over an older pointer", async () => {
    const root = await temp();
    const bundle = makePublicBundle("v3.0.0", "100");
    const seedPath = join(root, "playbook-edition.json");
    await writeFile(seedPath, encodeJson(bundle.edition));
    const seeded = await loadInitialPlaybookEdition({
      seedPath,
      readPointer: async () => makePublicBundle("v2.9.0", "99").edition.edition,
    });
    expect(seeded?.edition.source.tag).toBe("v3.0.0");
    expect(seeded?.edition.source.releaseId).toBe("100");
  });

  test("bounds the public pointer response before parsing", async () => {
    await expect(
      readPublicPointer(
        "https://blog.test/_content/playbook/manifest.json",
        async () => new Response("x".repeat(64 * 1024 + 1))
      )
    ).rejects.toThrow("size limit");
  });

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
          : url.endsWith("catalog.json")
            ? new Response(encodeJson(next.edition.catalog))
            : url.endsWith("search-documents.json")
              ? new Response(encodeJson(next.edition.search))
              : new Response("{}\n"),
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
        `https://console.test/api/public/playbook/search-index?edition=${current.edition.edition.editionDigest}&sourceReleaseId=${current.edition.edition.source.releaseId}&sourceTag=${current.edition.edition.source.tag}`
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
            `https://console.test/api/public/playbook/search-index?edition=${"0".repeat(64)}&sourceReleaseId=${current.edition.edition.source.releaseId}&sourceTag=${current.edition.edition.source.tag}`
          ),
          "/playbook/search-index",
          restored
        )
      ).status
    ).toBe(409);
    const resource = await handlePlaybookRequest(
      new Request(
        `https://console.test/api/public/playbook/resource?edition=${current.edition.edition.editionDigest}&sourceReleaseId=${current.edition.edition.source.releaseId}&sourceTag=${current.edition.edition.source.tag}&policy=safe-release&path=scripts%2Fverify.sh`
      ),
      "/playbook/resource",
      restored
    );
    expect(resource.headers.get("content-type")).toContain("text/plain");
    expect(await resource.text()).toContain("echo verify");
  });
  test("loads a source-bound private supplement only for the admin read model", async () => {
    const root = await temp();
    const publicBundle = makePublicBundle();
    const supplementBundle = makeSupplementBundle();
    const publicSeed = join(root, "playbook-edition.json");
    const supplementSeed = join(root, "playbook-private-supplement.json");
    const seedValue = (bundle: ReturnType<typeof makeSupplementBundle>) => ({
      manifest: bundle.manifest,
      catalog: JSON.parse(bundle.files[0].content),
      search: JSON.parse(bundle.files[1].content),
      rawFiles: encodePlaybookRawFiles(
        new Map(bundle.files.map((file) => [file.path, Buffer.from(file.content)]))
      ),
    });
    await writeFile(publicSeed, encodeJson(publicBundle.edition));
    await writeFile(supplementSeed, encodeJson(seedValue(supplementBundle)));
    const store = new PlaybookStore(root);
    await store.load(publicSeed, supplementSeed);
    expect(store.current?.catalog.snapshot.projects).toHaveLength(1);
    expect(store.adminEdition?.catalog.snapshot.projects).toHaveLength(2);
    expect(store.adminEdition?.supplement?.manifest.bundle.name).toBe(
      "playbook-private-supplement.tar.gz"
    );
    const mismatched = makeSupplementBundle("v3.1.0", "101");
    await writeFile(supplementSeed, encodeJson(seedValue(mismatched)));
    const isolated = new PlaybookStore(await temp());
    await writeFile(join(isolated.root, "seed.json"), encodeJson(publicBundle.edition));
    await isolated.load(join(isolated.root, "seed.json"), supplementSeed);
    expect(isolated.adminEdition?.supplement).toBeUndefined();
    expect(isolated.adminEdition?.catalog.snapshot.projects).toHaveLength(1);
    const malformed = makeSupplementBundle();
    const malformedSearch = JSON.parse(malformed.files[1].content);
    malformedSearch.documents[0].route = "/topics/missing-topic";
    await writeFile(
      supplementSeed,
      encodeJson({ ...seedValue(malformed), search: malformedSearch })
    );
    const malformedStore = new PlaybookStore(await temp());
    await writeFile(join(malformedStore.root, "seed.json"), encodeJson(publicBundle.edition));
    await malformedStore.load(join(malformedStore.root, "seed.json"), supplementSeed);
    expect(malformedStore.adminEdition?.supplement).toBeUndefined();
    expect(malformedStore.adminEdition?.catalog.snapshot.projects).toHaveLength(1);
  });
  test("rejects a supplement seed whose raw bytes do not match its manifest", async () => {
    const root = await temp();
    const publicBundle = makePublicBundle();
    const supplementBundle = makeSupplementBundle();
    const tamperedCatalog = Buffer.concat([
      Buffer.from(supplementBundle.files[0].content),
      Buffer.from("\n"),
    ]);
    const supplementSeed = join(root, "playbook-private-supplement.json");
    await writeFile(join(root, "playbook-edition.json"), encodeJson(publicBundle.edition));
    await writeFile(
      supplementSeed,
      encodeJson({
        manifest: supplementBundle.manifest,
        catalog: JSON.parse(supplementBundle.files[0].content),
        search: JSON.parse(supplementBundle.files[1].content),
        rawFiles: encodePlaybookRawFiles(
          new Map([
            ["catalog.json", tamperedCatalog],
            ["search-documents.json", Buffer.from(supplementBundle.files[1].content)],
          ])
        ),
      })
    );

    const store = new PlaybookStore(root);
    await store.load(join(root, "playbook-edition.json"), supplementSeed);

    expect(store.adminEdition?.supplement).toBeUndefined();
    expect(store.adminEdition?.catalog.snapshot.projects).toHaveLength(1);
  });
  test("stages a supplement by source identity across public edition adoption", async () => {
    const root = await temp();
    const current = makePublicBundle();
    const next = makePublicBundle("v3.1.0", "101");
    const supplementBundle = makeSupplementBundle("v3.1.0", "101");
    const supplement = {
      manifest: supplementBundle.manifest,
      catalog: JSON.parse(supplementBundle.files[0].content),
      search: JSON.parse(supplementBundle.files[1].content),
    };
    const store = new PlaybookStore(root);

    await store.adopt(current.edition);
    await store.updateSupplement(supplementBundle.manifest.source, supplement);
    await store.updateSupplement(next.edition.edition.source);
    expect(
      JSON.parse(await readFile(join(root, "supplement-state.json"), "utf8")).supplement
    ).toBeDefined();
    expect(store.adminEdition?.catalog.snapshot.projects).toHaveLength(1);

    await store.adopt(next.edition);
    expect(store.adminEdition?.catalog.snapshot.projects).toHaveLength(2);
    expect(store.adminEdition?.supplement).toBeDefined();

    const restored = new PlaybookStore(root);
    await restored.load(join(root, "missing-seed.json"));
    expect(restored.adminEdition?.catalog.snapshot.projects).toHaveLength(2);

    await restored.updateSupplement(next.edition.edition.source);
    expect(restored.adminEdition?.catalog.snapshot.projects).toHaveLength(2);
    expect(restored.adminEdition?.supplement).toBeDefined();
  });
  test("serializes supplement updates so stale arrivals cannot replace a newer staged source", async () => {
    const root = await temp();
    const current = makePublicBundle();
    const next = makePublicBundle("v3.1.0", "101");
    const newerBundle = makeSupplementBundle("v3.1.0", "101");
    const olderBundle = makeSupplementBundle("v3.0.0", "100");
    const newer = {
      manifest: newerBundle.manifest,
      catalog: JSON.parse(newerBundle.files[0].content),
      search: JSON.parse(newerBundle.files[1].content),
    };
    const older = {
      manifest: olderBundle.manifest,
      catalog: JSON.parse(olderBundle.files[0].content),
      search: JSON.parse(olderBundle.files[1].content),
    };
    const store = new PlaybookStore(root);
    await store.adopt(current.edition);

    const newerUpdate = store.updateSupplement(newerBundle.manifest.source, newer);
    const olderUpdate = store.updateSupplement(olderBundle.manifest.source, older);
    await newerUpdate;
    await expect(olderUpdate).rejects.toThrow("older");

    await store.adopt(next.edition);
    expect(store.adminEdition?.catalog.snapshot.projects).toHaveLength(2);
  });
  test("restores an overlay after the public store adopts an explicit rollback", async () => {
    const root = await temp();
    const older = makePublicBundle("v3.0.0", "100");
    const newer = makePublicBundle("v3.1.0", "101");
    const olderSupplementBundle = makeSupplementBundle("v3.0.0", "100");
    const newerSupplementBundle = makeSupplementBundle("v3.1.0", "101");
    const olderSupplement = {
      manifest: olderSupplementBundle.manifest,
      catalog: JSON.parse(olderSupplementBundle.files[0].content),
      search: JSON.parse(olderSupplementBundle.files[1].content),
    };
    const newerSupplement = {
      manifest: newerSupplementBundle.manifest,
      catalog: JSON.parse(newerSupplementBundle.files[0].content),
      search: JSON.parse(newerSupplementBundle.files[1].content),
    };
    const store = new PlaybookStore(root);

    await store.adopt(older.edition);
    await store.updateSupplement(older.edition.edition.source, olderSupplement);
    await store.adopt(newer.edition);
    await store.updateSupplement(newer.edition.edition.source, newerSupplement);
    expect(store.adminEdition?.supplement).toBeDefined();

    await store.adopt(older.edition);
    expect(store.adminEdition?.supplement).toBeUndefined();
    await store.updateSupplement(older.edition.edition.source, olderSupplement);
    expect(store.adminEdition?.supplement).toBeDefined();

    await expect(
      store.updateSupplement(newer.edition.edition.source, newerSupplement)
    ).rejects.toThrow("adopted rollback");
    expect(store.adminEdition?.supplement?.manifest.source.tag).toBe("v3.0.0");
  });
  test("stages a rollback overlay before the public store adopts an older edition", async () => {
    const root = await temp();
    const previous = makePublicBundle("v3.0.0", "100");
    const newer = makePublicBundle("v3.1.0", "101");
    const older = makePublicBundle("v2.9.0", "99");
    const olderSupplementBundle = makeSupplementBundle("v2.9.0", "99");
    const olderSupplement = {
      manifest: olderSupplementBundle.manifest,
      catalog: JSON.parse(olderSupplementBundle.files[0].content),
      search: JSON.parse(olderSupplementBundle.files[1].content),
    };
    const store = new PlaybookStore(root);

    await store.adopt(previous.edition);
    await store.adopt(newer.edition);
    await store.updateSupplement(older.edition.edition.source, olderSupplement, undefined, {
      allowRollback: true,
    });

    expect(store.adminEdition?.supplement).toBeUndefined();
    await store.adopt(older.edition);
    expect(store.adminEdition?.supplement).toBeDefined();
  });
  test("isolates a staged rollback overlay that cannot merge into the adopted edition", async () => {
    const root = await temp();
    const previous = makePublicBundle("v3.0.0", "100");
    const newer = makePublicBundle("v3.1.0", "101");
    const older = makePublicBundle("v2.9.0", "99");
    const invalidCatalog = structuredClone(
      JSON.parse(makeSupplementBundle("v2.9.0", "99").files[0].content)
    );
    invalidCatalog.relation_edges.push({
      topic_slug: "missing-topic",
      project_slug: "private-project",
      project_name: "Private Project",
    });
    const invalidBundle = makeSupplementBundle("v2.9.0", "99", invalidCatalog);
    const invalidSupplement = {
      manifest: invalidBundle.manifest,
      catalog: JSON.parse(invalidBundle.files[0].content),
      search: JSON.parse(invalidBundle.files[1].content),
    };
    const store = new PlaybookStore(root);

    await store.adopt(previous.edition);
    await store.adopt(newer.edition);
    await store.updateSupplement(older.edition.edition.source, invalidSupplement, undefined, {
      allowRollback: true,
    });

    await store.adopt(older.edition);
    expect(store.current?.edition.source.tag).toBe("v2.9.0");
    expect(store.adminEdition?.supplement).toBeUndefined();
    const retryBundle = makeSupplementBundle("v2.9.0", "99");
    const retrySupplement = validatePlaybookSupplement({
      manifest: retryBundle.manifest,
      catalog: JSON.parse(retryBundle.files[0].content),
      search: JSON.parse(retryBundle.files[1].content),
    });
    const restored = new PlaybookStore(root);
    await restored.load(join(root, "missing-seed.json"));
    expect(restored.adminEdition?.supplement).toBeUndefined();
    await restored.updateSupplement(older.edition.edition.source, retrySupplement);
    expect(restored.adminEdition?.supplement).toBeDefined();
  });
  test("does not clear an accepted overlay on a same-source absent retry", async () => {
    const root = await temp();
    const current = makePublicBundle();
    const supplementBundle = makeSupplementBundle();
    const supplement = {
      manifest: supplementBundle.manifest,
      catalog: JSON.parse(supplementBundle.files[0].content),
      search: JSON.parse(supplementBundle.files[1].content),
    };
    const store = new PlaybookStore(root);

    await store.adopt(current.edition);
    await store.updateSupplement(current.edition.edition.source, supplement);
    await store.updateSupplement(current.edition.edition.source);

    expect(store.adminEdition?.supplement).toBeDefined();
    expect(store.adminEdition?.catalog.snapshot.projects).toHaveLength(2);
  });
  test("hides an invalid overlay when its retryable tombstone cannot persist", async () => {
    const root = await temp();
    const current = makePublicBundle();
    const supplementBundle = makeSupplementBundle();
    const supplement = {
      manifest: supplementBundle.manifest,
      catalog: JSON.parse(supplementBundle.files[0].content),
      search: JSON.parse(supplementBundle.files[1].content),
    };
    const store = new PlaybookStore(root);

    await store.adopt(current.edition);
    await store.updateSupplement(current.edition.edition.source, supplement);
    const supplementStatePath = join(root, "supplement-state.json");
    await rm(supplementStatePath);
    await mkdir(supplementStatePath);

    await expect(
      store.updateSupplement(current.edition.edition.source, undefined, undefined, {
        allowSameSourceRetry: true,
      })
    ).rejects.toThrow();
    expect(store.adminEdition?.supplement).toBeUndefined();
    expect(store.adminEdition?.catalog.snapshot.projects).toHaveLength(1);
    expect(
      JSON.parse(await readFile(join(root, "state.json"), "utf8")).supplementInvalidation
    ).toEqual(current.edition.edition.source);

    const restored = new PlaybookStore(root);
    await restored.load(join(root, "missing-seed.json"));
    expect(restored.adminEdition?.supplement).toBeUndefined();

    await rm(supplementStatePath, { recursive: true });
    await store.updateSupplement(current.edition.edition.source, supplement);
    expect(store.adminEdition?.supplement).toBeDefined();
    expect(
      JSON.parse(await readFile(join(root, "state.json"), "utf8")).supplementInvalidation
    ).toBeUndefined();
  });
  test("does not let a stale invalidation marker hide a valid persisted overlay after restart", async () => {
    const root = await temp();
    const current = makePublicBundle();
    const supplementBundle = makeSupplementBundle();
    const supplement = {
      manifest: supplementBundle.manifest,
      catalog: JSON.parse(supplementBundle.files[0].content),
      search: JSON.parse(supplementBundle.files[1].content),
    };
    const store = new PlaybookStore(root);

    await store.adopt(current.edition);
    await store.updateSupplement(current.edition.edition.source, supplement);
    await writeFile(
      join(root, "state.json"),
      JSON.stringify({
        current: current.edition,
        supplementInvalidation: current.edition.edition.source,
      })
    );

    const restored = new PlaybookStore(root);
    await restored.load(join(root, "missing-seed.json"));
    expect(restored.adminEdition?.supplement).toBeDefined();
  });
  test("does not replace a same-source empty overlay with a supplement", async () => {
    const root = await temp();
    const current = makePublicBundle();
    const supplementBundle = makeSupplementBundle();
    const supplement = {
      manifest: supplementBundle.manifest,
      catalog: JSON.parse(supplementBundle.files[0].content),
      search: JSON.parse(supplementBundle.files[1].content),
    };
    const store = new PlaybookStore(root);

    await store.adopt(current.edition);
    await store.updateSupplement(current.edition.edition.source);
    await expect(
      store.updateSupplement(current.edition.edition.source, supplement)
    ).rejects.toThrow("source identity conflict");
    expect(store.adminEdition?.supplement).toBeUndefined();
  });
  test("rejects changed supplement content for an existing source identity", async () => {
    const root = await temp();
    const current = makePublicBundle();
    const originalBundle = makeSupplementBundle();
    const changedCatalog = structuredClone(JSON.parse(originalBundle.files[0].content));
    changedCatalog.snapshot.projects[0].description = "Changed supplement content";
    changedCatalog.project_details[0].item.description = "Changed supplement content";
    const changedBundle = makeSupplementBundle(
      originalBundle.manifest.source.tag,
      originalBundle.manifest.source.releaseId,
      changedCatalog
    );
    const original = {
      manifest: originalBundle.manifest,
      catalog: JSON.parse(originalBundle.files[0].content),
      search: JSON.parse(originalBundle.files[1].content),
    };
    const changed = {
      manifest: changedBundle.manifest,
      catalog: JSON.parse(changedBundle.files[0].content),
      search: JSON.parse(changedBundle.files[1].content),
    };
    const store = new PlaybookStore(root);
    await store.adopt(current.edition);
    await store.updateSupplement(originalBundle.manifest.source, original);

    await expect(store.updateSupplement(changedBundle.manifest.source, changed)).rejects.toThrow(
      "source identity conflict"
    );
    expect(store.adminEdition?.supplement?.catalog.snapshot.projects[0]?.description).toBe(
      "整理后的私有补充项目知识。"
    );
  });
  test("rejects a tampered persisted supplement projection after restart", async () => {
    const root = await temp();
    const current = makePublicBundle();
    const supplementBundle = makeSupplementBundle();
    const supplement = {
      manifest: supplementBundle.manifest,
      catalog: JSON.parse(supplementBundle.files[0].content),
      search: JSON.parse(supplementBundle.files[1].content),
    };
    const store = new PlaybookStore(root);
    await store.adopt(current.edition);
    await store.updateSupplement(supplementBundle.manifest.source, supplement);

    const statePath = join(root, "supplement-state.json");
    const persisted = JSON.parse(await readFile(statePath, "utf8"));
    persisted.supplement.catalog.snapshot.projects[0].description = "Tampered persisted content";
    persisted.supplement.catalog.project_details[0].item.description = "Tampered persisted content";
    await writeFile(statePath, encodeJson(persisted));

    const restored = new PlaybookStore(root);
    await restored.load(join(root, "missing-seed.json"));
    expect(restored.adminEdition?.supplement).toBeUndefined();
    expect(restored.adminEdition?.catalog.snapshot.projects).toHaveLength(1);
  });
  test("isolates a staged supplement that conflicts with its adopted public edition", async () => {
    const root = await temp();
    const current = makePublicBundle();
    const next = makePublicBundle("v3.1.0", "101");
    const supplementBundle = makeSupplementBundle("v3.1.0", "101");
    const catalog = JSON.parse(supplementBundle.files[0].content);
    catalog.snapshot.projects[0].slug = "sample-project";
    catalog.project_details[0].item.slug = "sample-project";
    const conflictingBundle = makeSupplementBundle("v3.1.0", "101", catalog);
    const supplement = validatePlaybookSupplement({
      manifest: conflictingBundle.manifest,
      catalog: JSON.parse(conflictingBundle.files[0].content),
      search: JSON.parse(conflictingBundle.files[1].content),
    });
    const store = new PlaybookStore(root);
    await store.adopt(current.edition);
    await store.updateSupplement(conflictingBundle.manifest.source, supplement);
    expect(store.adminEdition?.catalog.snapshot.projects).toHaveLength(1);
    await store.adopt(next.edition);
    expect(store.current?.edition.source.tag).toBe("v3.1.0");
    expect(store.adminEdition?.catalog.snapshot.projects).toHaveLength(1);
    expect(store.adminEdition?.supplement).toBeUndefined();
    const retryBundle = makeSupplementBundle("v3.1.0", "101");
    const retrySupplement = validatePlaybookSupplement({
      manifest: retryBundle.manifest,
      catalog: JSON.parse(retryBundle.files[0].content),
      search: JSON.parse(retryBundle.files[1].content),
    });
    await store.updateSupplement(retryBundle.manifest.source, retrySupplement);
    expect(store.adminEdition?.catalog.snapshot.projects).toHaveLength(2);
    expect(store.adminEdition?.supplement).toBeDefined();
  });
  test("keeps public adoption successful when conflicting supplement cleanup cannot persist", async () => {
    const root = await temp();
    const current = makePublicBundle();
    const next = makePublicBundle("v3.1.0", "101");
    const supplementBundle = makeSupplementBundle("v3.1.0", "101");
    const catalog = JSON.parse(supplementBundle.files[0].content);
    catalog.snapshot.projects[0].slug = "sample-project";
    catalog.project_details[0].item.slug = "sample-project";
    const conflictingBundle = makeSupplementBundle("v3.1.0", "101", catalog);
    const conflicting = validatePlaybookSupplement({
      manifest: conflictingBundle.manifest,
      catalog: JSON.parse(conflictingBundle.files[0].content),
      search: JSON.parse(conflictingBundle.files[1].content),
    });
    const store = new PlaybookStore(root);
    await store.adopt(current.edition);
    await store.updateSupplement(conflictingBundle.manifest.source, conflicting);
    const supplementStatePath = join(root, "supplement-state.json");
    await rm(supplementStatePath);
    await mkdir(supplementStatePath);

    await expect(store.adopt(next.edition)).resolves.toBeUndefined();
    expect(store.current?.edition.source.tag).toBe("v3.1.0");
    expect(store.adminEdition?.catalog.snapshot.projects).toHaveLength(1);
    expect(store.adminEdition?.supplement).toBeUndefined();

    await rm(supplementStatePath, { recursive: true });
    const retryBundle = makeSupplementBundle("v3.1.0", "101");
    const retrySupplement = validatePlaybookSupplement({
      manifest: retryBundle.manifest,
      catalog: JSON.parse(retryBundle.files[0].content),
      search: JSON.parse(retryBundle.files[1].content),
    });
    await store.updateSupplement(retryBundle.manifest.source, retrySupplement);
    expect(store.adminEdition?.supplement).toBeDefined();
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
      if (url.endsWith("catalog.json")) return new Response(encodeJson(next.edition.catalog));
      if (url.endsWith("search-documents.json"))
        return new Response(encodeJson(next.edition.search));
      return new Response("{}\n");
    });
    await store.adopt(current.edition);
    await Promise.all([store.sync(), store.sync()]);
    expect(requests).toBe(4);
    expect(store.current?.edition.source.tag).toBe("v3.1.0");
    expect(
      store.getEdition(
        current.edition.edition.editionDigest,
        current.edition.edition.source.releaseId,
        current.edition.edition.source.tag
      )
    ).toBeDefined();
    fail = true;
    await expect(store.sync()).rejects.toThrow();
    expect(store.current?.edition.source.tag).toBe("v3.1.0");
    expect(PLAYBOOK_POLL_INTERVAL_MS).toBe(300_000);
  });
  test("runs edition preparation only after the edition is atomically adopted", async () => {
    const root = await temp();
    const current = makePublicBundle();
    const next = makePublicBundle("v3.1.0", "101");
    const store = new PlaybookStore(root, async (url) => {
      if (url.endsWith("manifest.json")) return Response.json(next.edition.edition);
      if (url.endsWith("catalog.json")) return new Response(encodeJson(next.edition.catalog));
      if (url.endsWith("search-documents.json"))
        return new Response(encodeJson(next.edition.search));
      return new Response("{}\n");
    });
    await store.adopt(current.edition);

    let observedCurrent = false;
    await store.sync(undefined, undefined, async (edition) => {
      observedCurrent = Boolean(
        store.current && samePlaybookEdition(store.current.edition, edition.edition)
      );
    });

    expect(observedCurrent).toBe(true);
    expect(store.current?.edition.source.tag).toBe("v3.1.0");
  });
  test("keeps an adopted edition when semantic preparation fails afterwards", async () => {
    const root = await temp();
    const current = makePublicBundle();
    const next = makePublicBundle("v3.1.0", "101");
    const store = new PlaybookStore(root, async (url) => {
      if (url.endsWith("manifest.json")) return Response.json(next.edition.edition);
      if (url.endsWith("catalog.json")) return new Response(encodeJson(next.edition.catalog));
      if (url.endsWith("search-documents.json"))
        return new Response(encodeJson(next.edition.search));
      return new Response("{}\n");
    });
    await store.adopt(current.edition);

    await expect(
      store.sync(undefined, undefined, async () => {
        throw new Error("embedding unavailable");
      })
    ).rejects.toThrow("embedding unavailable");
    expect(store.current?.edition.source.tag).toBe("v3.1.0");
  });
  test("shares staged downloads and cancels the active operation without a stale controller", async () => {
    const root = await temp();
    const next = makePublicBundle("v3.1.0", "101");
    let catalogStarted = false;
    let manifestRequests = 0;
    const store = new PlaybookStore(root, async (url, init) => {
      if (url.endsWith("manifest.json")) {
        manifestRequests++;
        return Response.json(next.edition.edition);
      }
      if (url.endsWith("catalog.json")) {
        catalogStarted = true;
        await new Promise<never>((_, reject) => {
          init?.signal?.addEventListener("abort", () => reject(init?.signal?.reason), {
            once: true,
          });
        });
      }
      if (url.endsWith("search-documents.json"))
        return new Response(encodeJson(next.edition.search));
      return new Response("{}\n");
    });

    const first = store.downloadEdition();
    while (!catalogStarted) await Bun.sleep(0);
    const second = store.downloadEdition();
    expect(second).toBe(first);
    expect(manifestRequests).toBe(1);

    store.cancelSync();
    await expect(first).rejects.toThrow();
    await expect(second).rejects.toThrow();
  });
  test("stages a verified edition without replacing the current edition until adoption", async () => {
    const root = await temp();
    const current = makePublicBundle("v3.0.0", "100");
    const next = makePublicBundle("v3.1.0", "101");
    const store = new PlaybookStore(root, async (url) => {
      if (url.endsWith("manifest.json")) return Response.json(next.edition.edition);
      if (url.endsWith("catalog.json")) return new Response(encodeJson(next.edition.catalog));
      if (url.endsWith("search-documents.json"))
        return new Response(encodeJson(next.edition.search));
      return new Response("{}\n");
    });
    await store.adopt(current.edition);

    const staged = await store.downloadEdition();

    expect(staged?.edition.source.tag).toBe("v3.1.0");
    expect(store.current?.edition.source.tag).toBe("v3.0.0");
    if (!staged) throw new Error("expected a staged edition");
    await store.adopt(staged);
    expect(store.current?.edition.source.tag).toBe("v3.1.0");
  });
  test("keeps the current edition when the published article snapshot fails integrity", async () => {
    const root = await temp();
    const current = makePublicBundle("v3.0.0", "100");
    const next = makePublicBundle("v3.1.0", "101");
    const store = new PlaybookStore(root, async (url) => {
      if (url.endsWith("manifest.json")) return Response.json(next.edition.edition);
      if (url.endsWith("catalog.json")) return new Response(encodeJson(next.edition.catalog));
      if (url.endsWith("search-documents.json"))
        return new Response(encodeJson(next.edition.search));
      return new Response("x}\n");
    });
    await store.adopt(current.edition);
    let preparationCalls = 0;
    await expect(
      store.sync(undefined, undefined, async () => {
        preparationCalls++;
      })
    ).rejects.toThrow("integrity");
    expect(preparationCalls).toBe(0);
    expect(store.current?.edition.source.tag).toBe("v3.0.0");
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
      if (url.endsWith("catalog.json")) return new Response(encodeJson(rollback.edition.catalog));
      if (url.endsWith("search-documents.json"))
        return new Response(encodeJson(rollback.edition.search));
      return new Response("{}\n");
    });
    await store.adopt(newer.edition);
    await store.sync();
    expect(store.current?.edition.source.tag).toBe("v3.0.0");
    const html = renderToStaticMarkup(
      createElement(PlaybookPage, { edition: store.current, path: "topics/delivery" })
    );
    expect(html).toContain("Restored stable content");
    expect(requests).toBe(4);
    const restored = new PlaybookStore(root);
    await restored.load(join(root, "missing-seed.json"));
    expect(restored.current?.edition).toEqual(rollback.edition.edition);
    expect(
      restored.getEdition(
        newer.edition.edition.editionDigest,
        newer.edition.edition.source.releaseId,
        newer.edition.edition.source.tag
      )?.edition
    ).toEqual(newer.edition.edition);
  });
});
test("retains distinct source identities when two Releases have identical data digests", async () => {
  const root = await temp();
  const old = makePublicBundle("v3.0.0", "100");
  const next = makePublicBundle("v3.1.0", "101");
  expect(next.edition.edition.editionDigest).toBe(old.edition.edition.editionDigest);
  const store = new PlaybookStore(root);
  await store.adopt(old.edition);
  await store.adopt(next.edition);
  await store.adopt(next.edition);
  const persisted = JSON.parse(await readFile(join(root, "state.json"), "utf8"));
  expect(persisted.current.edition.source).toEqual(next.manifest.source);
  expect(persisted.previous.edition.source).toEqual(old.manifest.source);
  const restored = new PlaybookStore(root);
  await restored.load(join(root, "missing-seed.json"));
  expect(restored.current?.edition.source).toEqual(next.manifest.source);
  const response = await handlePlaybookRequest(
    new Request(
      `https://console.test/api/public/playbook/search-index?edition=${old.edition.edition.editionDigest}&sourceReleaseId=${old.edition.edition.source.releaseId}&sourceTag=${old.edition.edition.source.tag}`
    ),
    "/playbook/search-index",
    restored
  );
  expect(response.status).toBe(200);
  expect(await response.text()).toBe(encodeJson(old.edition.search));
  expect(response.headers.get("x-playbook-source-release-id")).toBe(
    old.edition.edition.source.releaseId
  );
  expect(response.headers.get("x-playbook-source-tag")).toBe(old.edition.edition.source.tag);
  expect(
    (
      await handlePlaybookRequest(
        new Request(
          `https://console.test/api/public/playbook/search-index?edition=${old.edition.edition.editionDigest}&sourceReleaseId=${next.edition.edition.source.releaseId}&sourceTag=${next.edition.edition.source.tag}`
        ),
        "/playbook/search-index",
        restored
      )
    ).status
  ).toBe(200);
  expect(
    (
      await handlePlaybookRequest(
        new Request(
          `https://console.test/api/public/playbook/search-index?edition=${old.edition.edition.editionDigest}`
        ),
        "/playbook/search-index",
        restored
      )
    ).status
  ).toBe(400);
  expect(
    (
      await handlePlaybookRequest(
        new Request(
          `https://console.test/api/public/playbook/search-index?edition=${old.edition.edition.editionDigest}&sourceReleaseId=999&sourceTag=v9.0.0`
        ),
        "/playbook/search-index",
        restored
      )
    ).status
  ).toBe(409);
  await restored.adopt(next.edition);
  expect(
    JSON.parse(await readFile(join(root, "state.json"), "utf8")).previous.edition.source
  ).toEqual(old.manifest.source);
});

test("Chinese, English and independent Policy documents use the upstream tokenization strategy", () => {
  const { edition } = makePublicBundle();
  const index = buildPlaybookIndex(edition.search, createPlaybookSearchPages(edition.catalog));
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
