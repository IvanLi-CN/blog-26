import {
  AMBIENT_FRAME_INTERVAL,
  type AmbientCanvasSize,
  type AmbientMotionModel,
  type AmbientPalette,
  ambientColor,
  getAmbientSeedPose,
} from "./ambient-scene";

export type CanvasRendererContext = {
  root: HTMLElement;
  model: AmbientMotionModel;
  palette: AmbientPalette;
  reducedMotion: boolean;
};

function createCanvas(className: string) {
  const canvas = document.createElement("canvas");
  canvas.className = className;
  canvas.setAttribute("aria-hidden", "true");
  return canvas;
}

class CanvasRenderer {
  private readonly root: HTMLElement;
  private readonly currentCanvas = createCanvas(
    "nature-ambient-canvas nature-ambient-canvas-current"
  );
  private readonly seedCanvas = createCanvas("nature-ambient-canvas nature-ambient-canvas-seed");
  private readonly spriteCanvases = new Map<string, HTMLCanvasElement>();
  private currentContext: CanvasRenderingContext2D | null = null;
  private seedContext: CanvasRenderingContext2D | null = null;
  private model: AmbientMotionModel;
  private palette: AmbientPalette;
  private size: AmbientCanvasSize | null = null;
  private reducedMotion: boolean;
  private hidden = false;
  private timer: number | null = null;
  private raf: number | null = null;
  private running = false;

  constructor(context: CanvasRendererContext) {
    this.root = context.root;
    this.model = context.model;
    this.palette = context.palette;
    this.reducedMotion = context.reducedMotion;
  }

  mount() {
    this.currentContext = this.currentCanvas.getContext("2d", { desynchronized: true });
    this.seedContext = this.seedCanvas.getContext("2d", { desynchronized: true });
    this.root.replaceChildren(this.currentCanvas, this.seedCanvas);
    this.rebuildSprites();
    this.syncPlayback();
  }

  resize(model: AmbientMotionModel, size: AmbientCanvasSize) {
    this.model = model;
    this.size = size;
    for (const canvas of [this.currentCanvas, this.seedCanvas]) {
      canvas.width = size.backingWidth;
      canvas.height = size.backingHeight;
      canvas.style.width = `${size.cssWidth}px`;
      canvas.style.height = `${size.cssHeight}px`;
    }
    this.currentContext?.setTransform(size.scale, 0, 0, size.scale, 0, 0);
    this.seedContext?.setTransform(size.scale, 0, 0, size.scale, 0, 0);
    this.rebuildSprites();
    this.syncPlayback();
  }

  setPalette(palette: AmbientPalette) {
    this.palette = palette;
    this.rebuildSprites();
    this.render(performance.now());
  }

  setReducedMotion(reducedMotion: boolean) {
    this.reducedMotion = reducedMotion;
    this.syncPlayback();
  }

  setVisibility(hidden: boolean) {
    this.hidden = hidden;
    this.syncPlayback();
  }

  destroy() {
    this.stop();
    this.currentCanvas.remove();
    this.seedCanvas.remove();
    this.spriteCanvases.clear();
  }

  private stop() {
    this.running = false;
    if (this.timer !== null) window.clearTimeout(this.timer);
    if (this.raf !== null) window.cancelAnimationFrame(this.raf);
    this.timer = null;
    this.raf = null;
  }

  private syncPlayback() {
    this.stop();
    if (this.hidden) return;
    this.render(performance.now());
    if (!this.hidden && !this.reducedMotion) {
      this.running = true;
      this.schedule();
    }
  }

  private schedule() {
    if (!this.running) return;
    this.timer = window.setTimeout(() => {
      this.timer = null;
      this.raf = window.requestAnimationFrame((timestamp) => {
        this.raf = null;
        if (!this.running) return;
        this.render(timestamp);
        this.schedule();
      });
    }, AMBIENT_FRAME_INTERVAL);
  }

  private rebuildSprites() {
    this.spriteCanvases.clear();
    for (const tone of ["accent", "mist"] as const) {
      const canvas = document.createElement("canvas");
      canvas.width = 128;
      canvas.height = 80;
      const context = canvas.getContext("2d");
      if (!context) continue;
      context.translate(64, 40);
      context.lineCap = "round";
      context.lineWidth = 2.2;
      context.strokeStyle = ambientColor(this.palette, tone, 0.34);
      context.fillStyle = ambientColor(this.palette, tone, 0.09);
      context.beginPath();
      context.moveTo(-40, 0);
      context.quadraticCurveTo(0, -19, 40, 0);
      context.quadraticCurveTo(0, 19, -40, 0);
      context.fill();
      context.stroke();
      context.beginPath();
      context.moveTo(-50, 0);
      context.lineTo(49, 0);
      context.stroke();
      this.spriteCanvases.set(tone, canvas);
    }
  }

  private render(timestamp: number) {
    if (!this.currentContext || !this.seedContext || !this.size) return;
    const width = this.model.width;
    const height = this.model.height;
    const current = this.currentContext;
    const seeds = this.seedContext;

    current.clearRect(0, 0, width, height);
    current.lineCap = "round";
    current.lineWidth = 1.2;
    const phase = timestamp / 6_000;
    for (let index = 0; index < 3; index += 1) {
      const baseline = height * (0.18 + index * 0.29);
      const amplitude = Math.max(18, height * (0.035 + index * 0.006));
      current.strokeStyle = ambientColor(
        this.palette,
        index === 1 ? "mist" : "accent",
        index === 1 ? 0.17 : 0.24
      );
      current.beginPath();
      for (let x = -96; x <= width + 96; x += 72) {
        const progress = x / Math.max(width, 1);
        const y =
          baseline +
          Math.sin(progress * Math.PI * 2.4 + phase + index * 1.5) * amplitude +
          Math.cos(progress * Math.PI * 1.2 - phase * 0.7) * amplitude * 0.35;
        if (x === -96) current.moveTo(x, y);
        else current.lineTo(x, y);
      }
      current.stroke();
    }

    seeds.clearRect(0, 0, width, height);
    for (const seed of this.model.seeds) {
      const pose = getAmbientSeedPose(this.model, seed, timestamp);
      const sprite = this.spriteCanvases.get(seed.tone);
      if (!sprite) continue;
      seeds.save();
      seeds.translate(pose.x, pose.y);
      seeds.rotate(pose.angle);
      seeds.globalAlpha = seed.alpha / 0.34;
      seeds.drawImage(sprite, -seed.size * 0.8, -seed.size * 0.5, seed.size * 1.6, seed.size);
      seeds.restore();
    }
    seeds.globalAlpha = 1;
  }
}

export function createCanvasRenderer(context: CanvasRendererContext) {
  return new CanvasRenderer(context);
}
