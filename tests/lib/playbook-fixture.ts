import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { gzipSync } from "node:zlib";
import { createPlaybookEdition, readPublicArchive } from "../../src/lib/playbook/bundle";
import { publicFixtureCatalog, publicFixtureSearch } from "../../src/lib/playbook/fixture";
import { encodeJson, fileRecord, sha256 } from "../../src/lib/playbook/manifest";
import {
  publicReadingFixtureCatalog,
  publicReadingFixtureSearch,
} from "../../src/lib/playbook/reading-fixture";
import type {
  PlaybookManifest,
  PlaybookSearchPayload,
  PlaybookSupplementCatalog,
} from "../../src/lib/playbook/types";
import { webDemoCatalog, webDemoSearch } from "../../src/lib/playbook/web-demo-fixture";

export function makeArchive(
  files: { path: string; content: string; kind?: string; mode?: string }[],
  sourceTimestamp = 0
) {
  const parts: Buffer[] = [];
  for (const file of files) {
    const body = Buffer.from(file.content);
    const header = Buffer.alloc(512);
    header.write(file.path, 0, 100);
    header.write(file.mode || "0000644\0", 100);
    header.write("0000000\0", 108);
    header.write("0000000\0", 116);
    header.write(`${body.length.toString(8).padStart(11, "0")}\0`, 124);
    header.write(`${sourceTimestamp.toString(8).padStart(11, "0")}\0`, 136);
    header.fill(32, 148, 156);
    header.write(file.kind || "0", 156);
    header.write("ustar\0", 257);
    header.write("00", 263);
    const checksum = header.reduce((sum, byte) => sum + byte, 0);
    header.write(`${checksum.toString(8).padStart(6, "0")}\0 `, 148);
    parts.push(header, body, Buffer.alloc((512 - (body.length % 512)) % 512));
  }
  const archive = gzipSync(Buffer.concat([...parts, Buffer.alloc(1024)]));
  archive.writeUInt32LE(sourceTimestamp, 4);
  return archive;
}

export function makePublicBundle(
  tag = "v3.0.0",
  releaseId = "100",
  catalog = publicFixtureCatalog,
  search = publicFixtureSearch
) {
  const files = [
    { path: "catalog.json", content: encodeJson(catalog) },
    { path: "search-documents.json", content: encodeJson(search) },
  ];
  const archive = makeArchive(files);
  const manifest: PlaybookManifest = {
    schemaVersion: 1,
    source: {
      repository: "IvanLi-CN/style-playbook-skills",
      releaseId,
      tag,
      commit: "a".repeat(40),
      publishedAt: "2026-09-01T00:00:00Z",
    },
    bundle: { name: "playbook-public.tar.gz", size: archive.length, sha256: sha256(archive) },
    files: files.map((file) => fileRecord(file.path, file.content)),
  };
  const edition = createPlaybookEdition(
    readPublicArchive(archive, manifest),
    manifest,
    "b".repeat(40),
    "{}\n"
  );
  return { archive, manifest, edition, files };
}

