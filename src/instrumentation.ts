export async function register() {
  // 仅在 Node.js 运行时启动（避免在 edge/runtime 重复）
  if (process.env.NEXT_RUNTIME && process.env.NEXT_RUNTIME !== "nodejs") return;
  try {
    const { startJobsScheduler } = await import("@/server/jobs");
    await startJobsScheduler();
    // eslint-disable-next-line no-console
    console.log("[scheduler] started");
  } catch (e) {
    console.error("[scheduler] failed to start:", e);
  }
}

export const runtime = "nodejs";
