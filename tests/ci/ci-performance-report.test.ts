import { expect, test } from "bun:test";
import { summarizeJobs } from "../../scripts/ci-performance-report";

test("runner sum counts parallel jobs separately and excludes skipped jobs", () => {
  const report = summarizeJobs([
    {
      id: 1,
      name: "one",
      conclusion: "success",
      started_at: "2026-11-07T00:00:00Z",
      completed_at: "2026-11-07T00:01:00Z",
    },
    {
      id: 2,
      name: "two",
      conclusion: "failure",
      started_at: "2026-11-07T00:00:00Z",
      completed_at: "2026-11-07T00:02:00Z",
    },
    { id: 3, name: "skipped", conclusion: "skipped", started_at: null, completed_at: null },
  ]);
  expect(report.complete).toBe(true);
  expect(report.runnerSeconds).toBe(180);
  expect(report.jobCount).toBe(2);
});

test("pending work remains unknown instead of becoming a fast successful measurement", () => {
  const report = summarizeJobs([
    { id: 1, name: "pending", conclusion: null, started_at: null, completed_at: null },
  ]);
  expect(report.complete).toBe(false);
  expect(report.runnerSeconds).toBeNull();
});
