import type { AmbientRenderer, AmbientRendererContext } from "./ambient-renderer";
import {
  AMBIENT_CURRENT_CYCLE_MS,
  type AmbientCanvasSize,
  type AmbientMotionModel,
  type AmbientPalette,
  type AmbientRendererKind,
  ambientColor,
  ambientPathData,
  getAmbientCurrentPath,
  getAmbientSeedPose,
} from "./ambient-scene";

const SVG_NS = "http://www.w3.org/2000/svg";

type SvgDocument = SVGSVGElement & {
  pauseAnimations?: () => void;
  unpauseAnimations?: () => void;
};

function svgElement<K extends keyof SVGElementTagNameMap>(tag: K) {
  return document.createElementNS(SVG_NS, tag) as SVGElementTagNameMap[K];
}

function leafPath() {
  return "M -0.62 0 Q 0 -0.3 0.62 0 Q 0 0.3 -0.62 0 Z M -0.78 0 L 0.76 0";
}

function appendPathAnimation(
  path: SVGPathElement,
  model: AmbientMotionModel,
  current: number,
  reducedMotion: boolean
) {
  const sampleTimes = [0, 0.25, 0.5, 0.75, 1].map(
    (fraction) => fraction * AMBIENT_CURRENT_CYCLE_MS
  );
  const values = sampleTimes
    .map((timestamp) => ambientPathData(getAmbientCurrentPath(model, timestamp, current)))
    .join(";");
  path.setAttribute("d", values.split(";")[0]);

  if (reducedMotion) return;

  const animate = svgElement("animate");
  animate.setAttribute("attributeName", "d");
  animate.setAttribute("dur", `${AMBIENT_CURRENT_CYCLE_MS}ms`);
  animate.setAttribute("repeatCount", "indefinite");
  animate.setAttribute("values", values);
  path.append(animate);
}

function appendSeedAnimation(
  group: SVGGElement,
  model: AmbientMotionModel,
  seed: AmbientMotionModel["seeds"][number],
  reducedMotion: boolean
) {
  const sampleCount = 9;
  const values = Array.from({ length: sampleCount }, (_, index) => {
    const timestamp = (seed.duration * index) / (sampleCount - 1);
    const pose = getAmbientSeedPose(model, seed, timestamp);
    return `translate(${pose.x.toFixed(2)} ${pose.y.toFixed(2)}) rotate(${(
      (pose.angle * 180) / Math.PI
    ).toFixed(2)}) scale(${seed.size.toFixed(2)})`;
  }).join(";");
  group.setAttribute("transform", values.split(";")[0]);

  if (reducedMotion) return;

  const animate = svgElement("animate");
  animate.setAttribute("attributeName", "transform");
  animate.setAttribute("dur", `${seed.duration}ms`);
  animate.setAttribute("repeatCount", "indefinite");
  animate.setAttribute("values", values);
  group.append(animate);
}

class SvgRenderer implements AmbientRenderer {
  readonly kind: AmbientRendererKind;

  private readonly root: HTMLElement;
  private readonly diagnostics: AmbientRendererContext["diagnostics"];
  private svg: SvgDocument | null = null;
  private model: AmbientMotionModel;
  private palette: AmbientPalette;
  private reducedMotion: boolean;
  private hidden = false;

  constructor(context: AmbientRendererContext, kind: AmbientRendererKind) {
    this.root = context.root;
    this.model = context.model;
    this.palette = context.palette;
    this.reducedMotion = context.reducedMotion;
    this.diagnostics = context.diagnostics;
    this.kind = kind;
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
    this.rebuild();
  }

  setReducedMotion(reducedMotion: boolean) {
    this.reducedMotion = reducedMotion;
    this.rebuild();
  }

  setVisibility(hidden: boolean) {
    this.hidden = hidden;
    if (!this.svg) return;
    if (hidden) this.svg.pauseAnimations?.();
    else this.svg.unpauseAnimations?.();
    this.diagnostics?.setVisibility(hidden);
  }

  destroy() {
    this.svg?.pauseAnimations?.();
    this.svg?.remove();
    this.svg = null;
  }

  private rebuild() {
    this.destroy();
    const svg = svgElement("svg") as SvgDocument;
    svg.classList.add("nature-ambient-svg");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");
    svg.setAttribute("viewBox", `0 0 ${this.model.width} ${this.model.height}`);
    svg.setAttribute("preserveAspectRatio", "none");

    for (let current = 0; current < 3; current += 1) {
      const path = svgElement("path");
      path.classList.add("nature-ambient-current");
      path.setAttribute("fill", "none");
      path.setAttribute(
        "stroke",
        ambientColor(this.palette, current === 1 ? "mist" : "accent", current === 1 ? 0.17 : 0.24)
      );
      path.setAttribute("stroke-linecap", "round");
      path.setAttribute("stroke-width", "1.2");
      appendPathAnimation(path, this.model, current, this.reducedMotion);
      svg.append(path);
    }

    for (const seed of this.model.seeds) {
      const group = svgElement("g");
      const path = svgElement("path");
      group.classList.add("nature-ambient-seed");
      path.setAttribute("d", leafPath());
      path.setAttribute("fill", ambientColor(this.palette, seed.tone, seed.alpha * 0.26));
      path.setAttribute("stroke", ambientColor(this.palette, seed.tone, seed.alpha));
      path.setAttribute("stroke-linecap", "round");
      path.setAttribute("stroke-width", "0.07");
      group.append(path);
      appendSeedAnimation(group, this.model, seed, this.reducedMotion);
      svg.append(group);
    }

    this.root.replaceChildren(svg);
    this.svg = svg;
    if (this.hidden) svg.pauseAnimations?.();
    this.diagnostics?.recordFrame(performance.now(), this.hidden);
  }
}

export function createSvgRenderer(
  context: AmbientRendererContext,
  kind: AmbientRendererKind
): AmbientRenderer {
  return new SvgRenderer(context, kind);
}
