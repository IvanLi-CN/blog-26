"use client";

import { useEffect, useRef } from "react";
import type { AmbientRenderer } from "./ambient-renderer";
import {
  type AmbientPalette,
  createAmbientMotionModel,
  DEFAULT_AMBIENT_PALETTE,
  getAmbientWebGpuCanvasSize,
} from "./ambient-scene";
import { createSvgRenderer } from "./ambient-svg";
import { createWebGpuRenderer } from "./ambient-webgpu";

function readPalette(): AmbientPalette {
  const style = getComputedStyle(document.documentElement);
  return {
    accent: style.getPropertyValue("--nature-accent-rgb").trim() || DEFAULT_AMBIENT_PALETTE.accent,
    mist: style.getPropertyValue("--nature-mist-rgb").trim() || DEFAULT_AMBIENT_PALETTE.mist,
  };
}

export default function AmbientScene() {
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let palette = readPalette();
    let model = createAmbientMotionModel(window.innerWidth, window.innerHeight);
    let active: AmbientRenderer | null = null;
    let generation = 0;
    let disposed = false;

    const size = () =>
      getAmbientWebGpuCanvasSize(
        window.innerWidth,
        window.innerHeight,
        window.devicePixelRatio || 1
      );

    const mountSvg = () => {
      active?.destroy();
      const renderer = createSvgRenderer({
        root,
        model,
        palette,
        reducedMotion: reducedMotion.matches,
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
      let candidate: AmbientRenderer | null = null;
      let candidateFailed = false;
      candidate = await createWebGpuRenderer({
        root,
        model,
        palette,
        reducedMotion: reducedMotion.matches,
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
      candidate.setVisibility(document.hidden);
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
      palette = readPalette();
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
  }, []);

  return <div ref={rootRef} className="nature-ambient" aria-hidden="true" />;
}
