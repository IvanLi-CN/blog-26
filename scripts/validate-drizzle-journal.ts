import { readFileSync } from "node:fs";
import path from "node:path";

type JournalEntry = {
  idx: number;
  tag: string;
  when: number;
};

type Journal = {
  entries?: JournalEntry[];
};

const DEFAULT_JOURNAL_PATH = path.resolve("drizzle/meta/_journal.json");

export function validateDrizzleJournal(journalPath: string = DEFAULT_JOURNAL_PATH): void {
  const raw = readFileSync(journalPath, "utf8");
  let parsed: Journal;
  try {
    parsed = JSON.parse(raw) as Journal;
  } catch (error) {
    throw new Error(`Failed to parse journal JSON (${journalPath}): ${(error as Error).message}`);
  }

  if (!parsed.entries || !Array.isArray(parsed.entries)) {
    throw new Error("Journal file is missing an 'entries' array");
  }

  let previousWhen = -Infinity;
  let previousTag = "<none>";

  parsed.entries.forEach((entry, index) => {
    if (typeof entry.when !== "number" || Number.isNaN(entry.when)) {
      throw new Error(`Entry ${entry.tag ?? index} has an invalid 'when' value`);
    }

    if (entry.when <= previousWhen) {
      const idxInfo = `idx=${entry.idx ?? index}`;
      throw new Error(
        `Drizzle journal timestamps must be strictly increasing: entry ${entry.tag} (${idxInfo}) has when=${entry.when}, ` +
          `which is not greater than previous entry ${previousTag} (when=${previousWhen}).`
      );
    }

    previousWhen = entry.when;
    previousTag = entry.tag;
  });
}

if (import.meta.main) {
  try {
    validateDrizzleJournal();
    console.log("✅ Drizzle journal timestamps are strictly increasing.");
  } catch (error) {
    console.error(
      "❌ Drizzle journal validation failed:",
      error instanceof Error ? error.message : error
    );
    process.exit(1);
  }
}
