import Icon from "@/components/ui/Icon";
import { SITE } from "@/config/site";
import type { loadhome } from "../../lib/page-data/home";
import {
  getProjectCardEntries,
  getProjectDetailPath,
  getProjectDomainDefinition,
} from "../../lib/projects";
import { toPublicSitePath } from "../../lib/runtime-urls";
import FeaturedProjectLogo from "../projects/FeaturedProjectLogo";
import ProjectExternalLinks from "../projects/ProjectExternalLinks";
import TagBadge from "../TagBadge";
import TimelineCard from "../TimelineCard";
export default function homePage(data: Awaited<ReturnType<typeof loadhome>>) {
  const { snapshot, timeline, assetVersion, featuredProjects, featuredProjectLogos } = data;

  return (
    <>
      <section className="nature-container px-2 py-7 sm:px-6 sm:py-8 md:py-12">
        <div className="nature-surface nature-mobile-structural nature-mobile-reading-surface px-4 py-6 text-center sm:px-8 sm:py-12">
          <span className="nature-kicker mx-auto mb-5">Nature Interface</span>
          <h1 className="nature-title mx-auto max-w-4xl text-4xl font-bold sm:text-5xl md:text-6xl">
            Ivan&apos;s <span className="text-[color:var(--nature-accent-strong)]">Blog</span>
            ，在流动的数字温室里安放想法。
          </h1>
          <p className="nature-muted mx-auto mt-5 max-w-3xl text-base leading-8 sm:text-lg">
            {SITE.description}
          </p>
          <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
            <a href={toPublicSitePath("/posts")} className="nature-button nature-button-primary">
              <Icon name="tabler:article" className="h-4 w-4" />
              浏览文章
            </a>
            <a href={toPublicSitePath("/memos")} className="nature-button nature-button-outline">
              <Icon name="tabler:bulb" className="h-4 w-4" />
              进入 Memos
            </a>
          </div>
        </div>
      </section>

      <section className="nature-container px-1 py-5 sm:px-6 sm:py-6 md:py-10">
        {timeline.length > 0 ? (
          <div className="nature-timeline nature-mobile-reading-stream" data-testid="home-timeline">
            {timeline.map((item, index) => (
              <TimelineCard
                key={item.title}
                item={item}
                isLast={index === timeline.length - 1}
                iconMap={snapshot.tags.tagIconMap}
                iconSvgMap={snapshot.tags.tagIconSvgMap}
                assetVersion={assetVersion}
              />
            ))}
          </div>
        ) : (
          <div className="nature-empty">
            <Icon name="tabler:timeline" className="mx-auto mb-2 h-8 w-8 opacity-50" />
            <p>暂无内容</p>
          </div>
        )}
      </section>

      <section className="nature-container px-2 py-5 sm:px-6 sm:py-6 md:py-8">
        <div className="mb-6 flex items-center justify-between gap-4">
          <div>
            <h2 className="nature-title flex items-center gap-3 text-2xl font-semibold sm:text-3xl">
              <Icon
                name="tabler:code"
                className="h-6 w-6 text-[color:var(--nature-accent-strong)]"
              />
              精选项目 ({featuredProjects.length})
            </h2>
          </div>
          <a
            href={toPublicSitePath("/projects")}
            className="nature-button nature-button-ghost featured-projects-all-link"
            aria-label="查看全部项目"
            title="查看全部项目"
          >
            <Icon name="tabler:arrow-up-right" className="h-4 w-4" />
            <span className="featured-projects-all-label">查看全部</span>
          </a>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {featuredProjects.map((project) => {
            const logo = featuredProjectLogos[project.slug as keyof typeof featuredProjectLogos];
            return (
              <article
                key={project.title}
                className="nature-hover-hitbox"
                data-testid="featured-project-card"
                data-project-slug={project.slug}
                data-logo-state={logo ? "available" : "missing"}
              >
                <div className="nature-panel nature-panel-soft nature-hover-lift nature-hover-surface featured-project-panel h-full px-4 py-4 sm:px-5 sm:py-5 [--nature-hover-border-color:rgba(var(--nature-accent-rgb),0.34)] [--nature-hover-lift-offset:-0.14rem] [--nature-hover-shadow:0_20px_40px_rgba(8,21,16,0.14)]">
                  {logo && <FeaturedProjectLogo {...logo} variant="watermark" />}
                  <div className="relative z-[1] flex h-full flex-col gap-4">
                    <div className="flex min-h-14 items-center gap-3">
                      {logo && <FeaturedProjectLogo {...logo} variant="inline" />}
                      <div className="min-w-0">
                        <h3 className="font-heading text-2xl font-semibold tracking-[-0.04em] text-[color:var(--nature-text)]">
                          <a
                            href={toPublicSitePath(getProjectDetailPath(project.slug))}
                            className="transition-colors hover:text-[color:var(--nature-accent-strong)]"
                          >
                            {project.title}
                          </a>
                        </h3>
                        <span className="nature-muted mt-1 block text-xs font-medium">
                          {getProjectDomainDefinition(project.domain).title}
                        </span>
                      </div>
                    </div>

                    <p className="nature-muted min-h-[4.25rem] text-sm leading-7">
                      {project.summary}
                    </p>

                    <div className="native-tag-list flex min-h-8 flex-wrap content-start gap-2">
                      {(project.featuredTags ?? []).map((tag) => (
                        <TagBadge
                          key={tag}
                          tag={tag}
                          iconMap={snapshot.tags.tagIconMap}
                          iconSvgMap={snapshot.tags.tagIconSvgMap}
                        />
                      ))}
                    </div>

                    <div
                      className="featured-project-footer mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-[color:rgba(var(--nature-border-rgb),0.32)] pt-3"
                      data-featured-project-footer=""
                    >
                      <a
                        href={toPublicSitePath(getProjectDetailPath(project.slug))}
                        className="nature-button nature-button-ghost px-3 py-2 text-sm"
                        data-project-case-link=""
                      >
                        <Icon name="tabler:arrow-right" className="h-4 w-4" />
                        查看案例
                      </a>
                      <ProjectExternalLinks
                        entries={getProjectCardEntries(project)}
                        compact={true}
                        adaptive={true}
                      />
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </>
  );
}
