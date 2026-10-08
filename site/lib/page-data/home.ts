import codexVibeMonitorLogo from "../../assets/projects/logos/codex-vibe-monitor-product-mark.svg";
import kaisouMailLogo from "../../assets/projects/logos/kaisoumail-brand-symbol.png";
import kaisouMailLogoDark from "../../assets/projects/logos/kaisoumail-brand-symbol-on-dark.png";
import spotiBindLogo from "../../assets/projects/logos/spotibind-logo-monochrome.svg";
import tuckmarkLogoDark from "../../assets/projects/logos/tuckmark-mark-square-dark.svg";
import tuckmarkLogo from "../../assets/projects/logos/tuckmark-mark-square-light.svg";
import xpLogo from "../../assets/projects/logos/xp-logo-monochrome.svg";
import { getFeaturedProjects } from "../projects";
import { buildHomeTimeline, getSnapshot } from "../public-site";
import type { PageContext } from "../route-data-utils";
import { timelinePreviews, trimRouteSnapshot } from "../route-data-utils";
export async function loadhome(Astro: PageContext) {
  const snapshot = await getSnapshot();
  const timeline = timelinePreviews(buildHomeTimeline(snapshot));
  const assetVersion = snapshot.generatedAt;
  const featuredProjects = getFeaturedProjects();
  const featuredProjectLogos = {
    "codex-vibe-monitor": {
      src: codexVibeMonitorLogo.src,
      kind: "native" as const,
      label: "Codex Vibe Monitor Logo",
    },
    "spoti-bind": {
      src: spotiBindLogo.src,
      kind: "mask" as const,
      label: "SpotiBind Logo",
      colorLight: "#178243",
      colorDark: "#65d596",
    },
    kaisoumail: {
      src: kaisouMailLogo.src,
      darkSrc: kaisouMailLogoDark.src,
      kind: "native" as const,
      label: "KaisouMail Logo",
    },
    tuckmark: {
      src: tuckmarkLogo.src,
      darkSrc: tuckmarkLogoDark.src,
      kind: "native" as const,
      label: "Tuckmark Logo",
    },
    xp: {
      src: xpLogo.src,
      kind: "mask" as const,
      label: "XP Logo",
      colorLight: "#277d78",
      colorDark: "#89d8be",
    },
  } as const;
  return {
    snapshot: trimRouteSnapshot(snapshot, "home", Astro.url.pathname),
    timeline,
    assetVersion,
    featuredProjects,
    featuredProjectLogos,
  };
}
