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

export function decodeUtf8(content: Uint8Array, label = "Playbook bytes") {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(content);
  } catch {
    throw new Error(`${label} must be valid UTF-8`);
  }
}

export function parseJson<T = unknown>(text: string): T {
  let offset = 0;
  const whitespace = () => {
    while (
      text[offset] === " " ||
      text[offset] === "\n" ||
      text[offset] === "\r" ||
      text[offset] === "\t"
    )
      offset++;
  };
  const readString = () => {
    const start = offset++;
    let escaped = false;
    while (offset < text.length) {
      const character = text[offset++];
      if (escaped) {
        escaped = false;
        continue;
      }
      if (character === "\\") {
        escaped = true;
        continue;
      }
      if (character === '"') return JSON.parse(text.slice(start, offset)) as string;
    }
    throw new Error("Invalid JSON string");
  };
  const readValue = (): void => {
    whitespace();
    if (text[offset] === '"') {
      readString();
      return;
    }
    if (text[offset] === "{") {
      readObject();
      return;
    }
    if (text[offset] === "[") {
      readArray();
      return;
    }
    const start = offset;
    while (offset < text.length && !",]} \n\r\t".includes(text[offset] ?? "")) offset++;
    if (offset === start) throw new Error("Invalid JSON value");
  };
  const readObject = () => {
    offset++;
    whitespace();
    const keys = new Set<string>();
    if (text[offset] === "}") {
      offset++;
      return;
    }
    while (true) {
      whitespace();
      if (text[offset] !== '"') throw new Error("Invalid JSON object key");
      const key = readString();
      if (keys.has(key)) throw new Error("Duplicate JSON object key");
      keys.add(key);
      whitespace();
      if (text[offset++] !== ":") throw new Error("Invalid JSON object separator");
      readValue();
      whitespace();
      if (text[offset] === "}") {
        offset++;
        return;
      }
      if (text[offset++] !== ",") throw new Error("Invalid JSON object delimiter");
    }
  };
  const readArray = () => {
    offset++;
    whitespace();
    if (text[offset] === "]") {
      offset++;
      return;
    }
    while (true) {
      readValue();
      whitespace();
      if (text[offset] === "]") {
        offset++;
        return;
      }
      if (text[offset++] !== ",") throw new Error("Invalid JSON array delimiter");
    }
  };

  readValue();
  whitespace();
  if (offset !== text.length) throw new Error("Invalid JSON trailing data");
  return JSON.parse(text) as T;
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
  edition: Pick<
    PlaybookEdition["edition"],
    "bundle" | "rendererCommit" | "sourceTimestamp" | "files"
  >
) {
  const identity: {
    bundleDigest: string;
    rendererCommit: string;
    sourceTimestamp?: number;
    files: { path: string; sha256: string; size: number }[];
  } = {
    bundleDigest: edition.bundle.sha256,
    rendererCommit: edition.rendererCommit,
    files: [...edition.files]
      .sort((a, b) => a.path.localeCompare(b.path))
      .map((file) => ({ path: file.path, sha256: file.sha256, size: file.size })),
  };
  if (edition.sourceTimestamp !== undefined) identity.sourceTimestamp = edition.sourceTimestamp;
  return sha256(JSON.stringify(identity));
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
  return parseManifest(parseJson(decodeUtf8(await readFile(path), "Playbook manifest")));
}

export async function verifyManifestFiles(root: string, manifest: PlaybookManifest) {
  for (const file of manifest.files) verifyFile(await readFile(join(root, file.path)), file);
}
