import Icon from "@/components/ui/Icon";
import { formatAbsoluteDate } from "../../lib/format";
import type { loadtag } from "../../lib/page-data/tag";
import { getProjectDetailPath, getProjectDomainDefinition } from "../../lib/projects";
import { toPublicSitePath } from "../../lib/runtime-urls";
import ProjectTagLogo from "../projects/ProjectTagLogo";
export default function tagPage(data: Awaited<ReturnType<typeof loadtag>>) {
  const { summary, items, projects, breadcrumbs, iconId, iconSvg } = data;

  return (
    <section className="nature-container tag-detail-layout px-2 py-8 sm:px-6 lg:py-12">
      <nav aria-label="Breadcrumb" className="mb-4">
        <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-[color:var(--nature-text-soft)]">
          <li>
            <a
              href={toPublicSitePath("/tags")}
              className="transition-colors hover:text-[color:var(--nature-accent-strong)]"
            >
              标签
            </a>
          </li>
          {breadcrumbs.map((item) => (
            <li key={item.href} className="flex items-center gap-2">
              <Icon
                name="tabler:chevron-right"
                className="h-4 w-4 text-[color:var(--nature-text-faint)]"
              />
              <a
                href={item.href}
                className="transition-colors hover:text-[color:var(--nature-accent-strong)]"
              >
                {item.label}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      <div className="nature-surface tag-detail-header mb-6 flex items-center justify-between gap-4 px-4 py-4 sm:mb-8 sm:px-5 sm:py-5">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 font-heading text-2xl font-semibold tracking-[-0.03em] text-[color:var(--nature-text)] md:text-3xl">
            {iconSvg ? (
              <span
                className="inline-flex text-[color:var(--nature-accent-strong)] [&>svg]:h-5 [&>svg]:w-5"
                dangerouslySetInnerHTML={{ __html: iconSvg }}
              />
            ) : (
              <Icon name={iconId} className="h-5 w-5 text-[color:var(--nature-accent-strong)]" />
            )}
            <span className="truncate">{summary.lastSegment}</span>
          </h1>
          <p className="mt-2 truncate text-sm text-[color:var(--nature-text-soft)]">
            #{summary.name}
          </p>
        </div>

        <a
          href={toPublicSitePath("/tags")}
          className="nature-button nature-button-ghost min-h-10 px-4 py-2"
        >
          <Icon name="tabler:tags" className="h-4 w-4" />
          返回
        </a>
      </div>

      {projects.length > 0 && (
        <section className="mb-8" aria-labelledby="tag-projects-title" data-tag-projects="">
          <h2 id="tag-projects-title" className="tag-section-heading nature-title mb-3 text-xl">
            相关项目 <span className="nature-muted text-sm">{projects.length}</span>
          </h2>
          <div className="nature-mobile-reading-stream space-y-4">
            {projects.map((project) => (
              <article
                key={project.slug}
                className="tag-project-entry nature-panel nature-panel-soft nature-mobile-reading-row flex items-start gap-3 px-4 py-4 sm:px-6 sm:py-5"
              >
                <ProjectTagLogo slug={project.slug} title={project.title} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <h3 className="nature-title text-lg">
                      <a
                        className="nature-link-inline inline-flex min-h-11 items-center"
                        href={toPublicSitePath(getProjectDetailPath(project.slug))}
                      >
                        {project.title}
                      </a>
                    </h3>
                    <span className="nature-muted text-xs">
                      {getProjectDomainDefinition(project.domain).title}
                    </span>
                  </div>
                  <p className="nature-muted mt-1 text-sm leading-7">{project.summary}</p>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}
      <section aria-labelledby="tag-dated-title" data-tag-dated="">
        <h2 id="tag-dated-title" className="tag-section-heading nature-title mb-4 text-xl">
          文章与闪念
        </h2>
        {items.length > 0 ? (
          <div className="nature-mobile-reading-stream space-y-4">
            {items.map((item) => {
              const href = toPublicSitePath(
                item.type === "memo" ? `/memos/${item.slug}` : `/posts/${item.slug}`
              );
              return (
                <article
                  key={item.title}
                  className="nature-panel nature-panel-soft nature-mobile-reading-row tag-detail-entry px-4 py-4 sm:px-6 sm:py-5"
                >
                  <div className="flex flex-wrap items-center gap-2 text-sm text-[color:var(--nature-text-soft)]">
                    <span className="nature-chip nature-content-type-chip gap-1">
                      <Icon
                        name={item.type === "memo" ? "tabler:bulb" : "tabler:article"}
                        className="nature-content-type-icon h-3.5 w-3.5"
                      />
                      <span className="sr-only sm:not-sr-only">
                        {item.type === "memo" ? "闪念" : "文章"}
                      </span>
                    </span>
                    <time dateTime={item.publishDate}>{formatAbsoluteDate(item.publishDate)}</time>
                  </div>
                  {item.title && (
                    <h2 className="nature-title mt-3 text-xl font-semibold">
                      <a
                        href={href}
                        className="transition-colors hover:text-[color:var(--nature-accent-strong)]"
                      >
                        {item.title}
                      </a>
                    </h2>
                  )}
                  {!item.title && item.type === "memo" && (
                    <a
                      href={href}
                      className="nature-link-inline mt-3 inline-flex min-h-10 items-center px-2 text-sm"
                    >
                      查看闪念详情
                    </a>
                  )}
                  {item.excerpt && (
                    <p className="nature-muted mt-3 text-base leading-7">{item.excerpt}</p>
                  )}
                </article>
              );
            })}
          </div>
        ) : (
          <div className="nature-empty">
            <p>该标签下暂无公开文章或闪念。</p>
          </div>
        )}
      </section>
    </section>
  );
}
