import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import {
  computeEditionDigest,
  encodeJson,
  fileRecord,
  parseManifest,
  sha256,
  verifyFile,
} from "./manifest";
import { normalizePlaybookSearch } from "./navigation";
import { assertPublicCatalog, commitSchema, digestSchema, searchSchema } from "./schema";
import type { PlaybookEdition, PlaybookManifest } from "./types";

export const PLAYBOOK_MANIFEST_FILE = "playbook-public-manifest.json";
const FILES = ["catalog.json", "search-documents.json"];

// Parse the tiny ustar data contract in memory. Never extract paths or execute assets.
export function readPublicArchive(archive: Uint8Array, manifest: PlaybookManifest) {
  if (archive.byteLength !== manifest.bundle.size || sha256(archive) !== manifest.bundle.sha256)
    throw new Error("Playbook bundle integrity mismatch");
  const tar = gunzipSync(archive, { maxOutputLength: 64 * 1024 * 1024 });
  const files = new Map<string, Buffer>();
  let offset = 0;
  while (offset + 512 <= tar.length) {
    const header = tar.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) {
      if (tar.subarray(offset).some((byte) => byte !== 0))
        throw new Error("Unexpected archive data after terminator");
      break;
    }
    const field = (start: number, size: number) =>
      header
        .subarray(start, start + size)
        .toString("utf8")
        .split("\0")[0];
    const name = field(0, 100).replace(/^\.\//u, "");
    const prefix = field(345, 155);
    const sizeText = field(124, 12).trim();
    const checksumText = field(148, 8).trim();
    if (!/^[0-7]+$/u.test(sizeText) || !/^[0-7]+$/u.test(checksumText))
      throw new Error("Invalid archive header");
    const size = Number.parseInt(sizeText, 8);
    let checksum = 0;
    for (let i = 0; i < 512; i++) checksum += i >= 148 && i < 156 ? 32 : header[i];
    if (checksum !== Number.parseInt(checksumText, 8)) throw new Error("Invalid archive checksum");
    const kind = field(156, 1);
    if (prefix || !FILES.includes(name) || (kind !== "0" && kind !== "") || files.has(name))
      throw new Error(`Unsafe or unexpected archive entry: ${name}`);
    const end = offset + 512 + size;
    if (!Number.isSafeInteger(size) || end > tar.length) throw new Error("Truncated archive");
    const bytes = tar.subarray(offset + 512, end);
    const record = manifest.files.find((file) => file.path === name);
    if (!record) throw new Error("Archive file missing from manifest");
    verifyFile(bytes, record);
    files.set(name, bytes);
    offset += 512 + Math.ceil(size / 512) * 512;
  }
  if (files.size !== FILES.length) throw new Error("Archive data files are incomplete");
  if (offset >= tar.length || tar.length % 512 !== 0)
    throw new Error("Archive has no complete terminator");
  return files;
}

export function createPlaybookEdition(
  files: Map<string, Uint8Array>,
  manifest: PlaybookManifest,
  rendererCommit: string,
  publicSnapshot: Uint8Array | string
): PlaybookEdition {
  commitSchema.parse(rendererCommit);
  const contentSnapshotIdentity = sha256(publicSnapshot);
  digestSchema.parse(contentSnapshotIdentity);
  const catalog = assertPublicCatalog(
    JSON.parse(Buffer.from(files.get("catalog.json") ?? []).toString("utf8"))
  );
  const search = normalizePlaybookSearch(
    catalog,
    searchSchema.parse(
      JSON.parse(Buffer.from(files.get("search-documents.json") ?? []).toString("utf8"))
    )
  );
  const records = [
    fileRecord("catalog.json", encodeJson(catalog)),
    fileRecord("search-documents.json", encodeJson(search)),
    fileRecord("public-snapshot.json", publicSnapshot),
  ];
  const edition = {
    schemaVersion: 1 as const,
    editionDigest: "",
    rendererCommit,
    contentSnapshotIdentity,
    source: manifest.source,
    bundle: manifest.bundle,
    files: records,
    generatedAt: manifest.source.publishedAt,
  };
  edition.editionDigest = computeEditionDigest(edition);
  return { edition, catalog, search };
}

export async function readPlaybookEdition(
  root: string,
  rendererCommit: string,
  publicSnapshot: Uint8Array | string
) {
  const manifest = parseManifest(
    JSON.parse(await readFile(join(root, PLAYBOOK_MANIFEST_FILE), "utf8"))
  );
  const archive = await readFile(join(root, manifest.bundle.name));
  return createPlaybookEdition(
    readPublicArchive(archive, manifest),
    manifest,
    rendererCommit,
    publicSnapshot
  );
}
