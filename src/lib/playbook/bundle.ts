import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { gunzipSync, inflateRawSync } from "node:zlib";
import {
  computeEditionDigest,
  decodeUtf8,
  encodeJson,
  encodePlaybookRawFiles,
  fileRecord,
  parseEditionIdentity,
  parseJson,
  parseManifest,
  sha256,
  verifyFile,
} from "./manifest";
import { normalizePlaybookSearch } from "./navigation";
import {
  assertPublicCatalog,
  assertSupplementCatalog,
  commitSchema,
  digestSchema,
  isLegacyPublicCatalog,
  PLAYBOOK_PUBLIC_BUNDLE_NAME,
  PLAYBOOK_SUPPLEMENT_BUNDLE_NAME,
  type PublicCatalogOptions,
  searchSchema,
} from "./schema";
import type { PlaybookEdition, PlaybookManifest } from "./types";

export const PLAYBOOK_MANIFEST_FILE = "playbook-public-manifest.json";
export const PLAYBOOK_SOURCE_TIMESTAMP_FILE = ".playbook-source-timestamp";
const FILES = ["catalog.json", "search-documents.json"];

function assertSourceTimestamp(value: number) {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error("Invalid source commit timestamp");
  return value;
}

async function readExpectedSourceTimestamp(root: string, explicit?: number) {
  if (explicit !== undefined) return assertSourceTimestamp(explicit);
  const sidecar = await readFile(join(root, PLAYBOOK_SOURCE_TIMESTAMP_FILE), "utf8").catch(
    (error) => {
      if (error?.code === "ENOENT") return undefined;
      throw error;
    }
  );
  if (sidecar !== undefined) {
    const raw = sidecar.trim();
    if (!/^\d+$/u.test(raw)) throw new Error("Invalid source commit timestamp");
    const value = Number(raw);
    return assertSourceTimestamp(value);
  }
  const identity = await readFile(join(root, "edition.json"), "utf8").catch((error) => {
    if (error?.code === "ENOENT") return undefined;
    throw error;
  });
  if (identity === undefined) return undefined;
  return parseEditionIdentity(parseJson(identity)).sourceTimestamp;
}

function readOctalField(
  header: Uint8Array,
  start: number,
  size: number,
  label: string,
  allowEmpty = false
) {
  const text = Buffer.from(header.subarray(start, start + size))
    .toString("utf8")
    .split("\0", 1)[0]
    .trim();
  if (!text && allowEmpty) return 0;
  if (!/^[0-7]+$/u.test(text)) throw new Error(`Invalid archive ${label}`);
  const value = Number.parseInt(text, 8);
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`Invalid archive ${label}`);
  return value;
}

function assertArchiveField(
  header: Uint8Array,
  start: number,
  expected: Uint8Array,
  label: string
) {
  const actual = header.subarray(start, start + expected.length);
  if (actual.length !== expected.length || actual.some((byte, index) => byte !== expected[index]))
    throw new Error(`Archive ${label} is not canonical`);
}

function canonicalTextField(value: string, size: number) {
  const encoded = Buffer.from(value, "utf8");
  if (encoded.length >= size) throw new Error("Archive text field is too long");
  const field = Buffer.alloc(size);
  encoded.copy(field);
  return field;
}

function canonicalOctalField(value: number, size: number) {
  const text = value.toString(8).padStart(size - 1, "0");
  if (text.length !== size - 1) throw new Error("Archive numeric field is too large");
  return Buffer.from(`${text}\0`, "ascii");
}

function canonicalChecksumField(value: number) {
  return Buffer.from(`${value.toString(8).padStart(6, "0")}\0 `, "ascii");
}

