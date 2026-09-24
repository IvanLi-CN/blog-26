import { afterEach, describe, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import {
  createAmbientMotionModel,
  DEFAULT_AMBIENT_PALETTE,
  getAmbientWebGpuCanvasSize,
} from "./ambient-scene";
import { createWebGpuRenderer } from "./ambient-webgpu";

if (typeof document === "undefined") GlobalRegistrator.register();

afterEach(() => {
  document.body.replaceChildren();
});

describe("ambient renderer capability detection", () => {
  test("does not request an adapter when WebGPU is unavailable", async () => {
    const originalGpu = (navigator as unknown as { gpu?: unknown }).gpu;
    Object.defineProperty(navigator, "gpu", { configurable: true, value: undefined });

    const renderer = await createWebGpuRenderer({
      root: {} as HTMLElement,
      model: createAmbientMotionModel(1440, 1000),
      palette: DEFAULT_AMBIENT_PALETTE,
      reducedMotion: false,
    });

    expect(renderer).toBeNull();
    Object.defineProperty(navigator, "gpu", { configurable: true, value: originalGpu });
  });

  test("configures a transparent native-DPR canvas and stops submitting when hidden", async () => {
    const root = document.createElement("div");
    document.body.append(root);
    let configure: Record<string, unknown> | null = null;
    let submits = 0;
    let rafRequests = 0;
    let frameCallback: FrameRequestCallback | null = null;
    let resolveLost: (() => void) | null = null;
    let unavailable = 0;
    const device = {
      queue: {
        writeBuffer() {
          // The mock only records command submissions.
        },
        submit() {
          submits += 1;
        },
      },
      lost: new Promise<void>((resolve) => {
        resolveLost = resolve;
      }),
      createShaderModule: () => ({}),
      createBuffer: () => ({
        destroy() {
          // The mock has no GPU allocation to release.
        },
      }),
      createBindGroupLayout: () => ({}),
      createPipelineLayout: () => ({}),
      createBindGroup: () => ({}),
      createRenderPipeline: () => ({}),
      createCommandEncoder: () => ({
        beginRenderPass: () => ({
          setPipeline() {
            // No-op command recorder.
          },
          setBindGroup() {
            // No-op command recorder.
          },
          draw() {
            // No-op command recorder.
          },
          end() {
            // No-op command recorder.
          },
        }),
        finish: () => ({}),
      }),
    };
    const canvasContext = {
      configure(options: Record<string, unknown>) {
        configure = options;
      },
      getCurrentTexture: () => ({ createView: () => ({}) }),
    };
    const originalGetContext = HTMLCanvasElement.prototype.getContext;
    const originalRaf = window.requestAnimationFrame;
    const originalCancelRaf = window.cancelAnimationFrame;
    const originalPerformanceNow = performance.now;
    performance.now = () => 1000;
    HTMLCanvasElement.prototype.getContext = ((kind: string) =>
      kind === "webgpu" ? canvasContext : null) as typeof HTMLCanvasElement.prototype.getContext;
    window.requestAnimationFrame = ((callback: FrameRequestCallback) => {
      rafRequests += 1;
      frameCallback = callback;
      return rafRequests;
    }) as typeof window.requestAnimationFrame;
    window.cancelAnimationFrame = (() => {
      // The mock frame is never executed.
    }) as typeof window.cancelAnimationFrame;
    const originalGpu = (navigator as unknown as { gpu?: unknown }).gpu;
    Object.defineProperty(navigator, "gpu", {
      configurable: true,
      value: {
        requestAdapter: async () => ({ requestDevice: async () => device }),
        getPreferredCanvasFormat: () => "bgra8unorm",
      },
    });

    try {
      const renderer = await createWebGpuRenderer({
        root,
        model: createAmbientMotionModel(1440, 1000),
        palette: DEFAULT_AMBIENT_PALETTE,
        reducedMotion: false,
        onUnavailable: () => {
          unavailable += 1;
        },
      });
      expect(renderer).not.toBeNull();
      renderer?.mount();
      renderer?.resize(
        createAmbientMotionModel(1440, 1000),
        getAmbientWebGpuCanvasSize(1440, 1000, 2)
      );
      expect(configure).toMatchObject({ alphaMode: "premultiplied" });
      expect((root.querySelector("canvas") as HTMLCanvasElement).width).toBe(2880);
      expect(submits).toBeGreaterThan(0);
      const submitCountAfterResize = submits;
      frameCallback?.(1010);
      expect(submits).toBe(submitCountAfterResize);
      frameCallback?.(1040);
      expect(submits).toBeGreaterThan(submitCountAfterResize);
      const submitCount = submits;
      renderer?.setVisibility(true);
      expect(submits).toBe(submitCount);
      resolveLost?.();
      await Promise.resolve();
      expect(unavailable).toBe(1);
      renderer?.destroy();
    } finally {
      HTMLCanvasElement.prototype.getContext = originalGetContext;
      window.requestAnimationFrame = originalRaf;
      window.cancelAnimationFrame = originalCancelRaf;
      performance.now = originalPerformanceNow;
      Object.defineProperty(navigator, "gpu", { configurable: true, value: originalGpu });
    }
  });
});
