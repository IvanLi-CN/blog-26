import type { ImageMetadata } from "astro";
import codexVibeMonitorMark from "../../assets/projects/logos/codex-vibe-monitor-product-mark.svg";
import octoRillDark from "../../assets/projects/logos/octo-rill-wordmark-dark.svg";
import octoRillLight from "../../assets/projects/logos/octo-rill-wordmark-light.svg";
import tavilyHikariDark from "../../assets/projects/logos/tavily-hikari-lockup-dark.svg";
import tavilyHikariLight from "../../assets/projects/logos/tavily-hikari-lockup-light.svg";
import { classList } from "../../lib/react-template";

type PanelKind = "codex-vibe-monitor" | "tavily-hikari" | "octo-rill";
interface Props {
  kind: PanelKind;
}
export default function RuntimeProjectLogo(props: Props) {
  interface LogoPair {
    label: string;
    light: ImageMetadata;
    dark: ImageMetadata;
  }
  const logos: Record<Exclude<PanelKind, "codex-vibe-monitor">, LogoPair> = {
    "tavily-hikari": {
      label: "Tavily Hikari Logo",
      light: tavilyHikariLight,
      dark: tavilyHikariDark,
    },
    "octo-rill": {
      label: "OctoRill Logo",
      light: octoRillLight,
      dark: octoRillDark,
    },
  };
  const { kind } = props;
  const logo = kind === "codex-vibe-monitor" ? null : logos[kind];
  return (
    <div
      className={classList([
        "runtime-project-logo",
        `runtime-project-logo--${kind}`,
        { "runtime-project-logo-has-dark": kind !== "codex-vibe-monitor" },
      ])}
      data-runtime-project-logo=""
      role="img"
      aria-label={logo?.label ?? "Codex Vibe Monitor Logo"}
    >
      {kind === "codex-vibe-monitor" ? (
        <span className="runtime-project-logo-lockup">
          <img className="runtime-project-logo-mark" src={codexVibeMonitorMark.src} alt="" />
          <span className="runtime-project-logo-name">
            Codex <span>Vibe</span> Monitor
          </span>
        </span>
      ) : (
        logo && (
          <>
            <img
              className="runtime-project-logo-image runtime-project-logo-image--light"
              src={logo.light.src}
              alt=""
            />
            <img
              className="runtime-project-logo-image runtime-project-logo-image--dark"
              src={logo.dark.src}
              alt=""
            />
          </>
        )
      )}
    </div>
  );
}
