import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import path from "node:path";

const receiptScript = path.resolve(process.cwd(), ".github/scripts/release-receipt.sh");

function runReceipt(overrides: Record<string, string> = {}) {
  return spawnSync("bash", [receiptScript], {
    encoding: "utf8",
    env: {
      ...process.env,
      RELEASE_RECEIPT_DRY_RUN: "true",
      GITHUB_REPOSITORY: "IvanLi-CN/blog-26",
      GITHUB_TOKEN: "dry-run-token",
      PR_NUMBER: "42",
      PR_URL: "https://github.com/IvanLi-CN/blog-26/pull/42",
      SHOULD_RELEASE: "true",
      HEAD_SHA: "0123456789abcdef",
      INTENT_TYPE: "patch",
      CHANNEL: "stable",
      FRONTEND_RELEASE: "true",
      BACKEND_RELEASE: "false",
      FRONTEND_RELEASE_TAG: "frontend-v1.2.3",
      BACKEND_RELEASE_TAG: "",
      IMAGE_RELEASE_TAG: "v1.2.3",
      IS_LATEST_BRANCH_HEAD: "true",
      WORKFLOW_EVENT_NAME: "workflow_run",
      WORKFLOW_RUN_URL: "https://github.com/IvanLi-CN/blog-26/actions/runs/1",
      PUBLISH_FRONTEND_RESULT: "success",
      PUBLISH_BACKEND_RESULT: "skipped",
      PUBLISH_IMAGE_RESULT: "success",
      DEPLOY_FRONTEND_EDGEONE_RESULT: "success",
      EDGEONE_STATUS: "deployed",
      ISSUE_COMMENTS_JSON: "[]",
      ...overrides,
    },
  });
}

describe("release-receipt.sh", () => {
  test("records a successful EdgeOne Makers deployment", () => {
    const result = runReceipt();

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("- EdgeOne Makers: deployed");
    expect(result.stdout).not.toContain("- Pages:");
  });

  test("does not create a receipt when the EdgeOne deployment fails", () => {
    const result = runReceipt({ DEPLOY_FRONTEND_EDGEONE_RESULT: "failure" });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("skip comment: edgeone job result=failure");
    expect(result.stdout).not.toContain("## Release Receipt");
  });
});
