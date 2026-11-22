export interface MergeRegion {
  start: number;
  end: number;
  replacement: string[];
}

export interface BodyMergeResult {
  clean: boolean;
  lines: string[];
  conflicts: number;
}

export interface FrontmatterMergeResult {
  value: Record<string, unknown>;
  conflicts: string[];
}

const LCS_CELL_LIMIT = 1_000_000;

function sameLines(left: string[], right: string[]) {
  return left.length === right.length && left.every((line, index) => line === right[index]);
}

/**
 * Regions of `base` that `next` replaces. A document too large for the LCS table
 * becomes one whole-document region, which is safe but conservative.
 */
export function diffRegions(base: string[], next: string[]): MergeRegion[] {
  if (sameLines(base, next)) return [];
  if (base.length * next.length > LCS_CELL_LIMIT || !base.length || !next.length) {
    if (next.length === 0) return [{ start: 0, end: base.length, replacement: [] }];
    return [{ start: 0, end: base.length, replacement: [...next] }];
  }

  const width = next.length + 1;
  const table = new Int32Array((base.length + 1) * width);
  for (let i = base.length - 1; i >= 0; i -= 1) {
    for (let j = next.length - 1; j >= 0; j -= 1) {
      table[i * width + j] =
        base[i] === next[j]
          ? table[(i + 1) * width + j + 1] + 1
          : Math.max(table[(i + 1) * width + j], table[i * width + j + 1]);
    }
  }

  const regions: MergeRegion[] = [];
  let i = 0;
  let j = 0;
  let open: MergeRegion | null = null;
  const flush = () => {
    if (open) regions.push(open);
    open = null;
  };
  while (i < base.length || j < next.length) {
    if (i < base.length && j < next.length && base[i] === next[j]) {
      flush();
      i += 1;
      j += 1;
      continue;
    }
    if (!open) open = { start: i, end: i, replacement: [] };
    const takeBase =
      i < base.length &&
      (j >= next.length || table[(i + 1) * width + j] >= table[i * width + j + 1]);
    if (takeBase) {
      i += 1;
      open.end = i;
    } else {
      open.replacement.push(next[j]);
      j += 1;
    }
  }
  flush();
  return regions;
}

function applyRegions(base: string[], regions: MergeRegion[], from: number, to: number): string[] {
  const output: string[] = [];
  let cursor = from;
  for (const region of regions) {
    if (region.start < from || region.end > to) continue;
    output.push(...base.slice(cursor, region.start), ...region.replacement);
    cursor = region.end;
  }
  output.push(...base.slice(cursor, to));
  return output;
}

function overlapping(left: MergeRegion, right: MergeRegion) {
  if (left.start === left.end && right.start === right.end) return left.start === right.start;
  return left.start < right.end && right.start < left.end;
}

/** Three-way merge of the document body with line granularity. */
export function mergeBody(base: string[], local: string[], remote: string[]): BodyMergeResult {
  const localRegions = diffRegions(base, local);
  const remoteRegions = diffRegions(base, remote);
  const merged: MergeRegion[] = [];
  const used = new Set<number>();
  let conflicts = 0;

  for (const [index, localRegion] of localRegions.entries()) {
    const overlappingRemote = remoteRegions.filter((region) => overlapping(localRegion, region));
    if (!overlappingRemote.length) {
      merged.push(localRegion);
      continue;
    }
    used.add(index);
    const start = Math.min(localRegion.start, ...overlappingRemote.map((region) => region.start));
    const end = Math.max(localRegion.end, ...overlappingRemote.map((region) => region.end));
    const localPart = applyRegions(
      base,
      localRegions.filter((region) => region.start >= start && region.end <= end),
      start,
      end
    );
    const remotePart = applyRegions(
      base,
      remoteRegions.filter((region) => region.start >= start && region.end <= end),
      start,
      end
    );
    if (sameLines(localPart, remotePart)) {
      merged.push({ start, end, replacement: localPart });
    } else {
      conflicts += 1;
      merged.push({ start, end, replacement: localPart });
    }
  }
  for (const remoteRegion of remoteRegions) {
    if (localRegions.some((region) => overlapping(region, remoteRegion))) continue;
    merged.push(remoteRegion);
  }

  merged.sort((left, right) => left.start - right.start || left.end - right.end);
  const lines: string[] = [];
  let cursor = 0;
  for (const region of merged) {
    if (region.start < cursor) continue;
    lines.push(...base.slice(cursor, region.start), ...region.replacement);
    cursor = region.end;
  }
  lines.push(...base.slice(cursor));
  return { clean: conflicts === 0, lines, conflicts };
}

function stable(value: unknown): string {
  return JSON.stringify(value ?? null);
}

/** Field-level merge for frontmatter; conflicting keys are reported, never silently chosen. */
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
