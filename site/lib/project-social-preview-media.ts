export const projectSocialPreviewWidths = [640, 1280] as const;
export const projectSocialPreviewFormats = ["avif", "webp"] as const;

export const projectSocialPreviewBudgets = {
  640: { avif: 100 * 1024, webp: 150 * 1024 },
  1280: { avif: 250 * 1024, webp: 350 * 1024 },
} as const;

export const projectSocialPreviewPlaceholderMaxBytes = 2 * 1024;

export type ProjectSocialPreviewWidth = (typeof projectSocialPreviewWidths)[number];
export type ProjectSocialPreviewFormat = (typeof projectSocialPreviewFormats)[number];
export type ProjectSocialPreviewTheme = "light" | "dark";

export type ProjectSocialPreviewAsset = {
  width: number;
  height: number;
  placeholder: string;
  sources: Record<ProjectSocialPreviewFormat, Record<ProjectSocialPreviewWidth, string>>;
};

export type ProjectSocialPreviewThemedAsset = Record<
  ProjectSocialPreviewTheme,
  ProjectSocialPreviewAsset
>;
