"use client";

import { useEffect, useId, useLayoutEffect, useState } from "react";
import { applyThemeToDocument, isDarkTheme, normalizeThemeSelection } from "@/lib/theme";
import { UI, type UiThemeSelection } from "../../config/site";
import Icon from "../ui/Icon";

interface ThemeToggleProps {
  iconClass?: string;
  compactOnMobile?: boolean;
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

export default function ThemeToggle({
  iconClass = "w-6 h-6",
  compactOnMobile = false,
}: ThemeToggleProps) {
  const [currentTheme, setCurrentTheme] = useState<UiThemeSelection | null>(null);
  const selectId = useId();

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

  const selectedTheme = currentTheme ?? UI.theme.default;
  const selectedMode = modes.find(({ theme }) => theme === selectedTheme) ?? modes[0];

  return (
    <>
      {compactOnMobile && (
        <div className="relative inline-flex sm:hidden">
          <label className="sr-only" htmlFor={selectId}>
            主题
          </label>
          <select
            id={selectId}
            value={selectedTheme}
            onChange={(event) => setTheme(normalizeThemeSelection(event.target.value))}
            className="nature-mobile-theme-select"
            aria-label={`主题：${selectedMode.label}`}
          >
            {modes.map(({ theme, label }) => (
              <option key={theme} value={theme}>
                {label}
              </option>
            ))}
          </select>
          <span className="nature-mobile-theme-trigger pointer-events-none" aria-hidden="true">
            <Icon name={selectedMode.icon} className={iconClass} />
          </span>
        </div>
      )}

      <div
        className={`nature-surface-quiet items-center gap-1 rounded-full p-1 ${
          compactOnMobile ? "hidden sm:flex" : "flex"
        }`}
      >
        {modes.map(({ theme, label, icon }) => (
          <button
            key={theme}
            type="button"
            onClick={() => setTheme(theme)}
            className="theme-toggle-option inline-flex min-w-11 items-center justify-center gap-2 rounded-full px-3 text-sm transition"
            data-theme-option={theme}
            aria-pressed={currentTheme === theme}
            title={label}
          >
            {currentTheme ? (
              <Icon name={icon} className={iconClass} />
            ) : (
              <span aria-hidden="true" className={iconClass} />
            )}
            <span className="hidden xl:inline">{label}</span>
          </button>
        ))}
      </div>
    </>
  );
}
