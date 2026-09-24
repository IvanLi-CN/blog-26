import type { AmbientRenderer, AmbientRendererContext } from "./ambient-renderer";
import {
  AMBIENT_STATIC_FRAME_TIME,
  type AmbientCanvasSize,
  type AmbientMotionModel,
  type AmbientPalette,
  ambientPathData,
  getAmbientCurrentPath,
  getAmbientSeedPose,
} from "./ambient-scene";

const SVG_NS = "http://www.w3.org/2000/svg";

function svgElement<K extends keyof SVGElementTagNameMap>(tag: K) {
  return document.createElementNS(SVG_NS, tag) as SVGElementTagNameMap[K];
}

function leafPath() {
  return "M -0.62 0 Q 0 -0.3 0.62 0 Q 0 0.3 -0.62 0 Z M -0.78 0 L 0.76 0";
}

class SvgRenderer implements AmbientRenderer {
  readonly kind = "svg" as const;

  private readonly root: HTMLElement;
  private model: AmbientMotionModel;
  private palette: AmbientPalette;
  private svg: SVGSVGElement | null = null;

  constructor(context: AmbientRendererContext) {
    this.root = context.root;
    this.model = context.model;
    this.palette = context.palette;
  }

  mount() {
    this.rebuild();
  }

  resize(model: AmbientMotionModel, _size: AmbientCanvasSize) {
    this.model = model;
    this.rebuild();
  }

  setPalette(palette: AmbientPalette) {
    this.palette = palette;
    if (this.svg) {
      this.svg.style.setProperty("--ambient-accent-rgb", palette.accent);
      this.svg.style.setProperty("--ambient-mist-rgb", palette.mist);
    }
  }

  setReducedMotion(_reducedMotion: boolean) {
    // The SVG renderer is always a static scene.
  }

  setVisibility(_hidden: boolean) {
    // The SVG renderer has no playback loop to pause.
  }

  destroy() {
    this.svg?.remove();
    this.svg = null;
  }

  private rebuild() {
    this.destroy();
    const svg = svgElement("svg");
    svg.classList.add("nature-ambient-svg");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");
    svg.setAttribute("viewBox", `0 0 ${this.model.width} ${this.model.height}`);
    svg.setAttribute("preserveAspectRatio", "none");
    svg.style.setProperty("--ambient-accent-rgb", this.palette.accent);
    svg.style.setProperty("--ambient-mist-rgb", this.palette.mist);

    for (let current = 0; current < 3; current += 1) {
      const path = svgElement("path");
      const tone = current === 1 ? "mist" : "accent";
      path.classList.add("nature-ambient-current", `nature-ambient-current-${tone}`);
      path.setAttribute(
        "d",
        ambientPathData(getAmbientCurrentPath(this.model, AMBIENT_STATIC_FRAME_TIME, current))
      );
      path.setAttribute("fill", "none");
      path.setAttribute("stroke-linecap", "round");
      path.setAttribute("stroke-width", "1.2");
      svg.append(path);
    }

    for (const seed of this.model.seeds) {
      const pose = getAmbientSeedPose(this.model, seed, AMBIENT_STATIC_FRAME_TIME);
      const group = svgElement("g");
      const path = svgElement("path");
      group.classList.add("nature-ambient-seed", `nature-ambient-seed-${seed.tone}`);
      group.style.setProperty("--ambient-seed-fill-alpha", (seed.alpha * 0.26).toFixed(4));
      group.style.setProperty("--ambient-seed-stroke-alpha", seed.alpha.toFixed(4));
      group.setAttribute(
        "transform",
        `translate(${pose.x.toFixed(2)} ${pose.y.toFixed(2)}) rotate(${(
          (pose.angle * 180) / Math.PI
        ).toFixed(2)}) scale(${seed.size.toFixed(2)})`
      );
      path.setAttribute("d", leafPath());
      path.setAttribute("stroke-linecap", "round");
      path.setAttribute("stroke-width", "0.07");
      group.append(path);
      svg.append(group);
    }

    this.root.replaceChildren(svg);
    this.svg = svg;
  }
}

export function createSvgRenderer(context: AmbientRendererContext): AmbientRenderer {
  return new SvgRenderer(context);
}
