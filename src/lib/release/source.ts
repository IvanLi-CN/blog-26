import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { publishedBaseline, type ReleaseLedger, supportedVersions } from "./ledger";
import {
  contractSchema,
  digest,
  type ImpactRecord,
  impactRecordSchema,
  shaSchema,
  verifyImpactRecords,
} from "./policy";

export function gitOutput(args: string[], cwd = process.cwd()): string {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 32 * 1024 * 1024,
  });
}

export function readContract() {
  return contractSchema.parse(JSON.parse(readFileSync(".github/release-contract.json", "utf8")));
}

export function policyFingerprint(
  contract: unknown,
  quality: unknown,
  blobs: Record<string, string | null>
): string {
  const policyBlobs = Object.fromEntries(
    Object.entries(blobs).filter(
      ([path]) =>
        path.startsWith("src/lib/release/") ||
        [
          "scripts/product-release.ts",
          "scripts/release-settings.ts",
          ".github/workflows/manual-product-release.yml",
          ".github/workflows/product-release.yml",
          ".github/workflows/ci.yml",
          ".github/workflows/e2e.yml",
          ".github/workflows/release-merge-followup.yml",
        ].includes(path)
    )
  );
  if (
    !policyBlobs["src/lib/release/policy.ts"] ||
    !policyBlobs[".github/workflows/product-release.yml"]
  )
    throw new Error("Release policy source is incomplete");
  return digest({ contract, quality, policyBlobs });
}

export function policyIdentity(contract: unknown, quality: unknown): string {
  return policyFingerprint(contract, quality, treeBlobs(gitOutput(["rev-parse", "HEAD"]).trim()));
}

export function gitFile(sha: string, path: string): string | undefined {
  try {
    return gitOutput(["show", `${shaSchema.parse(sha)}:${path}`]);
  } catch {
    return undefined;
  }
}

export function treeBlobs(sha: string): Record<string, string | null> {
  const tree: Record<string, string | null> = {};
  for (const line of gitOutput(["ls-tree", "-r", "-z", shaSchema.parse(sha)])
    .split("\0")
    .filter(Boolean)) {
    const separator = line.indexOf("\t");
    const [mode, type, blob] = line.slice(0, separator).split(" ");
    if (type !== "blob" || !blob) throw new Error("Release sources cannot contain submodules");
    const path = line.slice(separator + 1);
    if (path.startsWith("docs/version-impact/") && mode !== "100644")
      throw new Error("Impact records must be regular files");
    tree[path] = shaSchema.parse(blob);
  }
  return tree;
}

export function changedBlobs(base: string, head: string): Record<string, string | null> {
  gitOutput(["merge-base", "--is-ancestor", shaSchema.parse(base), shaSchema.parse(head)]);
  const tree = treeBlobs(head);
  return Object.fromEntries(
    gitOutput(["diff", "--no-renames", "--name-only", "-z", base, head])
      .split("\0")
      .filter(Boolean)
      .map((path) => [path, tree[path] ?? null])
  );
}

export function sourceAssessment(ledger: ReleaseLedger, sourceSha: string) {
  const baseline = publishedBaseline(ledger);
  const changed = changedBlobs(baseline.sourceSha, sourceSha);
  const blobs = { ...treeBlobs(sourceSha), ...changed };
  const records: ImpactRecord[] = Object.keys(treeBlobs(sourceSha))
    .filter((path) => /^docs\/version-impact\/[^/]+\.json$/.test(path))
    .map((path) => impactRecordSchema.parse(JSON.parse(gitFile(sourceSha, path) || "null")));
  const semanticChanges = Object.fromEntries(
    Object.entries(changed).filter(([path]) => !/^docs\/version-impact\/[^/]+\.json$/.test(path))
  );
  const verified = verifyImpactRecords(
    records,
    semanticChanges,
    blobs,
    baseline.sourceSha,
    supportedVersions(ledger),
    baseline.version
  );
  return { ...verified, baseline, records, changed: semanticChanges };
}
