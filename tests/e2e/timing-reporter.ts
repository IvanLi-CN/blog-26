import { basename } from "node:path";
import type { Reporter, TestCase, TestResult, TestStep } from "@playwright/test/reporter";

type Bucket = "navigation" | "action" | "assertion" | "wait" | "other";
type Interval = [number, number];
type Step = Pick<TestStep, "category" | "title" | "duration" | "startTime"> & {
  steps: Step[];
};

function bucket(step: Step): Bucket | undefined {
  if (step.category === "expect") return "assertion";
  if (step.category !== "pw:api") return undefined;
  // Classify the pinned Playwright's display titles, but never log their
  // subtitles, parameters, selectors, URLs, errors or user-provided values.
  if (/^(Navigate|Reload|Go back|Go forward|Wait for load state|Wait for URL)$/.test(step.title))
    return "navigation";
  if (
    /^(Click|Double click|Tap|Hover|Fill|Press|Check|Uncheck|Select option|Set input files)\b/.test(
      step.title
    )
  )
    return "action";
  if (/^Wait\b/.test(step.title)) return "wait";
  return "other";
}

function unionMilliseconds(intervals: Interval[]) {
  const sorted = [...intervals].sort((a, b) => a[0] - b[0]);
  let end = -Infinity;
  let total = 0;
  for (const [start, stop] of sorted) {
    total += Math.max(0, stop - Math.max(start, end));
    end = Math.max(end, stop);
  }
  return total;
}

export function summarizeSteps(steps: Step[]) {
  const intervals: Record<Bucket, Interval[]> = {
    navigation: [],
    action: [],
    assertion: [],
    wait: [],
    other: [],
  };
  function visit(step: Step) {
    const kind = bucket(step);
    if (kind) {
      const start = step.startTime.getTime();
      if (Number.isFinite(start) && Number.isFinite(step.duration) && step.duration >= 0)
        intervals[kind].push([start, start + step.duration]);
      // An assertion can contain several API attempts. Its outer duration is
      // the wait being diagnosed; counting its children would duplicate it.
      return;
    }
    for (const child of step.steps) visit(child);
  }
  for (const step of steps) visit(step);
  return {
    navigation_ms: unionMilliseconds(intervals.navigation),
    action_ms: unionMilliseconds(intervals.action),
    assertion_ms: unionMilliseconds(intervals.assertion),
    wait_ms: unionMilliseconds(intervals.wait),
    other_ms: unionMilliseconds(intervals.other),
    observed_union_ms: unionMilliseconds(Object.values(intervals).flat()),
  };
}

export default class TimingReporter implements Reporter {
  private slowest: {
    file: string;
    line: number;
    retry: number;
    duration_ms: number;
    steps: ReturnType<typeof summarizeSteps>;
  }[] = [];
  private files = new Map<
    string,
    { attempts: number; duration_ms: number; steps: ReturnType<typeof summarizeSteps> }
  >();

  onTestEnd(test: TestCase, result: TestResult) {
    const file = basename(test.location.file);
    const steps = summarizeSteps(result.steps);
    const item = {
      file,
      line: test.location.line,
      retry: result.retry,
      duration_ms: result.duration,
      steps,
    };
    this.slowest.push(item);
    this.slowest.sort((a, b) => b.duration_ms - a.duration_ms);
    this.slowest.length = Math.min(this.slowest.length, 10);
    const aggregate = this.files.get(file) ?? {
      attempts: 0,
      duration_ms: 0,
      steps: summarizeSteps([]),
    };
    aggregate.attempts++;
    aggregate.duration_ms += result.duration;
    for (const key of Object.keys(steps) as (keyof typeof steps)[])
      aggregate.steps[key] += steps[key];
    this.files.set(file, aggregate);
  }

  onEnd() {
    // Test attempts and per-file API time are not job wall time. Categories can
    // overlap; observed_union_ms removes overlap within each test attempt.
    console.log(
      `[e2e-timing] ${JSON.stringify({
        schema: 1,
        files: [...this.files]
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([file, data]) => ({ file, ...data })),
        slowest: this.slowest,
      })}`
    );
  }

  printsToStdio() {
    return true;
  }
}
