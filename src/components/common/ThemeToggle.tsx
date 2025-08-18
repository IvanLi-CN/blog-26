"use client";

import { useEffect, useState } from "react";
import { UI } from "../../config/site";
import Icon from "../ui/Icon";

// 使用纯 CSS 的主题颜色预览圆点
// 不再需要 JavaScript 动态获取颜色

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

      <div className="dropdown-content z-[1] shadow-2xl bg-base-200 rounded-2xl w-80 border border-base-300">
        {/* 下拉菜单标题 */}
        <div className="px-4 py-3 border-b border-base-300">
          <h3 className="text-sm font-semibold text-base-content/80 uppercase tracking-wide">
            选择主题
          </h3>
        </div>

        <div className="max-h-96 overflow-y-auto">
          {/* 主要主题区域 */}
          <div className="p-3">
            <div className="text-xs font-medium text-base-content/60 uppercase tracking-wide mb-2 px-1">
              常用主题
            </div>
            <div className="space-y-1">
              {UI.theme.mainThemes.map((theme: string) => (
                <button
                  key={theme}
                  type="button"
                  className={`group relative flex items-center w-full p-3 rounded-xl transition-all duration-200 ${
                    currentTheme === theme
                      ? "bg-primary/10 border-2 border-primary/20"
                      : "hover:bg-base-300/50 border-2 border-transparent"
                  }`}
                  onClick={() => setTheme(theme)}
                >
                  {/* 主题名称 */}
                  <div className="flex-1 text-left">
                    <div
                      className={`text-sm font-medium capitalize ${
                        currentTheme === theme ? "text-primary" : "text-base-content"
                      }`}
                    >
                      {theme}
                    </div>
                  </div>

                  {/* 选中状态指示器 */}
                  {currentTheme === theme && (
                    <div className="flex items-center justify-center w-6 h-6 rounded-full bg-primary">
                      <Icon name="tabler:check" className="w-3 h-3 text-primary-content" />
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* 分隔线 */}
          <div className="border-t border-base-300 mx-3"></div>

          {/* 亮色主题区域 */}
          <div className="p-3">
            <div className="text-xs font-medium text-base-content/60 uppercase tracking-wide mb-2 px-1">
              亮色主题
            </div>
            <div className="space-y-1">
              {UI.theme.lightThemes.map((theme: string) => (
                <button
                  key={theme}
                  type="button"
                  className={`group relative flex items-center w-full p-3 rounded-xl transition-all duration-200 ${
                    currentTheme === theme
                      ? "bg-primary/10 border-2 border-primary/20"
                      : "hover:bg-base-300/50 border-2 border-transparent"
                  }`}
                  onClick={() => setTheme(theme)}
                >
                  {/* 主题名称 */}
                  <div className="flex-1 text-left">
                    <div
                      className={`text-sm font-medium capitalize ${
                        currentTheme === theme ? "text-primary" : "text-base-content"
                      }`}
                    >
                      {theme}
                    </div>
                  </div>

                  {/* 颜色预览圆点 */}
                  <div
                    className="flex items-center gap-1.5 mr-2 px-2 py-1 rounded-lg bg-base-100/50"
                    data-theme={theme}
                  >
                    <div className="w-4 h-4 rounded-full bg-primary shadow-sm ring-1 ring-base-content/20" />
                    <div className="w-4 h-4 rounded-full bg-secondary shadow-sm ring-1 ring-base-content/20" />
                    <div className="w-4 h-4 rounded-full bg-accent shadow-sm ring-1 ring-base-content/20" />
                    <div className="w-4 h-4 rounded-full bg-neutral shadow-sm ring-1 ring-base-content/20" />
                  </div>

                  {/* 选中状态指示器 */}
                  {currentTheme === theme && (
                    <div className="flex items-center justify-center w-6 h-6 rounded-full bg-primary">
                      <Icon name="tabler:check" className="w-3 h-3 text-primary-content" />
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* 分隔线 */}
          <div className="border-t border-base-300 mx-3"></div>

          {/* 暗色主题区域 */}
          <div className="p-3">
            <div className="text-xs font-medium text-base-content/60 uppercase tracking-wide mb-2 px-1">
              暗色主题
            </div>
            <div className="space-y-1">
              {UI.theme.darkThemes.map((theme: string) => (
                <button
                  key={theme}
                  type="button"
                  className={`group relative flex items-center w-full p-3 rounded-xl transition-all duration-200 ${
                    currentTheme === theme
                      ? "bg-primary/10 border-2 border-primary/20"
                      : "hover:bg-base-300/50 border-2 border-transparent"
                  }`}
                  onClick={() => setTheme(theme)}
                >
                  {/* 主题名称 */}
                  <div className="flex-1 text-left">
                    <div
                      className={`text-sm font-medium capitalize ${
                        currentTheme === theme ? "text-primary" : "text-base-content"
                      }`}
                    >
                      {theme}
                    </div>
                  </div>

                  {/* 颜色预览圆点 */}
                  <div
                    className="flex items-center gap-1.5 mr-2 px-2 py-1 rounded-lg bg-base-100/50"
                    data-theme={theme}
                  >
                    <div className="w-4 h-4 rounded-full bg-primary shadow-sm ring-1 ring-base-content/20" />
                    <div className="w-4 h-4 rounded-full bg-secondary shadow-sm ring-1 ring-base-content/20" />
                    <div className="w-4 h-4 rounded-full bg-accent shadow-sm ring-1 ring-base-content/20" />
                    <div className="w-4 h-4 rounded-full bg-neutral shadow-sm ring-1 ring-base-content/20" />
                  </div>

                  {/* 选中状态指示器 */}
                  {currentTheme === theme && (
                    <div className="flex items-center justify-center w-6 h-6 rounded-full bg-primary">
                      <Icon name="tabler:check" className="w-3 h-3 text-primary-content" />
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
