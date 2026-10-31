import { describe, expect, test } from "bun:test";
import { getProjectStatusCatalogEntries, projectCatalog } from "./project-catalog";

describe("project status catalog projection", () => {
  test("projects the complete external directory and excludes internal routes", () => {
    const entries = getProjectStatusCatalogEntries();

    expect(projectCatalog).toHaveLength(16);
    expect(entries).toHaveLength(42);
    expect(new Set(entries.map((entry) => entry.href)).size).toBe(42);
    expect(entries.every((entry) => !entry.href.includes("/projects/"))).toBe(true);
    expect(entries.every((entry) => entry.entryKey.includes(entry.projectSlug))).toBe(true);
  });
});
