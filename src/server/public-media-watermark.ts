import sharp from "sharp";

export const WATERMARK_STRATEGY_VERSION = "regional-contrast-v3";
export const WATERMARK_OVERALL_OPACITY = 0.64;
export const WATERMARK_DARK_RGB = [36, 53, 45] as const;
export const WATERMARK_LIGHT_RGB = [255, 255, 255] as const;

export type WatermarkInk = "light" | "dark";

export type WatermarkFrame = {
  data: Buffer;
  width: number;
  height: number;
  delayMs?: number;
};

export type WatermarkMask = {
  data: Uint8Array;
  width: number;
  height: number;
};

export type WatermarkInkScores = {
  lightScore: number;
  darkScore: number;
  totalWeight: number;
};

export type WatermarkPlan = {
  composition: "a" | "b";
  version: "v1" | "v2" | "v3";
  ink: WatermarkInk;
  asset: string;
  widthRatio: number;
  width: number;
  margin: number;
  opacity: number;
  heightRatio: number | null;
};

const ANALYSIS_CONCURRENCY = 2;
const ANALYSIS_QUEUE_LIMIT = 32;
const ANALYSIS_BUDGET_MS = 15_000;
const CACHE_LIMIT = 256;
const CACHE_TTL_MS = 5 * 60_000;

type CacheEntry = { ink: WatermarkInk; expiresAt: number };
type AnalysisTask<T> = {
  run: (signal: AbortSignal) => Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
  budgetMs: number;
  started: boolean;
  expired: boolean;
  controller?: AbortController;
  timer?: ReturnType<typeof setTimeout>;
};

const analysisQueue: Array<AnalysisTask<unknown>> = [];
const watermarkCache = new Map<string, CacheEntry>();
const watermarkInFlight = new Map<string, Promise<WatermarkInk>>();
let activeAnalyses = 0;

function startNextAnalysis() {
  if (activeAnalyses >= ANALYSIS_CONCURRENCY) return;
  const next = analysisQueue.shift();
  if (!next) return;
  if (next.expired) {
    startNextAnalysis();
    return;
  }

  activeAnalyses += 1;
  next.started = true;
  const controller = new AbortController();
  next.controller = controller;
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    if (next.timer) clearTimeout(next.timer);
    activeAnalyses = Math.max(0, activeAnalyses - 1);
    startNextAnalysis();
  };
  const work = Promise.resolve().then(() => next.run(controller.signal));
  work.then(next.resolve, next.reject);
  work.finally(release).catch(() => undefined);
}

export function runWatermarkAnalysis<T>(
  run: (signal: AbortSignal) => Promise<T>,
  budgetMs = ANALYSIS_BUDGET_MS
) {
  return new Promise<T>((resolve, reject) => {
    if (analysisQueue.length >= ANALYSIS_QUEUE_LIMIT && activeAnalyses >= ANALYSIS_CONCURRENCY) {
      reject(new Error("watermark analysis queue is full"));
      return;
    }
    const task: AnalysisTask<T> = {
      run,
      resolve,
      reject,
      budgetMs,
      started: false,
      expired: false,
    };
    task.timer = setTimeout(
      () => {
        if (task.expired) return;
        task.expired = true;
        if (task.started) {
          task.controller?.abort("watermark analysis deadline exceeded");
          task.reject(new Error("watermark analysis deadline exceeded"));
          return;
        }
        const index = analysisQueue.indexOf(task as AnalysisTask<unknown>);
        if (index >= 0) analysisQueue.splice(index, 1);
        task.reject(new Error("watermark analysis deadline exceeded"));
        startNextAnalysis();
      },
      Math.max(1, budgetMs)
    );
    analysisQueue.push(task as AnalysisTask<unknown>);
    startNextAnalysis();
  });
}

function pruneWatermarkCache(now: number) {
  for (const [key, value] of watermarkCache) {
    if (value.expiresAt <= now) watermarkCache.delete(key);
  }
  while (watermarkCache.size > CACHE_LIMIT) {
    const oldest = watermarkCache.keys().next().value;
    if (!oldest) break;
    watermarkCache.delete(oldest);
  }
}

export async function getCachedWatermarkInk(
  key: string,
  compute: (signal: AbortSignal) => Promise<WatermarkInk>
) {
  const now = Date.now();
  pruneWatermarkCache(now);
  const cached = watermarkCache.get(key);
  if (cached && cached.expiresAt > now) return cached.ink;

  const existing = watermarkInFlight.get(key);
  if (existing) return existing;

  const pending = runWatermarkAnalysis(compute);
  watermarkInFlight.set(key, pending);
  try {
    const ink = await pending;
    watermarkCache.set(key, { ink, expiresAt: Date.now() + CACHE_TTL_MS });
    pruneWatermarkCache(Date.now());
    return ink;
  } finally {
    watermarkInFlight.delete(key);
  }
}

export function resetWatermarkAnalysisStateForTests() {
  analysisQueue.length = 0;
  watermarkCache.clear();
  watermarkInFlight.clear();
  activeAnalyses = 0;
}

function removeSvgShadow(svg: string) {
  return svg.replace(/<defs[\s\S]*?<\/defs>/u, "").replace(/\sfilter="url\(#soft-shadow\)"/gu, "");
}

