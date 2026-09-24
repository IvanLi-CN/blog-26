import {
  AMBIENT_FRAME_INTERVAL_MS,
  AMBIENT_SEED_BUFFER_BYTES,
  type AmbientGpuLimits,
  type AmbientPerformanceScore,
  ambientGpuLimitsSupportSize,
  ambientPerformanceScore,
  ambientRenderTierForScore,
} from "./ambient-performance";
import type { AmbientRenderer, AmbientRendererContext } from "./ambient-renderer";
import type { AmbientCanvasSize, AmbientMotionModel, AmbientPalette } from "./ambient-scene";

const GPU_BUFFER_USAGE_STORAGE = 0x80;
const GPU_BUFFER_USAGE_UNIFORM = 0x40;
const GPU_BUFFER_USAGE_COPY_DST = 0x08;
const GPU_SHADER_STAGE_VERTEX = 0x1;
const GPU_SHADER_STAGE_FRAGMENT = 0x2;

type GpuBufferLike = { destroy(): void };
type GpuTextureLike = { createView(): unknown };
type GpuPassLike = {
  setPipeline(pipeline: unknown): void;
  setBindGroup(index: number, bindGroup: unknown): void;
  draw(vertexCount: number, instanceCount?: number): void;
  end(): void;
};
type GpuEncoderLike = {
  beginRenderPass(descriptor: unknown): GpuPassLike;
  finish(): unknown;
};
type GpuQueueLike = {
  writeBuffer(buffer: GpuBufferLike, offset: number, data: ArrayBuffer | ArrayBufferView): void;
  submit(commands: readonly unknown[]): void;
};
type GpuDeviceLike = {
  queue: GpuQueueLike;
  lost?: Promise<unknown>;
  createShaderModule(descriptor: { code: string }): unknown;
  createBuffer(descriptor: { size: number; usage: number }): GpuBufferLike;
  createBindGroupLayout(descriptor: unknown): unknown;
  createPipelineLayout(descriptor: unknown): unknown;
  createBindGroup(descriptor: unknown): unknown;
  createRenderPipeline(descriptor: unknown): unknown;
  createCommandEncoder(): GpuEncoderLike;
};
type GpuAdapterLike = {
  requestDevice(): Promise<GpuDeviceLike>;
  limits?: AmbientGpuLimits;
};
type GpuCanvasContextLike = {
  configure(config: unknown): void;
  getCurrentTexture(): GpuTextureLike;
};
type GpuNamespaceLike = {
  requestAdapter(options?: {
    powerPreference?: "high-performance";
  }): Promise<GpuAdapterLike | null>;
  getPreferredCanvasFormat?: () => string;
};

const shaderCode = `
struct Uniforms {
  resolution: vec2f,
  time: f32,
  seedCount: f32,
  accent: vec4f,
  mist: vec4f,
};

struct Seed {
  lane: f32,
  offset: f32,
  size: f32,
  duration: f32,
  phase: f32,
  alpha: f32,
  tone: f32,
  padding: f32,
};

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var<storage, read> seeds: array<Seed>;

struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) color: vec4f,
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
  output.color = select(uniforms.accent * vec4f(1.0, 1.0, 1.0, 0.24), uniforms.mist * vec4f(1.0, 1.0, 1.0, 0.17), current == 1u);
  return output;
}

@vertex
fn leafVertex(@builtin(vertex_index) vertexIndex: u32, @builtin(instance_index) seedIndex: u32) -> VertexOutput {
  let seed = seeds[seedIndex];
  let progress = fract(uniforms.time / seed.duration + seed.offset);
  let wave = sin(progress * 3.1415926 * 2.4 + seed.phase + uniforms.time / 8000.0);
  let x = -seed.size + progress * (uniforms.resolution.x + seed.size * 2.0);
  let y = uniforms.resolution.y * (0.12 + seed.lane * 0.76) + wave * uniforms.resolution.y * 0.045;
  let angle = wave * 0.22 + 0.14;
  let points = array<vec2f, 6>(vec2f(-0.78, 0.0), vec2f(-0.62, -0.3), vec2f(0.62, 0.0), vec2f(-0.78, 0.0), vec2f(0.62, 0.0), vec2f(-0.62, 0.3));
  let local = points[vertexIndex] * seed.size;
  let rotated = vec2f(local.x * cos(angle) - local.y * sin(angle), local.x * sin(angle) + local.y * cos(angle));
  var output: VertexOutput;
  output.position = vec4f(clip(vec2f(x, y) + rotated), 0.0, 1.0);
  let color = select(uniforms.accent, uniforms.mist, seed.tone > 0.5);
  output.color = color * vec4f(1.0, 1.0, 1.0, seed.alpha * 0.26);
  return output;
}

@vertex
fn leafOutlineVertex(@builtin(vertex_index) vertexIndex: u32, @builtin(instance_index) seedIndex: u32) -> VertexOutput {
  let seed = seeds[seedIndex];
  let progress = fract(uniforms.time / seed.duration + seed.offset);
  let wave = sin(progress * 3.1415926 * 2.4 + seed.phase + uniforms.time / 8000.0);
  let x = -seed.size + progress * (uniforms.resolution.x + seed.size * 2.0);
  let y = uniforms.resolution.y * (0.12 + seed.lane * 0.76) + wave * uniforms.resolution.y * 0.045;
  let angle = wave * 0.22 + 0.14;
  let points = array<vec2f, 9>(vec2f(-0.78, 0.0), vec2f(-0.5, -0.23), vec2f(0.0, -0.3), vec2f(0.5, -0.23), vec2f(0.78, 0.0), vec2f(0.5, 0.23), vec2f(0.0, 0.3), vec2f(-0.5, 0.23), vec2f(-0.78, 0.0));
  let local = points[vertexIndex] * seed.size;
  let rotated = vec2f(local.x * cos(angle) - local.y * sin(angle), local.x * sin(angle) + local.y * cos(angle));
  var output: VertexOutput;
  output.position = vec4f(clip(vec2f(x, y) + rotated), 0.0, 1.0);
  let color = select(uniforms.accent, uniforms.mist, seed.tone > 0.5);
  output.color = color * vec4f(1.0, 1.0, 1.0, seed.alpha);
  return output;
}

@fragment
fn fragmentMain(input: VertexOutput) -> @location(0) vec4f {
  return input.color;
}
`;

