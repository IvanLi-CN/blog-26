import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { gzipSync } from "node:zlib";
import { createPlaybookEdition, readPublicArchive } from "../../src/lib/playbook/bundle";
import { publicFixtureCatalog, publicFixtureSearch } from "../../src/lib/playbook/fixture";
import { encodeJson, fileRecord, sha256 } from "../../src/lib/playbook/manifest";
import type { PlaybookManifest } from "../../src/lib/playbook/types";

export function makeArchive(files: { path: string; content: string; kind?: string }[]) {
  const parts: Buffer[] = [];
  for (const file of files) {
    const body = Buffer.from(file.content);
    const header = Buffer.alloc(512);
    header.write(file.path, 0, 100);
    header.write("0000644\0", 100);
    header.write("0000000\0", 108);
    header.write("0000000\0", 116);
    header.write(`${body.length.toString(8).padStart(11, "0")}\0`, 124);
    header.write("00000000000\0", 136);
    header.fill(32, 148, 156);
    header.write(file.kind || "0", 156);
    header.write("ustar\0", 257);
    const checksum = header.reduce((sum, byte) => sum + byte, 0);
    header.write(`${checksum.toString(8).padStart(6, "0")}\0 `, 148);
    parts.push(header, body, Buffer.alloc((512 - (body.length % 512)) % 512));
  }
  return gzipSync(Buffer.concat([...parts, Buffer.alloc(1024)]));
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

if (import.meta.main) {
  const root = resolve(process.argv[2] || ".tmp/playbook-fixture");
  const bundle = makePublicBundle();
  await mkdir(root, { recursive: true });
  await writeFile(resolve(root, "playbook-public-manifest.json"), encodeJson(bundle.manifest));
  await writeFile(resolve(root, "playbook-public.tar.gz"), bundle.archive);
  console.log(root);
}
