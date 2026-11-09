"use client";

import { type ReactNode, useState } from "react";

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

export function ProjectArtifactTabs({ items }: { items: ProjectArtifact[] }) {
  const [activeId, setActiveId] = useState(items[0]?.id ?? "");
  const active = items.find((item) => item.id === activeId) ?? items[0];

  if (!active) return null;

  const panelId = `project-artifact-panel-${active.id}`;

  return (
    <div className="project-artifact-tabs">
      <div className="project-artifact-tabs-list" role="tablist" aria-label="工程文件类型">
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
      </div>
      <div
        id={panelId}
        className="project-artifact-panel"
        role="tabpanel"
        aria-labelledby={`project-artifact-tab-${active.id}`}
      >
        <div className="project-artifact-preview">
          <iframe
            key={active.id}
            title={`${active.title} 预览`}
            src={active.previewUrl}
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
    </div>
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
