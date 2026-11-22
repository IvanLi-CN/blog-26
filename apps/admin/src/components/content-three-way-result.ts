/** One diff3 region shared by the three-way merge surfaces. */
export type MergeRegion =
  | { kind: "stable"; text: string }
  | { kind: "conflict"; base: string; local: string; remote: string };
