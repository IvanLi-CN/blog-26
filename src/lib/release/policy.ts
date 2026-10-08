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

const safePath = z.string().refine((value) => {
  return (
    value.length > 0 &&
    !value.startsWith("/") &&
    !value.includes("\\") &&
    value.split("/").every((part) => part !== ".." && part !== "." && part !== "")
  );
}, "Expected a repository-relative path");

export const contractSchema = z
  .object({
    schemaVersion: z.literal(1),
    repository: z.literal("IvanLi-CN/blog-26"),
    branch: z.literal("main"),
    ledgerBranch: z.literal("release-ledger"),
    versionPolicy: z.literal("product-semver-v1"),
    impactRecordDirectory: z.literal("docs/version-impact"),
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
    releaseTimeoutMinutes: z.literal(180),
  })
  .strict();
export type ReleaseContract = z.infer<typeof contractSchema>;

const witnessSchema = z
  .object({ path: safePath, blob: shaSchema, command: z.string().min(1) })
  .strict();
const assessmentSchema = z
  .object({
    impact: impactSchema,
    reasoning: z.string().min(1),
    assessed_at: z.iso.datetime({ offset: true }),
    evidence: z.array(witnessSchema),
  })
  .strict();
export const impactRecordSchema = z
  .object({
    schema_version: z.literal(1),
    kind: z.literal("version-impact-record"),
    base_sha: shaSchema,
    covered_files: z.record(safePath, shaSchema.nullable()),
    change: z
      .object({
        description: z.string().min(1),
        release_unit_description: z.literal("static frontend and full-feature Docker image"),
        affected_contracts: z.array(z.enum(["public-api", "persistent-state"])).min(1),
      })
      .strict(),
    classification: z
      .object({
        planned: assessmentSchema,
        current: assessmentSchema.extend({
          scope_drift: z.object({ detected: z.boolean(), description: z.string().min(1) }).strict(),
        }),
        verified: assessmentSchema.nullable(),
      })
      .strict(),
    compatibility_evidence: z
      .object({
        public_api: z
          .object({
            impact: impactSchema,
            change: z.enum(["unchanged", "compatible", "breaking"]),
            supported_consumer_versions: z.array(versionSchema).min(1),
            evidence: z.array(witnessSchema).min(1),
          })
          .strict(),
        persistent_state: z
          .object({
            impact: impactSchema,
            applicable: z.boolean(),
            state_description: z.string().min(1),
            readable_by_prior_versions: z.array(versionSchema),
            upgrade_from_versions: z.array(versionSchema),
            evidence: z.array(witnessSchema).min(1),
          })
          .strict(),
      })
      .strict(),
  })
  .strict();
export type ImpactRecord = z.infer<typeof impactRecordSchema>;

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

export function maximumImpact(impacts: Impact[]): Impact {
  if (impacts.length === 0) throw new Error("Verified impact is missing");
  return impacts.includes("major") ? "major" : impacts.includes("minor") ? "minor" : "patch";
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

export function verifyImpactRecords(
  records: ImpactRecord[],
  changed: Record<string, string | null>,
  blobs: Record<string, string | null>,
  baseSha: string,
  supportedVersions: string[],
  baselineVersion: string
): { impact: Impact; evidenceDigest: string } {
  const current = records.filter((record) => record.base_sha === baseSha);
  const covered = new Set<string>();
  const impacts: Impact[] = [];
  const [major, minor] = versionParts(baselineVersion);
  const supportedMajor = supportedVersions.filter((version) => versionParts(version)[0] === major);
  const supportedMinor = supportedMajor.filter((version) => versionParts(version)[1] === minor);
  for (const raw of current) {
    const record = impactRecordSchema.parse(raw);
    const verified = record.classification.verified;
    if (!verified || verified.evidence.length === 0)
      throw new Error("Verified compatibility evidence is missing");
    const { public_api: api, persistent_state: state } = record.compatibility_evidence;
    if (verified.impact !== maximumImpact([api.impact, state.impact]))
      throw new Error("Separate API/state impact does not match verified impact");
    if (record.classification.current.impact !== verified.impact)
      throw new Error("Current scope was not reclassified before verification");
    if (api.change === "breaking" && api.impact !== "major")
      throw new Error("Breaking public API requires a major impact");
    if (
      api.impact !== "major" &&
      supportedMajor.some((version) => !api.supported_consumer_versions.includes(version))
    ) {
      throw new Error("Public API evidence omits a supported consumer");
    }
    if (state.applicable) {
      if (
        state.impact === "patch" &&
        supportedMinor.some((version) => !state.readable_by_prior_versions.includes(version))
      ) {
        throw new Error(
          "Patch state must remain readable by every supported earlier version in this Minor"
        );
      }
      if (!state.upgrade_from_versions.includes(baselineVersion))
        throw new Error("Candidate cannot read the supported baseline state");
      if (
        state.impact === "minor" &&
        supportedMajor.some((version) => !state.upgrade_from_versions.includes(version))
      ) {
        throw new Error("Minor state must support earlier supported Minor state");
      }
    }
    for (const witness of [...verified.evidence, ...api.evidence, ...state.evidence]) {
      if (blobs[witness.path] !== witness.blob) throw new Error(`Stale evidence: ${witness.path}`);
    }
    for (const [path, blob] of Object.entries(record.covered_files)) {
      if (blobs[path] !== blob) throw new Error(`Scope drift requires reclassification: ${path}`);
      if (Object.hasOwn(changed, path)) covered.add(path);
    }
    impacts.push(verified.impact);
  }
  for (const path of Object.keys(changed)) {
    if (!covered.has(path)) throw new Error(`Unclassified release change: ${path}`);
  }
  return { impact: maximumImpact(impacts), evidenceDigest: digest(current) };
}

export function validateStateUpgrade(base: string, candidate: string): void {
  if (versionParts(candidate)[0] - versionParts(base)[0] > BigInt(1)) {
    throw new Error("Persistent-state upgrades must proceed through consecutive supported Majors");
  }
}
