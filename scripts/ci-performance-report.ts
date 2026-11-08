import { execFileSync } from "node:child_process";

export type Job = {
  id: number;
  name: string;
  conclusion: string | null;
  started_at: string | null;
  completed_at: string | null;
  steps?: { name: string; started_at?: string | null; completed_at?: string | null }[];
};
const seconds = (start: string, end: string) =>
  Math.max(0, (Date.parse(end) - Date.parse(start)) / 1000);

/** Use execution timestamps, never workflow updated_at (which includes unrelated updates). */
export function summarizeJobs(jobs: Job[]) {
  const executed = jobs.filter((job) => job.conclusion !== "skipped");
  const complete = executed.every((job) => job.started_at && job.completed_at);
  return {
    complete,
    jobCount: executed.length,
    runnerSeconds: complete
      ? executed.reduce((sum, job) => sum + seconds(job.started_at!, job.completed_at!), 0)
      : null,
    jobs: jobs.map((job) => ({
      ...job,
      executionSeconds:
        job.conclusion === "skipped"
          ? 0
          : job.started_at && job.completed_at
            ? seconds(job.started_at, job.completed_at)
            : null,
      steps: job.steps?.map((step) => ({
        name: step.name,
        seconds:
          step.started_at && step.completed_at ? seconds(step.started_at, step.completed_at) : null,
      })),
    })),
  };
}

if (import.meta.main) {
  const [repository, ...ids] = process.argv.slice(2);
  if (
    !repository ||
    !/^[\w.-]+\/[\w.-]+$/.test(repository) ||
    !ids.length ||
    ids.some((id) => !/^\d+$/.test(id))
  ) {
    throw new Error("Usage: bun scripts/ci-performance-report.ts owner/repo run-id [run-id ...]");
  }
  const api = (path: string) => JSON.parse(execFileSync("gh", ["api", path], { encoding: "utf8" }));
  const pages = (path: string, field: string) => {
    const values: any[] = [];
    for (let page = 1; ; page++) {
      const result = api(`${path}?per_page=100&page=${page}`)[field];
      values.push(...result);
      if (result.length < 100) return values;
    }
  };
  const runs = [...new Set(ids)].map((id) => {
    const prefix = `repos/${repository}/actions/runs/${id}`;
    const run = api(prefix);
    const jobs: Job[] = pages(`${prefix}/jobs`, "jobs");
    const artifacts = pages(`${prefix}/artifacts`, "artifacts").map((artifact) => ({
      name: artifact.name,
      bytes: artifact.size_in_bytes,
      expired: artifact.expired,
      createdAt: artifact.created_at,
      expiresAt: artifact.expires_at,
    }));
    const summary = summarizeJobs(jobs);
    const first = jobs
      .filter((job) => job.conclusion !== "skipped" && job.started_at)
      .map((job) => job.started_at!)
      .sort()[0];
    const last = jobs
      .filter((job) => job.completed_at)
      .map((job) => job.completed_at!)
      .sort()
      .at(-1);
    return {
      id,
      sha: run.head_sha,
      event: run.event,
      attempt: run.run_attempt,
      url: run.html_url,
      createdAt: run.created_at,
      firstJobAt: first,
      lastJobAt: last,
      queueSeconds: first ? seconds(run.created_at, first) : null,
      wallSeconds: summary.complete && last ? seconds(run.created_at, last) : null,
      conclusion: run.conclusion,
      ...summary,
      artifacts,
      cacheTransferBytes: null,
      cacheTransferNote:
        "Inspect Actions cache and BuildKit logs; API artifacts are not cache transfer bytes.",
    };
  });
  if (new Set(runs.map((run) => run.sha)).size !== 1)
    throw new Error("Combine only runs from the same source SHA; compare candidates separately");
  const complete = runs.every((run) => run.complete && run.conclusion);
  console.log(
    JSON.stringify(
      {
        repository,
        sha: runs[0]?.sha,
        complete,
        runCount: runs.length,
        runnerSeconds: complete ? runs.reduce((sum, run) => sum + run.runnerSeconds!, 0) : null,
        wallSeconds: complete
          ? seconds(
              runs.map((run) => run.createdAt).sort()[0]!,
              runs
                .map((run) => run.lastJobAt!)
                .sort()
                .at(-1)!
            )
          : null,
        runs,
      },
      null,
      2
    )
  );
}
