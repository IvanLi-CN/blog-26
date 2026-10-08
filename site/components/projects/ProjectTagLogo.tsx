import blogMark from "../../assets/brand/source/ivan-blog-mark.svg";
import codexMark from "../../assets/projects/logos/codex-vibe-monitor-product-mark.svg";
import kaisouLight from "../../assets/projects/logos/kaisoumail-brand-symbol.png";
import kaisouDark from "../../assets/projects/logos/kaisoumail-brand-symbol-on-dark.png";
import octoDark from "../../assets/projects/logos/octo-rill-wordmark-dark.svg";
import octoLight from "../../assets/projects/logos/octo-rill-wordmark-light.svg";
import spotibindMark from "../../assets/projects/logos/spotibind-logo-monochrome.svg";
import tavilyDark from "../../assets/projects/logos/tavily-hikari-lockup-dark.svg";
import tavilyLight from "../../assets/projects/logos/tavily-hikari-lockup-light.svg";
import tuckmarkDark from "../../assets/projects/logos/tuckmark-mark-square-dark.svg";
import tuckmarkLight from "../../assets/projects/logos/tuckmark-mark-square-light.svg";
import xpMark from "../../assets/projects/logos/xp-logo-monochrome.svg";
import { projectFallbackIcons } from "../../lib/project-fallback-icons";
import { cssStyle } from "../../lib/react-template";

interface Props {
  slug: string;
  title: string;
}
export default function ProjectTagLogo(props: Props) {
  type Asset = {
    src: string;
    darkSrc?: string;
    kind: "asset" | "mask" | "icon";
    icon?: string;
    colorLight?: string;
    colorDark?: string;
  };
  const assets: Record<string, Asset> = {
    "codex-vibe-monitor": { src: codexMark.src, kind: "asset" },
    "tavily-hikari": { src: tavilyLight.src, darkSrc: tavilyDark.src, kind: "asset" },
    kaisoumail: { src: kaisouLight.src, darkSrc: kaisouDark.src, kind: "asset" },
    "octo-rill": { src: octoLight.src, darkSrc: octoDark.src, kind: "asset" },
    "spoti-bind": {
      src: spotibindMark.src,
      kind: "mask",
      colorLight: "#178243",
      colorDark: "#65d596",
    },
    tuckmark: { src: tuckmarkLight.src, darkSrc: tuckmarkDark.src, kind: "asset" },
    xp: { src: xpMark.src, kind: "mask", colorLight: "#277d78", colorDark: "#89d8be" },
    "paste-preset": { kind: "icon", src: "", icon: "tabler:photo-edit" },
    "blog-26": { kind: "mask", src: blogMark.src, colorLight: "#277d78", colorDark: "#89d8be" },
    loadlynx: { kind: "icon", src: "", icon: "tabler:cpu" },
    "mains-aegis": { kind: "icon", src: "", icon: "tabler:battery-4" },
    "isolappurr-usb-hub": { kind: "icon", src: "", icon: "tabler:usb" },
    "flux-purr": { kind: "icon", src: "", icon: "tabler:device-desktop" },
    "iso-usb-hub": { kind: "icon", src: "", icon: "tabler:route" },
    dockrev: { kind: "icon", src: "", icon: "tabler:brand-docker" },
  };
  const { slug, title } = props;
  const asset: Asset = assets[slug] ?? { kind: "icon", src: "", icon: "tabler:box" };
  const maskStyle =
    asset.kind === "mask"
      ? `--project-logo-mask: url(${JSON.stringify(asset.src)}); --project-logo-light: ${asset.colorLight}; --project-logo-dark: ${asset.colorDark}`
      : undefined;
  return (
    <span
      className="project-tag-logo"
      data-project-logo=""
      data-logo-kind={asset.kind}
      aria-label={`${title} ${asset.kind === "icon" ? "Icon" : "Logo"}`}
      role="img"
      style={cssStyle(maskStyle)}
    >
      {asset.kind === "asset" ? (
        <>
          <img className="project-tag-logo-image project-tag-logo-light" src={asset.src} alt="" />
          {asset.darkSrc && (
            <img
              className="project-tag-logo-image project-tag-logo-dark"
              src={asset.darkSrc}
              alt=""
            />
          )}
        </>
      ) : asset.kind === "mask" ? (
        <span className="project-tag-logo-mask" aria-hidden="true"></span>
      ) : (
        <svg className="project-tag-logo-icon" viewBox="0 0 24 24" aria-hidden="true">
          <g
            dangerouslySetInnerHTML={{
              __html: projectFallbackIcons[(asset.icon ?? "tabler:box").split(":")[1]],
            }}
          />
        </svg>
      )}
    </span>
  );
}
