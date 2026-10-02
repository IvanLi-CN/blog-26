import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { downloadRetainedEdition, readPublicPointer } from "../src/lib/playbook/artifacts";
import { readPublicArchive } from "../src/lib/playbook/bundle";
import { githubReleaseReader } from "../src/lib/playbook/github";
import {
  encodeJson,
  parseEditionIdentity,
  samePlaybookEdition,
} from "../src/lib/playbook/manifest";
import { deployContent, type ReleaseTrigger, resolveRelease } from "../src/lib/playbook/release";

const enabled = process.env.PLAYBOOK_CONTENT_UPDATES_ENABLED === "true";
const rollback = process.env.PLAYBOOK_ROLLBACK === "true";
if (!rollback && !enabled) {
  console.log("Playbook automatic updates are paused");
  process.exit(0);
}
if (rollback && enabled) throw new Error("Pause automatic updates before explicit rollback");
if (!process.env.GITHUB_EVENT_PATH) throw new Error("A GitHub event file is required");
const event = JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH, "utf8"));
const input: ReleaseTrigger =
  process.env.GITHUB_EVENT_NAME === "schedule" ? { mode: "reconcile" } : event.inputs;
const reader = githubReleaseReader();
const selected = await resolveRelease(reader, input);
if (!selected) {
  console.log("No ready stable public release");
  process.exit(0);
}
const archive = await reader.asset(selected.bundleAssetId, selected.manifest.bundle.size);
readPublicArchive(archive, selected.manifest);
const taskRoot = resolve(
  process.env.RUNNER_TEMP || ".tmp",
  `playbook-${process.env.GITHUB_RUN_ID || "local"}`
);
const bundleRoot = resolve(taskRoot, "bundle");
await mkdir(bundleRoot, { recursive: true });
await writeFile(
  resolve(bundleRoot, "playbook-public-manifest.json"),
  encodeJson(selected.manifest)
);
await writeFile(resolve(bundleRoot, "playbook-public.tar.gz"), archive);
const manifestUrl =
  process.env.PLAYBOOK_MANIFEST_URL || "https://ivanli.cc/_content/playbook/manifest.json";
let buildNumber = 0;
let rendererRoot = "";
async function run(args: string[], cwd = process.cwd(), env = process.env) {
  const child = Bun.spawn(args, { cwd, env, stdout: "inherit", stderr: "inherit" });
  if ((await child.exited) !== 0) throw new Error(`Command failed: ${args[0]}`);
}
if (process.env.GITHUB_STEP_SUMMARY)
  await appendFile(
    process.env.GITHUB_STEP_SUMMARY,
    `Requested Playbook input (adoption is not implied):\n\n\`\`\`json\n${encodeJson(selected.manifest)}\`\`\`\n`
  );
let result: string;
try {
  result = await deployContent(
    {
      current: () => readPublicPointer(manifestUrl),
      async build(_manifest, renderer, current) {
        if (!current) throw new Error("A deployed stable renderer is required");
        rendererRoot = resolve(taskRoot, `renderer-${++buildNumber}`);
        await run(["git", "fetch", "origin", renderer]);
        await run(["git", "worktree", "add", "--detach", rendererRoot, renderer]);
        await downloadRetainedEdition(current, manifestUrl, resolve(taskRoot, "deployed"));
        await mkdir(resolve(rendererRoot, "site/generated"), { recursive: true });
        await writeFile(
          resolve(rendererRoot, "site/generated/public-snapshot.json"),
          await readFile(resolve(taskRoot, "deployed/public-snapshot.json"))
        );
        const env = {
          ...process.env,
          GH_TOKEN: undefined,
          PLAYBOOK_BUNDLE_DIR: bundleRoot,
          PLAYBOOK_USE_DEPLOYED: "true",
          PLAYBOOK_REQUIRED: "true",
          PLAYBOOK_RENDERER_COMMIT: renderer,
          BUILD_DATE: (
            await Bun.$`git -C ${rendererRoot} show -s --format=%cI ${renderer}`.text()
          ).trim(),
          COMMIT_HASH: renderer,
          COMMIT_SHORT_HASH: renderer.slice(0, 8),
          REPOSITORY_URL: "https://github.com/IvanLi-CN/blog-26",
          BRANCH_NAME: "main",
          PUBLIC_CONTENT_BUNDLE_URL: "preloaded",
          PUBLIC_API_BASE_URL: process.env.PUBLIC_API_BASE_URL || "https://console.ivanli.cc",
          PUBLIC_SITE_URL: process.env.PUBLIC_SITE_URL || "https://ivanli.cc",
          PUBLIC_SITE_BASE_PATH: process.env.PUBLIC_SITE_BASE_PATH || "/",
          PUBLIC_STATIC_MEDIA_ORIGIN: "https://console.ivanli.cc",
          PUBLIC_STATIC_MEDIA_DOWNLOAD_CONCURRENCY: "1",
        };
        await run(["bun", "install", "--frozen-lockfile"], rendererRoot, env);
        await run(
          ["bash", resolve(process.cwd(), "scripts/build-edgeone-content-artifact.sh")],
          rendererRoot,
          env
        );
        return parseEditionIdentity(
          JSON.parse(
            await readFile(
              resolve(rendererRoot, "edgeone-dist/_content/playbook/manifest.json"),
              "utf8"
            )
          )
        );
      },
      async deploy() {
        if (!process.env.EDGEONE_API_TOKEN || !process.env.EDGEONE_PROJECT_NAME)
          throw new Error("EdgeOne deployment credentials are required");
        const child = Bun.spawn(
          [
            "npx",
            "edgeone@1.6.34",
            "makers",
            "deploy",
            resolve(rendererRoot, "edgeone-dist"),
            "-n",
            process.env.EDGEONE_PROJECT_NAME,
            "-t",
            process.env.EDGEONE_API_TOKEN,
            "-e",
            "production",
          ],
          { stdout: "pipe", stderr: "pipe" }
        );
        const [output, errors, status] = await Promise.all([
          new Response(child.stdout).text(),
          new Response(child.stderr).text(),
          child.exited,
        ]);
        // Do not expose signed preview URLs or credentials in run logs.
        const redact = (text: string) =>
          text
            .split("\n")
            .filter((line) => !line.includes("Deploy URL:"))
            .join("\n")
            .replace(/(eo_token=|eo_time=)[^&\s]+/gu, "$1[REDACTED]")
            .replaceAll(process.env.EDGEONE_API_TOKEN || "[absent-token]", "[REDACTED]");
        console.log(redact(output));
        if (status !== 0) throw new Error(redact(errors));
      },
      async verify(edition) {
        for (let attempt = 0; attempt < 15; attempt++) {
          const actual = await readPublicPointer(manifestUrl);
          if (actual && samePlaybookEdition(actual, edition)) return;
          await new Promise((done) => setTimeout(done, 2000));
        }
        throw new Error("Deployment did not publish the expected public pointer");
      },
    },
    selected.manifest,
    { rollback, automaticUpdatesEnabled: enabled }
  );
} catch (error) {
  if (process.env.GITHUB_STEP_SUMMARY)
    await appendFile(
      process.env.GITHUB_STEP_SUMMARY,
      "\nPlaybook deployment failed. The requested input above was not verified as adopted; see the failing step log.\n"
    );
  throw error;
}
const current = await readPublicPointer(manifestUrl);
const summary = `Playbook result: ${result}\n\n${encodeJson({ adopted: current, upstreamRunId: input.source_run_id || null, downstreamRun: `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}` })}`;
console.log(summary);
if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, summary);