function parseRgb(value: string, fallback: [number, number, number]): [number, number, number] {
  const values = value.split(",").map((part) => Number(part.trim()));
  if (values.length !== 3 || values.some((part) => !Number.isFinite(part))) return fallback;
  return values.map((part) => part / 255) as [number, number, number];
}

function uniformData(palette: AmbientPalette, model: AmbientMotionModel, timestamp: number) {
  const accent = parseRgb(palette.accent, [0.49, 0.66, 0.55]);
  const mist = parseRgb(palette.mist, [0.96, 0.97, 0.96]);
  return new Float32Array([
    model.width,
    model.height,
    timestamp,
    model.seeds.length,
    ...accent,
    1,
    ...mist,
    1,
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
        seed.alpha,
        seed.tone === "mist" ? 1 : 0,
        0,
      ],
      index * 8
    );
  });
  return data;
}

class WebGpuRenderer implements AmbientRenderer {
  readonly kind = "webgpu" as const;

  private readonly root: HTMLElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly context: GpuCanvasContextLike;
  private readonly device: GpuDeviceLike;
  private readonly queue: GpuQueueLike;
  private readonly format: string;
  private readonly adapterLimits: AmbientGpuLimits | undefined;
  private readonly uniformBuffer: GpuBufferLike;
  private readonly seedBuffer: GpuBufferLike;
  private readonly bindGroup: unknown;
  private readonly currentPipeline: unknown;
  private readonly leafPipeline: unknown;
  private readonly leafOutlinePipeline: unknown;
  private readonly onUnavailable?: () => void;
  private model: AmbientMotionModel;
  private palette: AmbientPalette;
  private size: AmbientCanvasSize | null = null;
  private reducedMotion: boolean;
  private hidden = false;
  private running = false;
  private raf: number | null = null;
  private lastRenderTime: number | null = null;
  private destroyed = false;
  private failed = false;
  private performanceScore: AmbientPerformanceScore = 1;

  static async create(context: AmbientRendererContext): Promise<WebGpuRenderer | null> {
    const gpu = (navigator as unknown as { gpu?: GpuNamespaceLike }).gpu;
    if (!gpu) return null;
    const adapter = await gpu.requestAdapter({ powerPreference: "high-performance" });
    if (!adapter) return null;
    const device = await adapter.requestDevice();
    const canvas = document.createElement("canvas");
    const gpuContext = canvas.getContext("webgpu") as unknown as GpuCanvasContextLike | null;
    if (!gpuContext) return null;
    return new WebGpuRenderer(
      context,
      canvas,
      gpuContext,
      device,
      gpu.getPreferredCanvasFormat?.() ?? "bgra8unorm",
      adapter.limits
    );
  }

