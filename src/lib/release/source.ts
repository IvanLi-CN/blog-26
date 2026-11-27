import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { classifySourceChanges, requestedImpact, sourceEvidenceDigest } from "./impact";
import { publishedBaseline, type ReleaseEntry, type ReleaseLedger } from "./ledger";
import { contractSchema, digest, shaSchema } from "./policy";

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

export function assertPolicyIdentity(
  contract: unknown,
  quality: unknown,
  expectedDigest: string
): void {
  if (expectedDigest !== policyIdentity(contract, quality))
    throw new Error("Release policy changed; cannot reinterpret the original identity");
}

export function assertPolicyIdentityAtSource(
  contract: unknown,
  quality: unknown,
  expectedDigest: string,
  sourceSha: string
): void {
  if (expectedDigest !== policyFingerprint(contract, quality, treeBlobs(sourceSha)))
    throw new Error("Release source policy changed; cannot reinterpret the original identity");
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
    // Symlinks are rejected: gitFile returns the link target rather than the bytes it
    // resolves to, so a link named like a migration would dodge every content check.
    if (mode !== "100644" && mode !== "100755")
      throw new Error(`Unsupported release source mode ${mode}: ${path}`);
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

/** Follow only VERSION-preserving edges; an equal value elsewhere in history is not proof. */
function nestedCarriedRelease(
  ledger: ReleaseLedger,
  incoming: string[],
  versionBlob: string,
  nodes: Map<string, { versionBlob: string | undefined; parents: string[] }>
): ReleaseEntry | undefined {
  const pending = [...incoming];
  const visited = new Set<string>();
  while (pending.length) {
    const sha = pending.pop();
    if (!sha) continue;
    if (visited.has(sha)) continue;
    visited.add(sha);
    let node = nodes.get(sha);
    if (!node) {
      const versionTree = gitOutput(["ls-tree", sha, "--", "VERSION"]).trim();
      node = {
        versionBlob: /^100644 blob ([a-f0-9]+)\tVERSION$/.exec(versionTree)?.[1],
        parents: gitOutput(["rev-list", "--parents", "-n", "1", sha]).trim().split(" ").slice(1),
      };
      nodes.set(sha, node);
    }
    if (node.versionBlob !== versionBlob) continue;
    const version = gitFile(sha, "VERSION")?.trim();
    const registered = ledger.entries.find(
      (entry) => entry.mergeSha === sha && entry.version === version
    );
    if (registered) return registered;
    const prepared = ledger.entries.find(
      (entry) =>
        (entry.stage === "pr_open" || entry.stage === "abandoned") &&
        entry.prNumber &&
        entry.preparationHead &&
        entry.mergeSha === undefined &&
        entry.sourceSha === node.parents[0] &&
        entry.version === version
    );
    // The caller must authenticate this exact commit through the original release PR.
    if (prepared) return { ...prepared, mergeSha: sha };
    pending.push(...node.parents);
  }
  return undefined;
}

/** Separate authenticated protocol-only VERSION writes from business compatibility evidence. */
export function semanticSourceBlobs(
  ledger: ReleaseLedger,
  sourceSha: string,
  proveRelease?: (entry: ReleaseEntry) => void
): { changed: Record<string, string | null>; blobs: Record<string, string | null> } {
  const baseline = publishedBaseline(ledger);
  const changed = changedBlobs(baseline.sourceSha, sourceSha);
  const blobs = { ...treeBlobs(sourceSha), ...changed };
  let businessVersion = treeBlobs(baseline.sourceSha).VERSION ?? null;
  const versionNodes = new Map<string, { versionBlob: string | undefined; parents: string[] }>();
  for (const sha of gitOutput([
    "rev-list",
    "--first-parent",
    "--reverse",
    `${baseline.sourceSha}..${sourceSha}`,
    "--",
    "VERSION",
  ])
    .trim()
    .split("\n")
    .filter(Boolean)) {
    const entry = ledger.entries.find((item) => item.mergeSha === sha);
    if (entry) {
      if (!proveRelease) throw new Error("VERSION release provenance must be verified");
      proveRelease(entry);
    } else {
      const parent = gitOutput(["rev-parse", `${sha}^`]).trim();
      const candidateVersion = treeBlobs(sha).VERSION;
      const candidateVersionText = gitFile(sha, "VERSION")?.trim();
      const carriedRelease = gitOutput(["rev-list", "--parents", "-n", "1", sha])
        .trim()
        .split(" ")
        .slice(1)
        .map((parentSha) => ({
          parentSha,
          entry: ledger.entries.find((item) => item.mergeSha === parentSha),
        }))
        .find(
          ({ parentSha, entry: carriedEntry }) =>
            carriedEntry !== undefined && treeBlobs(parentSha).VERSION === candidateVersion
        );
      if (carriedRelease) {
        if (proveRelease) proveRelease(carriedRelease.entry);
        continue;
      }
      const incoming = gitOutput(["rev-list", "--parents", "-n", "1", sha])
        .trim()
        .split(" ")
        .slice(2);
      const nestedRelease =
        candidateVersion && gitOutput(["ls-tree", sha, "--", "VERSION"]).startsWith("100644 blob ")
          ? nestedCarriedRelease(ledger, incoming, candidateVersion, versionNodes)
          : undefined;
      if (nestedRelease) {
        if (!proveRelease) throw new Error("VERSION release provenance must be verified");
        proveRelease(nestedRelease);
        continue;
      }
      const preparedRelease = ledger.entries.find(
        (entry) =>
          (entry.stage === "pr_open" ||
            (entry.stage === "abandoned" && entry.prNumber && entry.preparationHead)) &&
          entry.mergeSha === undefined &&
          entry.sourceSha === parent &&
          entry.version === candidateVersionText
      );
      if (preparedRelease) {
        if (preparedRelease.stage === "abandoned") {
          if (!proveRelease) throw new Error("VERSION release provenance must be verified");
          // Failed main evaluation may retire a merged PR before mergeSha is bound.
          // The caller must authenticate this exact merge through the original PR.
          proveRelease({ ...preparedRelease, mergeSha: sha });
        }
        continue;
      }
      if (businessVersion !== null && candidateVersion === businessVersion) continue;
      if (
        businessVersion !== null ||
        gitFile(parent, "VERSION") !== undefined ||
        gitFile(sha, "VERSION") !== `${ledger.bootstrap.version}\n` ||
        !gitOutput(["ls-tree", sha, "VERSION"]).startsWith("100644 blob ")
      )
        throw new Error("Unregistered VERSION change cannot supply semantic release evidence");
      businessVersion = treeBlobs(sha).VERSION ?? null;
    }
  }
  if (Object.hasOwn(changed, "VERSION")) {
    if (businessVersion === (treeBlobs(baseline.sourceSha).VERSION ?? null)) delete changed.VERSION;
    else changed.VERSION = businessVersion;
    blobs.VERSION = businessVersion;
  }
  return { changed, blobs };
}

/**
 * Classify the semantic changes between the published baseline and `sourceSha`.
 *
 * The result is reproducible from the published baseline, the candidate tree, and the
 * commit messages inside `baseline..source`: re-deriving with the registered baseline
 * always yields the same impact and evidence digest, so a reserved release can be
 * re-verified without trusting any author-maintained file.
 */
export function sourceAssessment(
  ledger: ReleaseLedger,
  sourceSha: string,
  proveRelease?: (entry: ReleaseEntry) => void
) {
  const baseline = publishedBaseline(ledger);
  const { changed, blobs } = semanticSourceBlobs(ledger, sourceSha, proveRelease);
  const requested = requestedImpact(subjectMessages(baseline.sourceSha, sourceSha));
  const classification = classifySourceChanges(
    changed,
    (path) => (blobs[path] === undefined ? undefined : gitFile(sourceSha, path)),
    requested
  );
  return {
    impact: classification.impact,
    evidenceDigest: sourceEvidenceDigest(baseline.sourceSha, changed, classification),
    baseline,
    changed,
    classification,
  };
}

function subjectMessages(base: string, head: string): string[] {
  return gitOutput(["log", "--format=%B%x00", `${base}..${head}`])
    .split("\u0000")
    .map((message) => message.trim())
    .filter(Boolean);
}
