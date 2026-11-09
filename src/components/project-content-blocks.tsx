"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export function ProjectFigure({
  src,
  alt,
  caption,
}: {
  src: string;
  alt: string;
  caption?: string;
}) {
  return (
    <figure className="project-content-figure">
      {/* biome-ignore lint/performance/noImgElement: MDX figures use author-provided static assets. */}
      <img src={src} alt={alt} loading="lazy" decoding="async" />
      {caption ? <figcaption>{caption}</figcaption> : null}
    </figure>
  );
}

type ProjectArtifactDownload = {
  label: string;
  href: string;
};

type ProjectArtifact = {
  id: string;
  label: string;
  title: string;
  description: string;
  previewUrl: string;
  previewKind: "pdf" | "model";
  downloads: ProjectArtifactDownload[];
};

export function ProjectArtifactTabs({
  title,
  description,
  items,
}: {
  title: string;
  description: string;
  items: ProjectArtifact[];
}) {
  const [activeId, setActiveId] = useState(items[0]?.id ?? "");
  const [isExpanded, setIsExpanded] = useState(false);
  const [previewHeight, setPreviewHeight] = useState(420);
  const [previewOutOfView, setPreviewOutOfView] = useState(false);
  const previewRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const active = items.find((item) => item.id === activeId) ?? items[0];
  const previewUrl = (mode?: "scroll") => {
    if (!active) return "";
    if (mode !== "scroll" || !active.previewUrl.includes("pdf-viewer.html"))
      return active.previewUrl;
    return `${active.previewUrl}${active.previewUrl.includes("?") ? "&" : "?"}mode=scroll`;
  };

  useEffect(() => {
    const node = previewRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(([entry]) =>
      setPreviewOutOfView(entry.intersectionRatio === 0)
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const onMessage = (event: MessageEvent<{ type?: string; height?: number }>) => {
      if (
        event.source !== iframeRef.current?.contentWindow ||
        event.data?.type !== "project-preview-height"
      )
        return;
      const nextHeight = Math.min(760, Math.max(360, Math.ceil(event.data.height ?? 420)));
      setPreviewHeight((current) =>
        nextHeight >= current || previewOutOfView ? nextHeight : current
      );
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [previewOutOfView]);

  useEffect(() => {
    document.body.classList.toggle("project-artifact-modal-open", isExpanded);
    return () => document.body.classList.remove("project-artifact-modal-open");
  }, [isExpanded]);

  if (!active) return null;

  const panelId = `project-artifact-panel-${active.id}`;

  return (
    <section className="project-artifact-group">
      <header className="project-artifact-group-header">
        <h4>{title}</h4>
        <p>{description}</p>
      </header>
      <div className="project-artifact-tabs-list" role="tablist" aria-label={`${title}文件`}>
        {items.map((item) => (
          <button
            key={item.id}
            id={`project-artifact-tab-${item.id}`}
            className="project-artifact-tab"
            type="button"
            role="tab"
            aria-selected={item.id === active.id}
            aria-controls={panelId}
            onClick={() => setActiveId(item.id)}
          >
            {item.label}
          </button>
        ))}
        <button
          className="project-artifact-expand"
          type="button"
          aria-label={`放大预览 ${active.title}`}
          title="放大预览"
          onClick={() => setIsExpanded(true)}
        >
          ↗
        </button>
      </div>
      <div
        id={panelId}
        className="project-artifact-panel"
        role="tabpanel"
        aria-labelledby={`project-artifact-tab-${active.id}`}
      >
        <div
          ref={previewRef}
          className="project-artifact-preview"
          style={{ height: `${previewHeight}px` }}
        >
          <iframe
            key={active.id}
            ref={iframeRef}
            title={`${active.title} 预览`}
            src={previewUrl()}
            loading="lazy"
            sandbox={active.previewKind === "model" ? "allow-scripts allow-same-origin" : undefined}
          />
        </div>
        <div className="project-artifact-meta">
          <div>
            <strong>{active.title}</strong>
            <p>{active.description}</p>
          </div>
          <div className="project-artifact-downloads">
            {active.downloads.map((download) => (
              <a key={download.href} href={download.href} target="_blank" rel="noreferrer" download>
                {download.label}
              </a>
            ))}
          </div>
        </div>
      </div>
      {isExpanded
        ? createPortal(
            <div
              className="project-artifact-modal"
              role="dialog"
              aria-modal="true"
              aria-label={`${title}放大预览`}
            >
              <aside className="project-artifact-modal-sidebar">
                <div className="project-artifact-modal-heading">
                  <strong>{title}</strong>
                  <button type="button" onClick={() => setIsExpanded(false)} aria-label="关闭预览">
                    ×
                  </button>
                </div>
                <div
                  className="project-artifact-modal-files"
                  role="tablist"
                  aria-label={`${title}文件列表`}
                >
                  {items.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      role="tab"
                      aria-selected={item.id === active.id}
                      onClick={() => setActiveId(item.id)}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </aside>
              <div className="project-artifact-modal-viewer">
                <iframe
                  key={`expanded-${active.id}`}
                  title={`${active.title} 放大预览`}
                  src={previewUrl("scroll")}
                  sandbox={
                    active.previewKind === "model" ? "allow-scripts allow-same-origin" : undefined
                  }
                />
              </div>
            </div>,
            document.body
          )
        : null}
    </section>
  );
}

export function ProjectCallout({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <aside className="project-content-callout">
      {title ? <strong>{title}</strong> : null}
      <div>{children}</div>
    </aside>
  );
}

export function ProjectFacts({ items }: { items: Array<{ label: string; value: string }> }) {
  return (
    <dl className="project-content-facts">
      {items.map((item) => (
        <div key={item.label}>
          <dt>{item.label}</dt>
          <dd>{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function ProjectComparison({ before, after }: { before: ReactNode; after: ReactNode }) {
  return (
    <div className="project-content-comparison">
      <div>
        <span>之前</span>
        {before}
      </div>
      <div>
        <span>之后</span>
        {after}
      </div>
    </div>
  );
}
