export const AMBIENT_FRAME_RATE = 24;
export const AMBIENT_FRAME_INTERVAL = 1000 / AMBIENT_FRAME_RATE;
export const AMBIENT_MAX_CANVAS_PIXELS = 1_800_000;
export const AMBIENT_MAX_DEVICE_PIXEL_RATIO = 1.25;
export const AMBIENT_MODEL_SEED = 0x6a09e667;
export const AMBIENT_CURRENT_CYCLE_MS = Math.PI * 2 * 6_000;

export type AmbientTone = "accent" | "mist";

export type AmbientPalette = {
  accent: string;
  mist: string;
};

export type AmbientSeed = {
  lane: number;
  offset: number;
  size: number;
  duration: number;
  phase: number;
  alpha: number;
  tone: AmbientTone;
};

export type AmbientPoint = {
  x: number;
  y: number;
};

export type AmbientMotionModel = {
  width: number;
  height: number;
  seeds: AmbientSeed[];
  seed: number;
};

export type AmbientSeedPose = AmbientPoint & {
  angle: number;
  progress: number;
};

export type AmbientRendererKind = "svg" | "canvas" | "webgpu" | "svg-fallback";

export type AmbientBenchmarkState = {
  requestedRenderer: AmbientRendererKind;
  activeRenderer: AmbientRendererKind;
  frames: number;
  hiddenFrames: number;
  frameTimes: number[];
  visibilityChanges: Array<{ hidden: boolean; at: number }>;
  backingPixels: number;
  backingSize: { width: number; height: number };
};

export type AmbientDiagnostics = {
  setActiveRenderer(kind: AmbientRendererKind): void;
  setBackingSize(width: number, height: number): void;
  setVisibility(hidden: boolean): void;
  recordFrame(timestamp: number, hidden: boolean): void;
};

export const DEFAULT_AMBIENT_PALETTE: AmbientPalette = {
  accent: "124, 169, 139",
  mist: "244, 248, 244",
};

declare global {
  interface Window {
    __ambientBenchmark?: AmbientBenchmarkState;
  }
}

type Random = () => number;

function createRandom(seed: number): Random {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

export function createAmbientMotionModel(
  width: number,
  height: number,
  seed = AMBIENT_MODEL_SEED
): AmbientMotionModel {
  const random = createRandom(seed ^ Math.round(width) ^ Math.round(height));
  const count = width < 640 ? 7 : 12;
  const seeds = Array.from({ length: count }, () => ({
    lane: random(),
    offset: random(),
    size: 16 + random() * 22,
    duration: 26_000 + random() * 18_000,
    phase: random() * Math.PI * 2,
    alpha: 0.22 + random() * 0.17,
    tone: random() > 0.3 ? ("accent" as const) : ("mist" as const),
  }));

  return {
    width: Math.max(1, Math.round(width)),
    height: Math.max(1, Math.round(height)),
    seeds,
    seed,
  };
}

export function getAmbientCurrentPath(
  model: AmbientMotionModel,
  timestamp: number,
  current: number
): AmbientPoint[] {
  const phase = timestamp / 6_000;
  const baseline = model.height * (0.18 + current * 0.29);
  const amplitude = Math.max(18, model.height * (0.035 + current * 0.006));
  const points: AmbientPoint[] = [];

  for (let x = -96; x <= model.width + 96; x += 72) {
    const progress = x / Math.max(model.width, 1);
    points.push({
      x,
      y:
        baseline +
        Math.sin(progress * Math.PI * 2.4 + phase + current * 1.5) * amplitude +
        Math.cos(progress * Math.PI * 1.2 - phase * 0.7) * amplitude * 0.35,
    });
  }

  return points;
}

export function getAmbientSeedPose(
  model: AmbientMotionModel,
  seed: AmbientSeed,
  timestamp: number
): AmbientSeedPose {
  const progress = (timestamp / seed.duration + seed.offset) % 1;
  const wave = Math.sin(progress * Math.PI * 2.4 + seed.phase + timestamp / 8_000);

  return {
    x: -seed.size + progress * (model.width + seed.size * 2),
    y: model.height * (0.12 + seed.lane * 0.76) + wave * model.height * 0.045,
    angle: wave * 0.22 + 0.14,
    progress,
  };
}

export function ambientColor(palette: AmbientPalette, tone: AmbientTone, alpha: number) {
  return `rgba(${palette[tone]}, ${alpha})`;
}

export function ambientPathData(points: AmbientPoint[]) {
  return points
    .map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
    .join(" ");
}

export type AmbientCanvasSize = {
  cssWidth: number;
  cssHeight: number;
  backingWidth: number;
  backingHeight: number;
  scale: number;
  pixelCount: number;
};

export function getAmbientCanvasSize(
  cssWidth: number,
  cssHeight: number,
  devicePixelRatio: number
): AmbientCanvasSize {
  const width = Math.max(1, Math.round(cssWidth));
  const height = Math.max(1, Math.round(cssHeight));
  const preferredScale = Math.min(
    Math.max(Number.isFinite(devicePixelRatio) ? devicePixelRatio : 1, 1),
    AMBIENT_MAX_DEVICE_PIXEL_RATIO
  );
  const pixelBudgetScale = Math.sqrt(AMBIENT_MAX_CANVAS_PIXELS / (width * height));
  const scale = Math.min(preferredScale, pixelBudgetScale);
  const backingWidth = Math.max(1, Math.floor(width * scale));
  const backingHeight = Math.max(1, Math.floor(height * scale));

  return {
    cssWidth: width,
    cssHeight: height,
    backingWidth,
    backingHeight,
    scale,
    pixelCount: backingWidth * backingHeight,
  };
}

export function shouldAnimateAmbient(documentHidden: boolean, reducedMotion: boolean) {
  return !documentHidden && !reducedMotion;
}

export function createAmbientDiagnostics(
  enabled: boolean,
  requestedRenderer: AmbientRendererKind
): AmbientDiagnostics | null {
  if (!enabled || typeof window === "undefined") return null;

  const state: AmbientBenchmarkState = {
    requestedRenderer,
    activeRenderer: requestedRenderer,
    frames: 0,
    hiddenFrames: 0,
    frameTimes: [],
    visibilityChanges: [],
    backingPixels: 0,
    backingSize: { width: 0, height: 0 },
  };

  window.__ambientBenchmark = state;

  return {
    setActiveRenderer(kind) {
      state.activeRenderer = kind;
      window.__ambientBenchmark = { ...state };
    },
    setBackingSize(width, height) {
      state.backingSize = { width, height };
      state.backingPixels = width * height;
      window.__ambientBenchmark = { ...state };
    },
    setVisibility(hidden) {
      state.visibilityChanges.push({ hidden, at: performance.now() });
      window.__ambientBenchmark = { ...state };
    },
    recordFrame(timestamp, hidden) {
      state.frames += 1;
      if (hidden) state.hiddenFrames += 1;
      state.frameTimes.push(timestamp);
      if (state.frameTimes.length > 720) state.frameTimes.shift();
      window.__ambientBenchmark = { ...state, frameTimes: [...state.frameTimes] };
    },
  };
}
