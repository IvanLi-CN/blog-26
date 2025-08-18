"use client";

import { useState } from "react";

export default function ThemeTestPage() {
  const [selectedTheme, setSelectedTheme] = useState("synthwave");

  const themes = [
    "light",
    "dark",
    "cupcake",
    "bumblebee",
    "emerald",
    "corporate",
    "synthwave",
    "retro",
    "cyberpunk",
    "valentine",
  ];

  return (
    <div className="min-h-screen p-8 bg-base-100">
      <div className="max-w-4xl mx-auto space-y-8">
        <h1 className="text-4xl font-bold text-base-content mb-8">DaisyUI 局部主题作用域测试</h1>

        {/* 主题选择器 */}
        <div className="card bg-base-200 shadow-xl p-6">
          <h2 className="text-2xl font-semibold mb-4">选择测试主题：</h2>
          <div className="flex flex-wrap gap-2">
            {themes.map((theme) => (
              <button
                key={theme}
                type="button"
                className={`btn btn-sm ${selectedTheme === theme ? "btn-primary" : "btn-outline"}`}
                onClick={() => setSelectedTheme(theme)}
              >
                {theme}
              </button>
            ))}
          </div>
        </div>

        {/* 全局主题区域 */}
        <div className="card bg-base-200 shadow-xl p-6">
          <h2 className="text-2xl font-semibold mb-4">全局主题（当前页面主题）</h2>
          <div className="flex flex-wrap gap-4">
            <button type="button" className="btn btn-primary">
              Primary Button
            </button>
            <button type="button" className="btn btn-secondary">
              Secondary Button
            </button>
            <button type="button" className="btn btn-accent">
              Accent Button
            </button>
            <div className="badge badge-primary">Primary Badge</div>
            <div className="badge badge-secondary">Secondary Badge</div>
            <div className="badge badge-accent">Accent Badge</div>
          </div>
        </div>

        {/* 局部主题区域 */}
        <div className="card bg-base-200 shadow-xl p-6" data-theme={selectedTheme}>
          <h2 className="text-2xl font-semibold mb-4">局部主题区域（{selectedTheme} 主题）</h2>
          <div className="flex flex-wrap gap-4">
            <button type="button" className="btn btn-primary">
              Primary Button
            </button>
            <button type="button" className="btn btn-secondary">
              Secondary Button
            </button>
            <button type="button" className="btn btn-accent">
              Accent Button
            </button>
            <div className="badge badge-primary">Primary Badge</div>
            <div className="badge badge-secondary">Secondary Badge</div>
            <div className="badge badge-accent">Accent Badge</div>
          </div>

          {/* 嵌套的局部主题 */}
          <div className="mt-6 p-4 rounded-lg bg-base-100" data-theme="valentine">
            <h3 className="text-lg font-medium mb-3">嵌套主题区域（valentine 主题）</h3>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn btn-sm btn-primary">
                Primary
              </button>
              <button type="button" className="btn btn-sm btn-secondary">
                Secondary
              </button>
              <button type="button" className="btn btn-sm btn-accent">
                Accent
              </button>
            </div>
          </div>
        </div>

        {/* 颜色变量测试 */}
        <div className="card bg-base-200 shadow-xl p-6">
          <h2 className="text-2xl font-semibold mb-4">CSS 变量测试</h2>
          <div className="grid grid-cols-2 gap-6">
            <div>
              <h3 className="text-lg font-medium mb-3">全局变量</h3>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded bg-primary"></div>
                  <span className="text-sm">--color-primary</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded bg-secondary"></div>
                  <span className="text-sm">--color-secondary</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded bg-accent"></div>
                  <span className="text-sm">--color-accent</span>
                </div>
              </div>
            </div>

            <div data-theme={selectedTheme}>
              <h3 className="text-lg font-medium mb-3">局部变量（{selectedTheme}）</h3>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded bg-primary"></div>
                  <span className="text-sm">--color-primary</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded bg-secondary"></div>
                  <span className="text-sm">--color-secondary</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded bg-accent"></div>
                  <span className="text-sm">--color-accent</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
