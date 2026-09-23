export const AMBIENT_FRAME_RATE = 24;
export const AMBIENT_FRAME_INTERVAL = 1000 / AMBIENT_FRAME_RATE;
export const AMBIENT_MAX_CANVAS_PIXELS = 1_800_000;
export const AMBIENT_WIND_TARGET_PIXELS = 3_200_000;
export const AMBIENT_MAX_DEVICE_PIXEL_RATIO = 1.25;
export const AMBIENT_MIN_WIND_SCALE = 1;
export const AMBIENT_MIN_SEED_SCALE = 0.75;
export const AMBIENT_MODEL_SEED = 0x6a09e667;

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

export const DEFAULT_AMBIENT_PALETTE: AmbientPalette = {
  accent: "124, 169, 139",
  mist: "244, 248, 244",
};

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

export type AmbientLayerCanvasSize = {
  backingWidth: number;
  backingHeight: number;
  scale: number;
  pixelCount: number;
};

export type AmbientCanvasSize = {
  cssWidth: number;
  cssHeight: number;
  wind: AmbientLayerCanvasSize;
  seeds: AmbientLayerCanvasSize;
  pixelCount: number;
};

function getAmbientLayerCanvasSize(
  width: number,
  height: number,
  preferredScale: number,
  maxPixels: number,
  minScale: number
): AmbientLayerCanvasSize {
  const pixelBudgetScale = Math.sqrt(maxPixels / (width * height));
  const budgetedScale = Math.min(preferredScale, pixelBudgetScale);
  const scale = pixelBudgetScale < minScale ? budgetedScale : Math.max(minScale, budgetedScale);
  const backingWidth = Math.max(1, Math.floor(width * scale));
  const backingHeight = Math.max(1, Math.floor(height * scale));

  return {
    backingWidth,
    backingHeight,
    scale,
    pixelCount: backingWidth * backingHeight,
  };
}

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
  const wind = getAmbientLayerCanvasSize(
    width,
    height,
    preferredScale,
    AMBIENT_WIND_TARGET_PIXELS,
    AMBIENT_MIN_WIND_SCALE
  );
  const seeds = getAmbientLayerCanvasSize(
    width,
    height,
    preferredScale,
    AMBIENT_MAX_CANVAS_PIXELS,
    AMBIENT_MIN_SEED_SCALE
  );

  return {
    cssWidth: width,
    cssHeight: height,
    wind,
    seeds,
    pixelCount: wind.pixelCount + seeds.pixelCount,
  };
}

export function shouldAnimateAmbient(documentHidden: boolean, reducedMotion: boolean) {
  return !documentHidden && !reducedMotion;
}
