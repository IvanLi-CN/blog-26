import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";

const workflowPath = path.resolve(process.cwd(), ".github/workflows/release.yml");
const workflow = readFileSync(workflowPath, "utf8");

function jobBlock(jobName: string) {
  const marker = `\n  ${jobName}:\n`;
  const start = workflow.indexOf(marker);
  expect(start).toBeGreaterThanOrEqual(0);

  const remaining = workflow.slice(start + marker.length);
  const nextJob = remaining.search(/\n {2}[a-z0-9_]+:\n/);
  return nextJob === -1 ? remaining : remaining.slice(0, nextJob);
}

function assertMainHeadGate(jobName: string, sideEffectName: string, gateId: string) {
  const job = jobBlock(jobName);
  const sideEffectStart = job.indexOf(`      - name: ${sideEffectName}\n`);
  expect(sideEffectStart).toBeGreaterThan(0);

  const gateStart = job.lastIndexOf("      - name:", sideEffectStart - 1);
  expect(gateStart).toBeGreaterThanOrEqual(0);

  const gate = job.slice(gateStart, sideEffectStart);
  const sideEffect = job.slice(sideEffectStart, sideEffectStart + 500);
  expect(gate).toContain(`id: ${gateId}`);
  expect(gate).toContain("uses: actions/github-script@v7");
  expect(gate).toContain("Release source is no longer the current main head");
  expect(sideEffect).toContain(`steps.${gateId}.outputs.is_current_head == 'true'`);
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
      "Create or update frontend GitHub Release",
      "main-head-before-frontend-release"
    );
    assertMainHeadGate(
      "deploy_frontend_edgeone",
      "Configure EdgeOne Makers backend origin",
      "main-head-before-edgeone-deployment"
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

  test("publishes the verified static artifact and functions to EdgeOne Makers only", () => {
    const publishFrontend = jobBlock("publish_frontend");
    expect(publishFrontend).toContain("- name: Stage EdgeOne deployment artifact");
    expect(publishFrontend).toContain("cp -R ./site-dist/. ./edgeone-dist/");
    expect(publishFrontend).toContain("cp -R ./edge-functions ./edgeone-dist/edge-functions");
    expect(publishFrontend).toContain("- name: Upload frontend EdgeOne artifact");
    expect(publishFrontend).toContain("uses: actions/upload-artifact@v4");
    expect(publishFrontend).toContain("name: frontend-edgeone-site");
    expect(publishFrontend).toContain("path: ./edgeone-dist");
    expect(workflow).not.toContain("\n  deploy_frontend_pages:\n");
    expect(workflow).not.toContain("actions/upload-pages-artifact");
    expect(workflow).not.toContain("actions/deploy-pages");

    const edgeone = jobBlock("deploy_frontend_edgeone");
    expect(edgeone).toContain("needs: [prepare, publish_frontend]");
    expect(edgeone).toContain("needs.prepare.outputs.channel == 'stable'");
    expect(edgeone).toContain("- name: Download frontend EdgeOne artifact");
    expect(edgeone).toContain("uses: actions/download-artifact@v4");
    expect(edgeone).toContain("name: frontend-edgeone-site");
    expect(edgeone).toContain("path: ./edgeone-dist");
    expect(edgeone).toContain(`EDGEONE_API_TOKEN: \${{ secrets.EDGEONE_API_TOKEN }}`);
    expect(edgeone).toContain(`EDGEONE_PROJECT_NAME: \${{ vars.EDGEONE_PROJECT_NAME }}`);
    expect(edgeone).toContain("- name: Configure EdgeOne Makers backend origin");
    expect(edgeone).toContain('makers link -n "$EDGEONE_PROJECT_NAME"');
    expect(edgeone).toContain("makers env set BLOG_BACKEND_ORIGIN https://api.ivanli.cc");
    expect(edgeone).toContain(
      `if: \${{ steps.main-head-before-edgeone-deployment.outputs.is_current_head == 'true' }}`
    );
    expect(edgeone).toContain('deployment_log="$RUNNER_TEMP/edgeone-deploy.log"');
    expect(edgeone).toContain("/Deploy URL:/d");
  });
});
