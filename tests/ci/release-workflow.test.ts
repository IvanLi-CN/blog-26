import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { load } from "js-yaml";

type WorkflowStep = {
  id?: string;
  if?: string;
  name?: string;
  uses?: string;
  with?: Record<string, string>;
};

type Workflow = {
  jobs: Record<string, { steps: WorkflowStep[] }>;
};

const workflowPath = path.resolve(process.cwd(), ".github/workflows/release.yml");
const workflow = load(readFileSync(workflowPath, "utf8")) as Workflow;

function assertMainHeadGate(jobName: string, sideEffectName: string, gateId: string) {
  const steps = workflow.jobs[jobName]?.steps;
  expect(steps).toBeDefined();

  const sideEffectIndex = steps.findIndex((step) => step.name === sideEffectName);
  expect(sideEffectIndex).toBeGreaterThan(0);

  const gate = steps[sideEffectIndex - 1];
  const sideEffect = steps[sideEffectIndex];
  expect(gate.id).toBe(gateId);
  expect(gate.uses).toBe("actions/github-script@v7");
  expect(gate.with?.script).toContain("Release source is no longer the current main head");
  expect(sideEffect.if).toContain(`steps.${gateId}.outputs.is_current_head == 'true'`);
}

describe("release.yml", () => {
  test("rechecks main immediately before each release tag side effect", () => {
    assertMainHeadGate(
      "prepare",
      "Create and push frontend tag (if missing)",
      "main-head-before-frontend-tag"
    );
    assertMainHeadGate(
      "prepare",
      "Create and push backend tag (if missing)",
      "main-head-before-backend-tag"
    );
    assertMainHeadGate(
      "prepare",
      "Create and push Docker image tag (if missing)",
      "main-head-before-image-tag"
    );
  });

  test("gates every release publication side effect on the current main head", () => {
    assertMainHeadGate(
      "publish_frontend",
      "Upload Pages artifact",
      "main-head-before-frontend-publication"
    );
    assertMainHeadGate(
      "publish_frontend",
      "Create or update frontend GitHub Release",
      "main-head-before-frontend-release"
    );
    assertMainHeadGate(
      "deploy_frontend_pages",
      "Deploy to GitHub Pages",
      "main-head-before-pages-deployment"
    );
    assertMainHeadGate(
      "publish_image",
      "Build and push unified Docker image",
      "main-head-before-image-publication"
    );
    assertMainHeadGate(
      "publish_backend",
      "Create or update backend GitHub Release",
      "main-head-before-backend-release"
    );
  });
});
