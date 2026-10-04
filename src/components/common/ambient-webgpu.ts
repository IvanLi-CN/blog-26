import { createAmbientLeafAtlas } from "./ambient-leaf";
import {
  AMBIENT_FRAME_INTERVAL_MS,
  AMBIENT_SEED_BUFFER_BYTES,
  type AmbientGpuLimits,
  type AmbientRenderTier,
  ambientGpuLimitsSupportSize,
  ambientPerformanceScore,
  ambientRenderTierForScore,
} from "./ambient-performance";
import type { AmbientRenderer, AmbientRendererContext } from "./ambient-renderer";
import {
  type AmbientCanvasSize,
  type AmbientMotionModel,
  type AmbientPalette,
  getAmbientWebGpuCanvasSize,
} from "./ambient-scene";

const BUFFER_STORAGE = 0x80;
const BUFFER_UNIFORM = 0x40;
const BUFFER_COPY_DST = 0x08;
const TEXTURE_USAGE = 0x04 | 0x02 | 0x10; // binding, copy destination, render attachment
const STAGE_VERTEX = 0x1;
const STAGE_FRAGMENT = 0x2;

type GpuBufferLike = { destroy(): void };
type GpuTextureLike = { createView(): unknown; destroy(): void };
type GpuPassLike = {
  setPipeline(pipeline: unknown): void;
  setBindGroup(index: number, bindGroup: unknown): void;
  draw(vertexCount: number, instanceCount?: number): void;
  end(): void;
};
type GpuEncoderLike = { beginRenderPass(descriptor: unknown): GpuPassLike; finish(): unknown };
type GpuDeviceLike = {
  queue: {
    writeBuffer(buffer: GpuBufferLike, offset: number, data: ArrayBuffer | ArrayBufferView): void;
    copyExternalImageToTexture(source: unknown, destination: unknown, size: unknown): void;
    submit(commands: readonly unknown[]): void;
  };
  limits?: AmbientGpuLimits;
  lost?: Promise<unknown>;
  destroy?(): void;
  pushErrorScope?(filter: string): void;
  popErrorScope?(): Promise<unknown | null>;
  createShaderModule(descriptor: { code: string }): unknown;
  createBuffer(descriptor: { size: number; usage: number }): GpuBufferLike;
  createTexture(descriptor: unknown): GpuTextureLike;
  createSampler(descriptor: unknown): unknown;
  createBindGroupLayout(descriptor: unknown): unknown;
  createPipelineLayout(descriptor: unknown): unknown;
  createBindGroup(descriptor: unknown): unknown;
  createRenderPipeline(descriptor: unknown): unknown;
  createCommandEncoder(): GpuEncoderLike;
};
type GpuCanvasContextLike = {
  configure(config: unknown): void;
  unconfigure?(): void;
  getCurrentTexture(): GpuTextureLike;
};
type GpuNamespaceLike = {
  requestAdapter(options?: { powerPreference?: "high-performance" }): Promise<{
    requestDevice(): Promise<GpuDeviceLike>;
    limits?: AmbientGpuLimits;
  } | null>;
  getPreferredCanvasFormat?: () => string;
};

