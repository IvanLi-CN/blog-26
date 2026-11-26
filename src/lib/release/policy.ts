import { createHash } from "node:crypto";
import { z } from "zod";
import {
  compareVersions,
  imageVersionTag,
  isPrerelease,
  isValidVersion,
  parseVersion,
  versionParts,
} from "./version";

export { compareVersions, versionParts } from "./version";

export const shaSchema = z.string().regex(/^[a-f0-9]{40}$/);
export const digestSchema = z.string().regex(/^[a-f0-9]{64}$/);
export const versionSchema = z
  .string()
  .refine(isValidVersion, "Expected a canonical SemVer product version");
export const stableVersionSchema = versionSchema.refine(
  (value) => !isPrerelease(value),
  "Expected a stable version"
);
export const versionRequestSchema = z.union([
  z.enum(["", "stable", "alpha", "beta", "rc"]),
  versionSchema,
]);
export const impactSchema = z.enum(["patch", "minor", "major"]);
export type Impact = z.infer<typeof impactSchema>;

export const contractSchema = z
  .object({
    schemaVersion: z.literal(1),
    repository: z.literal("IvanLi-CN/blog-26"),
    branch: z.literal("main"),
    ledgerBranch: z.literal("release-ledger"),
    versionPolicy: z.literal("product-semver-v1"),
    bootstrap: z.object({ version: stableVersionSchema, sourceSha: shaSchema }).strict(),
    products: z
      .object({
        static: z.object({ assetName: z.literal("frontend.tar.gz") }).strict(),
        image: z
          .object({
            repository: z.literal("ghcr.io/ivanli-cn/blog-26"),
            platform: z.literal("linux/amd64"),
          })
          .strict(),
      })
      .strict(),
    qualityPolicy: z.literal(".github/quality-gates.json"),
    automation: z
      .object({
        token: z.literal("GITHUB_TOKEN"),
        actor: z.literal("github-actions[bot]"),
        commitMethod: z.literal("createCommitOnBranch"),
      })
      .strict(),
    artifactRetentionDays: z.literal(90),
    productionConcurrency: z.literal("blog26-edgeone-production"),
    prepareTimeoutMinutes: z.literal(30),
    releaseTimeoutMinutes: z.literal(360),
  })
  .strict();
export type ReleaseContract = z.infer<typeof contractSchema>;

export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.entries(value)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(",")}}`;
  }
  const result = JSON.stringify(value);
  if (result === undefined) throw new Error("Identity cannot contain undefined");
  return result;
}

export function digest(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

export function bumpVersion(base: string, impact: Impact): string {
  const [major, minor, patch] = versionParts(base);
  if (impact === "major") return `${major + BigInt(1)}.0.0`;
  if (impact === "minor") return `${major}.${minor + BigInt(1)}.0`;
  return `${major}.${minor}.${patch + BigInt(1)}`;
}

export function allocateVersion(
  base: string,
  occupied: string[],
  impact: Impact,
  input = ""
): string {
  stableVersionSchema.parse(base);
  versionRequestSchema.parse(input);
  const floor = occupied.reduce(
    (highest, value) => (compareVersions(value, highest) > 0 ? value : highest),
    base
  );
  const minimum = bumpVersion(base, impact);
  const automatic = ["", "stable", "alpha", "beta", "rc"].includes(input);
  if (!automatic) {
    versionSchema.parse(input);
    if (compareVersions(input, floor) <= 0)
      throw new Error("Version must exceed the published and allocated floor");
    if (compareVersions(parseVersion(input).core, minimum) < 0)
      throw new Error("Version is below the verified semantic minimum");
    imageVersionTag(input);
    return input;
  }
  const highest = parseVersion(floor);
  let core = compareVersions(minimum, highest.core) > 0 ? minimum : highest.core;
  if (compareVersions(core, floor) <= 0) core = bumpVersion(core, "patch");
  if (input === "" || input === "stable") {
    imageVersionTag(core);
    return core;
  }
  let sequence = 0n;
  for (const value of occupied) {
    const parsed = parseVersion(value);
    if (parsed.core !== core || parsed.prerelease[0] !== input) continue;
    const part = parsed.prerelease[1];
    if (part && /^\d+$/.test(part) && BigInt(part) > sequence) sequence = BigInt(part);
  }
  const allocated = `${core}-${input}.${sequence + 1n}`;
  if (compareVersions(allocated, floor) <= 0)
    throw new Error(
      "Prerelease stage cannot move backwards; explicitly specify a higher complete target"
    );
  imageVersionTag(allocated);
  return allocated;
}

export function validateStateUpgrade(base: string, candidate: string): void {
  if (versionParts(candidate)[0] - versionParts(base)[0] > BigInt(1)) {
    throw new Error("Persistent-state upgrades must proceed through consecutive supported Majors");
  }
}
