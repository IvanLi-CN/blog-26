"use client";

import { useEffect, useState } from "react";
import { applyThemeToDocument, isDarkTheme } from "@/lib/theme";
import { UI, type UiThemeSelection } from "../../config/site";
import Icon from "../ui/Icon";

interface ThemeToggleProps {
  iconClass?: string;
}

export default function ThemeToggle({ iconClass = "w-6 h-6" }: ThemeToggleProps) {
  const [currentTheme, setCurrentTheme] = useState<UiThemeSelection>("system");

  useEffect(() => {
    const theme = localStorage.getItem("theme") || "system";
    if (theme === "light" || theme === "dark" || theme === "system") {
      setCurrentTheme(theme);
    }
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
          className={`inline-flex h-10 items-center gap-2 rounded-full px-3 text-sm transition ${
            currentTheme === theme
              ? "bg-[rgba(var(--nature-accent-rgb),0.16)] text-[color:var(--nature-accent-strong)]"
              : "text-[color:var(--nature-text-soft)] hover:bg-[rgba(var(--nature-highlight-rgb),0.26)] hover:text-[color:var(--nature-text)]"
          }`}
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
