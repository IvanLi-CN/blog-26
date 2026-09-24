import { afterEach, describe, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { cleanup, render } from "@testing-library/react";
import AmbientScene from "./AmbientScene";

if (typeof document === "undefined") GlobalRegistrator.register();

const originalMatchMedia = window.matchMedia;
const originalGpu = (navigator as unknown as { gpu?: unknown }).gpu;

afterEach(() => {
  cleanup();
  window.matchMedia = originalMatchMedia;
  Object.defineProperty(navigator, "gpu", { configurable: true, value: originalGpu });
  document.body.replaceChildren();
});

describe("AmbientScene coordinator", () => {
  test("mounts the complete SVG fallback when WebGPU is unavailable", () => {
    Object.defineProperty(navigator, "gpu", { configurable: true, value: undefined });
    window.matchMedia = (() => ({
      matches: false,
      media: "(prefers-reduced-motion: reduce)",
      addEventListener() {
        // The coordinator only needs the initial reduced-motion state here.
      },
      removeEventListener() {
        // The coordinator removes the listener during cleanup.
      },
    })) as typeof window.matchMedia;

    const { container, unmount } = render(<AmbientScene />);

    expect(container.querySelector("svg.nature-ambient-svg")).toBeTruthy();
    expect(container.querySelectorAll("path.nature-ambient-current")).toHaveLength(3);
    expect(container.querySelectorAll("g.nature-ambient-seed")).toHaveLength(12);
    unmount();
    expect(container.querySelector(".nature-ambient")).toBeNull();
  });

  test("does not request WebGPU when reduced motion is enabled", () => {
    let requests = 0;
    Object.defineProperty(navigator, "gpu", {
      configurable: true,
      value: {
        requestAdapter: async () => {
          requests += 1;
          return null;
        },
      },
    });
    window.matchMedia = (() => ({
      matches: true,
      media: "(prefers-reduced-motion: reduce)",
      addEventListener() {
        // Reduced motion prevents the listener from being used in this test.
      },
      removeEventListener() {
        // Reduced motion prevents the listener from being used in this test.
      },
    })) as typeof window.matchMedia;

    render(<AmbientScene />);

    expect(requests).toBe(0);
    expect(document.querySelector("svg.nature-ambient-svg")).toBeTruthy();
  });

  test("promotes the initial SVG scene to WebGPU and falls back after device loss", async () => {
    let resolveLost: (() => void) | undefined;
    let submits = 0;
    const originalHidden = Object.getOwnPropertyDescriptor(document, "hidden");
    const device = {
      queue: {
        writeBuffer() {
          // The coordinator test only needs a valid queue shape.
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
          // The coordinator owns resource cleanup.
        },
      }),
      createBindGroupLayout: () => ({}),
      createPipelineLayout: () => ({}),
      createBindGroup: () => ({}),
      createRenderPipeline: () => ({}),
      createCommandEncoder: () => ({
        beginRenderPass: () => ({
          setPipeline() {
            // The coordinator test only records renderer promotion.
          },
          setBindGroup() {
            // The coordinator test only records renderer promotion.
          },
          draw() {
            // The coordinator test only records renderer promotion.
          },
          end() {
            // The coordinator test only records renderer promotion.
          },
        }),
        finish: () => ({}),
      }),
    };
    const canvasContext = {
      configure() {
        // The fake context accepts the renderer configuration.
      },
      getCurrentTexture: () => ({ createView: () => ({}) }),
    };
    const originalGetContext = HTMLCanvasElement.prototype.getContext;
    const originalRaf = window.requestAnimationFrame;
    const originalCancelRaf = window.cancelAnimationFrame;
    Object.defineProperty(navigator, "gpu", {
      configurable: true,
      value: {
        requestAdapter: async () => ({ requestDevice: async () => device }),
        getPreferredCanvasFormat: () => "bgra8unorm",
      },
    });
    HTMLCanvasElement.prototype.getContext = ((kind: string) =>
      kind === "webgpu" ? canvasContext : null) as typeof HTMLCanvasElement.prototype.getContext;
    window.requestAnimationFrame = (() => 1) as typeof window.requestAnimationFrame;
    window.cancelAnimationFrame = (() => {
      // The fake frame is never executed.
    }) as typeof window.cancelAnimationFrame;
    window.matchMedia = (() => ({
      matches: false,
      media: "(prefers-reduced-motion: reduce)",
      addEventListener() {
        // The coordinator only needs the initial state in this test.
      },
      removeEventListener() {
        // The coordinator removes the listener during cleanup.
      },
    })) as typeof window.matchMedia;
    Object.defineProperty(document, "hidden", { configurable: true, get: () => true });

    try {
      const { container } = render(<AmbientScene />);
      expect(container.querySelector("svg.nature-ambient-svg")).toBeTruthy();
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(container.querySelector("canvas.nature-ambient-webgpu")).toBeTruthy();
      expect(submits).toBe(0);
      resolveLost?.();
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(container.querySelector("svg.nature-ambient-svg")).toBeTruthy();
    } finally {
      HTMLCanvasElement.prototype.getContext = originalGetContext;
      window.requestAnimationFrame = originalRaf;
      window.cancelAnimationFrame = originalCancelRaf;
      if (originalHidden) Object.defineProperty(document, "hidden", originalHidden);
    }
  });
});
