import { z } from "zod";
import {
  allocateVersion,
  canonicalJson,
  compareVersions,
  digest,
  digestSchema,
  type Impact,
  impactSchema,
  type ReleaseContract,
  shaSchema,
  stableVersionSchema,
  validateStateUpgrade,
  versionRequestSchema,
  versionSchema,
} from "./policy";
import { isPrerelease, precedenceKey } from "./version";

export const stages = [
  "reserved",
  "pr_open",
  "merged",
  "frozen",
  "published",
  "deployed",
  "complete",
] as const;
const artifactReferenceSchema = z
  .object({
    runId: z.number().int().positive(),
    artifactId: z.number().int().positive(),
    artifactName: z.string().regex(/^release-[a-f0-9]{64}-(inputs|products)$/),
    manifestDigest: digestSchema,
    archiveDigest: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  })
  .strict();
const productsSchema = artifactReferenceSchema.extend({
  staticSha256: digestSchema,
  imageSha256: digestSchema,
  imageDigest: z.string().regex(/^sha256:[a-f0-9]{64}$/),
});
export const productionPointersSchema = z
  .object({
    githubLatest: z
      .object({ id: z.number().int().positive(), tag: z.string() })
      .strict()
      .nullable(),
    imageLatest: z
      .string()
      .regex(/^sha256:[a-f0-9]{64}$/)
      .nullable(),
    siteVersion: z
      .object({
        productVersion: versionSchema,
        buildVersion: z.string().min(1),
        sourceSha: shaSchema,
      })
      .strict()
      .nullable(),
    playbookPointer: z.object({ editionDigest: digestSchema, rendererCommit: shaSchema }).strict(),
  })
  .strict();
export type ProductionPointers = z.infer<typeof productionPointersSchema>;
export const entrySchema = z
  .object({
    id: digestSchema,
    version: versionSchema,
    sourceSha: shaSchema,
    baselineVersion: stableVersionSchema,
    baselineSha: shaSchema,
    policyDigest: digestSchema,
    evidenceDigest: digestSchema,
    impact: impactSchema,
    actor: z.string().min(1),
    preparationRunId: z.number().int().positive(),
    versionInput: versionRequestSchema,
    stage: z.enum([...stages, "abandoned"]),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
    preparationHead: shaSchema.optional(),
    prNumber: z.number().int().positive().optional(),
    mergeSha: shaSchema.optional(),
    releaseRunId: z.number().int().positive().optional(),
    inputs: artifactReferenceSchema.optional(),
    products: productsSchema.optional(),
    publication: z
      .object({
        releaseId: z.number().int().positive(),
        staticAssetId: z.number().int().positive(),
        manifestAssetId: z.number().int().positive(),
        imageDigest: z.string().regex(/^sha256:[a-f0-9]{64}$/),
      })
      .strict()
      .optional(),
    deployment: z
      .object({
        url: z.string().url(),
        productVersion: versionSchema,
        sourceSha: shaSchema,
        staticSha256: digestSchema,
      })
      .strict()
      .optional(),
    latestVerified: z.boolean().optional(),
    deploymentStatus: z.literal("not-applicable").optional(),
    latestStatus: z.literal("not-applicable").optional(),
    productionBefore: productionPointersSchema.optional(),
    productionAfter: productionPointersSchema.optional(),
    failure: z
      .object({
        phase: z.string().min(1),
        runId: z.string().regex(/^\d+$/),
        attempt: z.number().int().positive(),
      })
      .strict()
      .optional(),
  })
  .strict();
export type ReleaseEntry = z.infer<typeof entrySchema>;

export const ledgerSchema = z
  .object({
    schemaVersion: z.literal(1),
    bootstrap: z.object({ version: stableVersionSchema, sourceSha: shaSchema }).strict(),
    entries: z.array(entrySchema),
  })
  .strict();
export type ReleaseLedger = z.infer<typeof ledgerSchema>;