const shaderCode = `
struct Uniforms {
  resolution: vec2f,
  time: f32,
  tier: f32,
  accent: vec4f,
  mist: vec4f,
  atlas: vec4f,
};
struct Seed {
  lane: f32,
  offset: f32,
  size: f32,
  duration: f32,
  phase: f32,
  rotation: f32,
  tone: f32,
  variant: f32,
};
@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var<storage, read> seeds: array<Seed>;
@group(0) @binding(2) var leafAtlas: texture_2d<f32>;
@group(0) @binding(3) var leafSampler: sampler;
struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) color: vec4f,
  @location(1) uv: vec2f,
};
fn clip(point: vec2f) -> vec2f {
  return vec2f(point.x / uniforms.resolution.x * 2.0 - 1.0, 1.0 - point.y / uniforms.resolution.y * 2.0);
}
@vertex
fn currentVertex(@builtin(vertex_index) vertexIndex: u32, @builtin(instance_index) current: u32) -> VertexOutput {
  let x = -96.0 + f32(vertexIndex) / 255.0 * (uniforms.resolution.x + 192.0);
  let progress = x / max(uniforms.resolution.x, 1.0);
  let baseline = uniforms.resolution.y * (0.18 + f32(current) * 0.29);
  let amplitude = max(18.0, uniforms.resolution.y * (0.035 + f32(current) * 0.006));
  let phase = uniforms.time / 6000.0;
  let y = baseline + sin(progress * 3.1415926 * 2.4 + phase + f32(current) * 1.5) * amplitude + cos(progress * 3.1415926 * 1.2 - phase * 0.7) * amplitude * 0.35;
  var output: VertexOutput;
  output.position = vec4f(clip(vec2f(x, y)), 0.0, 1.0);
  output.color = select(uniforms.accent, uniforms.mist, current == 1u) * vec4f(1.0, 1.0, 1.0, 0.035);
  output.uv = vec2f(0.0);
  return output;
}
@vertex
fn leafVertex(@builtin(vertex_index) vertexIndex: u32, @builtin(instance_index) seedIndex: u32) -> VertexOutput {
  let seed = seeds[seedIndex];
  let progress = fract(uniforms.time / seed.duration + seed.offset);
  let wave = sin(progress * 3.1415926 * 2.4 + seed.phase + uniforms.time / 8000.0);
  let x = -seed.size + progress * (uniforms.resolution.x + seed.size * 2.0);
  let y = uniforms.resolution.y * (0.12 + seed.lane * 0.76) + wave * uniforms.resolution.y * 0.045;
  let angle = wave * 0.22 + seed.rotation;
  let corners = array<vec2f, 6>(vec2f(0.0, 0.0), vec2f(1.0, 0.0), vec2f(0.0, 1.0), vec2f(0.0, 1.0), vec2f(1.0, 0.0), vec2f(1.0, 1.0));
  let corner = corners[vertexIndex];
  let local = (corner * vec2f(128.0, 84.0) - vec2f(64.0, 42.0)) * seed.size / 90.0;
  let rotated = vec2f(local.x * cos(angle) - local.y * sin(angle), local.x * sin(angle) + local.y * cos(angle));
  var output: VertexOutput;
  output.position = vec4f(clip(vec2f(x, y) + rotated), 0.0, 1.0);
  output.color = select(uniforms.accent, uniforms.mist, seed.tone > 0.5);
  output.uv = vec2f(seed.variant, uniforms.tier) * 0.5 + uniforms.atlas.zw + corner * uniforms.atlas.xy;
  return output;
}
@fragment
fn currentFragment(input: VertexOutput) -> @location(0) vec4f {
  return input.color;
}
@fragment
fn leafFragment(input: VertexOutput) -> @location(0) vec4f {
  let alpha = textureSample(leafAtlas, leafSampler, input.uv).a;
  return vec4f(input.color.rgb, alpha);
}
`;
function parseRgb(value: string, fallback: [number, number, number]): [number, number, number] {
  const values = value.split(",").map((part) => Number(part.trim()));
  if (values.length !== 3 || values.some((part) => !Number.isFinite(part))) return fallback;
  return values.map((part) => part / 255) as [number, number, number];
}

function uniformData(
  palette: AmbientPalette,
  model: AmbientMotionModel,
  timestamp: number,
  tier: number,
  atlas: [number, number, number, number]
) {
  const accent = parseRgb(palette.accent, [0.49, 0.66, 0.55]);
  const mist = parseRgb(palette.mist, [0.96, 0.97, 0.96]);
  return new Float32Array([
    model.width,
    model.height,
    timestamp,
    tier,
    ...accent,
    1,
    ...mist,
    1,
    ...atlas,
  ]);
}

function seedData(model: AmbientMotionModel) {
  const data = new Float32Array(12 * 8);
  model.seeds.forEach((seed, index) => {
    data.set(
      [
        seed.lane,
        seed.offset,
        seed.size,
        seed.duration,
        seed.phase,
        seed.rotation,
        seed.tone === "mist" ? 1 : 0,
        seed.variant === "willow" ? 1 : 0,
      ],
      index * 8
    );
  });
  return data;
}

function effectiveLimits(
  adapter: AmbientGpuLimits | undefined,
  device: AmbientGpuLimits | undefined
): AmbientGpuLimits {
  const minimum = (a: number | undefined, b: number | undefined) =>
    a === undefined ? b : b === undefined ? a : Math.min(a, b);
  return {
    maxTextureDimension2D: minimum(adapter?.maxTextureDimension2D, device?.maxTextureDimension2D),
    maxStorageBufferBindingSize: minimum(
      adapter?.maxStorageBufferBindingSize,
      device?.maxStorageBufferBindingSize
    ),
  };
}

