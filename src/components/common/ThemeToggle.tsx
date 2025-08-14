"use client";

import { useEffect, useState } from "react";
import { UI } from "../../config/site";
import Icon from "../ui/Icon";

interface ThemeToggleProps {
  iconClass?: string;
}

export default function ThemeToggle({ iconClass = "w-6 h-6" }: ThemeToggleProps) {
  const [currentTheme, setCurrentTheme] = useState<string>("light");
  const [_isDropdownOpen, setIsDropdownOpen] = useState(false);

  // 获取当前主题
  useEffect(() => {
    const theme = localStorage.getItem("theme") || "system";
    setCurrentTheme(theme);
    // 主题已经在layout.tsx中的脚本设置了，这里只需要同步状态
  }, []);

  // 设置主题
  const setTheme = (theme: string) => {
    setCurrentTheme(theme);
    localStorage.setItem("theme", theme);

    // 应用主题逻辑（与layout.tsx中的脚本保持一致）
    const darkThemes = [
      "dark",
      "synthwave",
      "halloween",
      "forest",
      "black",
      "luxury",
      "dracula",
      "night",
      "coffee",
      "dim",
      "sunset",
      "abyss",
    ];

    let currentTheme = theme;
    if (theme === "system") {
      currentTheme = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    }

    document.documentElement.setAttribute("data-theme", currentTheme);

    const isDark = darkThemes.includes(currentTheme);
    if (isDark) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }

    setIsDropdownOpen(false);
  };

  // 切换主题（用于主按钮）
  const toggleTheme = () => {
    // 在light、dark、system之间循环切换
    let newTheme: string;
    if (currentTheme === "light") {
      newTheme = "dark";
    } else if (currentTheme === "dark") {
      newTheme = "system";
    } else {
      newTheme = "light";
    }
    setTheme(newTheme);
  };

  return (
    <div className="dropdown dropdown-end dropdown-top md:dropdown-bottom dropdown-hover">
      <label
        className="swap swap-rotate btn btn-ghost btn-circle"
        onClick={toggleTheme}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            toggleTheme();
          }
        }}
      >
        <input
          type="checkbox"
          className="theme-controller"
          checked={
            currentTheme === "dark" ||
            (currentTheme === "system" &&
              window.matchMedia?.("(prefers-color-scheme: dark)").matches)
          }
          onChange={() => {
            // 由 onClick 处理，这里保持空函数以满足React要求
          }}
        />
        {currentTheme === "system" ? (
          <Icon name="tabler:device-desktop" className={iconClass} />
        ) : (
          <>
            <Icon name="line-md:sunny-outline" className={`${iconClass} swap-off`} />
            <Icon name="line-md:moon" className={`${iconClass} swap-on`} />
          </>
        )}
      </label>

      <div className="dropdown-content z-[1] py-2 shadow-2xl bg-base-300 rounded-box w-52">
        <ul className="max-h-96 overflow-y-auto px-2 flex flex-col gap-1">
          {/* 主要主题 */}
          {UI.theme.mainThemes.map((theme: string) => (
            <li key={theme}>
              <button
                type="button"
                className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer hover:bg-base-100 w-full text-left ${
                  currentTheme === theme ? "bg-base-100" : ""
                }`}
                onClick={() => setTheme(theme)}
              >
                <span className="flex-grow text-sm capitalize">{theme}</span>
                {currentTheme === theme && <Icon name="tabler:check" className="w-4 h-4" />}
              </button>
            </li>
          ))}

          {/* 分隔线 */}
          <li className="border-t border-base-content/20 my-1"></li>

          {/* 所有其他主题 */}
          {UI.theme.allThemes.map((theme: string) => (
            <li key={theme} data-theme={theme}>
              <button
                type="button"
                className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer hover:bg-base-100 w-full text-left ${
                  currentTheme === theme ? "bg-base-100" : ""
                }`}
                onClick={() => setTheme(theme)}
              >
                <span className="flex-grow text-sm capitalize">{theme}</span>
                <span className="flex items-center gap-1">
                  <span className="h-4 w-4 rounded-full bg-primary ring-1 ring-inset ring-black/10" />
                  <span className="h-4 w-4 rounded-full bg-secondary ring-1 ring-inset ring-black/10" />
                  <span className="h-4 w-4 rounded-full bg-accent ring-1 ring-inset ring-black/10" />
                  <span className="h-4 w-4 rounded-full bg-neutral ring-1 ring-inset ring-black/10" />
                </span>
                {currentTheme === theme && <Icon name="tabler:check" className="w-4 h-4 ml-2" />}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
