export interface ContentTaskProgressShape {
  status: string;
  total: number;
  processed: number;
}

/**
 * The task bar reports work advanced, not work committed.
 * A push can show 100% while the commit phase is still running.
 */
export function contentTaskPercent(task: ContentTaskProgressShape): number | null {
  if (task.status === "success" || task.status === "unchanged") return 100;
  if (task.total <= 0) return null;
  return Math.min(100, Math.max(0, Math.round((task.processed / task.total) * 100)));
}