  private constructor(
    context: AmbientRendererContext,
    canvas: HTMLCanvasElement,
    gpuContext: GpuCanvasContextLike,
    device: GpuDeviceLike,
    format: string,
    adapterLimits: AmbientGpuLimits | undefined
  ) {
    this.root = context.root;
    this.canvas = canvas;
    this.context = gpuContext;
    this.device = device;
    this.queue = device.queue;
    this.format = format;
    this.adapterLimits = adapterLimits;
    this.model = context.model;
    this.palette = context.palette;
    this.reducedMotion = context.reducedMotion;
    this.onUnavailable = context.onUnavailable;

    let uniformBuffer: GpuBufferLike | undefined;
    let seedBuffer: GpuBufferLike | undefined;
    try {
      const shader = device.createShaderModule({ code: shaderCode });
      const layout = device.createBindGroupLayout({
        entries: [
          {
            binding: 0,
            visibility: GPU_SHADER_STAGE_VERTEX | GPU_SHADER_STAGE_FRAGMENT,
            buffer: { type: "uniform" },
          },
          {
            binding: 1,
            visibility: GPU_SHADER_STAGE_VERTEX,
            buffer: { type: "read-only-storage" },
          },
        ],
      });
      const pipelineLayout = device.createPipelineLayout({ bindGroupLayouts: [layout] });
      uniformBuffer = device.createBuffer({
        size: 48,
        usage: GPU_BUFFER_USAGE_UNIFORM | GPU_BUFFER_USAGE_COPY_DST,
      });
      seedBuffer = device.createBuffer({
        size: AMBIENT_SEED_BUFFER_BYTES,
        usage: GPU_BUFFER_USAGE_STORAGE | GPU_BUFFER_USAGE_COPY_DST,
      });
      this.uniformBuffer = uniformBuffer;
      this.seedBuffer = seedBuffer;
      this.bindGroup = device.createBindGroup({
        layout,
        entries: [
          { binding: 0, resource: { buffer: uniformBuffer } },
          { binding: 1, resource: { buffer: seedBuffer } },
        ],
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
        fragment: { module: shader, entryPoint: "fragmentMain", targets: [target] },
        primitive: { topology: "line-strip" },
      });
      this.leafPipeline = device.createRenderPipeline({
        layout: pipelineLayout,
        vertex: { module: shader, entryPoint: "leafVertex" },
        fragment: { module: shader, entryPoint: "fragmentMain", targets: [target] },
        primitive: { topology: "triangle-list" },
      });
      this.leafOutlinePipeline = device.createRenderPipeline({
        layout: pipelineLayout,
        vertex: { module: shader, entryPoint: "leafOutlineVertex" },
        fragment: { module: shader, entryPoint: "fragmentMain", targets: [target] },
        primitive: { topology: "line-strip" },
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
    this.canvas.className = "nature-ambient-webgpu";
    this.canvas.setAttribute("aria-hidden", "true");
    this.root.replaceChildren(this.canvas);
    this.syncPlayback();
  }

  resize(model: AmbientMotionModel, size: AmbientCanvasSize) {
    this.model = model;
    this.size = size;
    if (!ambientGpuLimitsSupportSize(this.adapterLimits, size)) {
      this.fail();
      return;
    }
    this.performanceScore = ambientPerformanceScore(this.adapterLimits, size);
    this.canvas.width = size.backingWidth;
    this.canvas.height = size.backingHeight;
    this.canvas.style.width = `${size.cssWidth}px`;
    this.canvas.style.height = `${size.cssHeight}px`;
    try {
      this.context.configure({
        device: this.device,
        format: this.format,
        alphaMode: "premultiplied",
      });
      this.queue.writeBuffer(this.seedBuffer, 0, seedData(model));
    } catch {
      this.fail();
      return;
    }
    this.syncPlayback();
  }

  setPalette(palette: AmbientPalette) {
    this.palette = palette;
    if (!this.hidden) this.render(performance.now());
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
    if (this.destroyed) return;
    this.destroyed = true;
    this.stop();
    this.uniformBuffer.destroy();
    this.seedBuffer.destroy();
    this.canvas.remove();
  }

  private stop() {
    this.running = false;
    this.lastRenderTime = null;
    if (this.raf !== null) window.cancelAnimationFrame(this.raf);
    this.raf = null;
  }

  private syncPlayback() {
    this.stop();
    if (this.destroyed || this.failed || this.hidden || this.reducedMotion) return;
    this.render(performance.now());
    this.running = true;
    this.schedule();
  }

  private schedule() {
    if (!this.running || this.destroyed || this.failed) return;
    this.raf = window.requestAnimationFrame((timestamp) => {
      this.raf = null;
      if (!this.running || this.destroyed || this.failed) return;
      if (
        this.lastRenderTime === null ||
        timestamp - this.lastRenderTime >= AMBIENT_FRAME_INTERVAL_MS
      ) {
        this.render(timestamp);
      }
      this.schedule();
    });
  }

  private render(timestamp: number) {
    if (!this.size || this.destroyed || this.failed || this.hidden) return;
    try {
      this.queue.writeBuffer(
        this.uniformBuffer,
        0,
        uniformData(this.palette, this.model, timestamp)
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
      if (ambientRenderTierForScore(this.performanceScore) === "full") {
        pass.setPipeline(this.leafOutlinePipeline);
        pass.draw(9, this.model.seeds.length);
      }
      pass.end();
      this.queue.submit([encoder.finish()]);
      this.lastRenderTime = timestamp;
    } catch {
      this.fail();
    }
  }

  private fail() {
    if (this.destroyed || this.failed) return;
    this.failed = true;
    this.stop();
    this.onUnavailable?.();
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
