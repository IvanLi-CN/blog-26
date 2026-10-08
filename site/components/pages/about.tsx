import Icon from "@/components/ui/Icon";
import type { loadabout } from "../../lib/page-data/about";
import { projectCatalog } from "../../lib/projects";
export default function aboutPage(data: Awaited<ReturnType<typeof loadabout>>) {
  const { snapshot, skillGroups, experienceItems, recentMoments } = data;

  return (
    <section className="nature-container px-2 py-8 sm:px-6 sm:py-10 lg:py-14">
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1.9fr)_minmax(18rem,0.95fr)]">
        <div className="space-y-8">
          <section className="nature-surface nature-mobile-structural nature-mobile-reading-surface overflow-hidden px-4 py-5 sm:px-8 sm:py-8">
            <div className="nature-avatar-ring mb-6">
              <div className="flex h-28 w-28 items-center justify-center rounded-full bg-[radial-gradient(circle_at_30%_30%,rgba(var(--nature-accent-rgb),0.45),rgba(var(--nature-secondary-rgb),0.7))] font-heading text-4xl font-semibold text-white">
                I
              </div>
            </div>
            <span className="nature-kicker gap-2">
              <Icon name="tabler:leaf" className="h-4 w-4" />
              About
            </span>
            <h1 className="nature-title mt-4 text-4xl sm:text-5xl">你好，我是 Ivan</h1>
            <p className="nature-muted mt-4 max-w-3xl text-base sm:text-lg">
              全栈开发者，偏爱干净的工程结构，也在意界面的呼吸感。这个站点既是技术记录，也是我整理长期工作方法与审美判断的地方。
            </p>
            <div className="nature-stat-grid mt-8">
              <div className="nature-stat">
                <div className="nature-stat-label">总文章</div>
                <div className="nature-stat-value">{snapshot.stats.totalPosts}</div>
              </div>
              <div className="nature-stat">
                <div className="nature-stat-label">分类</div>
                <div className="nature-stat-value">{snapshot.stats.categories.length}</div>
              </div>
              <div className="nature-stat">
                <div className="nature-stat-label">公开项目</div>
                <div className="nature-stat-value">{projectCatalog.length}</div>
              </div>
            </div>
          </section>

          <section className="nature-panel nature-mobile-reading-surface px-4 py-5 sm:px-7 sm:py-6">
            <h2 className="font-heading text-2xl font-semibold tracking-[-0.03em] text-[color:var(--nature-text)]">
              关于我
            </h2>
            <div className="nature-prose mt-5 space-y-4 text-[color:var(--nature-text-soft)]">
              <p>
                我长期关注现代 Web
                开发、内容系统与设计工程之间的连接点。对我来说，代码不仅要能跑，还要足够稳、足够清晰，能被未来的自己和协作者继续接住。
              </p>
              <p>
                在职业工作之外，我会把一些能复用的方法论、踩坑记录和产品观察整理成文章或
                Memo。这个过程既是输出，也是重新理解问题的方式。
              </p>
            </div>
          </section>

          <section className="nature-panel px-4 py-5 sm:px-7 sm:py-6">
            <h2 className="font-heading text-2xl font-semibold tracking-[-0.03em] text-[color:var(--nature-text)]">
              技术栈
            </h2>
            <div className="mt-6 grid gap-5 md:grid-cols-3">
              {skillGroups.map((group) => (
                <article
                  key={group.title}
                  className="rounded-[var(--nature-radius-md)] border border-[rgba(var(--nature-border-rgb),0.72)] bg-[rgba(var(--nature-highlight-rgb),0.16)] p-4"
                >
                  <h3 className="text-base font-semibold text-[color:var(--nature-text)]">
                    {group.title}
                  </h3>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {group.items.map((item) => (
                      <span key={item} className={`nature-chip ${group.accent}`}>
                        {item}
                      </span>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section className="nature-panel px-4 py-5 sm:px-7 sm:py-6">
            <h2 className="font-heading text-2xl font-semibold tracking-[-0.03em] text-[color:var(--nature-text)]">
              工作经历
            </h2>
            <div className="mt-6 space-y-6">
              {experienceItems.map((item) => (
                <article
                  key={item.title}
                  className="rounded-[var(--nature-radius-md)] border border-[rgba(var(--nature-border-rgb),0.72)] bg-[rgba(var(--nature-surface-rgb),0.72)] p-4 sm:p-5"
                >
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="nature-chip nature-chip-info">{item.period}</span>
                    <h3 className="text-lg font-semibold text-[color:var(--nature-text)]">
                      {item.title}
                    </h3>
                    <span className="text-sm text-[color:var(--nature-text-soft)]">
                      {item.company}
                    </span>
                  </div>
                  <ul className="mt-4 space-y-2 text-sm leading-7 text-[color:var(--nature-text-soft)]">
                    {item.points.map((point) => (
                      <li key={point} className="flex gap-3">
                        <span className="mt-2 h-2 w-2 rounded-full bg-[rgba(var(--nature-accent-rgb),0.72)]" />
                        <span>{point}</span>
                      </li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>
          </section>
        </div>

        <aside className="space-y-6">
          <section className="nature-panel px-4 py-5 sm:px-5">
            <h2 className="font-heading text-xl font-semibold tracking-[-0.03em] text-[color:var(--nature-text)]">
              最近动态
            </h2>
            <div className="mt-5 space-y-4">
              {recentMoments.map((item) => (
                <div key={item.year} className="flex gap-4">
                  <div className="flex flex-col items-center">
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[rgba(var(--nature-accent-rgb),0.14)] text-sm font-semibold text-[color:var(--nature-accent-strong)]">
                      {item.year.slice(-2)}
                    </span>
                    <span className="mt-2 h-full w-px bg-[rgba(var(--nature-border-rgb),0.72)]" />
                  </div>
                  <div className="pb-3">
                    <div className="text-sm font-medium text-[color:var(--nature-text)]">
                      {item.year}
                    </div>
                    <p className="mt-1 text-sm leading-6 text-[color:var(--nature-text-soft)]">
                      {item.text}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </aside>
      </div>
    </section>
  );
}