class WebGpuRenderer implements AmbientRenderer {
  readonly kind = "webgpu" as const;
  private readonly uniformBuffer: GpuBufferLike;
  private readonly seedBuffer: GpuBufferLike;
  private readonly layout: unknown;
  private readonly sampler: unknown;
  private readonly currentPipeline: unknown;
  private readonly leafPipeline: unknown;
  private readonly loadAtlas: NonNullable<AmbientRendererContext["loadLeafAtlas"]>;
  private bindGroup: unknown;
  private texture: GpuTextureLike | null = null;
  private model: AmbientMotionModel;
  private palette: AmbientPalette;
  private size: AmbientCanvasSize | null = null;
  private atlasScale: number | null = null;
  private atlasUv: [number, number, number, number] = [0, 0, 0, 0];
  private tier: AmbientRenderTier = "conservative";
  private reducedMotion: boolean;
  private hidden = document.hidden;
  private raf: number | null = null;
  private lastRenderTime: number | null = null;
  private destroyed = false;
  private mounted = false;
  private resourcesReleased = false;
  private failed = false;
  private resizeGeneration = 0;

  static async create(input: AmbientRendererContext): Promise<WebGpuRenderer | null> {
    if (input.reducedMotion) return null;
    const gpu = (navigator as unknown as { gpu?: GpuNamespaceLike }).gpu;
    if (!gpu) return null;
    const adapter = await gpu.requestAdapter({ powerPreference: "high-performance" });
    if (!adapter) return null;
    const device = await adapter.requestDevice();
    let renderer: WebGpuRenderer | undefined;
    let scoped = false;
    try {
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("webgpu") as unknown as GpuCanvasContextLike | null;
      if (!context) {
        device.destroy?.();
        return null;
      }
      if (device.pushErrorScope && device.popErrorScope) {
        device.pushErrorScope("validation");
        scoped = true;
      }
      renderer = new WebGpuRenderer(
        input,
        canvas,
        context,
        device,
        gpu.getPreferredCanvasFormat?.() ?? "bgra8unorm",
        effectiveLimits(adapter.limits, device.limits)
      );
      if (scoped) {
        scoped = false;
        if (await device.popErrorScope?.()) throw new Error("Leaf pipeline validation failed");
      }
      await renderer.prepare(
        input.model,
        input.size ??
          getAmbientWebGpuCanvasSize(
            input.model.width,
            input.model.height,
            window.devicePixelRatio || 1
          )
      );
      if (renderer.failed || renderer.destroyed) {
        renderer.destroy();
        return null;
      }
      return renderer;
    } catch {
      if (scoped) {
        try {
          await device.popErrorScope?.();
        } catch {
          /* Resource cleanup remains mandatory. */
        }
      }
      renderer?.destroy();
      if (!renderer) device.destroy?.();
      return null;
    }
  }

