export type MergeRegion =
  | { kind: "stable"; text: string }
  | { kind: "conflict"; base: string; local: string; remote: string };

export type MergeSide = "base" | "local" | "remote";

export interface RegionResolution {
  /** Side adopted from the region, or `custom` when the administrator edited it. */
  side: MergeSide | "custom";
  text: string;
}

export type MergeResolutions = Record<number, RegionResolution>;

/** Assemble the result document; unresolved conflicts contribute nothing. */
export function assembleMergeResult(regions: MergeRegion[], resolutions: MergeResolutions) {
  return regions
    .map((region, index) =>
      region.kind === "stable" ? region.text : (resolutions[index]?.text ?? "")
    )
    .filter((part) => part.length > 0)
    .join("\n");
}

export function pendingConflicts(regions: MergeRegion[], resolutions: MergeResolutions) {
  return regions.reduce(
    (total, region, index) =>
      region.kind === "conflict" && !resolutions[index] ? total + 1 : total,
    0
  );
}
