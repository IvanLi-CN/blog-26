import { resolve } from "node:path";
import { withoutDeploymentCredentials } from "../src/lib/playbook/child-env";

const token = process.env.EDGEONE_API_TOKEN;
const project = process.env.EDGEONE_PROJECT_NAME;
if (!token || !project) throw new Error("EdgeOne diagnostic configuration missing");
const child = Bun.spawn(
  [
    "npx",
    "edgeone@1.6.34",
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
  {
    env: {
      ...withoutDeploymentCredentials(process.env),
      EDGEONE_API_TOKEN: token,
      EDGEONE_PROJECT_NAME: project,
      NODE_OPTIONS: `--require ${resolve("scripts/diagnose-edgeone-cli-guard.cjs")}`,
    },
    stdout: "pipe",
    stderr: "pipe",
  }
);
const chunks = await Promise.all([
  new Response(child.stdout).text(),
  new Response(child.stderr).text(),
]);
const output = chunks.join("\n");
const exitCode = await child.exited;
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
    stoppedBeforeDeployment: output.includes("DIAGNOSTIC_STOP_BEFORE_DEPLOYMENT"),
  })
);
// Emit errors only, removing the configured credential and every URL.
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
if (!output.includes("DIAGNOSTIC_STOP_BEFORE_DEPLOYMENT")) process.exitCode = 1;