export async function renderWatermarkMask(svg: string, width: number): Promise<WatermarkMask> {
  const rendered = await sharp(Buffer.from(removeSvgShadow(svg)))
    .resize({ width: Math.max(1, Math.round(width)), fit: "inside" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const alpha = new Uint8Array(rendered.info.width * rendered.info.height);
  for (let index = 0, pixel = 0; index < alpha.length; index += 1, pixel += 4) {
    alpha[index] = rendered.data[pixel + 3] ?? 0;
  }
  return { data: alpha, width: rendered.info.width, height: rendered.info.height };
}

function srgbToLinear(value: number) {
  const normalized = value / 255;
  return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance(rgb: readonly [number, number, number]) {
  return (
    srgbToLinear(rgb[0]) * 0.2126 + srgbToLinear(rgb[1]) * 0.7152 + srgbToLinear(rgb[2]) * 0.0722
  );
}

function frameBackgroundRgb(data: Buffer, offset: number): [number, number, number] {
  const alpha = (data[offset + 3] ?? 255) / 255;
  const red = (data[offset] ?? 255) * alpha + 255 * (1 - alpha);
  const green = (data[offset + 1] ?? 255) * alpha + 255 * (1 - alpha);
  const blue = (data[offset + 2] ?? 255) * alpha + 255 * (1 - alpha);
  return [red, green, blue];
}

function contrastLog(
  background: readonly [number, number, number],
  ink: readonly [number, number, number],
  coverage: number
) {
  const output: [number, number, number] = [
    ink[0] * coverage + background[0] * (1 - coverage),
    ink[1] * coverage + background[1] * (1 - coverage),
    ink[2] * coverage + background[2] * (1 - coverage),
  ];
  const backgroundLuminance = relativeLuminance(background);
  const outputLuminance = relativeLuminance(output);
  const ratio =
    (Math.max(backgroundLuminance, outputLuminance) + 0.05) /
    (Math.min(backgroundLuminance, outputLuminance) + 0.05);
  return Math.log(ratio);
}

export function createWatermarkInkScores(): WatermarkInkScores {
  return { lightScore: 0, darkScore: 0, totalWeight: 0 };
}

export function accumulateWatermarkInkScore(
  scores: WatermarkInkScores,
  frame: WatermarkFrame,
  mask: WatermarkMask
) {
  if (frame.width !== mask.width || frame.height !== mask.height) {
    throw new Error("watermark analysis frame and mask dimensions differ");
  }
  const durationWeight = Math.max(1, frame.delayMs ?? 100);
  for (let pixel = 0; pixel < mask.data.length; pixel += 1) {
    const maskAlpha = (mask.data[pixel] ?? 0) / 255;
    if (maskAlpha <= 0) continue;
    const background = frameBackgroundRgb(frame.data, pixel * 4);
    const weight = durationWeight * maskAlpha;
    scores.lightScore +=
      weight * contrastLog(background, WATERMARK_LIGHT_RGB, maskAlpha * WATERMARK_OVERALL_OPACITY);
    scores.darkScore +=
      weight * contrastLog(background, WATERMARK_DARK_RGB, maskAlpha * WATERMARK_OVERALL_OPACITY);
    scores.totalWeight += weight;
  }
}

export function chooseWatermarkInkFromScores(scores: WatermarkInkScores) {
  if (scores.totalWeight <= 0) return "light" satisfies WatermarkInk;
  return scores.darkScore > scores.lightScore + 1e-6
    ? ("dark" satisfies WatermarkInk)
    : ("light" satisfies WatermarkInk);
}

export function chooseWatermarkInk(frames: readonly WatermarkFrame[], mask: WatermarkMask) {
  const scores = createWatermarkInkScores();
  for (const frame of frames) accumulateWatermarkInkScore(scores, frame, mask);
  return chooseWatermarkInkFromScores(scores);
}

export function watermarkAssetName(
  composition: "a" | "b",
  version: "v1" | "v2" | "v3",
  ink: WatermarkInk = "light"
) {
  if (version !== "v3") return `watermark-ivanli-${composition}.v1.svg`;
  return `watermark-ivanli-${composition}.${ink}.${version}.svg`;
}

export function createWatermarkPlan(params: {
  composition: "a" | "b";
  version: "v1" | "v2" | "v3";
  ink: WatermarkInk;
  dimensions: { width: number; height: number };
}) {
  const widthRatio = params.composition === "a" ? 0.07 : 0.18;
  return {
    composition: params.composition,
    version: params.version,
    ink: params.ink,
    asset: watermarkAssetName(params.composition, params.version, params.ink),
    widthRatio,
    width: Math.max(1, Math.round(params.dimensions.width * widthRatio)),
    margin: Math.max(1, Math.round(params.dimensions.width * 0.02)),
    opacity: WATERMARK_OVERALL_OPACITY,
    heightRatio: params.version === "v1" ? null : 100,
  } satisfies WatermarkPlan;
}

export function watermarkCacheKey(parts: {
  sourcePath: string;
  size: number;
  mtimeMs: number;
  ctimeMs: number;
  variant: string;
  composition: string;
}) {
  return [
    WATERMARK_STRATEGY_VERSION,
    parts.sourcePath,
    parts.size,
    parts.mtimeMs,
    parts.ctimeMs,
    parts.variant,
    parts.composition,
  ].join("|");
}

export const watermarkAnalysisBudget = {
  concurrency: ANALYSIS_CONCURRENCY,
  queueLimit: ANALYSIS_QUEUE_LIMIT,
  budgetMs: ANALYSIS_BUDGET_MS,
} as const;
