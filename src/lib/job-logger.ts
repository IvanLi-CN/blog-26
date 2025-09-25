import fs from "node:fs";
import path from "node:path";

export type LogWriter = {
  /** absolute file path */
  filePath: string;
  /** write a line with timestamp */
  write: (line: string) => void;
  /** finalize stream */
  close: () => void;
};

function ensureDirSync(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

/**
 * Resolve the base directory for job logs.
 * - Docker/prod: /app/data/job-logs
 * - Test:       ./test-data/job-logs
 * - Dev:        ./dev-data/job-logs
 */
export function resolveJobLogsBaseDir(): string {
  const dbPath = process.env.DB_PATH || "";
  const inDocker =
    dbPath.startsWith("/app/data") || process.env.SITE_URL?.includes("localhost") === false;
  const isTest = process.env.NODE_ENV === "test" || /test-data\//.test(dbPath);
  if (inDocker) return "/app/data/job-logs";
  return isTest ? path.resolve("./test-data/job-logs") : path.resolve("./dev-data/job-logs");
}

export function createRunLog(jobKey: string): LogWriter {
  const base = resolveJobLogsBaseDir();
  const now = new Date();
  const dayDir = path.join(
    base,
    jobKey,
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`
  );
  ensureDirSync(dayDir);
  const filename = `${now.getTime()}.log`;
  const filePath = path.join(dayDir, filename);
  const stream = fs.createWriteStream(filePath, { flags: "a" });

  const write = (line: string) => {
    const ts = new Date().toISOString();
    stream.write(`[${ts}] ${line}\n`);
  };
  const close = () => stream.end();
  write(`== ${jobKey} run started ==`);
  return { filePath, write, close };
}

export function readLogSafe(filePath: string): { exists: boolean; content: string } {
  try {
    const content = fs.readFileSync(filePath, "utf8");
    return { exists: true, content };
  } catch {
    return { exists: false, content: "" };
  }
}

/**
 * Remove log files older than keepDays and return removed file paths.
 */
export function cleanupOldLogs(keepDays: number): string[] {
  const base = resolveJobLogsBaseDir();
  const cutoff = Date.now() - keepDays * 24 * 60 * 60 * 1000;
  const removed: string[] = [];

  if (!fs.existsSync(base)) return removed;

  const visit = (dir: string) => {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        visit(full);
        // remove empty dirs
        try {
          if (fs.readdirSync(full).length === 0) fs.rmdirSync(full);
        } catch (error) {
          // ignore cleanup errors for nested directories
          void error;
        }
      } else if (e.isFile()) {
        try {
          const stat = fs.statSync(full);
          if (stat.mtimeMs < cutoff) {
            fs.unlinkSync(full);
            removed.push(full);
          }
        } catch (error) {
          // ignore removal errors, e.g. file already deleted
          void error;
        }
      }
    }
  };

  visit(base);
  return removed;
}
