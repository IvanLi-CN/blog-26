"use client";

import { useEffect } from "react";
import { UI } from "@/config/site";
import { applyThemeToDocument, normalizeThemeSelection } from "@/lib/theme";

export function ThemeInit() {
  useEffect(() => {
    const storedTheme = localStorage.getItem("theme") || UI.theme.default;
    const normalizedTheme = normalizeThemeSelection(storedTheme);
    applyThemeToDocument(normalizedTheme);

    if (storedTheme !== normalizedTheme) {
      localStorage.setItem("theme", normalizedTheme);
    }
  }, []);

  return null;
}