// Parse the tiny ustar data contract in memory. Never extract paths or execute assets.
function readArchive(
  archive: Uint8Array,
  manifest: PlaybookManifest,
  expectedBundleName: string,
  expectedSourceTimestamp?: number
) {
  if (manifest.bundle.name !== expectedBundleName)
    throw new Error(`Unexpected bundle for ${expectedBundleName}`);
  if (archive.byteLength !== manifest.bundle.size || sha256(archive) !== manifest.bundle.sha256)
    throw new Error("Playbook bundle integrity mismatch");
  if (
    archive.byteLength < 18 ||
    archive[0] !== 0x1f ||
    archive[1] !== 0x8b ||
    archive[2] !== 0x08 ||
    archive[3] !== 0 ||
    archive[8] !== 2 ||
    archive[9] !== 255
  )
    throw new Error("Unsupported gzip format; expected one deterministic member and header");
  const gzipTimestamp = new DataView(archive.buffer, archive.byteOffset + 4, 4).getUint32(0, true);
  if (
    expectedSourceTimestamp !== undefined &&
    (!Number.isSafeInteger(expectedSourceTimestamp) || gzipTimestamp !== expectedSourceTimestamp)
  )
    throw new Error("Archive gzip timestamp does not match the source commit");
  const raw = inflateRawSync(archive.subarray(10), {
    info: true,
    maxOutputLength: 64 * 1024 * 1024,
  }) as unknown as {
    engine: { bytesWritten: number };
  };
  if (10 + raw.engine.bytesWritten + 8 !== archive.byteLength)
    throw new Error("Archive must contain one gzip member");
  const tar = gunzipSync(archive, { maxOutputLength: 64 * 1024 * 1024 });
  const files = new Map<string, Uint8Array>();
  let offset = 0;
  let terminated = false;
  let archiveTimestamp: number | undefined;
  while (offset + 512 <= tar.length) {
    const header = tar.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) {
      if (
        offset + 1024 > tar.length ||
        tar.subarray(offset, offset + 1024).some((byte) => byte !== 0) ||
        tar.subarray(offset + 1024).some((byte) => byte !== 0)
      )
        throw new Error("Archive must end with two zero blocks");
      terminated = true;
      break;
    }
    const magic = header.subarray(257, 263).toString("utf8");
    const version = header.subarray(263, 265).toString("utf8");
    if (magic !== "ustar\0" || version !== "00")
      throw new Error("Unsupported archive format; expected ustar");
    const name = Buffer.from(header.subarray(0, 100)).toString("utf8").split("\0", 1)[0];
    const size = readOctalField(header, 124, 12, "size");
    const checksum = readOctalField(header, 148, 8, "checksum");
    let actualChecksum = 0;
    for (let i = 0; i < 512; i++) actualChecksum += i >= 148 && i < 156 ? 32 : header[i];
    if (actualChecksum !== checksum) throw new Error("Invalid archive checksum");
    const mode = readOctalField(header, 100, 8, "mode");
    const uid = readOctalField(header, 108, 8, "uid");
    const gid = readOctalField(header, 116, 8, "gid");
    const mtime = readOctalField(header, 136, 12, "mtime");
    const devMajor = readOctalField(header, 329, 8, "device major", true);
    const devMinor = readOctalField(header, 337, 8, "device minor", true);
    assertArchiveField(header, 0, canonicalTextField(name, 100), "name");
    assertArchiveField(header, 100, canonicalOctalField(mode, 8), "mode");
    assertArchiveField(header, 108, canonicalOctalField(uid, 8), "uid");
    assertArchiveField(header, 116, canonicalOctalField(gid, 8), "gid");
    assertArchiveField(header, 124, canonicalOctalField(size, 12), "size");
    assertArchiveField(header, 136, canonicalOctalField(mtime, 12), "mtime");
    assertArchiveField(header, 148, canonicalChecksumField(checksum), "checksum");
    assertArchiveField(header, 156, Buffer.from("0", "ascii"), "type flag");
    assertArchiveField(header, 157, new Uint8Array(100), "link name");
    assertArchiveField(header, 265, new Uint8Array(32), "user name");
    assertArchiveField(header, 297, new Uint8Array(32), "group name");
    assertArchiveField(header, 329, new Uint8Array(8), "device major");
    assertArchiveField(header, 337, new Uint8Array(8), "device minor");
    assertArchiveField(header, 345, new Uint8Array(155), "prefix");
    assertArchiveField(header, 500, new Uint8Array(12), "reserved bytes");
    if (mode !== 0o644 || uid !== 0 || gid !== 0 || devMajor !== 0 || devMinor !== 0)
      throw new Error("Archive entry metadata is not deterministic");
    if (archiveTimestamp === undefined) archiveTimestamp = mtime;
    if (
      mtime !== archiveTimestamp ||
      (expectedSourceTimestamp !== undefined && mtime !== expectedSourceTimestamp)
    )
      throw new Error("Archive entry timestamp does not match the source commit");
    if (!FILES.includes(name) || files.has(name))
      throw new Error(`Unsafe or unexpected archive entry: ${name}`);
    if (name !== FILES[files.size]) throw new Error("Archive entries are not in canonical order");
    const end = offset + 512 + size;
    const nextOffset = offset + 512 + Math.ceil(size / 512) * 512;
    if (!Number.isSafeInteger(size) || end > tar.length || nextOffset > tar.length)
      throw new Error("Truncated archive");
    if (tar.subarray(end, nextOffset).some((byte) => byte !== 0))
      throw new Error("Archive entry padding is not zero");
    const bytes = tar.subarray(offset + 512, end);
    const record = manifest.files.find((file) => file.path === name);
    if (!record) throw new Error("Archive file missing from manifest");
    verifyFile(bytes, record);
    files.set(name, bytes);
    offset = nextOffset;
  }
  if (files.size !== FILES.length) throw new Error("Archive data files are incomplete");
  if (!terminated || tar.length % 512 !== 0) throw new Error("Archive has no complete terminator");
  if (archiveTimestamp !== undefined && gzipTimestamp !== archiveTimestamp)
    throw new Error("Archive gzip timestamp does not match entry timestamps");
  return files;
}

