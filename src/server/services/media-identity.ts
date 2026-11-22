import { eq } from "drizzle-orm";
import { sha256Hex } from "@/lib/content-repo/canonical";
import { decideMediaIdentity } from "@/lib/content-repo/media-identity";
import { db } from "@/lib/db";
import { contentMedia } from "@/lib/schema";

export interface MediaIdentity {
  sha256: string;
  bytes: number;
}

export function readMediaIdentity(path: string): MediaIdentity | null {
  const row = db.select().from(contentMedia).where(eq(contentMedia.path, path)).get();
  return row ? { sha256: row.sha256, bytes: row.bytes } : null;
}

export function recordMediaIdentity(path: string, bytes: Uint8Array, mime?: string | null) {
  const values = {
    path,
    sha256: sha256Hex(bytes),
    bytes: bytes.byteLength,
    mime: mime ?? null,
    updatedAt: Date.now(),
  };
  db.insert(contentMedia)
    .values(values)
    .onConflictDoUpdate({
      target: contentMedia.path,
      set: {
        sha256: values.sha256,
        bytes: values.bytes,
        mime: values.mime,
        updatedAt: values.updatedAt,
      },
    })
    .run();
  return values;
}

export type MediaIdentityCheck =
  | { status: "record"; sha256: string }
  | { status: "unchanged"; sha256: string }
  | { status: "mismatch"; sha256: string; recorded: string };

/**
 * Adopt an unrecorded attachment, accept an unchanged one, and surface divergence.
 * Callers decide whether a mismatch blocks the operation.
 */
export function verifyMediaIdentity(path: string, bytes: Uint8Array): MediaIdentityCheck {
  const sha256 = sha256Hex(bytes);
  const recorded = readMediaIdentity(path);
  const decision = decideMediaIdentity(recorded?.sha256, sha256);
  if (decision === "mismatch")
    return { status: "mismatch", sha256, recorded: recorded?.sha256 ?? "" };
  return { status: decision, sha256 };
}
