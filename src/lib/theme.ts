import { UI, type UiResolvedTheme, type UiThemeSelection } from "@/config/site";

export const UI_THEME_PREFERENCE_EVENT = "ui:theme-preference-change";

export function normalizeThemeSelection(
  selectedTheme: UiThemeSelection | string
): UiThemeSelection {
  if (selectedTheme === "light" || selectedTheme === "dark" || selectedTheme === "system") {
    return selectedTheme;
  }

  if (UI.theme.legacyDark.includes(selectedTheme as (typeof UI.theme.legacyDark)[number])) {
    return "dark";
  }

  if (UI.theme.legacyLight.includes(selectedTheme as (typeof UI.theme.legacyLight)[number])) {
    return "light";
  }

  return "system";
}

export function resolveThemeName(
  selectedTheme: UiThemeSelection | string,
  prefersDark: boolean
): UiResolvedTheme {
  const normalizedTheme = normalizeThemeSelection(selectedTheme);

  if (normalizedTheme === "system") {
    return prefersDark ? "dark" : "light";
  }

  return normalizedTheme === "dark" ? "dark" : "light";
}

export function isDarkTheme(theme: UiThemeSelection | UiResolvedTheme | string): boolean {
  return normalizeThemeSelection(theme) === "dark";
}

export function applyThemeToDocument(selectedTheme: UiThemeSelection | string): UiResolvedTheme {
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const normalizedTheme = normalizeThemeSelection(selectedTheme);
  const resolvedTheme = resolveThemeName(normalizedTheme, prefersDark);

  const root = document.documentElement;
  root.setAttribute("data-ui-theme", resolvedTheme);
  root.setAttribute("data-ui-preference", normalizedTheme);
  root.setAttribute("data-theme", resolvedTheme);
  root.classList.toggle("dark", isDarkTheme(resolvedTheme));
  root.style.colorScheme = resolvedTheme;
  const themeColor = document.querySelector('meta[name="theme-color"]');
  const backgroundColor = window.getComputedStyle(root).getPropertyValue("--nature-bg").trim();
  if (themeColor && backgroundColor) themeColor.setAttribute("content", backgroundColor);

  return resolvedTheme;
}

export function setThemePreference(selectedTheme: UiThemeSelection | string) {
  const normalizedTheme = normalizeThemeSelection(selectedTheme);
  localStorage.setItem("theme", normalizedTheme);
  const resolvedTheme = applyThemeToDocument(normalizedTheme);
  window.dispatchEvent(
    new CustomEvent<{ theme: UiThemeSelection; resolvedTheme: UiResolvedTheme }>(
      UI_THEME_PREFERENCE_EVENT,
      { detail: { theme: normalizedTheme, resolvedTheme } }
    )
  );
  return resolvedTheme;
}