export function initialLedger(contract: ReleaseContract): ReleaseLedger {
  return { schemaVersion: 1, bootstrap: contract.bootstrap, entries: [] };
}

export function validateLedger(raw: unknown, contract: ReleaseContract): ReleaseLedger {
  const ledger = ledgerSchema.parse(raw);
  if (canonicalJson(ledger.bootstrap) !== canonicalJson(contract.bootstrap))
    throw new Error("Ledger bootstrap does not match the approved contract");
  const ids = new Set<string>();
  const versions = new Set<string>();
  const runs = new Set<number>();
  for (const entry of ledger.entries) {
    if (
      ids.has(entry.id) ||
      versions.has(precedenceKey(entry.version)) ||
      runs.has(entry.preparationRunId)
    )
      throw new Error("Ledger contains a duplicate identity or version");
    ids.add(entry.id);
    versions.add(precedenceKey(entry.version));
    runs.add(entry.preparationRunId);
    if (
      entry.id !==
      digest({
        version: entry.version,
        sourceSha: entry.sourceSha,
        policyDigest: entry.policyDigest,
        evidenceDigest: entry.evidenceDigest,
        versionInput: entry.versionInput,
      })
    ) {
      throw new Error("Ledger identity was modified");
    }
    if (compareVersions(entry.version, ledger.bootstrap.version) <= 0)
      throw new Error("Ledger contains a version at or below bootstrap");
    validateEntry(entry);
  }
  return ledger;
}

function validateEntry(entry: ReleaseEntry): void {
  if (entry.stage === "abandoned") {
    if (entry.inputs || entry.products || entry.publication || entry.deployment)
      throw new Error("Abandoned releases cannot retain frozen or published proofs");
    return;
  }
  const prerelease = isPrerelease(entry.version);
  const level = stages.indexOf(entry.stage as (typeof stages)[number]);
  if (
    prerelease &&
    (entry.stage === "deployed" || entry.deployment || entry.latestVerified !== undefined)
  )
    throw new Error("Prerelease cannot contain deployment or latest promotion proofs");
  if (!prerelease && (entry.deploymentStatus || entry.latestStatus))
    throw new Error("Stable deployment and latest promotion cannot be marked not-applicable");
  if (!prerelease && (entry.productionBefore || entry.productionAfter))
    throw new Error("Prerelease isolation evidence cannot be attached to a stable release");
  if (
    (entry.productionBefore && level < 3) ||
    (entry.productionAfter && entry.stage !== "complete")
  )
    throw new Error("Production isolation proofs cannot precede frozen products or completion");
  if (
    prerelease &&
    entry.stage === "complete" &&
    (!entry.productionBefore ||
      !entry.productionAfter ||
      canonicalJson(entry.productionBefore) !== canonicalJson(entry.productionAfter))
  )
    throw new Error("Prerelease completion requires unchanged production pointer evidence");
  if (
    prerelease &&
    entry.stage === "complete" &&
    (entry.deploymentStatus !== "not-applicable" || entry.latestStatus !== "not-applicable")
  )
    throw new Error(
      "Prerelease completion requires explicit not-applicable deployment/latest results"
    );
  if (entry.stage !== "complete" && (entry.deploymentStatus || entry.latestStatus))
    throw new Error("Not-applicable outcomes belong to verified prerelease completion");
  if (level >= 1 && (!entry.preparationHead || !entry.prNumber))
    throw new Error("PR provenance is missing");
  if (level >= 2 && (!entry.mergeSha || !entry.releaseRunId))
    throw new Error("Merged source/run identity is missing");
  if (level >= 3 && (!entry.inputs || !entry.products))
    throw new Error("Frozen inputs/products are missing");
  if (
    level >= 4 &&
    (!entry.publication || entry.publication.imageDigest !== entry.products?.imageDigest)
  )
    throw new Error("Both publication proofs are required");
  if (
    !prerelease &&
    level >= 5 &&
    (!entry.deployment ||
      entry.deployment.productVersion !== entry.version ||
      entry.deployment.sourceSha !== entry.mergeSha ||
      entry.deployment.staticSha256 !== entry.products?.staticSha256)
  ) {
    throw new Error("Deployment must consume the frozen static product");
  }
  if (!prerelease && level >= 6 && entry.latestVerified !== true)
    throw new Error("Latest promotion must be verified before completion");
  if (entry.inputs && !entry.mergeSha)
    throw new Error("Inputs cannot be frozen before the source is merged");
  if (
    (entry.mergeSha && level < 2) ||
    (entry.products && level < 3) ||
    (entry.publication && level < 4) ||
    (entry.deployment && level < 5) ||
    (entry.latestVerified && level < 6)
  )
    throw new Error("A release proof was attached before its verified stage");
  for (const [kind, artifact] of [
    ["inputs", entry.inputs],
    ["products", entry.products],
  ] as const) {
    if (artifact && artifact.runId !== entry.releaseRunId)
      throw new Error("Frozen artifacts must belong to the original release run");
    if (artifact && artifact.artifactName !== `release-${entry.id}-${kind}`)
      throw new Error("Frozen artifact name belongs to a different release identity");
  }
}

