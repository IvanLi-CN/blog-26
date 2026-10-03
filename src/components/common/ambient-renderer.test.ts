import { afterEach, describe, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { type AmbientLeafAtlas, getAmbientLeafAtlasSize } from "./ambient-leaf";
import {
  createAmbientMotionModel,
  DEFAULT_AMBIENT_PALETTE,
  getAmbientWebGpuCanvasSize,
} from "./ambient-scene";
import { createWebGpuRenderer } from "./ambient-webgpu";

if (typeof document === "undefined") GlobalRegistrator.register();
const originalGpu = (navigator as unknown as { gpu?: unknown }).gpu;
const originalGetContext = HTMLCanvasElement.prototype.getContext;
const originalRaf = window.requestAnimationFrame;
const originalCancelRaf = window.cancelAnimationFrame;
const originalNow = performance.now;
const originalDocumentHidden = Object.getOwnPropertyDescriptor(document, "hidden");
afterEach(() => {
  Object.defineProperty(navigator, "gpu", { configurable: true, value: originalGpu });
  HTMLCanvasElement.prototype.getContext = originalGetContext;
  window.requestAnimationFrame = originalRaf;
  window.cancelAnimationFrame = originalCancelRaf;
  performance.now = originalNow;
  if (originalDocumentHidden) {
    Object.defineProperty(document, "hidden", originalDocumentHidden);
  } else {
    Reflect.deleteProperty(document, "hidden");
  }
  document.body.replaceChildren();
});

async function flush() {
  for (let i = 0; i < 12; i++) await Promise.resolve();
}
function fixture() {
  const root = document.createElement("div");
  document.body.append(root);
  const state = {
    submits: 0,
    uploads: 0,
    atlasLoads: 0,
    closedBitmaps: 0,
    destroyedDevices: 0,
    requests: 0,
    unavailable: 0,
    uploadFailure: false,
    pipelineFailure: false,
    validationError: false,
    scopeFailure: false,
    submitFailure: false,
  };
  const textures = new Set<object>();
  const buffers = new Set<object>();
  let callback: FrameRequestCallback = () => undefined;
  let resolveLost: () => void = () => undefined;
  const device = {
    limits: { maxTextureDimension2D: 8192, maxStorageBufferBindingSize: 65536 },
    lost: new Promise<void>((resolve) => {
      resolveLost = resolve;
    }),
    destroy: () => {
      state.destroyedDevices++;
    },
    pushErrorScope: () => undefined,
    popErrorScope: async () => {
      if (state.scopeFailure) throw new Error("scope unavailable");
      return state.validationError ? new Error("validation") : null;
    },
    queue: {
      writeBuffer: () => undefined,
      copyExternalImageToTexture: () => {
        state.uploads++;
        if (state.uploadFailure) throw new Error("upload");
      },
      submit: () => {
        state.submits++;
        if (state.submitFailure) throw new Error("submit");
      },
      onSubmittedWorkDone: () => {
        throw new Error("queue timing must not control rendering");
      },
    },
    createShaderModule: () => ({}),
    createBuffer: () => {
      const resource = {
        destroy: () => {
          buffers.delete(resource);
        },
      };
      buffers.add(resource);
      return resource;
    },
    createTexture: () => {
      const resource = {
        createView: () => ({}),
        destroy: () => {
          textures.delete(resource);
        },
      };
      textures.add(resource);
      return resource;
    },
    createSampler: () => ({}),
    createBindGroupLayout: () => ({}),
    createPipelineLayout: () => ({}),
    createBindGroup: () => ({}),
    createRenderPipeline: () => {
      if (state.pipelineFailure) throw new Error("pipeline");
      return {};
    },
    createCommandEncoder: () => ({
      beginRenderPass: () => ({
        setPipeline: () => undefined,
        setBindGroup: () => undefined,
        draw: () => undefined,
        end: () => undefined,
      }),
      finish: () => ({}),
    }),
  };
  const canvasContext = {
    configure: () => undefined,
    unconfigure: () => undefined,
    getCurrentTexture: () => ({ createView: () => ({}) }),
  };
  HTMLCanvasElement.prototype.getContext = ((kind: string) =>
    kind === "webgpu" ? canvasContext : null) as typeof originalGetContext;
  window.requestAnimationFrame = (next) => {
    callback = next;
    return 1;
  };
  window.cancelAnimationFrame = () => undefined;
  performance.now = () => 1000;
  Object.defineProperty(navigator, "gpu", {
    configurable: true,
    value: {
      requestAdapter: async () => {
        state.requests++;
        return {
          limits: { maxTextureDimension2D: 32768, maxStorageBufferBindingSize: 131072 },
          requestDevice: async () => device,
        };
      },
    },
  });
  const atlas = (scale: number): AmbientLeafAtlas => ({
    source: {} as ImageBitmap,
    size: getAmbientLeafAtlasSize(scale),
    close: () => {
      state.closedBitmaps++;
    },
  });
  const input = {
    root,
    model: createAmbientMotionModel(1440, 900),
    palette: DEFAULT_AMBIENT_PALETTE,
    reducedMotion: false,
    size: getAmbientWebGpuCanvasSize(1440, 900, 2),
    loadLeafAtlas: async (scale: number) => {
      state.atlasLoads++;
      return atlas(scale);
    },
    onUnavailable: () => {
      state.unavailable++;
    },
  };
  return {
    state,
    device,
    root,
    input,
    textures,
    buffers,
    atlas,
    frame: (time: number) => callback(time),
    loseDevice: () => resolveLost(),
  };
}

describe("ambient GPU resource lifecycle", () => {
  test("reduced motion and absent GPU never request an adapter", async () => {
    const f = fixture();
    expect(await createWebGpuRenderer({ ...f.input, reducedMotion: true })).toBeNull();
    expect(f.state.requests).toBe(0);
    Object.defineProperty(navigator, "gpu", { configurable: true, value: undefined });
    expect(await createWebGpuRenderer(f.input)).toBeNull();
  });
  test("uses native DPR, 30Hz scheduling, hidden pause and device-loss fallback", async () => {
    const f = fixture();
    const renderer = await createWebGpuRenderer(f.input);
    expect(renderer).not.toBeNull();
    renderer?.mount();
    expect(f.root.querySelector("canvas")?.width).toBe(2880);
    const count = f.state.submits;
    f.frame(1010);
    expect(f.state.submits).toBe(count);
    f.frame(1040);
    expect(f.state.submits).toBe(count + 1);
    renderer?.setVisibility(true);
    f.frame(1100);
    expect(f.state.submits).toBe(count + 1);
    renderer?.setVisibility(false);
    expect(f.state.submits).toBe(count + 2);
    f.loseDevice();
    await flush();
    expect(f.state.unavailable).toBe(1);
    renderer?.destroy();
    expect(f.textures.size).toBe(0);
    expect(f.buffers.size).toBe(0);
  });
  test("does not submit frames when atlas preparation finishes after the page is hidden", async () => {
    const f = fixture();
    let resolveAtlas: (atlas: AmbientLeafAtlas) => void = () => undefined;
    let notifyAtlasStarted: () => void = () => undefined;
    const atlasStarted = new Promise<void>((resolve) => {
      notifyAtlasStarted = resolve;
    });
    let atlasScale = 1;
    Object.defineProperty(document, "hidden", { configurable: true, value: false });
    const rendererPromise = createWebGpuRenderer({
      ...f.input,
      loadLeafAtlas: (scale) => {
        atlasScale = scale;
        notifyAtlasStarted();
        return new Promise((resolve) => {
          resolveAtlas = resolve;
        });
      },
    });
    await atlasStarted;
    Object.defineProperty(document, "hidden", { configurable: true, value: true });
    resolveAtlas(f.atlas(atlasScale));

    const renderer = await rendererPromise;
    expect(f.state.submits).toBe(0);
    renderer?.mount();
    expect(f.state.submits).toBe(0);

    Object.defineProperty(document, "hidden", { configurable: true, value: false });
    renderer?.setVisibility(false);
    expect(f.state.submits).toBe(1);
    renderer?.destroy();
  });
  test("reuses masks for theme and viewport changes and replaces them for DPR", async () => {
    const f = fixture();
    const renderer = await createWebGpuRenderer(f.input);
    renderer?.mount();
    renderer?.setPalette({ accent: "136, 193, 160", mist: "59, 86, 72" });
    renderer?.resize(createAmbientMotionModel(393, 852), getAmbientWebGpuCanvasSize(393, 852, 2));
    await flush();
    expect(f.state.atlasLoads).toBe(1);
    renderer?.resize(f.input.model, getAmbientWebGpuCanvasSize(1440, 900, 3));
    await flush();
    expect(f.state.atlasLoads).toBe(2);
    expect(f.textures.size).toBe(1);
    expect(f.root.querySelector("canvas")?.width).toBe(4320);
    expect(f.state.closedBitmaps).toBe(2);
    renderer?.destroy();
  });
  test("drops stale DPR work and closes late bitmaps after teardown", async () => {
    const f = fixture();
    let release: (atlas: AmbientLeafAtlas) => void = () => undefined;
    let pending = false;
    const renderer = await createWebGpuRenderer({
      ...f.input,
      loadLeafAtlas: (scale) =>
        pending
          ? new Promise((resolve) => {
              release = resolve;
            })
          : Promise.resolve(f.atlas(scale)),
    });
    renderer?.mount();
    pending = true;
    renderer?.resize(f.input.model, getAmbientWebGpuCanvasSize(1440, 900, 3));
    renderer?.resize(f.input.model, f.input.size);
    release(f.atlas(3));
    await flush();
    expect(f.root.querySelector("canvas")?.width).toBe(2880);
    expect(f.state.uploads).toBe(1);
    renderer?.resize(f.input.model, getAmbientWebGpuCanvasSize(1440, 900, 3));
    renderer?.destroy();
    release(f.atlas(3));
    await flush();
    expect(f.state.closedBitmaps).toBe(3);
    expect(f.textures.size).toBe(0);
  });
  test.each(["decode", "upload", "pipeline", "validation", "scope"])(
    "releases all resources after %s failure",
    async (failure) => {
      const f = fixture();
      f.state.uploadFailure = failure === "upload";
      f.state.pipelineFailure = failure === "pipeline" || failure === "scope";
      f.state.validationError = failure === "validation";
      f.state.scopeFailure = failure === "scope";
      const input =
        failure === "decode"
          ? {
              ...f.input,
              loadLeafAtlas: async () => {
                throw new Error("decode");
              },
            }
          : f.input;
      expect(await createWebGpuRenderer(input)).toBeNull();
      expect(f.buffers.size).toBe(0);
      expect(f.textures.size).toBe(0);
      expect(f.state.destroyedDevices).toBe(1);
      if (failure === "upload") expect(f.state.closedBitmaps).toBe(1);
    }
  );
  test("uses the device limit even when the adapter advertises more capacity", async () => {
    const f = fixture();
    f.device.limits.maxTextureDimension2D = 2048;
    expect(await createWebGpuRenderer(f.input)).toBeNull();
    expect(f.state.atlasLoads).toBe(0);
    expect(f.buffers.size).toBe(0);
  });
  test("releases resources when a mounted renderer fails without a callback", async () => {
    const f = fixture();
    const renderer = await createWebGpuRenderer({ ...f.input, onUnavailable: undefined });
    expect(renderer).not.toBeNull();
    f.state.submitFailure = true;
    expect(() => renderer?.mount()).not.toThrow();
    expect(f.state.destroyedDevices).toBe(1);
    expect(f.buffers.size).toBe(0);
    expect(f.textures.size).toBe(0);
    expect(f.root.querySelector("canvas")).toBeNull();
  });
  test("releases resources when the fallback callback throws", async () => {
    const f = fixture();
    const renderer = await createWebGpuRenderer({
      ...f.input,
      onUnavailable: () => {
        throw new Error("fallback");
      },
    });
    expect(renderer).not.toBeNull();
    f.state.submitFailure = true;
    expect(() => renderer?.mount()).not.toThrow();
    expect(f.state.destroyedDevices).toBe(1);
    expect(f.buffers.size).toBe(0);
    expect(f.textures.size).toBe(0);
  });
});
