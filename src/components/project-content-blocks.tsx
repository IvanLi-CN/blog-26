import type { ReactNode } from "react";

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
