import { UI } from "@/config/site";

export function resolveThemeName(selectedTheme: string, prefersDark: boolean): string {
  if (selectedTheme === "system") {
    return prefersDark ? "dark" : "light";
  }
  return selectedTheme;
}

export function isDarkTheme(theme: string): boolean {
  return UI.theme.darkThemes.includes(theme);
}

export function applyThemeToDocument(selectedTheme: string): string {
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const resolvedTheme = resolveThemeName(selectedTheme, prefersDark);

  const root = document.documentElement;
  root.setAttribute("data-theme", resolvedTheme);
  root.classList.toggle("dark", isDarkTheme(resolvedTheme));

  return resolvedTheme;
}
