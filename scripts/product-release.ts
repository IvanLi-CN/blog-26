import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { z } from "zod";
import { findArtifact, restoreArtifact, verifyDirectory } from "../src/lib/release/artifacts";
import {
  evaluationChecksPassed,
  readQuality,
  resolveCompletedRelease,
  validateCandidatePolicy,
} from "../src/lib/release/completion";
import { deployStatic } from "../src/lib/release/deployment";
import { GitHubLedgerStore, GitHubRelease } from "../src/lib/release/github";
import { freezeInputs } from "../src/lib/release/inputs";
import { changeLedger, entrySchema, initialLedger, updateRelease } from "../src/lib/release/ledger";
import { canonicalJson, digest } from "../src/lib/release/policy";
import {
  assertMerge,
  assertReleasePull,
  prepareRelease,
  releaseBranch,
  verifyTrustedTags,
} from "../src/lib/release/preparation";
import { buildProducts, verifyProducts } from "../src/lib/release/products";
import {
  assertProductionOwner,
  finishRelease,
  productProof,
  promoteLatest,
  publishProducts,
} from "../src/lib/release/publication";
import { readContract } from "../src/lib/release/source";

const contract = readContract();
const quality = readQuality();
const command = process.argv[2];
const work = resolve(process.env.RUNNER_TEMP || ".tmp", "product-release");
const entryPath = resolve(work, "entry.json");
const inputs = resolve(work, "inputs");
const products = resolve(work, "products");
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
      workflow_run: z.object({
        id: z.number().int().positive(),
        head_sha: z.string().regex(/^[a-f0-9]{40}$/),
        head_branch: z.literal("main"),
        head_repository: z.object({ full_name: z.literal(contract.repository) }),
        path: z.enum([
          ".github/workflows/product-release.yml",
          ".github/workflows/manual-product-release.yml",
        ]),
        conclusion: z.literal("failure"),
      }),
    })
    .parse(await event());
  const ledger = app.reference(`heads/${contract.ledgerBranch}`)
    ? (await new GitHubLedgerStore(app).read()).ledger
    : initialLedger(contract);
  const entries = ledger.entries.filter(
    (item) =>
      item.releaseRunId === payload.workflow_run.id ||
      item.preparationRunId === payload.workflow_run.id
  );
  if (entries.length > 1) throw new Error("Failed run claims multiple release identities");
  const entry = entries[0];
  await output({
    confirmed: "true",
    version: entry?.version || "unreserved",
    source: entry?.mergeSha || entry?.sourceSha || payload.workflow_run.head_sha,
    identity: entry?.id || "unreserved",
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
      ? (await store.read()).ledger
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
      workflow_run: z.object({
        head_sha: z.string(),
        head_branch: z.string(),
        event: z.string(),
        path: z.string(),
        head_repository: z.object({ full_name: z.string() }),
      }),
    })
    .parse(await event());
  const run = payload.workflow_run;
  if (
    run.head_repository.full_name !== contract.repository ||
    !["workflow_dispatch", "pull_request"].includes(run.event) ||
    ![".github/workflows/ci.yml", ".github/workflows/e2e.yml"].includes(run.path)
  )
    throw new Error("Untrusted preparation evaluation event");
  const store = new GitHubLedgerStore(app);
  if (app.reference(`heads/${contract.ledgerBranch}`)) {
    const entry = (await store.read()).ledger.entries.find(
      (item) =>
        item.preparationHead === run.head_sha &&
        releaseBranch(item) === run.head_branch &&
        item.prNumber &&
        item.stage !== "abandoned"
    );
    if (
      entry?.prNumber &&
      evaluationChecksPassed(app, run.head_sha, quality.required_checks, run.head_branch)
    ) {
      const deadline = Date.now() + 20 * 60_000;
      while (true) {
        const pull = app.pull(entry.prNumber);
        assertReleasePull(app, entry, pull);
        if (pull.merged && pull.merge_commit_sha) {
          assertMerge(app, entry, pull, pull.merge_commit_sha);
          for (const workflow of ["ci.yml", "e2e.yml"] as const)
            app.dispatchEvaluation(workflow, "main", pull.merge_commit_sha);
          break;
        }
        if (pull.state !== "open" || app.reference("heads/main") !== entry.sourceSha)
          throw new Error("Preparation source changed before merge");
        if (Date.now() >= deadline)
          throw new Error(
            "Auto-merge has not completed; rerun this same followup after resolving the protected gate"
          );
        await new Promise((done) => setTimeout(done, 10_000));
      }
    }
  }
} else if (command === "resolve") {
  const app = github();
  const payload = z.object({ workflow_run: z.unknown() }).parse(await event());
  const entry = await resolveCompletedRelease(
    app,
    new GitHubLedgerStore(app),
    quality,
    payload.workflow_run,
    Number(process.env.GITHUB_RUN_ID),
    !process.argv.includes("--read-only")
  );
  await output({
    active: String(Boolean(entry)),
    source_sha: entry?.mergeSha || "",
    identity: entry?.id || "",
  });
  if (entry) await save(entry);
} else if (command === "restore") {
  const { app, store, entry } = await fresh();
  const frozenInputs = await restoreArtifact(app, entry, "inputs", inputs);
  if (frozenInputs && !entry.inputs)
    await changeLedger(store, (ledger) => ({
      ledger: updateRelease(ledger, entry.id, { inputs: frozenInputs }),
      result: null,
    }));
  const frozenProducts = await restoreArtifact(app, entry, "products", products);
  if (frozenProducts && !entry.products) {
    const manifest = await verifyProducts(entry, products);
    await changeLedger(store, (ledger) => ({
      ledger: updateRelease(ledger, entry.id, {
        stage: "frozen",
        products: { ...frozenProducts, ...productProof(manifest) },
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
} else if (command === "build-products") {
  await buildProducts(await localEntry(), inputs, products);
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
      ? { inputs: reference }
      : {
          stage: "frozen" as const,
          products: { ...reference, ...productProof(await verifyProducts(entry, root)) },
        };
  await changeLedger(store, (ledger) => ({
    ledger: updateRelease(ledger, entry.id, patch),
    result: null,
  }));
  await fresh();
} else if (command === "publish") {
  const { app, store, entry } = await fresh();
  const completed = await finishRelease(store, entry.id, {
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
  const { store, entry } = await fresh();
  await changeLedger(store, (ledger) => ({
    ledger: updateRelease(ledger, entry.id, {
      failure: {
        phase: entry.stage,
        runId: String(process.env.GITHUB_RUN_ID),
        attempt: Number(process.env.GITHUB_RUN_ATTEMPT || 1),
      },
    }),
    result: null,
  }));
} else throw new Error("Unknown product release operation");
