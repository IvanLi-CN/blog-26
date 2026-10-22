import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  editionSchema,
  manifestSchema,
  PLAYBOOK_PUBLIC_BUNDLE_NAME,
  PLAYBOOK_SUPPLEMENT_BUNDLE_NAME,
} from "./schema";
import type {
  PlaybookEdition,
  PlaybookEditionIdentity,
  PlaybookManifest,
  PlaybookManifestFile,
} from "./types";

export function samePlaybookEdition(a: PlaybookEditionIdentity, b: PlaybookEditionIdentity) {
  return a.editionDigest === b.editionDigest && encodeJson(a.source) === encodeJson(b.source);
}

export function sha256(content: string | Uint8Array) {
  return createHash("sha256").update(content).digest("hex");
}

export function encodeJson(value: unknown) {
  return `${JSON.stringify(value, (_key, nested) => (nested && typeof nested === "object" && !Array.isArray(nested) ? Object.fromEntries(Object.entries(nested).sort(([a], [b]) => a.localeCompare(b))) : nested), 2)}\n`;
}

export function encodePlaybookRawFiles(rawFiles: ReadonlyMap<string, Uint8Array>) {
  const encode = (path: string) => {
    const bytes = rawFiles.get(path);
    if (!bytes) throw new Error(`Playbook data file is missing: ${path}`);
    return Buffer.from(bytes).toString("base64");
  };
  return { catalog: encode("catalog.json"), search: encode("search-documents.json") };
}

export function decodePlaybookRawFiles(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Playbook raw file bytes are missing");
  const input = value as Record<string, unknown>;
  const decode = (field: string) => {
    const encoded = input[field];
    if (typeof encoded !== "string" || !encoded)
      throw new Error(`Playbook raw file bytes are invalid: ${field}`);
    const bytes = Buffer.from(encoded, "base64");
    if (bytes.toString("base64") !== encoded)
      throw new Error(`Playbook raw file bytes are invalid: ${field}`);
    return bytes;
  };
  return new Map<string, Uint8Array>([
    ["catalog.json", decode("catalog")],
    ["search-documents.json", decode("search")],
  ]);
}

export function fileRecord(path: string, content: Uint8Array | string): PlaybookManifestFile {
  return {
    path,
    size: typeof content === "string" ? Buffer.byteLength(content) : content.byteLength,
    sha256: sha256(content),
  };
}

function assertSortedFilePaths(files: PlaybookManifestFile[], expected: string, label: string) {
  const paths = files.map((file) => file.path);
  const sorted = [...paths].sort((a, b) => a.localeCompare(b));
  if (paths.join("\0") !== sorted.join("\0") || paths.join(",") !== expected)
    throw new Error(`${label} file records must be sorted by path`);
}

export function parseManifest(value: unknown, kind: "public" | "supplement" = "public") {
  const manifest = manifestSchema.parse(value);
  const expectedBundleName =
    kind === "public" ? PLAYBOOK_PUBLIC_BUNDLE_NAME : PLAYBOOK_SUPPLEMENT_BUNDLE_NAME;
  if (manifest.bundle.name !== expectedBundleName)
    throw new Error(`${kind} manifest has an unexpected bundle name`);
  assertSortedFilePaths(manifest.files, "catalog.json,search-documents.json", "Public bundle");
  if (manifest.files.map((file) => file.path).join(",") !== "catalog.json,search-documents.json")
    throw new Error("Public bundle must contain catalog.json and search-documents.json");
  return manifest;
}

export function computeEditionDigest(
  edition: Pick<PlaybookEdition["edition"], "bundle" | "rendererCommit" | "files">
) {
  return sha256(
    JSON.stringify({
      bundleDigest: edition.bundle.sha256,
      rendererCommit: edition.rendererCommit,
      files: [...edition.files]
        .sort((a, b) => a.path.localeCompare(b.path))
        .map((file) => ({ path: file.path, sha256: file.sha256, size: file.size })),
    })
  );
}

export function parseEditionIdentity(value: unknown) {
  const edition = editionSchema.parse(value);
  if (computeEditionDigest(edition) !== edition.editionDigest)
    throw new Error("Edition identity digest mismatch");
  assertSortedFilePaths(
    edition.files,
    "catalog.json,public-snapshot.json,search-documents.json",
    "Edition"
  );
  if (
    edition.files.find((file) => file.path === "public-snapshot.json")?.sha256 !==
    edition.contentSnapshotIdentity
  )
    throw new Error("Article/Memo snapshot identity mismatch");
  return edition;
}

export function verifyFile(content: Uint8Array | string, record: PlaybookManifestFile) {
  const actual = fileRecord(record.path, content);
  if (actual.size !== record.size || actual.sha256 !== record.sha256)
    throw new Error(`Playbook file integrity mismatch: ${record.path}`);
}

export async function readAndValidateManifest(path: string) {
  return parseManifest(JSON.parse(await readFile(path, "utf8")));
}

export async function verifyManifestFiles(root: string, manifest: PlaybookManifest) {
  for (const file of manifest.files) verifyFile(await readFile(join(root, file.path)), file);
}
