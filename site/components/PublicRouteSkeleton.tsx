import type { ReactNode } from "react";
import type { PublicRouteKind } from "../lib/public-route";
import { isAsyncPublicRouteKind } from "../lib/public-route-skeleton";

function skeletonKeys(prefix: string, count: number) {
  return Array.from({ length: count }, (_, index) => `${prefix}-${index}`);
}

function SkeletonBar({ className = "" }: { className?: string }) {
  return <span aria-hidden="true" className={`nature-skeleton public-skeleton-bar ${className}`} />;
}

function SkeletonBlock({ className = "" }: { className?: string }) {
  return (
    <span aria-hidden="true" className={`nature-skeleton public-skeleton-block ${className}`} />
  );
}

function Lines({ count = 3, className = "" }: { count?: number; className?: string }) {
  return (
    <div className={`public-skeleton-lines ${className}`}>
      {skeletonKeys("line", count).map((key, index) => (
        <SkeletonBar
          key={key}
          className={index === count - 1 ? "public-skeleton-line-short" : ""}
        />
      ))}
    </div>
  );
}

function Surface({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`nature-surface nature-mobile-reading-surface ${className}`}>{children}</div>
  );
}

function Intro({ detail = false }: { detail?: boolean }) {
  return (
    <header className={`public-skeleton-intro ${detail ? "public-skeleton-intro-detail" : ""}`}>
      <SkeletonBar className="public-skeleton-kicker" />
      <SkeletonBar className="public-skeleton-heading" />
      <SkeletonBar className="public-skeleton-heading public-skeleton-heading-short" />
      {!detail && <SkeletonBar className="public-skeleton-copy public-skeleton-copy-centered" />}
    </header>
  );
}

function TimelineSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="public-skeleton-timeline">
      {skeletonKeys("timeline", count).map((key, index) => (
        <div key={key} className="public-skeleton-timeline-item">
          <div className="public-skeleton-timeline-rail">
            <SkeletonBlock className="public-skeleton-timeline-node" />
            {index < count - 1 && <span className="public-skeleton-timeline-connector" />}
          </div>
          <Surface className="public-skeleton-timeline-card">
            <div className="public-skeleton-meta">
              <SkeletonBar className="public-skeleton-meta-icon" />
              <SkeletonBar className="public-skeleton-meta-line" />
              <SkeletonBar className="public-skeleton-meta-chip" />
            </div>
            <SkeletonBar className="public-skeleton-card-title" />
            <Lines count={2} />
            <div className="public-skeleton-tags">
              <SkeletonBar className="public-skeleton-tag" />
              <SkeletonBar className="public-skeleton-tag public-skeleton-tag-short" />
            </div>
          </Surface>
        </div>
      ))}
    </div>
  );
}

function PostCards({ count = 4 }: { count?: number }) {
  return (
    <div className="public-skeleton-stack">
      {skeletonKeys("post", count).map((key) => (
        <Surface key={key} className="public-skeleton-post-card">
          <div className="public-skeleton-post-copy">
            <div className="public-skeleton-meta">
              <SkeletonBar className="public-skeleton-meta-line" />
              <SkeletonBar className="public-skeleton-meta-chip" />
            </div>
            <SkeletonBar className="public-skeleton-card-title" />
            <Lines count={2} />
            <div className="public-skeleton-tags">
              <SkeletonBar className="public-skeleton-tag" />
              <SkeletonBar className="public-skeleton-tag public-skeleton-tag-short" />
            </div>
          </div>
          <SkeletonBlock className="public-skeleton-post-media" />
        </Surface>
      ))}
    </div>
  );
}

function PosterGrid({ count = 3 }: { count?: number }) {
  return (
    <div className="public-skeleton-poster-grid">
      {skeletonKeys("poster", count).map((key) => (
        <div key={key} className="public-skeleton-poster-card">
          <SkeletonBlock className="public-skeleton-poster" />
          <SkeletonBar className="public-skeleton-card-title" />
          <SkeletonBar className="public-skeleton-copy public-skeleton-copy-short" />
        </div>
      ))}
    </div>
  );
}