  private constructor(
    private readonly input: AmbientRendererContext,
    private readonly canvas: HTMLCanvasElement,
    private readonly context: GpuCanvasContextLike,
    private readonly device: GpuDeviceLike,
    private readonly format: string,
    private readonly limits: AmbientGpuLimits
  ) {
    this.model = input.model;
    this.palette = input.palette;
    this.reducedMotion = input.reducedMotion;
    this.loadAtlas = input.loadLeafAtlas ?? createAmbientLeafAtlas;
    let uniformBuffer: GpuBufferLike | undefined;
    let seedBuffer: GpuBufferLike | undefined;
    try {
      const shader = device.createShaderModule({ code: shaderCode });
      this.layout = device.createBindGroupLayout({
        entries: [
          { binding: 0, visibility: STAGE_VERTEX | STAGE_FRAGMENT, buffer: { type: "uniform" } },
          { binding: 1, visibility: STAGE_VERTEX, buffer: { type: "read-only-storage" } },
          { binding: 2, visibility: STAGE_FRAGMENT, texture: { sampleType: "float" } },
          { binding: 3, visibility: STAGE_FRAGMENT, sampler: { type: "filtering" } },
        ],
      });
      const pipelineLayout = device.createPipelineLayout({ bindGroupLayouts: [this.layout] });
      uniformBuffer = device.createBuffer({ size: 64, usage: BUFFER_UNIFORM | BUFFER_COPY_DST });
      seedBuffer = device.createBuffer({
        size: AMBIENT_SEED_BUFFER_BYTES,
        usage: BUFFER_STORAGE | BUFFER_COPY_DST,
      });
      this.uniformBuffer = uniformBuffer;
      this.seedBuffer = seedBuffer;
      this.sampler = device.createSampler({
        magFilter: "linear",
        minFilter: "linear",
        addressModeU: "clamp-to-edge",
        addressModeV: "clamp-to-edge",
      });
      const target = {
        format,
        blend: {
          color: { srcFactor: "src-alpha", dstFactor: "one-minus-src-alpha", operation: "add" },
          alpha: { srcFactor: "one", dstFactor: "one-minus-src-alpha", operation: "add" },
        },
      };
      this.currentPipeline = device.createRenderPipeline({
        layout: pipelineLayout,
        vertex: { module: shader, entryPoint: "currentVertex" },
        fragment: { module: shader, entryPoint: "currentFragment", targets: [target] },
        primitive: { topology: "line-strip" },
      });
      this.leafPipeline = device.createRenderPipeline({
        layout: pipelineLayout,
        vertex: { module: shader, entryPoint: "leafVertex" },
        fragment: { module: shader, entryPoint: "leafFragment", targets: [target] },
        primitive: { topology: "triangle-list" },
      });
    } catch (error) {
      uniformBuffer?.destroy();
      seedBuffer?.destroy();
      throw error;
    }
    device.lost?.then(
      () => this.fail(),
      () => this.fail()
    );
  }

  mount() {
    if (this.destroyed || this.failed) return;
    this.mounted = true;
    this.hidden = document.hidden;
    this.input.root.dataset.ambientRenderer = "webgpu";
    this.canvas.className = "nature-ambient-webgpu";
    this.canvas.setAttribute("aria-hidden", "true");
    this.canvas.dataset.ambientTier = this.tier;
    this.input.root.replaceChildren(this.canvas);
    this.syncPlayback();
  }

  resize(model: AmbientMotionModel, size: AmbientCanvasSize) {
    if (this.destroyed || this.failed) return;
    void this.prepare(model, size).catch(() => this.fail());
  }

  private async prepare(model: AmbientMotionModel, size: AmbientCanvasSize) {
    const generation = ++this.resizeGeneration;
    if (!ambientGpuLimitsSupportSize(this.limits, size)) {
      this.fail();
      return;
    }
    const tier =
      this.input.renderTier ??
      ambientRenderTierForScore(ambientPerformanceScore(this.limits, size));
    if (this.atlasScale === size.scale && this.texture) {
      this.applySize(model, size, tier);
      return;
    }
    const atlas = await this.loadAtlas(size.scale);
    let texture: GpuTextureLike | undefined;
    let scoped = false;
    try {
      if (this.destroyed || this.failed || generation !== this.resizeGeneration) return;
      if (this.device.pushErrorScope && this.device.popErrorScope) {
        this.device.pushErrorScope("validation");
        scoped = true;
      }
      texture = this.device.createTexture({
        size: [atlas.size.width, atlas.size.height],
        format: "rgba8unorm",
        usage: TEXTURE_USAGE,
      });
      this.device.queue.copyExternalImageToTexture(
        { source: atlas.source },
        { texture, premultipliedAlpha: false },
        { width: atlas.size.width, height: atlas.size.height }
      );
      const bindGroup = this.device.createBindGroup({
        layout: this.layout,
        entries: [
          { binding: 0, resource: { buffer: this.uniformBuffer } },
          { binding: 1, resource: { buffer: this.seedBuffer } },
          { binding: 2, resource: texture.createView() },
          { binding: 3, resource: this.sampler },
        ],
      });
      if (scoped) {
        scoped = false;
        if (await this.device.popErrorScope?.()) throw new Error("Leaf atlas validation failed");
      }
      if (this.destroyed || this.failed || generation !== this.resizeGeneration) return;
      this.texture?.destroy();
      this.texture = texture;
      texture = undefined;
      this.bindGroup = bindGroup;
      this.atlasScale = size.scale;
      this.atlasUv = [
        atlas.size.tileWidth / atlas.size.width,
        atlas.size.tileHeight / atlas.size.height,
        atlas.size.padding / atlas.size.width,
        atlas.size.padding / atlas.size.height,
      ];
      this.applySize(model, size, tier);
    } finally {
      if (scoped) {
        try {
          await this.device.popErrorScope?.();
        } catch {
          /* Resource cleanup remains mandatory. */
        }
      }
      texture?.destroy();
      atlas.close();
    }
  }

