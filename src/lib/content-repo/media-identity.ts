export type MediaIdentityDecision = "record" | "unchanged" | "mismatch";

/**
 * Decide whether an attachment's recorded identity still matches the bytes on disk.
 * A missing record is adopted; a different sha is a divergence, never a silent overwrite.
 */
export function decideMediaIdentity(
  recordedSha: string | null | undefined,
  actualSha: string
): MediaIdentityDecision {
  if (!recordedSha) return "record";
  return recordedSha === actualSha ? "unchanged" : "mismatch";
}
