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
});