function ContentRows({ count = 4, className = "" }: { count?: number; className?: string }) {
  return (
    <div className={`public-skeleton-content-rows ${className}`}>
      {skeletonKeys("content", count).map((key) => (
        <Surface key={key} className="public-skeleton-content-row">
          <div className="public-skeleton-meta">
            <SkeletonBar className="public-skeleton-meta-icon" />
            <SkeletonBar className="public-skeleton-meta-line" />
          </div>
          <SkeletonBar className="public-skeleton-card-title" />
          <Lines count={2} />
        </Surface>
      ))}
    </div>
  );
}

function DetailSkeleton({ kind }: { kind: "post" | "memo" }) {
  return (
    <section
      className={`public-skeleton-detail public-skeleton-${kind}-detail nature-detail-container`}
    >
      <div className="public-skeleton-reading-column">
        <Surface className="public-skeleton-detail-header">
          <div className="public-skeleton-meta">
            <SkeletonBar className="public-skeleton-meta-chip" />
            <SkeletonBar className="public-skeleton-meta-line" />
            <SkeletonBar className="public-skeleton-meta-chip" />
          </div>
          <SkeletonBar className="public-skeleton-detail-title" />
          <SkeletonBar className="public-skeleton-detail-title public-skeleton-heading-short" />
          <SkeletonBar className="public-skeleton-copy" />
          <div className="public-skeleton-tags">
            <SkeletonBar className="public-skeleton-tag" />
            <SkeletonBar className="public-skeleton-tag public-skeleton-tag-short" />
          </div>
        </Surface>
        {kind === "post" && <SkeletonBlock className="public-skeleton-detail-media" />}
        <Surface className="public-skeleton-body">
          <Lines count={9} />
          <div className="public-skeleton-body-break" />
          <Lines count={6} />
        </Surface>
        {kind === "post" && (
          <Surface className="public-skeleton-feedback">
            <SkeletonBar className="public-skeleton-card-title public-skeleton-card-title-short" />
            <SkeletonBar className="public-skeleton-copy public-skeleton-copy-short" />
          </Surface>
        )}
      </div>
      {kind === "post" && (
        <div className="public-skeleton-related">
          <SkeletonBar className="public-skeleton-section-title" />
          <div className="public-skeleton-card-grid public-skeleton-related-grid">
            <Surface className="public-skeleton-related-card">
              <SkeletonBlock className="public-skeleton-related-media" />
              <Lines count={2} />
            </Surface>
            <Surface className="public-skeleton-related-card">
              <SkeletonBlock className="public-skeleton-related-media" />
              <Lines count={2} />
            </Surface>
          </div>
        </div>
      )}
    </section>
  );
}

function HomeSkeleton() {
  return (
    <section className="public-route-skeleton-page public-skeleton-home nature-container">
      <Surface className="public-skeleton-home-intro">
        <SkeletonBar className="public-skeleton-kicker" />
        <SkeletonBar className="public-skeleton-home-title" />
        <SkeletonBar className="public-skeleton-home-title public-skeleton-heading-short" />
        <SkeletonBar className="public-skeleton-copy public-skeleton-copy-centered" />
        <div className="public-skeleton-actions">
          <SkeletonBar />
          <SkeletonBar />
        </div>
      </Surface>
      <TimelineSkeleton />
      <SkeletonBar className="public-skeleton-section-title" />
      <PosterGrid count={3} />
    </section>
  );
}

function PostsSkeleton() {
  return (
    <section className="public-route-skeleton-page nature-container">
      <Intro />
      <PostCards />
    </section>
  );
}

function ProjectsSkeleton() {
  return (
    <section className="public-route-skeleton-page nature-container">
      <Intro />
      <Surface className="public-skeleton-project-groups">
        {skeletonKeys("project-group", 3).map((key) => (
          <section key={key} className="public-skeleton-project-group">
            <div className="public-skeleton-group-heading">
              <SkeletonBar className="public-skeleton-card-title" />
              <SkeletonBar className="public-skeleton-meta-chip" />
            </div>
            <SkeletonBar className="public-skeleton-copy public-skeleton-copy-short" />
            <PosterGrid count={3} />
          </section>
        ))}
      </Surface>
    </section>
  );
}

