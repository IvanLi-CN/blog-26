/** Text access for the active comparison mode, used by the card-level save. */
export interface ContentMergeHandle {
  getText(): string;
  /** Unresolved conflicts in the current mode. */
  pending(): { unresolved: number; total: number };
}