export function publishedBaseline(ledger: ReleaseLedger): { version: string; sourceSha: string } {
  return ledger.entries
    .filter(
      (entry) =>
        !isPrerelease(entry.version) && ["published", "deployed", "complete"].includes(entry.stage)
    )
    .reduce(
      (base, entry) =>
        compareVersions(entry.version, base.version) > 0
          ? { version: entry.version, sourceSha: shaSchema.parse(entry.mergeSha) }
          : base,
      ledger.bootstrap
    );
}

export function supportedVersions(ledger: ReleaseLedger): string[] {
  return [
    ledger.bootstrap.version,
    ...ledger.entries
      .filter(
        (entry) =>
          !isPrerelease(entry.version) &&
          ["published", "deployed", "complete"].includes(entry.stage)
      )
      .map((entry) => entry.version),
  ];
}

export function reserveRelease(
  ledger: ReleaseLedger,
  request: {
    sourceSha: string;
    policyDigest: string;
    evidenceDigest: string;
    impact: Impact;
    actor: string;
    version?: string;
    preparationRunId: number;
  },
  now = new Date().toISOString()
): { ledger: ReleaseLedger; entry: ReleaseEntry; reused: boolean } {
  const same = ledger.entries.find((entry) => entry.preparationRunId === request.preparationRunId);
  if (same) {
    if (same.actor !== request.actor)
      throw new Error("An existing preparation belongs to another operator");
    if (
      same.sourceSha !== request.sourceSha ||
      same.policyDigest !== request.policyDigest ||
      same.evidenceDigest !== request.evidenceDigest ||
      same.stage === "abandoned"
    )
      throw new Error("Retry cannot replace the reserved source or policy identity");
    if ((request.version || "") !== same.versionInput)
      throw new Error("Retry cannot replace the original version input");
    return { ledger, entry: same, reused: true };
  }
  if (ledger.entries.some((entry) => entry.stage !== "complete" && entry.stage !== "abandoned"))
    throw new Error("Another release identity is active; recover or abandon it first");
  const baseline = publishedBaseline(ledger);
  const version = allocateVersion(
    baseline.version,
    ledger.entries.map((entry) => entry.version),
    request.impact,
    request.version
  );
  validateStateUpgrade(baseline.version, version);
  const identity = {
    version,
    sourceSha: request.sourceSha,
    policyDigest: request.policyDigest,
    evidenceDigest: request.evidenceDigest,
    versionInput: request.version || "",
  };
  const entry = entrySchema.parse({
    ...identity,
    id: digest(identity),
    baselineVersion: baseline.version,
    baselineSha: baseline.sourceSha,
    impact: request.impact,
    actor: request.actor,
    preparationRunId: request.preparationRunId,
    versionInput: request.version || "",
    stage: "reserved",
    createdAt: now,
    updatedAt: now,
  });
  return { ledger: { ...ledger, entries: [...ledger.entries, entry] }, entry, reused: false };
}

