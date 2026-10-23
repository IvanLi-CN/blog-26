import { describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { downloadRetainedEdition } from "../../src/lib/playbook/artifacts";
import { createPlaybookEdition } from "../../src/lib/playbook/bundle";
import { publicFixtureCatalog, publicFixtureSearch } from "../../src/lib/playbook/fixture";
import { encodeJson, fileRecord, sha256 } from "../../src/lib/playbook/manifest";
import { normalizePlaybookSearch } from "../../src/lib/playbook/navigation";
import { assertPublicCatalog } from "../../src/lib/playbook/schema";
import type { PlaybookManifest } from "../../src/lib/playbook/types";
import { makeArchive } from "./playbook-fixture";

describe("deployed Playbook compatibility", () => {
  test("strips historical internal doc metadata only with the deployed-read option", () => {
    const catalog = structuredClone(publicFixtureCatalog);
    catalog.project_details[0].doc_metadata.push({
      key: "source_repo",
      value: "IvanLi-CN/internal-checkout",
    });

    expect(() => assertPublicCatalog(catalog)).toThrow("Internal metadata");
    const normalized = assertPublicCatalog(catalog, { stripInternalMetadata: true });
    expect(normalized.project_details[0].doc_metadata).not.toContainEqual({
      key: "source_repo",
      value: "IvanLi-CN/internal-checkout",
    });
  });

  test("retains a historical deployed edition identity while reading its catalog", async () => {
    const catalog = structuredClone(publicFixtureCatalog);
    catalog.project_details[0].doc_metadata.push({
      key: "source_repo",
      value: "IvanLi-CN/internal-checkout",
    });
    const catalogBytes = Buffer.from(encodeJson(catalog));
    const searchBytes = Buffer.from(
      encodeJson(
        normalizePlaybookSearch(
          assertPublicCatalog(catalog, { stripInternalMetadata: true }),
          publicFixtureSearch
        )
      )
    );
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
    const source = createPlaybookEdition(
      new Map([
        ["catalog.json", catalogBytes],
        ["search-documents.json", searchBytes],
      ]),
      manifest,
      "b".repeat(40),
      "{}\n",
      undefined,
      { stripInternalMetadata: true }
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
    const destination = await mkdtemp(join(tmpdir(), "playbook-deployed-compat-"));
    const retained = await downloadRetainedEdition(
      source.edition,
      "https://blog.test/_content/playbook/manifest.json",
      destination,
      fetcher
    );
    expect(retained.edition).toEqual(source.edition);
    expect(retained.catalog.project_details[0].doc_metadata).not.toContainEqual({
      key: "source_repo",
      value: "IvanLi-CN/internal-checkout",
    });
    await rm(destination, { recursive: true, force: true });
  });
});
