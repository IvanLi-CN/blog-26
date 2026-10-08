import {
  projectPosterAssets,
  projectPosterThemedAssets,
} from "../../generated/project-poster-assets";
import type { ProjectPosterAsset } from "../../lib/project-poster-media";
import { type projectPosterFormats, projectPosterWidths } from "../../lib/project-poster-media";
import type { ProjectCatalogItem, ProjectDomain } from "../../lib/projects";
import { toPublicSitePath } from "../../lib/runtime-urls";
import "./project-poster-radius.css";
import { cssStyle } from "../../lib/react-template";

interface Props {
  project: ProjectCatalogItem;
  compact?: boolean;
  aspect?: "poster" | "hero";
  showOverlay?: boolean;
  priority?: boolean;
  fetchPriority?: "auto" | "high";
}
export default function ProjectPoster(props: Props) {
  const {
    project,
    compact = false,
    aspect = "poster",
    showOverlay = true,
    priority = false,
    fetchPriority = "auto",
  } = props;
  const domainStyleMap: Record<
    ProjectDomain,
    {
      tone: string;
      glow: string;
      panel: string;
    }
  > = {
    "developer-tools": {
      tone: "112, 168, 136",
      glow: "123, 173, 194",
      panel: "18, 34, 28",
    },
    "productivity-tools": {
      tone: "102, 154, 170",
      glow: "126, 188, 166",
      panel: "22, 35, 40",
    },
    "web-products": {
      tone: "108, 146, 184",
      glow: "140, 196, 162",
      panel: "24, 36, 44",
    },
    "hardware-product": {
      tone: "176, 128, 84",
      glow: "148, 185, 148",
      panel: "38, 31, 24",
    },
    "device-control": {
      tone: "102, 140, 176",
      glow: "118, 182, 166",
      panel: "22, 31, 40",
    },
    "operations-tools": {
      tone: "118, 156, 128",
      glow: "122, 164, 191",
      panel: "22, 32, 27",
    },
  };
  const poster = project.poster;
  const domainStyle = domainStyleMap[project.domain];
  const posterAsset = projectPosterAssets[project.slug];
  const themedPosterAsset = projectPosterThemedAssets[project.slug];
  const hasPosterMedia = Boolean(posterAsset || themedPosterAsset);
  const previewAsset = posterAsset ?? themedPosterAsset?.light;
  const sizes =
    aspect === "hero"
      ? "(min-width: 1024px) min(100vw - 4rem, 46rem), (min-width: 640px) 60vw, calc(100vw - 2rem)"
      : "(min-width: 1024px) 30vw, (min-width: 640px) 45vw, calc(100vw - 2rem)";
  const imageLoading = priority ? "eager" : "lazy";
  const imageFetchPriority = fetchPriority;
  function toPosterSourceSet(
    asset: ProjectPosterAsset,
    format: (typeof projectPosterFormats)[number]
  ) {
    return projectPosterWidths
      .map((width) => `${toPublicSitePath(asset.sources[format][width])} ${width}w`)
      .join(", ");
  }
  function toPosterFallbackSource(asset: ProjectPosterAsset) {
    return toPublicSitePath(asset.sources.webp[960]);
  }
  function toPosterPlaceholderStyle(lightAsset: ProjectPosterAsset, darkAsset = lightAsset) {
    return [
      `--project-poster-placeholder-light:url("${lightAsset.placeholder}")`,
      `--project-poster-placeholder-dark:url("${darkAsset.placeholder}")`,
    ].join(";");
  }
  const posterPlaceholderStyle = posterAsset
    ? toPosterPlaceholderStyle(posterAsset)
    : themedPosterAsset
      ? toPosterPlaceholderStyle(themedPosterAsset.light, themedPosterAsset.dark)
      : undefined;
  return (
    <div
      className={`project-poster ${compact ? "is-compact" : ""} ${aspect === "hero" ? "is-hero" : ""}`}
      style={cssStyle(
        `--project-tone-rgb:${domainStyle.tone};--project-glow-rgb:${domainStyle.glow};--project-panel-rgb:${domainStyle.panel};${posterPlaceholderStyle ?? ""}`
      )}
    >
      <div className={`project-poster-fallback pattern-${poster.pattern}`} aria-hidden="true">
        <span className="project-poster-orb project-poster-orb-primary"></span>
        <span className="project-poster-orb project-poster-orb-secondary"></span>
        <span className="project-poster-grid"></span>
        <span className="project-poster-line project-poster-line-a"></span>
        <span className="project-poster-line project-poster-line-b"></span>
        <span className="project-poster-node project-poster-node-a"></span>
        <span className="project-poster-node project-poster-node-b"></span>
        <span className="project-poster-node project-poster-node-c"></span>
        <span className="project-poster-stack project-poster-stack-a"></span>
        <span className="project-poster-stack project-poster-stack-b"></span>
      </div>

      {previewAsset && <div className="project-poster-preview" aria-hidden="true"></div>}

      {posterAsset && (
        <picture className="project-poster-media">
          <source type="image/avif" srcSet={toPosterSourceSet(posterAsset, "avif")} sizes={sizes} />
          <source type="image/webp" srcSet={toPosterSourceSet(posterAsset, "webp")} sizes={sizes} />
          <img
            className="project-poster-image"
            data-project-poster-image=""
            src={toPosterFallbackSource(posterAsset)}
            srcSet={toPosterSourceSet(posterAsset, "webp")}
            sizes={sizes}
            width={posterAsset.width}
            height={posterAsset.height}
            alt={`${project.title} 项目海报`}
            loading={imageLoading}
            fetchPriority={imageFetchPriority}
            decoding="async"
          />
        </picture>
      )}

      {themedPosterAsset && (
        <picture
          className="project-poster-media"
          data-themed-project-picture=""
          data-light-avif-srcSet={toPosterSourceSet(themedPosterAsset.light, "avif")}
          data-dark-avif-srcSet={toPosterSourceSet(themedPosterAsset.dark, "avif")}
          data-light-webp-srcSet={toPosterSourceSet(themedPosterAsset.light, "webp")}
          data-dark-webp-srcSet={toPosterSourceSet(themedPosterAsset.dark, "webp")}
          data-light-src={toPosterFallbackSource(themedPosterAsset.light)}
          data-dark-src={toPosterFallbackSource(themedPosterAsset.dark)}
          data-light-placeholder={themedPosterAsset.light.placeholder}
          data-dark-placeholder={themedPosterAsset.dark.placeholder}
        >
          <source data-project-poster-avif="" type="image/avif" sizes={sizes} />
          <source data-project-poster-webp="" type="image/webp" sizes={sizes} />
          <img
            className="project-poster-image"
            data-project-poster-image=""
            width={themedPosterAsset.light.width}
            height={themedPosterAsset.light.height}
            alt={`${project.title} 项目海报`}
            loading={imageLoading}
            fetchPriority={imageFetchPriority}
            decoding="async"
          />
        </picture>
      )}

      {showOverlay && !hasPosterMedia && (
        <div className="project-poster-copy">
          <p className="project-poster-eyebrow">{poster.eyebrow}</p>
          {!compact && <div className="project-poster-title">{project.title}</div>}
          <p className="project-poster-strapline">{poster.strapline}</p>
        </div>
      )}
    </div>
  );
}
