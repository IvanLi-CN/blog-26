import { afterEach, describe, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { createAmbientMotionModel, DEFAULT_AMBIENT_PALETTE } from "./ambient-scene";
import { createSvgRenderer } from "./ambient-svg";

if (typeof document === "undefined") GlobalRegistrator.register();

afterEach(() => {
  document.body.replaceChildren();
});

describe("ambient SVG fallback", () => {
  test("renders independent wind paths and responsive leaf groups", () => {
    const root = document.createElement("div");
    document.body.append(root);
    const renderer = createSvgRenderer({
      root,
      model: createAmbientMotionModel(1440, 1000),
      palette: DEFAULT_AMBIENT_PALETTE,
      reducedMotion: true,
    });

    renderer.mount();

    const svg = root.querySelector("svg");
    expect(svg?.classList.contains("nature-ambient-svg")).toBe(true);
    expect(svg?.querySelectorAll("path.nature-ambient-current")).toHaveLength(3);
    expect(svg?.querySelectorAll("g.nature-ambient-seed")).toHaveLength(12);
    expect(svg?.querySelectorAll("animate")).toHaveLength(0);
    expect(svg?.getAttribute("viewBox")).toBe("0 0 1440 1000");

    renderer.destroy();
    expect(root.querySelector("svg")).toBeNull();
  });

  test("uses seven leaf groups for a mobile model and updates theme variables", () => {
    const root = document.createElement("div");
    document.body.append(root);
    const renderer = createSvgRenderer({
      root,
      model: createAmbientMotionModel(393, 852),
      palette: DEFAULT_AMBIENT_PALETTE,
      reducedMotion: true,
    });

    renderer.mount();
    renderer.setPalette({ accent: "1, 2, 3", mist: "4, 5, 6" });

    expect(root.querySelectorAll("g.nature-ambient-seed")).toHaveLength(7);
    expect(root.querySelector("svg")?.style.getPropertyValue("--ambient-accent-rgb")).toBe(
      "1, 2, 3"
    );
    expect(root.querySelector("svg")?.style.getPropertyValue("--ambient-mist-rgb")).toBe("4, 5, 6");
  });
});
