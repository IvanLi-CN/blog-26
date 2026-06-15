#!/usr/bin/env bun

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { E2E_PROJECTS } from "../tests/e2e/taxonomy";

function reportDirFor(project: string) {
  return path.resolve(process.cwd(), "test-results", project, "html-report");
}

function runShowReport(target: string) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn("bun", ["x", "playwright", "show-report", target], {
      stdio: "inherit",
      env: process.env,
    });
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`show-report failed with exit code ${code ?? "unknown"}`));
    });
  });
}

async function main() {
  const requestedProject = process.argv[2]?.trim();
  if (requestedProject) {
    const target = reportDirFor(requestedProject);
    if (!existsSync(target)) {
      throw new Error(`Report not found for project ${requestedProject}: ${target}`);
    }
    await runShowReport(target);
    return;
  }

  const rootReport = path.resolve(process.cwd(), "test-results", "html-report");
  if (existsSync(rootReport)) {
    await runShowReport(rootReport);
    return;
  }

  const available = E2E_PROJECTS.map((project) => ({
    project,
    target: reportDirFor(project),
  })).filter(({ target }) => existsSync(target));

  if (available.length === 1) {
    await runShowReport(available[0].target);
    return;
  }

  if (available.length === 0) {
    throw new Error("No Playwright HTML report found under test-results/");
  }

  console.log("Multiple project reports found. Re-run with one of:");
  for (const { project } of available) {
    console.log(`  bun run test:e2e:report -- ${project}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
