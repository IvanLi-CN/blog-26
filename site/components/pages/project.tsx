import Icon from "@/components/ui/Icon";
import type { loadproject } from "../../lib/page-data/project";
import { toPublicSitePath } from "../../lib/runtime-urls";
import ProjectBody from "../ProjectBody";
import ProjectExternalLinks from "../projects/ProjectExternalLinks";
import ProjectPoster from "../projects/ProjectPoster";
import ProjectSocialPreview from "../projects/ProjectSocialPreview";
import TagBadge from "../TagBadge";
export default function projectPage(data: Awaited<ReturnType<typeof loadproject>>) {
  const {
    project,
    snapshot,
    domain,
    relatedEntries,
    publicEntries,
    detailBody,
    heroSummary,
    structuredData,
  } = data;
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(structuredData).replace(/</g, "\\u003c"),
        }}
      />
      <section className="nature-detail-container project-detail-page px-2 py-8 sm:px-6 lg:py-12">
        <div className="space-y-8">
          <header className="nature-surface nature-mobile-reading-surface project-detail-header overflow-hidden px-4 py-5 sm:px-8 sm:py-8">
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(18rem,0.65fr)] lg:items-start lg:gap-8">
              <div>
                <div className="flex flex-wrap items-center gap-3 text-sm text-[color:var(--nature-text-soft)]">
                  <a
                    href={toPublicSitePath("/projects")}
                    className="nature-chip gap-2 transition-colors hover:text-[color:var(--nature-accent-strong)]"
                  >
                    <Icon name="tabler:arrow-left" className="h-3.5 w-3.5" />
                    返回项目索引
                  </a>
                  <span className="nature-chip nature-chip-accent">{domain.title}</span>
                </div>
                <h1 className="mt-5 font-heading text-3xl font-semibold tracking-[-0.05em] text-[color:var(--nature-text)] sm:text-4xl md:text-5xl">
                  {project.title}
                </h1>
                <p className="mt-5 max-w-3xl text-base leading-8 text-[color:var(--nature-text)] sm:text-lg">
                  {heroSummary}
                </p>
                <div className="native-tag-list mt-6 flex flex-wrap gap-2">
                  {project.techTags.map((tag) => (
                    <TagBadge
                      key={tag}
                      tag={tag}
                      iconMap={snapshot.tags.tagIconMap}
                      iconSvgMap={snapshot.tags.tagIconSvgMap}
                    />
                  ))}
                </div>
              </div>
              <div className="w-full max-w-[18rem] justify-self-start lg:justify-self-end">
                <ProjectPoster
                  project={project}
                  compact={true}
                  showOverlay={false}
                  priority={true}
                  fetchPriority="high"
                />
              </div>
            </div>
          </header>
          <div className="project-detail-layout">
            <section className="project-detail-main">
              <ProjectSocialPreview project={project} />
              {detailBody.kind === "mdx" ? (
                <article className="project-mdx-content">
                  <div className="nature-prose">
                    <ProjectBody slug={project.slug} />
                  </div>
                </article>
              ) : (
                <article className="nature-mobile-reading-surface project-mdx-content project-catalog-fallback">
                  <div className="nature-prose">
                    <p>{detailBody.description}</p>
                    <ul>
                      {detailBody.highlights.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                </article>
              )}
              {relatedEntries.length > 0 && (
                <section className="nature-panel px-4 py-5 sm:px-7 sm:py-6">
                  <div className="flex items-center gap-3">
                    <Icon
                      name="tabler:book-2"
                      className="h-5 w-5 text-[color:var(--nature-accent-strong)]"
                    />
                    <h2 className="font-heading text-2xl font-semibold text-[color:var(--nature-text)]">
                      延伸阅读
                    </h2>
                  </div>
                  <div className="mt-5 grid gap-4 md:grid-cols-2">
                    {relatedEntries.map((entry) => (
                      <article
                        key={entry.title}
                        className="nature-panel nature-panel-soft px-4 py-4"
                      >
                        <span className="nature-chip">
                          {entry.type === "post" ? "Post" : "Memo"}
                        </span>
                        {entry.title ? (
                          <h3 className="mt-3 text-lg font-semibold text-[color:var(--nature-text)]">
                            <a
                              href={toPublicSitePath(entry.href)}
                              className="transition-colors hover:text-[color:var(--nature-accent-strong)]"
                            >
                              {entry.title}
                            </a>
                          </h3>
                        ) : (
                          <a
                            href={toPublicSitePath(entry.href)}
                            className="nature-link-inline mt-3 inline-flex min-h-10 items-center px-2 text-sm"
                          >
                            查看闪念详情
                          </a>
                        )}
                        {entry.excerpt && (
                          <p className="nature-muted mt-3 text-sm leading-7">{entry.excerpt}</p>
                        )}
                      </article>
                    ))}
                  </div>
                </section>
              )}
            </section>
            <aside className="project-detail-sidebar space-y-6">
              <section className="nature-panel px-4 py-5 sm:px-5">
                <div className="flex items-center gap-3">
                  <Icon
                    name="tabler:world"
                    className="h-5 w-5 text-[color:var(--nature-accent-strong)]"
                  />
                  <h2 className="font-heading text-xl font-semibold text-[color:var(--nature-text)]">
                    公开入口
                  </h2>
                </div>
                <ProjectExternalLinks entries={publicEntries} />
              </section>
              {detailBody.kind === "mdx" && detailBody.body.toc.length > 0 && (
                <nav
                  className="nature-panel project-toc px-4 py-5 sm:px-5"
                  aria-label="本页内容导航"
                >
                  <h2 className="font-heading text-xl font-semibold text-[color:var(--nature-text)]">
                    本页内容
                  </h2>
                  <ol className="mt-4 grid gap-2">
                    {detailBody.body.toc.map((item) => (
                      <li key={item.slug} className={item.depth === 3 ? "pl-4" : ""}>
                        <a
                          href={`#${item.slug}`}
                          className="text-sm leading-6 text-[color:var(--nature-text-soft)] transition-colors hover:text-[color:var(--nature-accent-strong)]"
                        >
                          {item.text}
                        </a>
                      </li>
                    ))}
                  </ol>
                </nav>
              )}
            </aside>
          </div>
        </div>
      </section>
    </>
  );
}
