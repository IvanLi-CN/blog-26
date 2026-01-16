"use client";

import { useEffect } from "react";
import { UI } from "@/config/site";
import { applyThemeToDocument } from "@/lib/theme";

export function ThemeInit() {
  useEffect(() => {
    const theme = localStorage.getItem("theme") || UI.theme.default;
    applyThemeToDocument(theme);
  }, []);

  return null;
}
