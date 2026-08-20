export const projectPosterWidths = [480, 960] as const;
export const projectPosterFormats = ["avif", "webp"] as const;

export const projectPosterBudgets = {
  480: { avif: 100 * 1024, webp: 150 * 1024 },
  960: { avif: 250 * 1024, webp: 350 * 1024 },
} as const;

export const projectPosterPlaceholderMaxBytes = 2 * 1024;
export const projectPosterPrioritySlugs = ["tavily-hikari", "kaisoumail", "octo-rill"] as const;
export const projectPosterPrimaryPrioritySlug = projectPosterPrioritySlugs[0];

export type ProjectPosterWidth = (typeof projectPosterWidths)[number];
export type ProjectPosterFormat = (typeof projectPosterFormats)[number];
export type ProjectPosterTheme = "light" | "dark";

export type ProjectPosterAsset = {
  width: number;
  height: number;
  placeholder: string;
  sources: Record<ProjectPosterFormat, Record<ProjectPosterWidth, string>>;
};

export type ProjectPosterThemedAsset = Record<ProjectPosterTheme, ProjectPosterAsset>;

export function isProjectPosterPriority(slug: string) {
  return projectPosterPrioritySlugs.includes(slug as (typeof projectPosterPrioritySlugs)[number]);
}

export function isPrimaryProjectPosterPriority(slug: string) {
  return slug === projectPosterPrimaryPrioritySlug;
}
