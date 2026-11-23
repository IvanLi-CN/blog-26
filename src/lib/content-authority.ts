/**
 * Content authority is a deployment-level switch.
 *
 * - `local` (default): the legacy local content source stays registered and may
 *   scan the mounted content root.
 * - `database`: the content library is authoritative; local source registration,
 *   incremental/full sync and prune are disabled. The same mounted root remains
 *   the media storage for attachments.
 */
export type ContentAuthorityMode = "local" | "database";

export function contentAuthorityMode(
  env: Record<string, string | undefined> = process.env
): ContentAuthorityMode {
  return env.CONTENT_AUTHORITY?.trim().toLowerCase() === "database" ? "database" : "local";
}

export function isDatabaseContentAuthority(
  env: Record<string, string | undefined> = process.env
): boolean {
  return contentAuthorityMode(env) === "database";
}
