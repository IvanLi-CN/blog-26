/** One diff3 region shared by the three-way merge surfaces. */
export type MergeRegion =
  | { kind: "stable"; text: string }
  | { kind: "conflict"; base: string; local: string; remote: string };

export type ConflictText = Record<number, string>;

/**
 * The local pane is the merge target. Stable regions keep their merged text and
 * each conflict contributes the text currently held in the local pane.
 */
export function assembleLocalResult(regions: MergeRegion[], conflicts: ConflictText) {
  return regions
    .map((region, index) =>
      region.kind === "stable" ? region.text : (conflicts[index] ?? region.local)
    )
    .filter((part) => part.length > 0)
    .join("\n");
}

export function undecidedConflicts(regions: MergeRegion[], decided: Record<number, true>) {
  return regions.flatMap((region, index) =>
    region.kind === "conflict" && !decided[index] ? [index] : []
  );
}
