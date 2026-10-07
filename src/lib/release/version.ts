/** Exact SemVer parsing and publication references shared by builds and releases. */
export interface ProductVersion {
  value: string;
  core: string;
  parts: [bigint, bigint, bigint];
  prerelease: string[];
  metadata: string[];
}

export function parseVersion(value: string): ProductVersion {
  const match =
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/.exec(
      value
    );
  if (!match || match[0] !== value) throw new Error("Expected a canonical SemVer product version");
  const prerelease = match[4]?.split(".") || [];
  if (prerelease.some((part) => /^\d+$/.test(part) && part.length > 1 && part[0] === "0"))
    throw new Error("Numeric prerelease identifiers cannot contain leading zeroes");
  return {
    value,
    core: `${match[1]}.${match[2]}.${match[3]}`,
    parts: [BigInt(match[1] || "0"), BigInt(match[2] || "0"), BigInt(match[3] || "0")],
    prerelease,
    metadata: match[5]?.split(".") || [],
  };
}

export function versionParts(value: string): [bigint, bigint, bigint] {
  return parseVersion(value).parts;
}

export function isValidVersion(value: string): boolean {
  try {
    parseVersion(value);
    return true;
  } catch {
    return false;
  }
}

export function compareVersions(left: string, right: string): number {
  const a = parseVersion(left);
  const b = parseVersion(right);
  for (let index = 0; index < 3; index++) {
    const x = a.parts[index] ?? 0n;
    const y = b.parts[index] ?? 0n;
    if (x !== y) return x > y ? 1 : -1;
  }
  if (!a.prerelease.length || !b.prerelease.length)
    return a.prerelease.length === b.prerelease.length ? 0 : a.prerelease.length ? -1 : 1;
  for (let index = 0; index < Math.max(a.prerelease.length, b.prerelease.length); index++) {
    const x = a.prerelease[index];
    const y = b.prerelease[index];
    if (x === y) continue;
    if (x === undefined) return -1;
    if (y === undefined) return 1;
    const numericX = /^\d+$/.test(x);
    const numericY = /^\d+$/.test(y);
    if (numericX && numericY) return BigInt(x) > BigInt(y) ? 1 : -1;
    if (numericX !== numericY) return numericX ? -1 : 1;
    return x > y ? 1 : -1;
  }
  return 0;
}

export function isPrerelease(value: string): boolean {
  return parseVersion(value).prerelease.length > 0;
}

export function precedenceKey(value: string): string {
  parseVersion(value);
  return value.split("+")[0] || value;
}

export function releaseTag(value: string): string {
  parseVersion(value);
  // SemVer permits a final .lock identifier; Git ref names prohibit this suffix.
  if (value.endsWith(".lock"))
    throw new Error("Product version cannot be represented by a Git tag");
  return `v${value}`;
}

export function imageVersionTag(value: string): string {
  const tag = releaseTag(value).replace("+", "_");
  if (!/^[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$/.test(tag))
    throw new Error("Product version cannot be represented by an immutable registry tag");
  return tag;
}
