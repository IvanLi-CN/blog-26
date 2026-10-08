import cvmBackground from "../../assets/projects/runtime-backgrounds/codex-vibe-monitor-art.webp";
import octoBackground from "../../assets/projects/runtime-backgrounds/octo-rill-art.webp";
import hikariBackground from "../../assets/projects/runtime-backgrounds/tavily-hikari-art.webp";

type PanelKind = "codex-vibe-monitor" | "tavily-hikari" | "octo-rill";
interface Props {
  kind: PanelKind;
}
export default function RuntimePanelAtmosphere(props: Props) {
  const { kind } = props;
  const backgroundByKind = {
    "codex-vibe-monitor": cvmBackground,
    "tavily-hikari": hikariBackground,
    "octo-rill": octoBackground,
  } as const;
  const background = backgroundByKind[kind];
  return (
    <img
      className={`runtime-panel-atmosphere runtime-panel-atmosphere--${kind}`}
      src={background.src}
      width={background.width}
      height={background.height}
      alt=""
      aria-hidden="true"
      data-runtime-background=""
      data-runtime-background-kind={kind}
      loading="eager"
      decoding="async"
    />
  );
}
