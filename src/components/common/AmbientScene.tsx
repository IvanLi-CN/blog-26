"use client";

import { useEffect, useRef } from "react";
import type { AmbientRenderer, AmbientRendererContext } from "./ambient-renderer";
import {
  type AmbientPalette,
  createAmbientMotionModel,
  DEFAULT_AMBIENT_PALETTE,
  getAmbientWebGpuCanvasSize,
} from "./ambient-scene";
import { createSvgRenderer } from "./ambient-svg";
import { createWebGpuRenderer } from "./ambient-webgpu";

function readPalette(root: HTMLElement): AmbientPalette {
  const style = getComputedStyle(root);
  return {
    accent: style.getPropertyValue("--nature-accent-rgb").trim() || DEFAULT_AMBIENT_PALETTE.accent,
    mist: style.getPropertyValue("--nature-mist-rgb").trim() || DEFAULT_AMBIENT_PALETTE.mist,
  };
}

/** Internal evidence inputs keep stories on the production coordinator. */
export type AmbientSceneEvidence = {
  width: number;
  height: number;
  renderer?: "auto" | "svg" | "full" | "conservative";
  frameTime?: number;
  loadLeafAtlas?: AmbientRendererContext["loadLeafAtlas"];
};

export default function AmbientScene({ evidence }: { evidence?: AmbientSceneEvidence } = {}) {
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let palette = readPalette(root);
    let model = createAmbientMotionModel(
      evidence?.width ?? window.innerWidth,
      evidence?.height ?? window.innerHeight
    );
    let active: AmbientRenderer | null = null;
    let generation = 0;
    let disposed = false;

    const size = () =>
      getAmbientWebGpuCanvasSize(
        evidence?.width ?? window.innerWidth,
        evidence?.height ?? window.innerHeight,
        window.devicePixelRatio || 1
      );

    const mountSvg = () => {
      active?.destroy();
      const renderer = createSvgRenderer({
        root,
        model,
        palette,
        reducedMotion: reducedMotion.matches,
        frameTime: evidence?.frameTime,
      });
      renderer.mount();
      renderer.resize(model, size());
      renderer.setPalette(palette);
      renderer.setVisibility(document.hidden);
      active = renderer;
    };

    const fallbackToSvg = () => {
      if (disposed || active?.kind !== "webgpu") return;
      generation += 1;
      mountSvg();
    };

    const tryWebGpu = async () => {
      const token = ++generation;
      if (evidence?.renderer === "svg") return;
      let candidate: AmbientRenderer | null = null;
      let candidateFailed = false;
      candidate = await createWebGpuRenderer({
        root,
        model,
        palette,
        reducedMotion: reducedMotion.matches,
        size: size(),
        frameTime: evidence?.frameTime,
        renderTier:
          evidence?.renderer === "full" || evidence?.renderer === "conservative"
            ? evidence.renderer
            : undefined,
        loadLeafAtlas: evidence?.loadLeafAtlas,
        onUnavailable: () => {
          if (active === candidate) fallbackToSvg();
          else candidateFailed = true;
        },
      });
      if (
        !candidate ||
        candidateFailed ||
        disposed ||
        token !== generation ||
        reducedMotion.matches
      ) {
        candidate?.destroy();
        return;
      }
      candidate.setVisibility(document.hidden);
      candidate.mount();
      candidate.resize(model, size());
      if (candidateFailed) {
        candidate.destroy();
        if (!disposed && token === generation && !reducedMotion.matches) mountSvg();
        return;
      }
      candidate.setPalette(palette);
      if (candidateFailed) {
        candidate.destroy();
        if (!disposed && token === generation && !reducedMotion.matches) mountSvg();
        return;
      }
      active?.destroy();
      active = candidate;
    };

    mountSvg();
    if (!reducedMotion.matches) void tryWebGpu();

    const syncSize = () => {
      const nextSize = size();
      model = createAmbientMotionModel(nextSize.cssWidth, nextSize.cssHeight);
      active?.resize(model, nextSize);
    };

    const syncPalette = () => {
      palette = readPalette(root);
      active?.setPalette(palette);
    };

    const syncVisibility = () => {
      active?.setVisibility(document.hidden);
    };

    const syncReducedMotion = () => {
      generation += 1;
      mountSvg();
      if (!reducedMotion.matches) void tryWebGpu();
    };

    const themeObserver = new MutationObserver(syncPalette);
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-ui-theme"],
    });

    window.addEventListener("resize", syncSize);
    document.addEventListener("visibilitychange", syncVisibility);
    reducedMotion.addEventListener("change", syncReducedMotion);

    return () => {
      disposed = true;
      generation += 1;
      active?.destroy();
      themeObserver.disconnect();
      window.removeEventListener("resize", syncSize);
      document.removeEventListener("visibilitychange", syncVisibility);
      reducedMotion.removeEventListener("change", syncReducedMotion);
    };
  }, [evidence]);

  return (
    <div
      ref={rootRef}
      className="nature-ambient"
      style={evidence ? { position: "absolute" } : undefined}
      aria-hidden="true"
    />
  );
}
