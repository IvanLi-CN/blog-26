import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { load } from "js-yaml";

type NotifyJob = {
  permissions?: Record<string, string>;
  secrets?: unknown;
  uses?: string;
  with?: Record<string, string>;
};

type Workflow = {
  jobs: Record<string, NotifyJob>;
};

const workflowPath = path.resolve(process.cwd(), ".github/workflows/notify-release-failure.yml");
const workflow = load(readFileSync(workflowPath, "utf8")) as Workflow;
const oidruneWorkflow =
  "IvanLi-CN/oidrune/.github/workflows/notify.yml@00bbb56c1853eed577652f69678a0419c468e969";

describe("notify-release-failure.yml", () => {
  for (const jobName of ["notify_failure", "smoke_test"]) {
    test(`${jobName} uses the pinned Oidrune workflow without caller secrets`, () => {
      const job = workflow.jobs[jobName];

      expect(job.uses).toBe(oidruneWorkflow);
      expect(job.permissions).toEqual({ "id-token": "write" });
      expect(job.secrets).toBeUndefined();
      expect(job.with?.outcome).toBe("failure");
      expect(job.with?.on_gateway_failure).toBe("warn");
      expect(job.with?.gateway_url).toBeUndefined();
      expect(job.with?.oidc_audience).toBeUndefined();
    });
  }

  test("preserves release context and smoke-test intent in caller summaries", () => {
    const failureSummary = workflow.jobs.notify_failure.with?.summary ?? "";
    const smokeSummary = workflow.jobs.smoke_test.with?.summary ?? "";

    expect(failureSummary).toContain("status: failure");
    expect(failureSummary).toContain("$" + "{{ needs.resolve_release_context.outputs.ref_label }}");
    expect(failureSummary).toContain(
      "sha: $" + "{{ needs.resolve_release_context.outputs.head_sha }}"
    );
    expect(failureSummary).toContain("url: $" + "{{ github.event.workflow_run.html_url }}");
    expect(smokeSummary).toContain("status: smoke test");
    expect(smokeSummary).toContain("note: manual notifier smoke test");
  });
});