function ProjectSkeleton() {
  return (
    <section className="public-route-skeleton-page public-skeleton-project-detail nature-detail-container">
      <Surface className="public-skeleton-project-hero">
        <div className="public-skeleton-project-hero-copy">
          <div className="public-skeleton-meta">
            <SkeletonBar className="public-skeleton-meta-chip" />
            <SkeletonBar className="public-skeleton-meta-chip" />
          </div>
          <SkeletonBar className="public-skeleton-detail-title" />
          <SkeletonBar className="public-skeleton-copy" />
          <div className="public-skeleton-tags">
            <SkeletonBar className="public-skeleton-tag" />
            <SkeletonBar className="public-skeleton-tag public-skeleton-tag-short" />
          </div>
        </div>
        <SkeletonBlock className="public-skeleton-project-poster" />
      </Surface>
      <div className="public-skeleton-project-layout">
        <div className="public-skeleton-project-main">
          <SkeletonBlock className="public-skeleton-social-preview" />
          <Surface className="public-skeleton-body">
            <Lines count={9} />
            <div className="public-skeleton-body-break" />
            <Lines count={5} />
          </Surface>
          <ContentRows count={2} />
        </div>
        <aside className="public-skeleton-project-sidebar">
          <Surface>
            <SkeletonBar className="public-skeleton-card-title public-skeleton-card-title-short" />
            <Lines count={4} />
          </Surface>
          <Surface>
            <SkeletonBar className="public-skeleton-card-title public-skeleton-card-title-short" />
            <Lines count={4} />
          </Surface>
        </aside>
      </div>
    </section>
  );
}

function TagsSkeleton() {
  return (
    <section className="public-route-skeleton-page public-skeleton-tags nature-container">
      <div className="public-skeleton-tag-heading">
        <div>
          <SkeletonBar className="public-skeleton-kicker" />
          <SkeletonBar className="public-skeleton-heading" />
          <SkeletonBar className="public-skeleton-copy" />
        </div>
        <Surface>
          <SkeletonBar className="public-skeleton-meta-line" />
          <SkeletonBar className="public-skeleton-stat" />
        </Surface>
      </div>
      {skeletonKeys("tag-group", 3).map((groupKey) => (
        <section key={groupKey} className="public-skeleton-tag-group">
          <div className="public-skeleton-group-heading">
            <SkeletonBar className="public-skeleton-meta-chip" />
            <SkeletonBar className="public-skeleton-meta-line" />
          </div>
          <div className="public-skeleton-tag-grid">
            {skeletonKeys("tag-card", 6).map((cardKey) => (
              <Surface key={cardKey} className="public-skeleton-tag-card">
                <SkeletonBlock className="public-skeleton-tag-icon" />
                <div>
                  <SkeletonBar className="public-skeleton-card-title public-skeleton-card-title-short" />
                  <SkeletonBar className="public-skeleton-copy public-skeleton-copy-short" />
                </div>
              </Surface>
            ))}
          </div>
        </section>
      ))}
    </section>
  );
}

function TagSkeleton() {
  return (
    <section className="public-route-skeleton-page public-skeleton-tag-detail nature-container">
      <div className="public-skeleton-breadcrumb">
        <SkeletonBar />
        <SkeletonBar />
        <SkeletonBar />
      </div>
      <Surface className="public-skeleton-tag-detail-header">
        <div>
          <SkeletonBar className="public-skeleton-detail-title public-skeleton-card-title-short" />
          <SkeletonBar className="public-skeleton-copy public-skeleton-copy-short" />
        </div>
        <SkeletonBar className="public-skeleton-button" />
      </Surface>
      <SkeletonBar className="public-skeleton-section-title" />
      <ContentRows count={3} />
      <SkeletonBar className="public-skeleton-section-title" />
      <ContentRows count={4} />
    </section>
  );
}

function MemosSkeleton() {
  return (
    <section className="public-route-skeleton-page public-skeleton-memos nature-container">
      <Intro />
      <TimelineSkeleton count={5} />
    </section>
  );
}

