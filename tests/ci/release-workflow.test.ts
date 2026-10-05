import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { load } from "js-yaml";

const workflowPath = path.resolve(process.cwd(), ".github/workflows/release.yml");
const workflow = readFileSync(workflowPath, "utf8");
const parsedWorkflow = load(workflow) as {
  concurrency?: {
    group?: string;
    "cancel-in-progress"?: boolean;
    queue?: string;
  };
  jobs: Record<
    string,
    {
      concurrency?: { group?: string; "cancel-in-progress"?: boolean };
      needs?: unknown;
      if?: string;
      steps?: Array<{ name?: string; env?: Record<string, string> }>;
    }
  >;
};

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
  expect(gate).toContain("uses: actions/github-script@v9");
  expect(gate).toContain("Release source is no longer the current main head");
  expect(sideEffect).toContain(`steps.${gateId}.outputs.is_current_head == 'true'`);
}

describe("release.yml", () => {
  test("fetches one public snapshot and shares it across release jobs", () => {
    const prepareContent = jobBlock("prepare_public_content");
    expect(prepareContent).toContain("needs: [prepare]");
    expect(prepareContent).toContain("scripts/fetch-public-content-bundle.sh");
    expect(prepareContent).toContain("PUBLIC_CONTENT_SNAPSHOT_URL");
    expect(prepareContent).toContain("uses: actions/upload-artifact@v7");
    expect(prepareContent).toContain("name: public-content-snapshot");
    expect(prepareContent).toContain("path: ./site/generated/public-snapshot.json");
    expect(prepareContent).not.toContain("Record public content snapshot identity");

    for (const jobName of ["publish_frontend", "publish_image"]) {
      const job = jobBlock(jobName);
      expect(job).toContain("prepare_public_content");
      expect(job).toContain("uses: actions/download-artifact@v8");
      expect(job).toContain("name: public-content-snapshot");
      expect(job).toContain("path: ./site/generated");
      expect(job).not.toContain("Fetch content bundle");
      expect(job).not.toContain("PUBLIC_CONTENT_SNAPSHOT_URL");
    }
  });

  test("uses HTTP/1.1 and retries transient content bundle failures", () => {
    const fetchScript = readFileSync(
      path.resolve(process.cwd(), "scripts/fetch-public-content-bundle.sh"),
      "utf8"
    );
    expect(fetchScript.match(/--http1\.1/g)).toHaveLength(2);
    expect(fetchScript.match(/--retry-all-errors/g)).toHaveLength(2);
    expect(fetchScript.match(/--retry-max-time 300/g)).toHaveLength(2);
  });

  test("rechecks main immediately before each release tag side effect", () => {
    assertMainHeadGate("prepare", "Create or verify frontend tag", "main-head-before-frontend-tag");
    assertMainHeadGate("prepare", "Create or verify backend tag", "main-head-before-backend-tag");
    assertMainHeadGate(
      "prepare",
      "Create or verify Docker image tag",
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

  test("reports the current main SHA and safe recovery for a stale release source", () => {
    const prepare = jobBlock("prepare");
    const summaryStart = prepare.indexOf("      - name: Write summary\n");
    expect(summaryStart).toBeGreaterThanOrEqual(0);
    const summary = prepare.slice(summaryStart);

    expect(summary).toContain(
      "CURRENT_MAIN_SHA: $" + "{{ steps.intent.outputs.current_main_sha }}"
    );
    expect(summary).toContain(
      'expected_stale_reason="release_head_must_match_current_' +
        String.fromCharCode(36) +
        '{RELEASE_HEAD_BRANCH}"'
    );
    expect(summary).toContain(
      "This run stopped before version tags, release assets, container images, or EdgeOne deployment were created."
    );
    expect(summary).toContain("create a new meaningful in-scope PR from current main");
    expect(summary).toContain("Do not rerun this stale source SHA");
  });

  test("publishes the verified static artifact and functions to EdgeOne Makers only", () => {
    const prepare = jobBlock("prepare");
    expect(prepare).toContain("persist-credentials: false");
    expect(
      prepare.match(/require\("\.\/\.github\/scripts\/create-release-tag\.cjs"\)/g)
    ).toHaveLength(3);
    expect(prepare).not.toContain("AUTHORIZATION: bearer");
    expect(prepare).not.toContain("git push origin");

    const publishFrontend = jobBlock("publish_frontend");
    expect(publishFrontend).toContain("persist-credentials: false");
    expect(publishFrontend).toContain("Download shared public content snapshot");
    expect(publishFrontend).toContain("PUBLIC_CONTENT_BUNDLE_URL: preloaded");
    expect(publishFrontend).toContain(
      "PUBLIC_CODEX_VIBE_MONITOR_METRICS_BASE_URL: $" +
        "{{ vars.PUBLIC_CODEX_VIBE_MONITOR_METRICS_BASE_URL }}"
    );
    expect(publishFrontend).toContain(
      "PUBLIC_TAVILY_HIKARI_METRICS_BASE_URL: $" +
        "{{ vars.PUBLIC_TAVILY_HIKARI_METRICS_BASE_URL }}"
    );
    expect(publishFrontend).toContain(
      "PUBLIC_OCTO_RILL_METRICS_BASE_URL: $" + "{{ vars.PUBLIC_OCTO_RILL_METRICS_BASE_URL }}"
    );
    expect(publishFrontend).toContain("- name: Package referenced public media");
    expect(publishFrontend).toContain(
      "PUBLIC_STATIC_MEDIA_ORIGIN: $" +
        "{{ vars.PUBLIC_STATIC_MEDIA_ORIGIN || 'https://console.ivanli.cc' }}"
    );
    expect(publishFrontend).toContain("PUBLIC_STATIC_MEDIA_RETRY_DELAY_MS: 1000");
    expect(publishFrontend).toContain("PUBLIC_STATIC_MEDIA_DOWNLOAD_ATTEMPTS: 5");
    expect(publishFrontend).toContain("run: bun run frontend:package-media");
    expect(publishFrontend).toContain("- name: Stage EdgeOne deployment artifact");
    expect(publishFrontend).toContain("cp -R ./site-dist/. ./edgeone-dist/");
    expect(publishFrontend).toContain("cp -R ./edge-functions ./edgeone-dist/edge-functions");
    expect(publishFrontend).toContain("- name: Verify EdgeOne deployment artifact");
    expect(publishFrontend).toContain("PUBLIC_EDGEONE_ARTIFACT_DIR: ./edgeone-dist");
    expect(publishFrontend).toContain("PUBLIC_MEDIA_ARTIFACT_DIR: ./edgeone-dist");
    expect(publishFrontend).toContain("bun run pwa:verify-edgeone-artifact");
    expect(publishFrontend).toContain("bun run frontend:verify-media");
    expect(publishFrontend).toContain("- name: Upload frontend EdgeOne artifact");
    expect(publishFrontend).toContain("uses: actions/upload-artifact@v7");
    expect(publishFrontend).toContain("name: frontend-edgeone-site");
    expect(publishFrontend).toContain("path: ./edgeone-dist");
    expect(workflow).not.toContain("\n  deploy_frontend_pages:\n");
    expect(publishFrontend).toContain("- name: Upload Playbook console seed for backend build");
    expect(publishFrontend).toContain("name: playbook-console-seed");
    expect(publishFrontend).toContain("path: ./site/generated/playbook-edition.json");
    expect(workflow).not.toContain("actions/upload-pages-artifact");
    expect(workflow).not.toContain("actions/deploy-pages");
    expect(workflow).not.toContain("pages: write");

    const edgeone = jobBlock("deploy_frontend_edgeone");
    expect(edgeone).toContain("needs: [prepare, publish_frontend]");
    expect(edgeone).toContain("needs.prepare.outputs.channel == 'stable'");
    expect(edgeone).toContain("- name: Download frontend EdgeOne artifact");
    expect(edgeone).toContain("uses: actions/download-artifact@v8");
    expect(edgeone).toContain("name: frontend-edgeone-site");
    expect(edgeone).toContain("path: ./edgeone-dist");
    const playbookRebuild = parsedWorkflow.jobs.deploy_frontend_edgeone?.steps?.find(
      (step) => step.name === "Rebuild with the current Playbook under the shared production lock"
    );
    expect(playbookRebuild?.env?.PUBLIC_STATIC_MEDIA_ORIGIN).toBe(
      `\${{ vars.PUBLIC_STATIC_MEDIA_ORIGIN || 'https://console.ivanli.cc' }}`
    );
    expect(edgeone).toContain(`EDGEONE_API_TOKEN: \${{ secrets.EDGEONE_API_TOKEN }}`);
    expect(edgeone).toContain(`EDGEONE_PROJECT_NAME: \${{ vars.EDGEONE_PROJECT_NAME }}`);
    expect(edgeone).toContain("- name: Configure EdgeOne Makers backend origin");
    expect(edgeone).toContain('npx edgeone@1.6.34 makers link -n "$EDGEONE_PROJECT_NAME"');
    expect(edgeone).toContain("ModifyPagesProjectEnvs");
    expect(edgeone).toContain("DescribePagesProjectEnvs");
    expect(edgeone).toContain("https://pages-api.cloud.tencent.com/v1");
    expect(edgeone).not.toContain("makers env set");
    expect(edgeone).toContain("for attempt in {1..10}; do");
    expect(edgeone).toContain("EdgeOne backend origin and trusted fallback secret verified");
    expect(edgeone).toContain('npx edgeone@1.6.34 makers deploy "$EDGEONE_ARTIFACT_DIR"');
    expect(edgeone).toContain("- name: Upload deployed Playbook console seed for backend build");
    expect(edgeone).toContain("name: playbook-console-seed-deployed");
    expect(edgeone).toContain("path: ./site/generated/playbook-edition.json");
    expect(edgeone).toContain(
      "Makers environment did not contain the expected console origin and fallback secret"
    );
    expect(edgeone).toContain(
      `if: \${{ steps.main-head-before-edgeone-deployment.outputs.is_current_head == 'true' }}`
    );
    expect(edgeone).toContain('deployment_log="$RUNNER_TEMP/edgeone-deploy.log"');
    expect(edgeone).toContain("/Deploy URL:/d");
    expect(edgeone).toContain("- name: Verify same-origin EdgeOne proxy");
    expect(edgeone).toContain("https://ivanli.cc/api/health");
    expect(edgeone).toContain("https://ivanli.cc/mcp");

    const publishImage = jobBlock("publish_image");
    expect(publishImage).toContain("Download shared public content snapshot");
    expect(publishImage).toContain("PUBLIC_CONTENT_BUNDLE_URL=preloaded");
    expect(publishImage).toContain(
      "- name: Download deployed Playbook console seed for image build"
    );
    expect(publishImage).toContain("name: playbook-console-seed-deployed");
    expect(publishImage).toContain("path: ./site/generated");
    expect(publishImage).toContain("id: playbook-initial");
    expect(publishImage).toContain(
      "- name: Prepare the exact Playbook console seed for image build"
    );
    expect(publishImage).toContain(
      "PLAYBOOK_BUNDLE_DIR: $" + "{{ steps.playbook-initial.outputs.bundle_dir }}"
    );
    expect(publishImage).toContain("run: bun scripts/prepare-console-playbook-seed.ts");
    expect(publishImage).toContain(
      "PLAYBOOK_REQUIRED=$" + "{{ vars.PLAYBOOK_INTEGRATION_ENABLED == 'true' }}"
    );
    expect(publishImage).toContain(
      "PLAYBOOK_EDITION_INPUT_PATH=$" +
        "{{ vars.PLAYBOOK_INTEGRATION_ENABLED == 'true' && '/app/site/generated/playbook-edition.json' || '' }}"
    );
    expect(publishImage).not.toContain("env.PLAYBOOK_BUNDLE_DIR != ''");
  });

  test("checks out the renderer before downloading the EdgeOne artifact into the workspace", () => {
    const steps = parsedWorkflow.jobs.deploy_frontend_edgeone?.steps ?? [];
    const indexOf = (name: string) => steps.findIndex((step) => step.name === name);
    const checkoutIndex = indexOf("Checkout the approved application renderer");
    const downloadIndex = indexOf("Download frontend EdgeOne artifact");
    const recoverIndex = indexOf("Recover the validated initial bundle from the release artifact");

    expect(checkoutIndex).toBeGreaterThanOrEqual(0);
    expect(downloadIndex).toBeGreaterThan(checkoutIndex);
    expect(recoverIndex).toBeGreaterThan(downloadIndex);
  });

  test("holds the shared production lock across the complete release workflow", () => {
    expect(parsedWorkflow.concurrency).toEqual({
      group: "blog26-edgeone-production",
      "cancel-in-progress": false,
      queue: "max",
    });
    for (const jobName of ["deploy_frontend_edgeone", "publish_image", "publish_backend"]) {
      expect(parsedWorkflow.jobs[jobName]?.concurrency).toBeUndefined();
    }
    expect(parsedWorkflow.jobs.publish_image?.needs).toEqual([
      "prepare",
      "prepare_public_content",
      "publish_frontend",
      "deploy_frontend_edgeone",
    ]);
    expect(parsedWorkflow.jobs.publish_image?.if).toContain("always()");
    expect(parsedWorkflow.jobs.publish_image?.if).toContain(
      "needs.prepare_public_content.result == 'success'"
    );
    expect(parsedWorkflow.jobs.publish_image?.if).toContain(
      "needs.deploy_frontend_edgeone.result == 'success'"
    );
    expect(parsedWorkflow.jobs.publish_image?.if).toContain(
      "needs.deploy_frontend_edgeone.result == 'skipped'"
    );
  });

  test("publishes the console SSR artifact with backend releases", () => {
    const publishBackend = jobBlock("publish_backend");
    expect(publishBackend).toContain("needs: [prepare, publish_frontend, deploy_frontend_edgeone]");
    expect(publishBackend).toContain("always()");
    expect(publishBackend).toContain("needs.publish_frontend.result == 'success'");
    expect(publishBackend).toContain("needs.publish_frontend.result == 'skipped'");
    expect(publishBackend).toContain("needs.deploy_frontend_edgeone.result == 'success'");
    expect(publishBackend).toContain("needs.deploy_frontend_edgeone.result == 'skipped'");
    expect(publishBackend).toContain("Download Playbook console seed from deployed frontend");
    expect(publishBackend).toContain("name: playbook-console-seed-deployed");
    expect(publishBackend).toContain("Download Playbook console seed from frontend build");
    expect(publishBackend).toContain("name: playbook-console-seed");
    expect(publishBackend).toContain("PLAYBOOK_SEED_INPUT_PATH");
    expect(publishBackend).toContain("Fetch public content snapshot for backend-only release");
    expect(publishBackend).toContain("bash ./scripts/fetch-public-content-bundle.sh");
    expect(publishBackend).toContain("Build backend runtime + console + admin artifacts");
    expect(publishBackend).toContain(`backend-console-dist-\${version}.tar.gz`);
    expect(publishBackend).toContain(
      `backend-console-dist-\${{ needs.prepare.outputs.backend_app_version }}.tar.gz`
    );
  });
});