export function readPublicArchive(
  archive: Uint8Array,
  manifest: PlaybookManifest,
  expectedSourceTimestamp?: number
) {
  return readArchive(archive, manifest, PLAYBOOK_PUBLIC_BUNDLE_NAME, expectedSourceTimestamp);
}

export function readSupplementArchive(
  archive: Uint8Array,
  manifest: PlaybookManifest,
  expectedSourceTimestamp?: number
) {
  return readArchive(archive, manifest, PLAYBOOK_SUPPLEMENT_BUNDLE_NAME, expectedSourceTimestamp);
}

export async function writePublicArchiveFiles(
  root: string,
  files: Map<string, Uint8Array>
): Promise<void> {
  for (const name of FILES) {
    const bytes = files.get(name);
    if (!bytes) throw new Error(`Public archive data file is missing: ${name}`);
    await writeFile(join(root, name), bytes);
  }
}

export function parseSupplementFiles(files: Map<string, Uint8Array>) {
  const catalog = assertSupplementCatalog(
    parseJson(decodeUtf8(files.get("catalog.json") ?? new Uint8Array(), "Supplement catalog"))
  );
  const search = searchSchema.parse(
    parseJson(
      decodeUtf8(files.get("search-documents.json") ?? new Uint8Array(), "Supplement search")
    )
  );
  return { catalog, search };
}

export function createPlaybookEdition(
  files: Map<string, Uint8Array>,
  manifest: PlaybookManifest,
  rendererCommit: string,
  publicSnapshot: Uint8Array | string,
  sourceTimestamp?: number,
  catalogOptions?: PublicCatalogOptions
): PlaybookEdition {
  commitSchema.parse(rendererCommit);
  if (sourceTimestamp !== undefined) assertSourceTimestamp(sourceTimestamp);
  const contentSnapshotIdentity = sha256(publicSnapshot);
  digestSchema.parse(contentSnapshotIdentity);
  const rawCatalog = parseJson(
    decodeUtf8(files.get("catalog.json") ?? new Uint8Array(), "Public catalog")
  );
  const legacyCatalog = isLegacyPublicCatalog(rawCatalog);
  const catalog = assertPublicCatalog(rawCatalog, catalogOptions);
  const search = normalizePlaybookSearch(
    catalog,
    searchSchema.parse(
      parseJson(decodeUtf8(files.get("search-documents.json") ?? new Uint8Array(), "Public search"))
    )
  );
  const catalogBytes = files.get("catalog.json");
  const searchBytes = files.get("search-documents.json");
  if (!catalogBytes || !searchBytes) throw new Error("Public bundle data files are incomplete");
  // Deployed historical editions retain their original catalog bytes so the
  // compatibility projection does not change the published edition identity.
  const preserveDeployedBytes = legacyCatalog || catalogOptions?.stripInternalMetadata === true;
  const records = [
    fileRecord("catalog.json", preserveDeployedBytes ? catalogBytes : encodeJson(catalog)),
    fileRecord("public-snapshot.json", publicSnapshot),
    fileRecord("search-documents.json", preserveDeployedBytes ? searchBytes : encodeJson(search)),
  ];
  const edition = {
    schemaVersion: 1 as const,
    editionDigest: "",
    rendererCommit,
    contentSnapshotIdentity,
    ...(sourceTimestamp === undefined ? {} : { sourceTimestamp }),
    source: manifest.source,
    bundle: manifest.bundle,
    files: records,
    generatedAt: manifest.source.publishedAt,
  };
  edition.editionDigest = computeEditionDigest(edition);
  return legacyCatalog
    ? {
        edition,
        catalog,
        search,
        legacyCatalog: true,
        legacyRawFiles: encodePlaybookRawFiles(files),
      }
    : { edition, catalog, search };
}

export async function readPlaybookEdition(
  root: string,
  rendererCommit: string,
  publicSnapshot: Uint8Array | string,
  expectedSourceTimestamp?: number,
  catalogOptions?: PublicCatalogOptions
) {
  const sourceTimestamp = await readExpectedSourceTimestamp(root, expectedSourceTimestamp);
  const manifest = parseManifest(
    parseJson(decodeUtf8(await readFile(join(root, PLAYBOOK_MANIFEST_FILE)), "Public manifest"))
  );
  const archive = await readFile(join(root, manifest.bundle.name));
  return createPlaybookEdition(
    readPublicArchive(archive, manifest, sourceTimestamp),
    manifest,
    rendererCommit,
    publicSnapshot,
    sourceTimestamp,
    catalogOptions
  );
}