function PlaybookSkeleton({ detail = false }: { detail?: boolean }) {
  if (!detail)
    return (
      <section className="public-route-skeleton-page public-skeleton-playbook nature-container">
        <Intro />
        <div className="public-skeleton-tabs">
          <SkeletonBar />
          <SkeletonBar />
          <SkeletonBar />
          <SkeletonBar />
        </div>
        <ContentRows count={6} />
      </section>
    );
  return (
    <section className="public-route-skeleton-page public-skeleton-playbook-detail nature-detail-container">
      <div className="public-skeleton-breadcrumb">
        <SkeletonBar />
        <SkeletonBar />
        <SkeletonBar />
      </div>
      <Surface className="public-skeleton-playbook-header">
        <SkeletonBar className="public-skeleton-meta-chip" />
        <SkeletonBar className="public-skeleton-detail-title" />
        <SkeletonBar className="public-skeleton-copy" />
        <div className="public-skeleton-tags">
          <SkeletonBar className="public-skeleton-tag" />
          <SkeletonBar className="public-skeleton-tag public-skeleton-tag-short" />
        </div>
      </Surface>
      <div className="public-skeleton-playbook-layout">
        <Surface className="public-skeleton-body">
          <Lines count={11} />
          <div className="public-skeleton-body-break" />
          <Lines count={7} />
        </Surface>
        <Surface className="public-skeleton-playbook-outline">
          <SkeletonBar className="public-skeleton-card-title public-skeleton-card-title-short" />
          <Lines count={6} />
        </Surface>
      </div>
      <SkeletonBar className="public-skeleton-section-title" />
      <ContentRows count={2} />
    </section>
  );
}

function SearchSkeleton() {
  return (
    <section className="public-route-skeleton-page public-skeleton-search nature-container">
      <Surface className="public-skeleton-search-panel">
        <SkeletonBar className="public-skeleton-heading" />
        <div className="public-skeleton-search-input">
          <SkeletonBar />
          <SkeletonBlock className="public-skeleton-search-button" />
        </div>
        <div className="public-skeleton-tabs">
          <SkeletonBar />
          <SkeletonBar />
          <SkeletonBar />
        </div>
      </Surface>
      <div className="public-skeleton-search-results">
        <Surface className="public-skeleton-search-status">
          <SkeletonBar className="public-skeleton-card-title" />
          <SkeletonBar className="public-skeleton-copy" />
        </Surface>
        <ContentRows count={4} />
      </div>
    </section>
  );
}

function renderSkeleton(kind: PublicRouteKind): ReactNode {
  switch (kind) {
    case "home":
      return <HomeSkeleton />;
    case "posts":
      return <PostsSkeleton />;
    case "post":
      return <DetailSkeleton kind="post" />;
    case "projects":
      return <ProjectsSkeleton />;
    case "project":
      return <ProjectSkeleton />;
    case "tags":
      return <TagsSkeleton />;
    case "tag":
      return <TagSkeleton />;
    case "memos":
      return <MemosSkeleton />;
    case "memo":
      return <DetailSkeleton kind="memo" />;
    case "playbook":
      return <PlaybookSkeleton />;
    case "playbookDetail":
      return <PlaybookSkeleton detail />;
    case "search":
      return <SearchSkeleton />;
    default:
      return null;
  }
}

export function PublicRouteSkeleton({ kind }: { kind: PublicRouteKind | null | undefined }) {
  if (!kind || !isAsyncPublicRouteKind(kind)) return null;
  return (
    <div
      className="public-route-skeleton"
      data-public-route-skeleton={kind}
      role="status"
      aria-live="polite"
      aria-label="正在加载目标页面"
    >
      <span className="sr-only">正在加载目标页面</span>
      <div aria-hidden="true">{renderSkeleton(kind)}</div>
    </div>
  );
}

export function PublicRouteError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <section className="nature-container public-route-error-container px-2 py-10 sm:px-6 sm:py-16">
      <div
        className="nature-panel nature-mobile-reading-surface public-route-error"
        role="alert"
        data-public-route-error
      >
        <div className="public-route-error-mark" aria-hidden="true">
          !
        </div>
        <div className="min-w-0">
          <h1 className="nature-title text-3xl">页面暂时无法加载</h1>
          <p className="nature-muted mt-4">{message}</p>
          <button
            type="button"
            className="nature-button nature-button-outline mt-5"
            onClick={onRetry}
          >
            重试
          </button>
        </div>
      </div>
    </section>
  );
}
