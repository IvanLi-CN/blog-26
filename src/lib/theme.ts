import type { UiResolvedTheme, UiThemeSelection } from "@/config/site";

export function resolveThemeName(
  selectedTheme: UiThemeSelection | string,
  prefersDark: boolean
): UiResolvedTheme {
  if (selectedTheme === "system") {
    return prefersDark ? "dark" : "light";
  }
  return selectedTheme === "dark" ? "dark" : "light";
}

export function isDarkTheme(theme: UiThemeSelection | UiResolvedTheme | string): boolean {
  return theme === "dark";
}

export function applyThemeToDocument(selectedTheme: UiThemeSelection | string): UiResolvedTheme {
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const resolvedTheme = resolveThemeName(selectedTheme, prefersDark);

  const root = document.documentElement;
  root.setAttribute("data-ui-theme", resolvedTheme);
  root.setAttribute(
    "data-ui-preference",
    selectedTheme === "dark" ? "dark" : selectedTheme === "light" ? "light" : "system"
  );
  root.setAttribute("data-theme", resolvedTheme);
  root.classList.toggle("dark", isDarkTheme(resolvedTheme));
  root.style.colorScheme = resolvedTheme;

  return resolvedTheme;
}
