import { createHash } from "node:crypto";

export function embeddingChunks(
  input: string,
  enabled = process.env.EMBED_CHUNKING_ENABLED !== "false"
) {
  if (!enabled) return [{ index: -1, text: input }];
  const size = Number(process.env.EMBED_CHUNK_SIZE || 1400);
  const overlap = Number(process.env.EMBED_CHUNK_OVERLAP || 200);
  if (
    !Number.isInteger(size) ||
    !Number.isInteger(overlap) ||
    size <= 0 ||
    overlap < 0 ||
    overlap >= size
  )
    throw new Error("Invalid embedding chunk policy");
  const chunks: { index: number; text: string }[] = [];
  for (let start = 0; start < input.length; start += size - overlap) {
    const end = Math.min(input.length, start + size);
    chunks.push({ index: chunks.length, text: input.slice(start, end) });
    if (end === input.length) break;
  }
  return chunks;
}

export const projectionDigest = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");

export function validEmbedding(vector: Uint8Array | null, dim: number, expected?: number | null) {
  if (
    !vector ||
    !Number.isInteger(dim) ||
    dim <= 0 ||
    (expected && dim !== expected) ||
    vector.byteLength !== dim * 4
  )
    return false;
  const bytes = Buffer.from(vector);
  for (let i = 0; i < dim; i++) if (!Number.isFinite(bytes.readFloatLE(i * 4))) return false;
  return true;
}
