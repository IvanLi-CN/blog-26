"use client";

import { useMemo, useState } from "react";
import ThemeToggle from "@/components/common/ThemeToggle";
import Icon from "@/components/ui/Icon";

const chips = ["Organic", "Ripple", "Mist", "Glass", "Gooey", "Breath"];

export default function ThemeTestPage() {
  const [query, setQuery] = useState("");
  const previewCards = useMemo(
    () => [
      {
        title: "液态卡片",
        description: "用于展示前台面板、摘要和信息容器的默认材质。",
      },
      {
        title: "静谧阅读",
        description: "长文模式只保留微弱呼吸感，避免干扰内容吸收。",
      },
      {
        title: "磁性反馈",
        description: "按钮与胶囊以柔和的边界和光泽反馈触碰。",
      },
    ],
    []
  );

  return (
    <main className="nature-app-shell min-h-screen">
      <div className="nature-content-layer">
        <section className="nature-container px-4 py-10 sm:px-6 lg:py-14">
          <div className="nature-surface px-6 py-7 sm:px-8">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <span className="nature-kicker gap-2">
                  <Icon name="tabler:palette" className="h-4 w-4" />
                  Theme Test
                </span>
                <h1 className="nature-title mt-4 text-4xl sm:text-5xl">Nature 视觉基线</h1>
                <p className="nature-muted mt-4 max-w-2xl">
                  用于校验 light / dark / system
                  三态主题、公开页面的表面材质、交互控件和阅读区样式。
                </p>
              </div>
              <ThemeToggle iconClass="h-4 w-4" />
            </div>
          </div>

          <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(18rem,0.8fr)]">
            <section className="space-y-6">
              <div className="nature-panel px-5 py-5 sm:px-6">
                <h2 className="font-heading text-2xl font-semibold tracking-[-0.03em] text-[color:var(--nature-text)]">
                  组件预览
                </h2>
                <div className="mt-5 flex flex-wrap gap-2">
                  {chips.map((chip) => (
                    <span key={chip} className="nature-chip nature-chip-accent">
                      {chip}
                    </span>
                  ))}
                </div>
                <div className="mt-5 flex flex-wrap gap-3">
                  <button type="button" className="nature-button nature-button-primary">
                    Primary Action
                  </button>
                  <button type="button" className="nature-button nature-button-outline">
                    Secondary Action
                  </button>
                  <button type="button" className="nature-button nature-button-ghost">
                    Quiet Action
                  </button>
                </div>
                <label className="nature-input-shell mt-5">
                  <Icon
                    name="tabler:search"
                    className="h-4 w-4 text-[color:var(--nature-text-faint)]"
                  />
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    className="nature-input"
                    placeholder="搜索主题、颜色或组件"
                  />
                </label>
              </div>

              <div className="grid gap-5 md:grid-cols-3">
                {previewCards.map((card) => (
                  <article key={card.title} className="nature-panel-soft px-5 py-5">
                    <h3 className="text-lg font-semibold text-[color:var(--nature-text)]">
                      {card.title}
                    </h3>
                    <p className="mt-3 text-sm leading-7 text-[color:var(--nature-text-soft)]">
                      {card.description}
                    </p>
                  </article>
                ))}
              </div>

              <article className="nature-panel px-6 py-6 sm:px-7">
                <h2 className="font-heading text-2xl font-semibold tracking-[-0.03em] text-[color:var(--nature-text)]">
                  阅读块
                </h2>
                <div className="nature-prose mt-5">
                  <p>
                    这里模拟文章正文区域。标题、段落、行距、引用和行内代码都应统一使用 Nature
                    token，而不是 DaisyUI 的基础色语义。
                  </p>
                  <blockquote>
                    界面应该像水一样适应容器，像烟雾一样柔和过渡，像生物一样对触碰产生有机反应。
                  </blockquote>
                  <p>
                    行内代码例如 <code>data-ui-theme</code> 与 <code>prefers-reduced-motion</code>{" "}
                    在深浅主题下都要保持可读。
                  </p>
                </div>
              </article>
            </section>

            <aside className="space-y-6">
              <section className="nature-panel px-5 py-5">
                <h2 className="font-heading text-xl font-semibold tracking-[-0.03em] text-[color:var(--nature-text)]">
                  验收点
                </h2>
                <ul className="mt-4 space-y-2 text-sm leading-7 text-[color:var(--nature-text-soft)]">
                  <li>公开主题切换只保留 light / dark / system。</li>
                  <li>卡片、按钮、输入框与阅读面板全部使用 Nature token。</li>
                  <li>减少动态偏好时，粒子与呼吸动效显著减弱。</li>
                </ul>
              </section>

              <section className="nature-panel-soft px-5 py-5">
                <div className="nature-stat-grid">
                  <div className="nature-stat">
                    <div className="nature-stat-label">Themes</div>
                    <div className="nature-stat-value">3</div>
                  </div>
                  <div className="nature-stat">
                    <div className="nature-stat-label">Surface Modes</div>
                    <div className="nature-stat-value">6</div>
                  </div>
                </div>
              </section>
            </aside>
          </div>
        </section>
      </div>
    </main>
  );
}
