import { recognizeMemoClipping } from "@/lib/memo-clipping";
import { projectClippingMemo, readAuthoredMemo } from "./store";

/** The filesystem is authoritative even before a visibility edit reaches the index. */
export async function isClippingRowPublic(row: {
  id: string;
  type: string;
  body: string;
  tags: string | null;
  metadata: string | null;
}) {
  if (row.type !== "memo") return true;
  let metadata: Record<string, unknown> = {};
  try {
    metadata = JSON.parse(row.metadata ?? "{}");
  } catch {
    /* Legacy metadata. */
  }
  let tags: unknown = [];
  try {
    tags = JSON.parse(row.tags ?? "[]");
  } catch {
    /* Legacy tags. */
  }
  const body = typeof metadata.content === "string" ? metadata.content : row.body;
  if (
    !metadata.authoredClipping &&
    !metadata.clipping &&
    !recognizeMemoClipping(body, { ...metadata, tags }).enabled
  )
    return true;
  try {
    const { frontmatter } = await readAuthoredMemo(row.id);
    return frontmatter.public !== false && frontmatter.draft !== true;
  } catch {
    return false;
  }
}

/** Read-only projection; never opens the execution runtime. */
export async function clippingProjectionForRow(
  row: { id: string; type: string; body: string; tags: string | null; metadata: string | null },
  includeArticle = false
) {
  if (row.type !== "memo") return null;
  let metadata: Record<string, unknown> = {};
  try {
    metadata = row.metadata ? JSON.parse(row.metadata) : {};
  } catch {
    /* Legacy malformed metadata falls back to authored body. */
  }
  let tags: unknown = [];
  try {
    tags = row.tags ? JSON.parse(row.tags) : [];
  } catch {
    /* Invalid tags cannot authorize a clipping. */
  }
  const body = typeof metadata.content === "string" ? metadata.content : row.body;
  if (
    !metadata.authoredClipping &&
    !metadata.clipping &&
    !recognizeMemoClipping(body, { ...metadata, tags }).enabled
  )
    return null;
  return projectClippingMemo(row.id, undefined, includeArticle);
}
