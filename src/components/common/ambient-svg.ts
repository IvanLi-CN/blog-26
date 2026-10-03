import { AMBIENT_CURRENT_ALPHA, AMBIENT_LEAF_SCALE, createAmbientLeafPaths } from "./ambient-leaf";
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

class SvgRenderer implements AmbientRenderer {
  readonly kind = "svg" as const;

  private readonly root: HTMLElement;
  private model: AmbientMotionModel;
  private palette: AmbientPalette;
  private svg: SVGSVGElement | null = null;
  private readonly frameTime: number;

  constructor(context: AmbientRendererContext) {
    this.root = context.root;
    this.model = context.model;
    this.palette = context.palette;
    this.frameTime = context.frameTime ?? AMBIENT_STATIC_FRAME_TIME;
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
    this.root.dataset.ambientRenderer = "svg";
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
        ambientPathData(getAmbientCurrentPath(this.model, this.frameTime, current))
      );
      path.setAttribute("fill", "none");
      path.setAttribute("stroke-linecap", "round");
      path.setAttribute("stroke-width", "1.2");
      path.setAttribute("stroke", `rgb(var(--ambient-${tone}-rgb))`);
      path.setAttribute("stroke-opacity", String(AMBIENT_CURRENT_ALPHA));
      svg.append(path);
    }

    for (const seed of this.model.seeds) {
      const pose = getAmbientSeedPose(this.model, seed, this.frameTime);
      const group = svgElement("g");
      group.classList.add("nature-ambient-seed", `nature-ambient-seed-${seed.tone}`);
      group.setAttribute("data-leaf-variant", seed.variant);
      group.setAttribute(
        "transform",
        `translate(${pose.x.toFixed(2)} ${pose.y.toFixed(2)}) rotate(${(
          (pose.angle * 180) / Math.PI
        ).toFixed(2)}) scale(${(seed.size / AMBIENT_LEAF_SCALE).toFixed(6)})`
      );
      group.append(...createAmbientLeafPaths(seed.variant, `rgb(var(--ambient-${seed.tone}-rgb))`));
      svg.append(group);
    }

    this.root.replaceChildren(svg);
    this.svg = svg;
  }
}

export function createSvgRenderer(context: AmbientRendererContext): AmbientRenderer {
  return new SvgRenderer(context);
}
