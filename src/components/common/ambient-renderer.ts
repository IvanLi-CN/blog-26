import { createCanvasRenderer } from "./ambient-canvas";
import type {
  AmbientCanvasSize,
  AmbientDiagnostics,
  AmbientMotionModel,
  AmbientPalette,
  AmbientRendererKind,
} from "./ambient-scene";
import { createSvgRenderer } from "./ambient-svg";
import { createWebGpuRenderer } from "./ambient-webgpu";

export type AmbientRendererRequest = "svg" | "canvas" | "webgpu";

export type AmbientRendererContext = {
  root: HTMLElement;
  model: AmbientMotionModel;
  palette: AmbientPalette;
  reducedMotion: boolean;
  diagnostics: AmbientDiagnostics | null;
};

export type AmbientRenderer = {
  readonly kind: AmbientRendererKind;
  mount(): void | Promise<void>;
  resize(model: AmbientMotionModel, size: AmbientCanvasSize): void;
  setPalette(palette: AmbientPalette): void;
  setReducedMotion(reducedMotion: boolean): void;
  setVisibility(hidden: boolean): void;
  destroy(): void;
};

export async function createAmbientRenderer(
  requested: AmbientRendererRequest,
  context: AmbientRendererContext
): Promise<AmbientRenderer> {
  if (requested === "webgpu") {
    const webGpu = await createWebGpuRenderer(context);
    if (webGpu) return webGpu;

    context.diagnostics?.setActiveRenderer("svg-fallback");
    return createSvgRenderer(context, "svg-fallback");
  }

  if (requested === "svg") return createSvgRenderer(context, "svg");
  return createCanvasRenderer(context);
}
