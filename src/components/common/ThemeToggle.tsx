"use client";

import { useEffect, useLayoutEffect, useState } from "react";
import { applyThemeToDocument, isDarkTheme, normalizeThemeSelection } from "@/lib/theme";
import { UI, type UiThemeSelection } from "../../config/site";
import Icon from "../ui/Icon";

interface ThemeToggleProps {
  iconClass?: string;
}

const useSafeLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

function readThemeSelectionFromDocument(): UiThemeSelection {
  if (typeof document !== "undefined") {
    const documentTheme = document.documentElement.getAttribute("data-ui-preference");
    if (documentTheme) {
      return normalizeThemeSelection(documentTheme);
    }
  }

  if (typeof window !== "undefined") {
    const storedTheme = window.localStorage.getItem("theme");
    if (storedTheme) {
      return normalizeThemeSelection(storedTheme);
    }
  }

  return UI.theme.default;
}

export default function ThemeToggle({ iconClass = "w-6 h-6" }: ThemeToggleProps) {
  const [currentTheme, setCurrentTheme] = useState<UiThemeSelection | null>(null);

  useSafeLayoutEffect(() => {
    setCurrentTheme(readThemeSelectionFromDocument());
  }, []);

  const setTheme = (theme: UiThemeSelection) => {
    setCurrentTheme(theme);
    localStorage.setItem("theme", theme);
    applyThemeToDocument(theme);
  };

  const modes = UI.theme.options.map((theme) => ({
    theme,
    label: theme === "system" ? "Auto" : theme === "light" ? "Light" : "Dark",
    icon:
      theme === "system"
        ? "tabler:device-desktop"
        : isDarkTheme(theme)
          ? "line-md:moon"
          : "line-md:sunny-outline",
  }));

  return (
    <div className="nature-surface-quiet flex items-center gap-1 rounded-full p-1">
      {modes.map(({ theme, label, icon }) => (
        <button
          key={theme}
          type="button"
          onClick={() => setTheme(theme)}
          className="theme-toggle-option inline-flex h-10 items-center gap-2 rounded-full px-3 text-sm transition"
          data-theme-option={theme}
          aria-pressed={currentTheme === theme}
          title={label}
        >
          <Icon name={icon} className={iconClass} />
          <span className="hidden xl:inline">{label}</span>
        </button>
      ))}
    </div>
  );
}
