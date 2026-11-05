import { spawn } from "node:child_process";
import { access, readdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

const cache = join(homedir(), ".npm", "_npx");
let cli;
for (const name of await readdir(cache)) {
  const candidate = join(cache, name, "node_modules/edgeone/edgeone-bin/edgeone.js");
  try {
    await access(candidate);
    cli = candidate;
    break;
  } catch {}
}
if (!cli) throw new Error("Pinned CLI installation missing");
const token = process.env.EDGEONE_API_TOKEN;
const project = process.env.EDGEONE_PROJECT_NAME;
if (!token || !project) throw new Error("EdgeOne diagnostic configuration missing");
const child = spawn(
  process.execPath,
  [
    "--require",
    resolve("scripts/diagnose-edgeone-cli-guard.cjs"),
    cli,
    "makers",
    "deploy",
    resolve(process.env.RUNNER_TEMP, "edgeone-frozen-static"),
    "-n",
    project,
    "-t",
    token,
    "-e",
    "production",
  ],
  { stdio: ["ignore", "pipe", "pipe"] }
);
let output = "";
for (const stream of [child.stdout, child.stderr]) {
  stream.on("data", (chunk) => {
    output += chunk.toString();
  });
}
const exitCode = await new Promise((done) => child.on("close", done));
const stages = [
  "Using provided API token",
  "Validating API endpoint",
  "Using Project ID",
  "Uploading",
];
console.log(
  JSON.stringify({
    exitCode,
    reached: stages.filter((stage) => output.includes(stage)),
    stoppedBeforeUpload: output.includes("DIAGNOSTIC_STOP_BEFORE_UPLOAD"),
  })
);
// No COS credentials have been obtained. Still remove credentials and every URL.
const errors = output
  .split(/\r?\n/)
  .filter((line) => /error|failed|invalid|DIAGNOSTIC_STOP/i.test(line));
for (let line of errors.slice(-15)) {
  line = line
    .replaceAll(token, "<REDACTED>")
    .replace(/https?:\/\/[^\s<>"']+/g, "<URL>")
    .replace(new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, "g"), "");
  console.log(line.slice(0, 600));
}
if (!output.includes("DIAGNOSTIC_STOP_BEFORE_UPLOAD")) process.exitCode = 1;
