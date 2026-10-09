import type { loadprojects } from "../../lib/page-data/projects";
import { getProjectRuntimeMetrics } from "../../lib/project-runtime-metrics";
import { getProjectRuntimeEndpoint } from "../../lib/project-runtime-sources";
import { getProjectCardEntries, getProjectDetailPath, projectCatalog } from "../../lib/projects";
import { cssStyle } from "../../lib/react-template";
import { toPublicSitePath } from "../../lib/runtime-urls";
import ProjectExternalLinks from "../projects/ProjectExternalLinks";
import ProjectPoster from "../projects/ProjectPoster";
import ProjectRuntimeDataPanel from "../projects/ProjectRuntimeDataPanel";
export default function projectsPage(data: Awaited<ReturnType<typeof loadprojects>>) {
  const { groupedProjects, firstProjectSlug } = data;

  return (
    <section className="nature-container px-1 py-10 sm:px-6 sm:py-16 lg:py-20">
      <header className="mb-8 text-center sm:mb-12">
        <span className="nature-kicker justify-center">Projects</span>
        <h1 className="nature-title mt-4 text-4xl sm:text-5xl lg:text-6xl">项目</h1>
        <p className="nature-muted mx-auto mt-4 max-w-2xl text-base sm:text-lg">
          收录了近期仍在维护的{" "}
          <strong className="whitespace-nowrap font-semibold text-[color:var(--nature-text)]">
            {projectCatalog.length} 个公开项目
          </strong>
          ，涵盖
          <strong className="whitespace-nowrap font-semibold text-[color:var(--nature-text)]">
            {groupedProjects.length} 个产品领域
          </strong>
          。
        </p>
      </header>

      <div className="projects-domain-stack nature-surface nature-mobile-reading-surface">
        {groupedProjects.map((group) => (
          <section key={group.id} id={group.id} className="projects-domain-section">
            <header className="projects-domain-head">
              <div>
                <h2 className="projects-domain-title">{group.title}</h2>
                <p className="projects-domain-framing">{group.framing}</p>
              </div>
              <span className="projects-domain-count">{group.projects.length} 项</span>
            </header>

            <div className="projects-domain-rail">
              <section
                className="projects-domain-grid scrollbar-auto-hide"
                data-scrollbar-auto-hide=""
                style={cssStyle(
                  `--showcase-cards:3;--showcase-cards-tablet:${Math.min(group.projects.length, 2)};`
                )}
                aria-label={`${group.title} 项目展架`}
              >
                {group.projects.map((project) => {
                  const runtimeMetrics = getProjectRuntimeMetrics(project.slug);
                  const runtimeSourceUrl = getProjectRuntimeEndpoint(project.slug);
                  const runtimePanelEnabled = Boolean(runtimeMetrics && runtimeSourceUrl);

                  return (
                    <article
                      key={project.slug}
                      className="projects-poster-card nature-hover-hitbox"
                    >
                      <div className="projects-poster-link nature-hover-lift">
                        <div className="projects-poster-visual">
                          {runtimePanelEnabled ? (
                            <>
                              <a
                                href={toPublicSitePath(getProjectDetailPath(project.slug))}
                                className="projects-poster-poster-link"
                                data-runtime-fallback-poster=""
                                aria-label={`查看 ${project.title} 项目案例`}
                              >
                                <ProjectPoster
                                  project={project}
                                  compact={true}
                                  priority={project.slug === firstProjectSlug}
                                  fetchPriority={
                                    project.slug === firstProjectSlug ? "high" : "auto"
                                  }
                                />
                              </a>
                              <ProjectRuntimeDataPanel
                                metrics={runtimeMetrics!}
                                sourceUrl={runtimeSourceUrl}
                                detailUrl={toPublicSitePath(getProjectDetailPath(project.slug))}
                              />
                            </>
                          ) : (
                            <a
                              href={toPublicSitePath(getProjectDetailPath(project.slug))}
                              className="projects-poster-poster-link"
                              aria-label={`查看 ${project.title} 项目案例`}
                            >
                              <ProjectPoster
                                project={project}
                                compact={true}
                                priority={project.slug === firstProjectSlug}
                                fetchPriority={project.slug === firstProjectSlug ? "high" : "auto"}
                              />
                            </a>
                          )}
                        </div>
                      </div>
                      <div className="projects-poster-copy">
                        <div className="projects-poster-heading">
                          <a
                            href={toPublicSitePath(getProjectDetailPath(project.slug))}
                            className="projects-poster-title-link"
                          >
                            <h3 className="projects-poster-title">{project.title}</h3>
                          </a>
                          <ProjectExternalLinks
                            entries={getProjectCardEntries(project)}
                            iconOnly={true}
                            compact={true}
                            dense={true}
                          />
                        </div>
                        <a
                          href={toPublicSitePath(getProjectDetailPath(project.slug))}
                          className="projects-poster-summary-link"
                          title={project.summary}
                        >
                          <p className="projects-poster-summary">{project.summary}</p>
                        </a>
                      </div>
                    </article>
                  );
                })}
              </section>

              <div
                className="projects-domain-scrollbar"
                data-scrollbar-overlay=""
                aria-hidden="true"
              >
                <div className="projects-domain-scrollbar-track" data-scrollbar-track="">
                  <div className="projects-domain-scrollbar-thumb" data-scrollbar-thumb=""></div>
                </div>
              </div>
            </div>
          </section>
        ))}
      </div>
    </section>
  );
}
