import { startJobsScheduler } from "./scheduler";

type JobsScheduler = Awaited<ReturnType<typeof startJobsScheduler>>;

let activeScheduler: JobsScheduler | undefined;
let startingScheduler: Promise<JobsScheduler> | undefined;

export async function startJobsRuntime() {
  if (activeScheduler) return activeScheduler;
  if (startingScheduler) return startingScheduler;

  startingScheduler = startJobsScheduler().then((scheduler) => {
    activeScheduler = scheduler;
    return scheduler;
  });
  try {
    return await startingScheduler;
  } finally {
    startingScheduler = undefined;
  }
}

export function stopJobsRuntime() {
  const scheduler = activeScheduler;
  activeScheduler = undefined;
  scheduler?.stop();
}