const immutable = [
  "id",
  "version",
  "sourceSha",
  "baselineVersion",
  "baselineSha",
  "policyDigest",
  "evidenceDigest",
  "impact",
  "actor",
  "preparationRunId",
  "versionInput",
  "createdAt",
  "preparationHead",
  "prNumber",
  "mergeSha",
  "releaseRunId",
  "inputs",
  "products",
  "publication",
  "deployment",
  "deploymentStatus",
  "latestStatus",
  "productionBefore",
  "productionAfter",
] as const;

export function updateRelease(
  ledger: ReleaseLedger,
  id: string,
  patch: Partial<ReleaseEntry>,
  now = new Date().toISOString()
): ReleaseLedger {
  const original = ledger.entries.find((entry) => entry.id === id);
  if (!original) throw new Error("Unknown release identity");
  for (const key of immutable) {
    if (
      original[key] !== undefined &&
      patch[key] !== undefined &&
      canonicalJson(original[key]) !== canonicalJson(patch[key])
    ) {
      throw new Error(`Recovery cannot replace ${key}`);
    }
  }
  const merged: Record<string, unknown> = { ...original, ...patch, updatedAt: now };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) delete merged[key];
  }
  const next = entrySchema.parse(merged);
  if (next.stage === "abandoned") {
    const failedBeforeArtifacts =
      original.stage === "merged" &&
      Boolean(original.failure) &&
      !original.inputs &&
      !original.products &&
      !original.publication &&
      !original.deployment;
    const abandonedFrozenInputs =
      original.stage === "merged" &&
      Boolean(original.failure) &&
      Boolean(original.inputs) &&
      !original.products &&
      !original.publication &&
      !original.deployment &&
      Object.hasOwn(patch, "inputs") &&
      patch.inputs === undefined;
    if (
      !["reserved", "pr_open", "abandoned"].includes(original.stage) &&
      !failedBeforeArtifacts &&
      !abandonedFrozenInputs
    )
      throw new Error("A merged release cannot be abandoned");
  } else if (next.stage !== original.stage) {
    if (
      !(
        isPrerelease(next.version) &&
        original.stage === "published" &&
        next.stage === "complete"
      ) &&
      stages.indexOf(next.stage) !== stages.indexOf(original.stage as (typeof stages)[number]) + 1
    )
      throw new Error("Release stage cannot be skipped or rolled back");
  }
  if (original.stage === "abandoned" && next.stage !== "abandoned")
    throw new Error("An abandoned reservation cannot be revived");
  validateEntry(next);
  return { ...ledger, entries: ledger.entries.map((entry) => (entry.id === id ? next : entry)) };
}

export function newerDeploymentExists(ledger: ReleaseLedger, entry: ReleaseEntry): boolean {
  return ledger.entries.some(
    (other) =>
      other.deployment !== undefined &&
      ["deployed", "complete"].includes(other.stage) &&
      compareVersions(other.version, entry.version) > 0
  );
}

export interface LedgerReadOptions {
  allowLegacyHead?: boolean;
  allowLegacyAncestor?: boolean;
}

export interface LedgerStore {
  read(
    options?: LedgerReadOptions
  ): Promise<{ sha: string; ledger: ReleaseLedger; legacySha?: string }>;
  compareAndSwap(expectedSha: string, ledger: ReleaseLedger): Promise<string>;
}

export async function changeLedger<T>(
  store: LedgerStore,
  change: (ledger: ReleaseLedger) => { ledger: ReleaseLedger; result: T }
): Promise<T> {
  const current = await store.read();
  const next = change(current.ledger);
  if (canonicalJson(next.ledger) !== canonicalJson(current.ledger))
    await store.compareAndSwap(current.sha, next.ledger);
  return next.result;
}
