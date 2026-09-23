import type { AmbientCanvasSize, AmbientMotionModel, AmbientPalette } from "./ambient-scene";

export type AmbientRendererKind = "svg" | "webgpu";

export type AmbientRendererContext = {
  root: HTMLElement;
  model: AmbientMotionModel;
  palette: AmbientPalette;
  reducedMotion: boolean;
  onUnavailable?: () => void;
};

export type AmbientRenderer = {
  readonly kind: AmbientRendererKind;
  mount(): void;
  resize(model: AmbientMotionModel, size: AmbientCanvasSize): void;
  setPalette(palette: AmbientPalette): void;
  setReducedMotion(reducedMotion: boolean): void;
  setVisibility(hidden: boolean): void;
  destroy(): void;
};
