import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { z } from "zod";
import {
  findArtifact,
  findRepositoryArtifact,
  findServerArtifact,
  restoreArtifact,
  verifyDirectory,
} from "../src/lib/release/artifacts";
import {
  assertReleaseRecoverySource,
  assertRetryableProductRelease,
  classifyMergeFollowup,
  evaluationChecksPassed,
  mainEvaluationResult,
  manualReleaseWorkflowRun,
  readQuality,
  releaseRecoveryEventSchema,
  resolveCompletedRelease,
  runSchema,
  validateCandidatePolicy,
} from "../src/lib/release/completion";
import { deployStatic } from "../src/lib/release/deployment";
import { classifyWorkflowFailure, recoveryOperation } from "../src/lib/release/failure";
import { GitHubLedgerStore, GitHubRelease } from "../src/lib/release/github";
import { freezeInputs } from "../src/lib/release/inputs";
import {
  abandonUnrecoverableFrozenInputs,
  changeLedger,
  entrySchema,
  initialLedger,
  updateRelease,
} from "../src/lib/release/ledger";
import { canonicalJson, digest } from "../src/lib/release/policy";
import {
  assertMerge,
  assertReleasePull,
  prepareRelease,
  releaseBranch,
  verifyTrustedTags,
} from "../src/lib/release/preparation";
import { buildProducts, preflightFrozenMedia, verifyProducts } from "../src/lib/release/products";
import {
  assertProductionOwner,
  finishRelease,
  productProof,
  promoteLatest,
  publishProducts,
  readProductionPointers,
} from "../src/lib/release/publication";
import { assertPolicyIdentity, readContract } from "../src/lib/release/source";
import { isPrerelease } from "../src/lib/release/version";

