/** Reading labels only: authored tags and Memo identity remain unchanged. */
export function getMemoPresentation(record: { tags?: readonly string[]; clipping?: unknown }) {
  const tags = record.tags ?? [];
  const isClipping = Boolean(record.clipping) || tags.includes("剪藏");
  return {
    kind: isClipping ? "clipping" : "memo",
    label: isClipping ? "剪藏" : "闪念",
    icon: isClipping ? "tabler:scissors" : "tabler:bulb",
    tags: isClipping ? tags.filter((tag) => tag !== "剪藏") : tags,
  };
}