const supplementProject = {
  slug: "private-project",
  name: "Private Project",
  description: "整理后的私有补充项目知识。",
  source: "private",
  tags: ["工程"],
  snapshot_exists: true,
  catalog_visibility: "private" as const,
  source_visibility: "private" as const,
  created_at: null,
  updated_at: null,
};
const supplementTopic = {
  slug: "private-topic",
  token: "私有主题",
  description: "仅供管理员浏览的主题补充。",
  categories: ["工程"],
  project_count: 1,
  related_projects: [{ slug: supplementProject.slug, name: supplementProject.name }],
  catalog_visibility: "private" as const,
};
const supplementCatalog: PlaybookSupplementCatalog = {
  snapshot: {
    index: { generated_at: "2026-09-01T00:00:00Z", project_count: 1, topic_count: 1 },
    projects: [supplementProject],
    topics: [supplementTopic],
  },
  project_details: [
    {
      item: supplementProject,
      title: "Private Project 实践快照",
      doc_metadata: [],
      stack: { runtime: "private" },
      preamble: "",
      sections: [{ id: "basics", title: "基础", markdown: "私有整理正文。" }],
    },
  ],
  topic_details: [
    {
      item: supplementTopic,
      doc_metadata: [],
      preamble: "",
      sections: [{ id: "definition", title: "定义", markdown: "私有主题正文。" }],
    },
  ],
  private_source_metadata: [
    {
      project_slug: supplementProject.slug,
      source: "https://github.com/example/private-project",
      source_visibility: "private",
    },
  ],
  relation_edges: [
    {
      topic_slug: supplementTopic.slug,
      project_slug: supplementProject.slug,
      project_name: supplementProject.name,
    },
  ],
};
const supplementSearch: PlaybookSearchPayload = {
  generated_at: "2026-09-01T00:00:00Z",
  documents: [
    {
      id: "page:topic:private-topic",
      kind: "page",
      title: "私有主题",
      subtitle: null,
      body: "私有主题正文。",
      route: "/topics/private-topic",
      section_id: null,
      keywords: ["工程"],
      command_id: null,
    },
  ],
};

export function makeSupplementBundle(
  tag = "v3.0.0",
  releaseId = "100",
  catalog = supplementCatalog,
  search = supplementSearch,
  serialize: (value: unknown) => string = encodeJson
) {
  const files = [
    { path: "catalog.json", content: serialize(catalog) },
    { path: "search-documents.json", content: serialize(search) },
  ];
  const archive = makeArchive(files);
  const manifest: PlaybookManifest = {
    schemaVersion: 1,
    source: {
      repository: "IvanLi-CN/style-playbook-skills",
      releaseId,
      tag,
      commit: "a".repeat(40),
      publishedAt: "2026-09-01T00:00:00Z",
    },
    bundle: {
      name: "playbook-private-supplement.tar.gz",
      size: archive.length,
      sha256: sha256(archive),
    },
    files: files.map((file) => fileRecord(file.path, file.content)),
  };
  return { archive, manifest, files };
}

export function makeRustSupplementBundle(tag = "v3.0.0", releaseId = "100") {
  const files = [
    {
      path: "catalog.json",
      content: readFileSync(
        resolve(import.meta.dir, "../fixtures/playbook/rust-supplement-catalog.fixture"),
        "utf8"
      ),
    },
    {
      path: "search-documents.json",
      content: readFileSync(
        resolve(import.meta.dir, "../fixtures/playbook/rust-supplement-search.fixture"),
        "utf8"
      ),
    },
  ];
  const archive = makeArchive(files);
  const manifest: PlaybookManifest = {
    schemaVersion: 1,
    source: {
      repository: "IvanLi-CN/style-playbook-skills",
      releaseId,
      tag,
      commit: "a".repeat(40),
      publishedAt: "2026-09-01T00:00:00Z",
    },
    bundle: {
      name: "playbook-private-supplement.tar.gz",
      size: archive.length,
      sha256: sha256(archive),
    },
    files: files.map((file) => fileRecord(file.path, file.content)),
  };
  return { archive, manifest, files };
}

if (import.meta.main) {
  const root = resolve(process.argv[2] || ".tmp/playbook-fixture");
  const bundle = process.argv.includes("--web-demo")
    ? makePublicBundle("v3.1.2", "240", webDemoCatalog, webDemoSearch)
    : process.argv.includes("--long")
      ? makePublicBundle("v3.0.0", "100", publicReadingFixtureCatalog, publicReadingFixtureSearch)
      : makePublicBundle();
  await mkdir(root, { recursive: true });
  await writeFile(resolve(root, "playbook-public-manifest.json"), encodeJson(bundle.manifest));
  await writeFile(resolve(root, "playbook-public.tar.gz"), bundle.archive);
  console.log(root);
}
