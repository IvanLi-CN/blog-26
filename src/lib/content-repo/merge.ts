import { diff3Merge } from "node-diff3";

export interface BodyMergeResult {
  clean: boolean;
  lines: string[];
  conflicts: number;
}

export interface FrontmatterMergeResult {
  value: Record<string, unknown>;
  conflicts: string[];
}

/**
 * Three-way merge of the document body.
 *
 * The diff and merge algorithm is `node-diff3` (GNU diff3 port); this module only
 * maps its regions to the shape the content repository contract needs. Conflicting
 * regions keep the local side until a human decides.
 */
export function mergeBody(base: string[], local: string[], remote: string[]): BodyMergeResult {
  const regions = diff3Merge(local, base, remote);
  const lines: string[] = [];
  let conflicts = 0;
  for (const region of regions) {
    if (region.conflict) {
      conflicts += 1;
      lines.push(...region.conflict.a);
      continue;
    }
    lines.push(...region.ok);
  }
  return { clean: conflicts === 0, lines, conflicts };
}

export type MergeRegionView =
  | { kind: "stable"; text: string }
  | { kind: "conflict"; base: string; local: string; remote: string };

/** Three-way regions for the conflict surface. */
export function mergeRegions(base: string[], local: string[], remote: string[]): MergeRegionView[] {
  return diff3Merge(local, base, remote).map((region) => {
    if (region.conflict) {
      return {
        kind: "conflict" as const,
        base: region.conflict.o.join("\n"),
        local: region.conflict.a.join("\n"),
        remote: region.conflict.b.join("\n"),
      };
    }
    return { kind: "stable" as const, text: region.ok.join("\n") };
  });
}

function stable(value: unknown): string {
  return JSON.stringify(value ?? null);
}

/**
 * Field-level merge for structured frontmatter: a key taken from one side when the
 * other side matches the ancestor, otherwise reported as a conflict. This compares
 * values, it does not diff text.
 */
export function mergeFrontmatter(
  base: Record<string, unknown>,
  local: Record<string, unknown>,
  remote: Record<string, unknown>
): FrontmatterMergeResult {
  const value: Record<string, unknown> = {};
  const conflicts: string[] = [];
  const keys = new Set([...Object.keys(local), ...Object.keys(remote)]);
  for (const key of keys) {
    const localValue = local[key];
    const remoteValue = remote[key];
    const baseValue = base[key];
    if (stable(localValue) === stable(remoteValue)) value[key] = localValue;
    else if (stable(localValue) === stable(baseValue)) value[key] = remoteValue;
    else if (stable(remoteValue) === stable(baseValue)) value[key] = localValue;
    else conflicts.push(key);
  }
  return { value, conflicts };
}
