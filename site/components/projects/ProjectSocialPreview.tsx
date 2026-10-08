import {
  projectSocialPreviewAssets,
  projectSocialPreviewThemedAssets,
} from "../../generated/project-social-preview-assets";
import type { ProjectSocialPreviewAsset } from "../../lib/project-social-preview-media";
import type { ProjectCatalogItem } from "../../lib/projects";
import { cssStyle } from "../../lib/react-template";
import { toPublicSitePath } from "../../lib/runtime-urls";

interface Props {
  project: ProjectCatalogItem;
}
export default function ProjectSocialPreview(props: Props) {
  const { project } = props;
  const socialPreviewAsset = projectSocialPreviewAssets[project.slug];
  const themedSocialPreviewAsset = projectSocialPreviewThemedAssets[project.slug];
  const fallbackSocialPreviewAsset = socialPreviewAsset ?? themedSocialPreviewAsset?.light;
  const hasRenderableSocialPreview = Boolean(fallbackSocialPreviewAsset);
  const sizes =
    "(min-width: 1328px) 52.5rem, (min-width: 1200px) calc(70vw - 5.625rem), (min-width: 1024px) calc(100vw - 28rem), (min-width: 640px) calc(100vw - 6rem), calc(100vw - 2rem)";
  function toSocialPreviewSourceSet(asset: ProjectSocialPreviewAsset, format: "avif" | "webp") {
    return Object.entries(asset.sources[format])
      .map(([width, source]) => `${toPublicSitePath(source)} ${width}w`)
      .join(", ");
  }
  function toSocialPreviewFallbackSource(asset: ProjectSocialPreviewAsset) {
    return toPublicSitePath(asset.sources.webp[1280]);
  }
  function toSocialPreviewStyle(lightAsset: ProjectSocialPreviewAsset, darkAsset = lightAsset) {
    return [
      `--project-social-preview-placeholder-light:url("${lightAsset.placeholder}")`,
      `--project-social-preview-placeholder-dark:url("${darkAsset.placeholder}")`,
    ].join(";");
  }
  const socialPreviewStyle = socialPreviewAsset
    ? toSocialPreviewStyle(socialPreviewAsset)
    : themedSocialPreviewAsset
      ? toSocialPreviewStyle(themedSocialPreviewAsset.light, themedSocialPreviewAsset.dark)
      : undefined;
  return (
    <>
      {hasRenderableSocialPreview && (
        <figure className="project-social-preview" style={cssStyle(socialPreviewStyle)}>
          {socialPreviewAsset ? (
            <picture>
              <source
                type="image/avif"
                srcSet={toSocialPreviewSourceSet(socialPreviewAsset, "avif")}
                sizes={sizes}
              />
              <source
                type="image/webp"
                srcSet={toSocialPreviewSourceSet(socialPreviewAsset, "webp")}
                sizes={sizes}
              />
              <img
                className="project-social-preview-image"
                data-project-social-preview-image=""
                src={toSocialPreviewFallbackSource(socialPreviewAsset)}
                srcSet={toSocialPreviewSourceSet(socialPreviewAsset, "webp")}
                sizes={sizes}
                alt={`${project.title} 项目界面与功能概览`}
                width={socialPreviewAsset.width}
                height={socialPreviewAsset.height}
                loading="lazy"
                decoding="async"
              />
            </picture>
          ) : themedSocialPreviewAsset ? (
            <picture
              data-themed-project-social-picture=""
              data-light-avif-srcset={toSocialPreviewSourceSet(
                themedSocialPreviewAsset.light,
                "avif"
              )}
              data-dark-avif-srcset={toSocialPreviewSourceSet(
                themedSocialPreviewAsset.dark,
                "avif"
              )}
              data-light-webp-srcset={toSocialPreviewSourceSet(
                themedSocialPreviewAsset.light,
                "webp"
              )}
              data-dark-webp-srcset={toSocialPreviewSourceSet(
                themedSocialPreviewAsset.dark,
                "webp"
              )}
              data-light-src={toSocialPreviewFallbackSource(themedSocialPreviewAsset.light)}
              data-dark-src={toSocialPreviewFallbackSource(themedSocialPreviewAsset.dark)}
              data-light-placeholder={themedSocialPreviewAsset.light.placeholder}
              data-dark-placeholder={themedSocialPreviewAsset.dark.placeholder}
            >
              <source data-project-social-preview-avif="" type="image/avif" sizes={sizes} />
              <source data-project-social-preview-webp="" type="image/webp" sizes={sizes} />
              <img
                className="project-social-preview-image"
                data-project-social-preview-image=""
                sizes={sizes}
                alt={`${project.title} 项目界面与功能概览`}
                width={themedSocialPreviewAsset.light.width}
                height={themedSocialPreviewAsset.light.height}
                loading="lazy"
                decoding="async"
              />
            </picture>
          ) : null}
        </figure>
      )}
    </>
  );
}
