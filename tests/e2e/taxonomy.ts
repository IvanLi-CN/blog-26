export const E2E_PROJECTS = ["guest", "admin", "user", "mcp"] as const;

export type E2EProjectName = (typeof E2E_PROJECTS)[number];

export const E2E_FULL_EXCLUDED_TAGS = ["@targeted", "@experimental"] as const;

export const E2E_FULL_EXCLUDED_TAG_PATTERN = new RegExp(
  E2E_FULL_EXCLUDED_TAGS.map((tag) => tag.replace("@", "\\@")).join("|")
);

export function getProjectSpecGlob(project: E2EProjectName) {
  return `**/${project}/**/*.spec.ts`;
}

export function getProjectReportDir(project: E2EProjectName) {
  return `test-results/${project}`;
}

export function readExplicitE2ETagFilter() {
  return process.env.E2E_INCLUDE_TAG?.trim() || "";
}