const contract = readContract();
const quality = readQuality();
const command = process.argv[2];
const work = resolve(process.env.RUNNER_TEMP || ".tmp", "product-release");
const entryPath = resolve(work, "entry.json");
const inputs = resolve(work, "inputs");
const products = resolve(work, "products");
const preflight = resolve(work, "preflight");
await mkdir(work, { recursive: true });
const github = () => new GitHubRelease(contract, "github-actions");
const event = async () => JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH || "", "utf8"));
const localEntry = async () => entrySchema.parse(JSON.parse(await readFile(entryPath, "utf8")));
async function save(entry: z.infer<typeof entrySchema>) {
  await writeFile(entryPath, `${canonicalJson(entry)}\n`);
}
async function output(values: Record<string, string>) {
  for (const [key, value] of Object.entries(values)) {
    if (/\r|\n/.test(value)) throw new Error("Workflow output must be one line");
    if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `${key}=${value}\n`);
  }
}
function failureLocation(app: GitHubRelease, runId: number, attempt: number) {
  return classifyWorkflowFailure(
    app.pages(`${app.root}/actions/runs/${runId}/attempts/${attempt}/jobs?per_page=100`, "jobs")
  );
}
async function fresh() {
  const app = github();
  const store = new GitHubLedgerStore(app);
  const local = await localEntry();
  const entry = (await store.read()).ledger.entries.find((item) => item.id === local.id);
  if (!entry || entry.releaseRunId !== Number(process.env.GITHUB_RUN_ID))
    throw new Error("Recovery must use the original release run");
  await save(entry);
  return { app, store, entry };
}
if (command === "notification") {
  const app = github();
  const payload = z
    .object({
      workflow_run: z
        .object({
          id: z.number().int().positive(),
          head_sha: z.string().regex(/^[a-f0-9]{40}$/),
          head_branch: z.literal("main"),
          head_repository: z.object({ full_name: z.literal(contract.repository) }),
          path: z.enum([
            ".github/workflows/product-release.yml",
            ".github/workflows/manual-product-release.yml",
          ]),
          conclusion: z.enum(["failure", "cancelled"]),
          run_attempt: z.number().int().positive(),
          html_url: z.string().url().optional(),
        })
        .passthrough(),
    })
    .parse(await event());
  const run = runSchema.parse(payload.workflow_run);
  const ledger = app.reference(`heads/${contract.ledgerBranch}`)
    ? (await new GitHubLedgerStore(app).read()).ledger
    : initialLedger(contract);
  const entries = ledger.entries.filter(
    (item) => item.releaseRunId === run.id || item.preparationRunId === run.id
  );
  if (entries.length > 1) throw new Error("Failed run claims multiple release identities");
  const entry = entries[0];
  const location = failureLocation(app, run.id, run.run_attempt);
  const phase =
    location.phase === "unknown" && entry?.failure && entry.failure.phase !== "merged"
      ? entry.failure.phase
      : location.phase;
  const step = entry?.failure?.step || location.step;
  const runUrl = run.html_url || `https://github.com/${contract.repository}/actions/runs/${run.id}`;
  await output({
    confirmed: "true",
    version: entry?.version || "unreserved",
    source: entry?.sourceSha || run.head_sha,
    source_sha: entry?.sourceSha || run.head_sha,
    merge_sha: entry?.mergeSha || "",
    identity: entry?.id || "unreserved",
    run_url: runUrl,
    attempt: String(run.run_attempt),
    phase,
    step,
    recovery: entry ? recoveryOperation(entry) : "inspect-release-ledger",
    recovery_url: entry
      ? `https://github.com/${contract.repository}/actions/workflows/retry-product-release.yml`
      : "",
  });
} else if (command === "policy") {
  const app = github();
  console.log(
    await validateCandidatePolicy(
      app,
      new GitHubLedgerStore(app),
      quality,
      await event(),
      process.env.GITHUB_EVENT_NAME || "",
      process.env.GITHUB_SHA || ""
    )
  );
} else if (command === "probe") {
  const app = github();
  const head = app.reference(`heads/${contract.ledgerBranch}`);
  if (!head || head === contract.bootstrap.sourceSha)
    throw new Error(
      "Read-only probe requires a signed ledger initialized by trusted release preparation"
    );
  const store = new GitHubLedgerStore(app);
  const verified = await store.read();
  verifyTrustedTags(app, verified.ledger);
  console.log(
    `Verified GitHub Actions ledger commit: https://github.com/${contract.repository}/commit/${verified.sha}`
  );
} else if (command === "prepare") {
  if (process.env.GITHUB_REF !== "refs/heads/main")
    throw new Error("Manual Product Release must be dispatched from main");
  const input = z
    .object({ inputs: z.object({ version: z.string().optional() }).optional() })
    .parse(await event());
  const app = github();
  const store = new GitHubLedgerStore(app);
  const ledgerHead = app.reference(`heads/${contract.ledgerBranch}`);
  verifyTrustedTags(
    app,
    ledgerHead && ledgerHead !== contract.bootstrap.sourceSha
      ? (await store.read({ allowLegacyHead: true, allowLegacyAncestor: true })).ledger
      : initialLedger(contract)
  );
  await store.initialize();
  const entry = await prepareRelease(
    app,
    store,
    quality,
    process.env.GITHUB_ACTOR || "",
    input.inputs?.version || "",
    Number(process.env.GITHUB_RUN_ID)
  );
  await output({
    identity: entry.id,
    version: entry.version,
    pr_number: String(entry.prNumber || ""),
  });
  console.log(
    `Prepared v${entry.version}: https://github.com/${contract.repository}/pull/${entry.prNumber}`
  );
} else if (command === "followup") {
  const app = github();
  const payload = z
    .object({
      inputs: z
        .object({
          release_id: z.string().min(1),
          pr_number: z.coerce.number().int().positive(),
          head_sha: z.string().regex(/^[a-f0-9]{40}$/),
        })
        .optional(),
      workflow_run: z
        .object({
          head_sha: z.string().regex(/^[a-f0-9]{40}$/),
          head_branch: z.string(),
          event: z.string(),
          path: z.string(),
          head_repository: z.object({ full_name: z.string() }),
        })
        .optional(),
    })
    .parse(await event());
  const run = payload.workflow_run;
  if (
    !payload.inputs &&
    (!run ||
      run.head_repository.full_name !== contract.repository ||
      !["workflow_dispatch", "pull_request"].includes(run.event) ||
      ![".github/workflows/ci.yml", ".github/workflows/e2e.yml"].includes(run.path))
  )
    throw new Error("Untrusted preparation evaluation event");
  const sourceSha = payload.inputs?.head_sha || run?.head_sha;
  if (!sourceSha) throw new Error("Release followup is missing its preparation head");
  const store = new GitHubLedgerStore(app);
  if (app.reference(`heads/${contract.ledgerBranch}`)) {
    const entry = (await store.read()).ledger.entries.find(
      (item) =>
        item.stage === "pr_open" &&
        item.preparationHead === sourceSha &&
        item.prNumber === (payload.inputs?.pr_number || item.prNumber) &&
        (!payload.inputs?.release_id
          ? releaseBranch(item) === run?.head_branch
          : item.id === payload.inputs.release_id)
    );
    if (!entry?.prNumber) throw new Error("Registered release preparation was not found");
    assertPolicyIdentity(contract, quality, entry.policyDigest);
    const evaluationDeadline = Date.now() + 75 * 60_000;
    while (true) {
      const pull = app.pull(entry.prNumber);
      assertReleasePull(app, entry, pull);
      if (evaluationChecksPassed(app, sourceSha, quality.required_checks, releaseBranch(entry))) {
        if (app.reference("heads/main") !== entry.sourceSha)
          throw new Error("Preparation source changed before release checks were published");
        assertPolicyIdentity(contract, quality, entry.policyDigest);
        app.publishReleaseChecks(entry.id, sourceSha, entry.prNumber, quality.required_checks);
        break;
      }
      if (pull.state !== "open" || app.reference("heads/main") !== entry.sourceSha)
        throw new Error("Preparation source changed before release checks completed");
      if (Date.now() >= evaluationDeadline)
        throw new Error(
          "Exact-head release evaluations did not complete before the followup deadline"
        );
      await new Promise((done) => setTimeout(done, 10_000));
    }
    const mergeDeadline = Date.now() + 20 * 60_000;
    let mergePropagationDeadline: number | undefined;
    while (true) {
      // Main can advance before the PR API exposes merged=true; allow the two observations to converge briefly.
      const mainSha = app.reference("heads/main");
      const pull = app.pull(entry.prNumber);
      assertReleasePull(app, entry, pull);
      const state = classifyMergeFollowup(pull, mainSha, entry.sourceSha);
      if (state === "merged" && pull.merge_commit_sha) {
        assertMerge(app, entry, pull, pull.merge_commit_sha);
        for (const workflow of ["ci.yml", "e2e.yml"] as const)
          app.dispatchEvaluation(workflow, "main", pull.merge_commit_sha);
        break;
      }
      if (state === "source_changed") throw new Error("Preparation source changed before merge");
      if (state === "merge_propagating") {
        mergePropagationDeadline ??= Date.now() + 60_000;
        if (Date.now() >= mergePropagationDeadline)
          throw new Error("Preparation source changed before merge");
      } else mergePropagationDeadline = undefined;
      if (Date.now() >= mergeDeadline)
        throw new Error(
          "Auto-merge has not completed; rerun this same followup after resolving the protected gate"
        );
      await new Promise((done) => setTimeout(done, 10_000));
    }
  }
} else if (command === "resolve") {
  const app = github();
  const store = new GitHubLedgerStore(app);
  const payload = await event();
  const triggeringRun =
    process.env.GITHUB_EVENT_NAME === "workflow_dispatch"
      ? manualReleaseWorkflowRun(
          app,
          (await store.read()).ledger,
          Number(process.env.GITHUB_RUN_ID),
          Number(process.env.GITHUB_RUN_ATTEMPT || "1")
        )
      : z.object({ workflow_run: z.unknown() }).parse(payload).workflow_run;
  if (!triggeringRun) {
    await output({ active: "false", source_sha: "", identity: "", prerelease: "false" });
  } else {
    const entry = await resolveCompletedRelease(
      app,
      store,
      quality,
      triggeringRun,
      Number(process.env.GITHUB_RUN_ID),
      !process.argv.includes("--read-only")
    );
    await output({
      active: String(Boolean(entry)),
      source_sha: entry?.mergeSha || "",
      identity: entry?.id || "",
      prerelease: entry ? String(isPrerelease(entry.version)) : "false",
    });
    if (entry) await save(entry);
  }
} else if (command === "retry") {
  const requestedId = process.env.RELEASE_ID || "";
  if (!requestedId) throw new Error("RELEASE_ID is required");
  const app = github();
  const store = new GitHubLedgerStore(app);
  const current = await store.read({ allowLegacyHead: true, allowLegacyAncestor: true });
  const entry = current.ledger.entries.find((item) => item.id === requestedId);
  if (!entry) throw new Error("Unknown release identity");
  if (!entry.releaseRunId) throw new Error("Release identity has no original Product Release run");
  const run = runSchema.parse(app.api(`${app.root}/actions/runs/${entry.releaseRunId}`));
  assertRetryableProductRelease(entry, run, contract.repository);
  app.rerunWorkflowRun(run.id);
  await output({ release_id: entry.id, run_id: String(run.id), version: entry.version });
  console.log(`Requested same-identity rerun for ${entry.id}: ${run.id}`);
} else if (command === "restore") {
  const { app, store, entry } = await fresh();
  const frozenInputs = await restoreArtifact(app, entry, "inputs", inputs);
  if (frozenInputs && !entry.inputs)
    await changeLedger(store, (ledger) => ({
      ledger: updateRelease(ledger, entry.id, { inputs: frozenInputs, failure: undefined }),
      result: null,
    }));
  const frozenProducts = await restoreArtifact(app, entry, "products", products);
  if (frozenProducts && !entry.products) {
    const manifest = await verifyProducts(entry, products);
    await changeLedger(store, (ledger) => ({
      ledger: updateRelease(ledger, entry.id, {
        stage: "frozen",
        products: { ...frozenProducts, ...productProof(manifest) },
        failure: undefined,
      }),
      result: null,
    }));
  }
  await fresh();
  await output({
    need_inputs: String(!frozenInputs),
    need_products: String(!frozenProducts),
    inputs,
    products,
    input_name: `release-${entry.id}-inputs`,
    product_name: `release-${entry.id}-products`,
  });
} else if (command === "freeze-inputs") {
  await freezeInputs(await localEntry(), inputs);
} else if (command === "preflight-frozen-media") {
  await preflightFrozenMedia(await localEntry(), inputs, preflight);
} else if (command === "build-products") {
  if (!process.argv.includes("--use-preflight"))
    throw new Error("Product image packaging requires a successful frozen-media preflight");
  await buildProducts(await localEntry(), inputs, products, preflight);
} else if (command === "record-inputs" || command === "record-products") {
  const { app, store, entry } = await fresh();
  const kind = command === "record-inputs" ? "inputs" : "products";
  const root = kind === "inputs" ? inputs : products;
  const manifest = await verifyDirectory(root, entry, kind);
  const artifact = findArtifact(app, entry, kind);
  if (!artifact) throw new Error("Immutable artifact upload is missing");
  const reference = {
    runId: Number(entry.releaseRunId),
    artifactId: artifact.id,
    artifactName: artifact.name,
    archiveDigest: artifact.digest,
    manifestDigest: digest(manifest),
  };
  const patch =
    kind === "inputs"
      ? { inputs: reference, failure: undefined }
      : {
          stage: "frozen" as const,
          products: { ...reference, ...productProof(await verifyProducts(entry, root)) },
          failure: undefined,
        };
  await changeLedger(store, (ledger) => ({
    ledger: updateRelease(ledger, entry.id, patch),
    result: null,
  }));
  await fresh();
} else if (
  command === "publish" ||
  command === "publish-prerelease" ||
  command === "publish-stable"
) {
  const { app, store, entry } = await fresh();
  if (
    (command === "publish-prerelease" && !isPrerelease(entry.version)) ||
    (command === "publish-stable" && isPrerelease(entry.version))
  )
    throw new Error("Publication command does not match the reserved release type");
  const completed = await finishRelease(store, entry.id, {
    productionPointers: () => readProductionPointers(app),
    publish: (identity) => publishProducts(app, identity, products),
    deploy: async (identity) => {
      await assertProductionOwner(app, (await store.read()).ledger, identity);
      return deployStatic(identity, products);
    },
    promote: async (identity) => {
      await assertProductionOwner(app, (await store.read()).ledger, identity);
      return promoteLatest(app, identity);
    },
  });
  await save(completed);
  console.log(`Completed v${completed.version} from ${completed.mergeSha}`);
} else if (command === "failure") {
  const { app, store, entry } = await fresh();
  const location = failureLocation(
    app,
    Number(process.env.GITHUB_RUN_ID),
    Number(process.env.GITHUB_RUN_ATTEMPT || 1)
  );
  await changeLedger(store, (ledger) => ({
    ledger: updateRelease(ledger, entry.id, {
      failure: {
        phase: location.phase,
        step: location.step,
        runId: String(process.env.GITHUB_RUN_ID),
        attempt: Number(process.env.GITHUB_RUN_ATTEMPT || 1),
      },
    }),
    result: null,
  }));
} else if (command === "repair-ledger") {
  const app = github();
  const store = new GitHubLedgerStore(app);
  const requestedId = process.env.RELEASE_ID || "";
  if (!requestedId) throw new Error("RELEASE_ID is required");
  const current = await store.read({ allowLegacyHead: true, allowLegacyAncestor: true });
  const entry = current.ledger.entries.find((item) => item.id === requestedId);
  if (!entry) throw new Error("Unknown release identity");
  if (
    entry.stage !== "abandoned" ||
    entry.inputs ||
    entry.products ||
    entry.publication ||
    entry.deployment
  )
    throw new Error(
      "Only an abandoned release without frozen artifacts can repair the ledger head"
    );
  const repaired = updateRelease(current.ledger, entry.id, { stage: "abandoned" });
  if (!current.legacySha)
    throw new Error("Legacy ledger repair did not identify a historical commit");
  await store.compareAndSwap(current.sha, repaired, current.legacySha);
  console.log(`Repaired abandoned release ledger ${entry.id}`);
} else if (command === "abandon-failed") {
  const app = github();
  const store = new GitHubLedgerStore(app);
  const requestedId = process.env.RELEASE_ID || "";
  if (!requestedId) throw new Error("RELEASE_ID is required");
  const current = await store.read();
  const entry = current.ledger.entries.find((item) => item.id === requestedId);
  if (!entry) throw new Error("Unknown release identity");
  if (entry.stage !== "merged" || !entry.failure || entry.inputs || entry.products)
    throw new Error("Only a failed merged release without frozen artifacts can be abandoned");
  if (entry.releaseRunId !== Number(entry.failure.runId))
    throw new Error("Release failure does not belong to the registered release run");
  const run = z
    .object({
      id: z.number().int().positive(),
      head_sha: z.string().regex(/^[a-f0-9]{40}$/),
      run_attempt: z.number().int().positive(),
      event: releaseRecoveryEventSchema,
      path: z.literal(".github/workflows/product-release.yml"),
      status: z.literal("completed"),
      conclusion: z.literal("failure"),
      head_branch: z.literal("main"),
      head_repository: z.object({ full_name: z.literal(contract.repository) }),
    })
    .parse(app.api(`${app.root}/actions/runs/${entry.releaseRunId}`));
  if (run.id !== entry.releaseRunId) throw new Error("Release run identity changed");
  assertReleaseRecoverySource(entry, run);
  if (entry.failure.attempt > run.run_attempt)
    throw new Error("Release failure attempt is newer than the registered run");
  const { findArtifact } = await import("../src/lib/release/artifacts");
  for (const kind of ["inputs", "products"] as const) {
    if (findArtifact(app, entry, kind))
      throw new Error(`Cannot abandon a release with frozen ${kind}`);
  }
  await changeLedger(store, (ledger) => ({
    ledger: updateRelease(ledger, entry.id, { stage: "abandoned" }),
    result: null,
  }));
  console.log(`Abandoned failed release ${entry.id}`);
} else if (command === "abandon-failed-evaluation") {
  const app = github();
  const store = new GitHubLedgerStore(app);
  const requestedId = process.env.RELEASE_ID || "";
  if (!requestedId) throw new Error("RELEASE_ID is required");
  const incidentReason = (process.env.RELEASE_INCIDENT_REASON || "").trim();
  if (incidentReason.length < 10)
    throw new Error("Failed-evaluation abandonment requires a meaningful incident reason");
  const current = await store.read({ allowLegacyHead: true, allowLegacyAncestor: true });
  const entry = current.ledger.entries.find((item) => item.id === requestedId);
  if (!entry) throw new Error("Unknown release identity");
  if (
    entry.stage !== "pr_open" ||
    !entry.prNumber ||
    !entry.preparationHead ||
    entry.mergeSha ||
    entry.releaseRunId ||
    entry.failure ||
    entry.inputs ||
    entry.products ||
    entry.publication ||
    entry.deployment
  )
    throw new Error(
      "Only an unbound merged preparation without frozen or published artifacts can be abandoned"
    );
  const pull = app.pull(entry.prNumber);
  assertReleasePull(app, entry, pull);
  if (!pull.merged || !pull.merge_commit_sha)
    throw new Error("Release preparation PR is not merged");
  assertMerge(app, entry, pull, pull.merge_commit_sha);
  verifyTrustedTags(app, current.ledger);
  if (app.optional(`${app.root}/releases/tags/v${entry.version}`))
    throw new Error("Cannot abandon a preparation with a published GitHub Release");
  for (const kind of ["inputs", "products"] as const) {
    if (findRepositoryArtifact(app, `release-${entry.id}-${kind}`))
      throw new Error(`Cannot abandon a preparation with an uploaded ${kind} artifact`);
  }
  if (!app.reference(`heads/${contract.branch}`)) throw new Error("Default branch is missing");
  const evaluation = mainEvaluationResult(app, pull.merge_commit_sha, quality);
  if (evaluation.state !== "failed")
    throw new Error("Exact main evaluations are not terminally failed; retry or wait instead");
  const failure = evaluation.failedRun
    ? {
        phase: "resolve",
        step: "Exact main release evaluation failed",
        runId: String(evaluation.failedRun.id),
        attempt: evaluation.failedRun.run_attempt,
      }
    : undefined;
  await changeLedger(store, (ledger) => ({
    ledger: updateRelease(ledger, entry.id, { stage: "abandoned", failure }),
    result: null,
  }));
  console.log(`Abandoned failed release evaluation ${entry.id}: ${incidentReason}`);
} else if (command === "abandon-cancelled") {
  const app = github();
  const store = new GitHubLedgerStore(app);
  const requestedId = process.env.RELEASE_ID || "";
  if (!requestedId) throw new Error("RELEASE_ID is required");
  const current = await store.read();
  const entry = current.ledger.entries.find((item) => item.id === requestedId);
  if (!entry) throw new Error("Unknown release identity");
  if (
    entry.stage !== "merged" ||
    entry.failure ||
    entry.inputs ||
    entry.products ||
    entry.publication ||
    entry.deployment
  )
    throw new Error("Only a cancelled merged release without frozen products can be abandoned");
  if (!entry.releaseRunId) throw new Error("Cancelled release run is missing");
  const run = z
    .object({
      id: z.number().int().positive(),
      head_sha: z.string().regex(/^[a-f0-9]{40}$/),
      run_attempt: z.number().int().positive(),
      event: releaseRecoveryEventSchema,
      path: z.literal(".github/workflows/product-release.yml"),
      status: z.literal("completed"),
      conclusion: z.literal("cancelled"),
      head_branch: z.literal("main"),
      head_repository: z.object({ full_name: z.literal(contract.repository) }),
    })
    .parse(app.api(`${app.root}/actions/runs/${entry.releaseRunId}`));
  if (run.id !== entry.releaseRunId) throw new Error("Release run identity changed");
  if (run.head_sha !== entry.mergeSha) throw new Error("Cancelled release source identity changed");
  for (const kind of ["inputs", "products"] as const) {
    if (findArtifact(app, entry, kind))
      throw new Error(`Cannot abandon a cancelled release with frozen ${kind}`);
  }
  const location = failureLocation(app, run.id, run.run_attempt);
  await changeLedger(store, (ledger) => ({
    ledger: updateRelease(ledger, entry.id, {
      stage: "abandoned",
      failure: {
        phase: location.phase,
        step: location.step,
        runId: String(run.id),
        attempt: run.run_attempt,
      },
    }),
    result: null,
  }));
  console.log(`Abandoned cancelled release ${entry.id}`);
} else if (command === "abandon-failed-inputs") {
  const app = github();
  const store = new GitHubLedgerStore(app);
  const requestedId = process.env.RELEASE_ID || "";
  if (!requestedId) throw new Error("RELEASE_ID is required");
  const current = await store.read({ allowLegacyHead: true, allowLegacyAncestor: true });
  const entry = current.ledger.entries.find((item) => item.id === requestedId);
  if (!entry) throw new Error("Unknown release identity");
  if (
    entry.stage !== "merged" ||
    !entry.inputs ||
    entry.products ||
    entry.publication ||
    entry.deployment
  )
    throw new Error(
      "Only a failed merged release with frozen inputs and no products can be abandoned"
    );
  if (!entry.releaseRunId) throw new Error("Frozen-input recovery run is missing");
  if (process.env.RELEASE_CONFIRM_LOSS !== "true")
    throw new Error("Emergency frozen-input abandon requires RELEASE_CONFIRM_LOSS=true");
  const incidentReason = (process.env.RELEASE_INCIDENT_REASON || "").trim();
  if (incidentReason.length < 10)
    throw new Error("Emergency frozen-input abandon requires a meaningful incident reason");
  const run = runSchema.parse(app.api(`${app.root}/actions/runs/${entry.releaseRunId}`));
  if (run.id !== entry.releaseRunId) throw new Error("Release run identity changed");
  if (
    !releaseRecoveryEventSchema.safeParse(run.event).success ||
    run.path !== ".github/workflows/product-release.yml" ||
    run.status !== "completed" ||
    !["failure", "cancelled"].includes(run.conclusion || "") ||
    run.head_branch !== "main" ||
    run.head_repository.full_name !== contract.repository
  )
    throw new Error("Emergency frozen-input recovery run is not trusted");
  assertReleaseRecoverySource(entry, run);
  if (entry.failure && entry.releaseRunId !== Number(entry.failure.runId))
    throw new Error("Release failure does not belong to the registered release run");
  if (entry.failure && entry.failure.attempt > run.run_attempt)
    throw new Error("Release failure attempt is newer than the registered run");
  const productArtifact = findServerArtifact(app, entry, "products");
  if (productArtifact)
    throw new Error("Cannot abandon a release with any uploaded products artifact");
  const inputArtifact = findServerArtifact(app, entry, "inputs");
  if (inputArtifact) {
    if (
      inputArtifact.workflow_run.id !== entry.releaseRunId ||
      inputArtifact.id !== entry.inputs.artifactId ||
      inputArtifact.name !== entry.inputs.artifactName ||
      inputArtifact.digest !== entry.inputs.archiveDigest
    )
      throw new Error("Frozen input artifact provenance changed; loss cannot be proven");
    if (!inputArtifact.expired)
      throw new Error("Frozen inputs are still available; retry the original run instead");
  }
  const location = failureLocation(app, run.id, run.run_attempt);
  const withFailure = entry.failure
    ? current.ledger
    : updateRelease(current.ledger, entry.id, {
        failure: {
          phase: location.phase,
          step: location.step,
          runId: String(run.id),
          attempt: run.run_attempt,
        },
      });
  const next = abandonUnrecoverableFrozenInputs(withFailure, entry.id, {
    artifactUnavailable: true,
    incidentReason,
  });
  if (canonicalJson(next) !== canonicalJson(current.ledger))
    await store.compareAndSwap(current.sha, next, current.legacySha);
  console.log(`Abandoned unrecoverable frozen inputs ${entry.id}: ${incidentReason}`);
} else throw new Error("Unknown product release operation");
