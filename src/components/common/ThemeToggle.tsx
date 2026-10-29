"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useEffect, useLayoutEffect, useState } from "react";
import {
  isDarkTheme,
  normalizeThemeSelection,
  setThemePreference,
  UI_THEME_PREFERENCE_EVENT,
} from "@/lib/theme";
import { UI, type UiThemeSelection } from "../../config/site";
import Icon from "../ui/Icon";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";

interface ThemeToggleProps {
  iconClass?: string;
  compactOnMobile?: boolean;
  compact?: boolean;
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
  compact = false,
}: ThemeToggleProps) {
  const [currentTheme, setCurrentTheme] = useState<UiThemeSelection | null>(null);

  useSafeLayoutEffect(() => {
    setCurrentTheme(readThemeSelectionFromDocument());
  }, []);

  useEffect(() => {
    const handlePreference = (event: Event) => {
      const nextTheme = (event as CustomEvent<{ theme?: UiThemeSelection }>).detail?.theme;
      if (nextTheme) setCurrentTheme(nextTheme);
    };
    window.addEventListener(UI_THEME_PREFERENCE_EVENT, handlePreference);
    return () => window.removeEventListener(UI_THEME_PREFERENCE_EVENT, handlePreference);
  }, []);

  const setTheme = (theme: UiThemeSelection) => {
    setCurrentTheme(theme);
    setThemePreference(theme);
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
    iconComponent: theme === "system" ? Monitor : isDarkTheme(theme) ? Moon : Sun,
  }));

  const selectedTheme = currentTheme ?? UI.theme.default;
  const selectedMode = modes.find(({ theme }) => theme === selectedTheme) ?? modes[0];
  const SelectedThemeIcon = selectedMode.iconComponent;

  const themeSelect = (
    <div className={`relative inline-flex ${compact ? "theme-toggle-compact" : "sm:hidden"}`}>
      <Select
        value={selectedTheme}
        onValueChange={(value) => setTheme(normalizeThemeSelection(value))}
      >
        <SelectTrigger
          className="theme-toggle-select-trigger"
          aria-label={`主题：${selectedMode.label}`}
        >
          <span className="theme-toggle-select-icon" aria-hidden="true">
            <SelectedThemeIcon className={iconClass} aria-hidden="true" />
          </span>
          <span className="theme-toggle-select-value" aria-hidden="true">
            <SelectValue />
          </span>
        </SelectTrigger>
        <SelectContent align="end">
          {modes.map(({ theme, label, iconComponent: ModeIcon }) => (
            <SelectItem key={theme} value={theme}>
              <span className="theme-toggle-select-item">
                <span className="theme-toggle-select-item-icon" aria-hidden="true">
                  <ModeIcon className="h-4 w-4" aria-hidden="true" />
                </span>
                <span>{label}</span>
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );

  return (
    <>
      {compact || compactOnMobile ? themeSelect : null}

      {!compact ? (
        <div
          className={`nature-header-theme-toggle nature-surface-quiet items-center gap-1 rounded-full p-1 ${
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
      ) : null}
    </>
  );
}