  private applySize(model: AmbientMotionModel, size: AmbientCanvasSize, tier: AmbientRenderTier) {
    this.model = model;
    this.size = size;
    this.tier = tier;
    this.canvas.dataset.ambientTier = tier;
    this.canvas.width = size.backingWidth;
    this.canvas.height = size.backingHeight;
    this.canvas.style.width = `${size.cssWidth}px`;
    this.canvas.style.height = `${size.cssHeight}px`;
    this.context.configure({
      device: this.device,
      format: this.format,
      alphaMode: "premultiplied",
    });
    this.device.queue.writeBuffer(this.seedBuffer, 0, seedData(model));
    this.syncPlayback();
  }

  setPalette(palette: AmbientPalette) {
    this.palette = palette;
    this.render(performance.now());
  }
  setReducedMotion(value: boolean) {
    this.reducedMotion = value;
    this.syncPlayback();
  }
  setVisibility(value: boolean) {
    this.hidden = value;
    this.syncPlayback();
  }
  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.resizeGeneration += 1;
    this.stop();
    this.releaseResources();
  }
  private releaseResources() {
    if (this.resourcesReleased) return;
    this.resourcesReleased = true;
    this.context.unconfigure?.();
    this.texture?.destroy();
    this.texture = null;
    this.uniformBuffer.destroy();
    this.seedBuffer.destroy();
    this.device.destroy?.();
    this.canvas.remove();
    if (this.input.root.dataset.ambientRenderer === "webgpu")
      delete this.input.root.dataset.ambientRenderer;
  }
  private stop() {
    this.lastRenderTime = null;
    if (this.raf !== null) window.cancelAnimationFrame(this.raf);
    this.raf = null;
  }
  private syncPlayback() {
    this.stop();
    if (!this.mounted || this.destroyed || this.failed || this.hidden || this.reducedMotion) return;
    this.render(performance.now());
    if (this.input.frameTime === undefined) this.schedule();
  }
  private schedule() {
    if (this.destroyed || this.failed || this.hidden || this.reducedMotion) return;
    this.raf = window.requestAnimationFrame((timestamp) => {
      this.raf = null;
      if (this.destroyed || this.failed || this.hidden || this.reducedMotion) return;
      if (
        this.lastRenderTime === null ||
        timestamp - this.lastRenderTime >= AMBIENT_FRAME_INTERVAL_MS
      )
        this.render(timestamp);
      this.schedule();
    });
  }
  private render(timestamp: number) {
    if (
      !this.mounted ||
      !this.size ||
      !this.texture ||
      this.destroyed ||
      this.failed ||
      this.hidden
    )
      return;
    try {
      this.device.queue.writeBuffer(
        this.uniformBuffer,
        0,
        uniformData(
          this.palette,
          this.model,
          this.input.frameTime ?? timestamp,
          this.tier === "full" ? 0 : 1,
          this.atlasUv
        )
      );
      const encoder = this.device.createCommandEncoder();
      const pass = encoder.beginRenderPass({
        colorAttachments: [
          {
            view: this.context.getCurrentTexture().createView(),
            clearValue: { r: 0, g: 0, b: 0, a: 0 },
            loadOp: "clear",
            storeOp: "store",
          },
        ],
      });
      pass.setBindGroup(0, this.bindGroup);
      pass.setPipeline(this.currentPipeline);
      pass.draw(256, 3);
      pass.setPipeline(this.leafPipeline);
      pass.draw(6, this.model.seeds.length);
      pass.end();
      this.device.queue.submit([encoder.finish()]);
      this.lastRenderTime = timestamp;
    } catch {
      this.fail();
    }
  }
  private fail() {
    if (this.destroyed || this.failed) return;
    this.failed = true;
    this.destroyed = true;
    this.resizeGeneration += 1;
    this.stop();
    this.releaseResources();
    try {
      this.input.onUnavailable?.();
    } catch {
      // A fallback notification must not prevent renderer cleanup.
    }
  }
}

export async function createWebGpuRenderer(
  context: AmbientRendererContext
): Promise<AmbientRenderer | null> {
  try {
    return await WebGpuRenderer.create(context);
  } catch {
    return null;
  }
}
