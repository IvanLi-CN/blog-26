import { digest, type Impact, impactSchema } from "./policy";

/**
 * Machine-derived release impact.
 *
 * Every decision here is reproducible from the source tree and its git history:
 * the same commit always yields the same impact and evidence digest. Nothing is
 * copied from an author-maintained record, so no field can drift from the bytes
 * it describes.
 */

export type ContractId = "public-api" | "persistent-state";

export type ContractSurface = {
  id: ContractId;
  /** Repository-relative path or prefix the surface owns. */
  pattern: RegExp;
  reason: string;
};

/**
 * Contract surfaces are declared in code so that changing them changes the
 * policy digest. Documentation, tests, styles, and internal modules are
 * deliberately absent: they cannot alter a published contract.
 */
export const contractSurfaces: readonly ContractSurface[] = [
  { id: "persistent-state", pattern: /^drizzle\/[^/]+\.sql$/, reason: "Database migration" },
  { id: "persistent-state", pattern: /^src\/lib\/schema\.ts$/, reason: "Drizzle schema mirror" },
  { id: "public-api", pattern: /^src\/server\/public-api\//, reason: "Public HTTP API" },
  { id: "public-api", pattern: /^src\/server\/routers\//, reason: "Public router surface" },
  { id: "public-api", pattern: /^src\/server\/version-api\.ts$/, reason: "Version endpoint" },
  {
    id: "public-api",
    pattern: /^src\/lib\/[a-z-]*contracts?\.ts$/,
    reason: "Shared contract module",
  },
  { id: "public-api", pattern: /^site\/pages\/api\//, reason: "Public API route handler" },
] as const;

/**
 * Tests sit inside contract directories but are not published contracts; deleting or
 * renaming one must stay `patch` rather than look like a withdrawn API surface.
 */
function isTestPath(path: string): boolean {
  return /\.(?:test|spec)\.[cm]?[jt]sx?$/.test(path) || /(?:^|\/)__tests__\//.test(path);
}

const impactRank: Record<Impact, number> = { patch: 0, minor: 1, major: 2 };

export function raiseImpact(current: Impact, next: Impact): Impact {
  return impactRank[next] > impactRank[current] ? next : current;
}

/**
 * A migration is destructive when previously written rows stop being readable,
 * or when persisted data is discarded. Additive DDL keeps prior readers working.
 */
export function destructiveMigration(sql: string): boolean {
  // Strip comments before literals so an unterminated `/*` inside a `--` comment cannot
  // swallow the statements that follow it.
  const uncommented = sql.replace(/--[^\n]*/g, " ").replace(/\/\*[\s\S]*?\*\//g, " ");
  // Blank string literals so keywords quoted as data never look like DDL.
  const statement = uncommented.replace(/'(?:[^']|'')*'/g, "''");
  // SQLite lets `COLUMN` be omitted, so `DROP legacy` and `RENAME c TO d` are real DDL.
  if (/\bDROP\s+(?:TABLE|COLUMN)\b/i.test(statement)) return true;
  if (/\bDROP\s+[`"[]?\w/i.test(statement)) return true;
  if (/\bRENAME\s+(?:COLUMN\s+)?(?:[`"[]?[\w$]+\s+)?TO\b/i.test(statement)) return true;
  if (/\bALTER\s+COLUMN\b/i.test(statement)) return true;
  // A new NOT NULL column cannot be written by prior readers unless it has a default.
  // drizzle-kit emits `ADD `<name>` ... NOT NULL` without `COLUMN`, and orders the
  // default before `NOT NULL`, so both omissions must be tolerated.
  for (const clause of statement.split(";")) {
    if (!/\bADD\s+(?:COLUMN\s+)?\S/i.test(clause) || !/\bNOT\s+NULL\b/i.test(clause)) continue;
    if (/\bDEFAULT\b/i.test(clause)) continue;
    return true;
  }
  return false;
}

export type SourceClassification = {
  impact: Impact;
  surfaces: Array<{ id: ContractId; paths: string[] }>;
  reasons: string[];
};

/**
 * Derive the release impact for a set of semantic source changes.
 *
 * The floor is `patch`; a destructive migration raises it to `minor` because the
 * persisted contract stops being readable by earlier supported versions. `major`
 * is never inferred: it is a business decision a human must request explicitly.
 */
export function classifySourceChanges(
  changed: Record<string, string | null>,
  read: (path: string) => string | undefined,
  requested: Impact = "patch"
): SourceClassification {
  let impact: Impact = "patch";
  const reasons: string[] = [];
  const surfacePaths = new Map<ContractId, Set<string>>();

  for (const path of Object.keys(changed).sort()) {
    const surface = contractSurfaces.find(
      (candidate) => !isTestPath(path) && candidate.pattern.test(path)
    );
    if (surface) {
      const paths = surfacePaths.get(surface.id) ?? new Set<string>();
      paths.add(path);
      surfacePaths.set(surface.id, paths);
      reasons.push(`${path}: ${surface.reason}`);
      // Removing a published contract surface is breaking even when the change is not DDL.
      if (surface.id === "public-api" && changed[path] === null) {
        impact = raiseImpact(impact, "minor");
        reasons.push(`${path}: a published contract surface was deleted`);
      }
    }
    if (!/^drizzle\/[^/]+\.sql$/.test(path)) continue;
    if (changed[path] === null) {
      impact = raiseImpact(impact, "minor");
      reasons.push(`${path}: an applied migration was deleted`);
      continue;
    }
    const sql = read(path);
    if (sql === undefined) {
      reasons.push(`${path}: migration content unavailable`);
      continue;
    }
    if (destructiveMigration(sql)) {
      impact = raiseImpact(impact, "minor");
      reasons.push(`${path}: destructive migration breaks prior readers`);
    }
  }

  return {
    impact: impactSchema.parse(raiseImpact(impact, requested)),
    surfaces: [...surfacePaths].map(([id, paths]) => ({ id, paths: [...paths].sort() })),
    reasons,
  };
}

/**
 * `Release-Impact:` is the single channel for raising the derived floor. It is read
 * only from a trailer block: the last paragraph, unindented, so a quoted example in
 * commit prose cannot silently promote an entire release.
 */
const overridePattern = /^Release-Impact:[ \t]*(patch|minor|major)[ \t]*$/gm;

function trailerBlock(message: string): string {
  const paragraphs = message.split(/\n[ \t]*\n/);
  return (paragraphs[paragraphs.length - 1] ?? "").trimEnd();
}

export function requestedImpact(messages: string[]): Impact {
  let requested: Impact = "patch";
  for (const message of messages) {
    for (const match of trailerBlock(message).matchAll(overridePattern)) {
      const value = match[1];
      if (!value) continue;
      requested = raiseImpact(requested, impactSchema.parse(value.toLowerCase()));
    }
  }
  return requested;
}

export function sourceEvidenceDigest(
  baselineSha: string,
  changed: Record<string, string | null>,
  classification: SourceClassification
): string {
  return digest({
    baseline: baselineSha,
    impact: classification.impact,
    changes: Object.entries(changed).sort(([left], [right]) => (left < right ? -1 : 1)),
    surfaces: classification.surfaces,
  });
}
