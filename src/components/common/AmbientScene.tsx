"use client";

import { useEffect, useRef } from "react";
import { createCanvasRenderer } from "./ambient-canvas";
import {
  type AmbientPalette,
  createAmbientMotionModel,
  DEFAULT_AMBIENT_PALETTE,
  getAmbientCanvasSize,
} from "./ambient-scene";

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
    const renderer = createCanvasRenderer({
      root,
      model,
      palette,
      reducedMotion: reducedMotion.matches,
    });

    const size = () =>
      getAmbientCanvasSize(window.innerWidth, window.innerHeight, window.devicePixelRatio || 1);

    const syncSize = () => {
      const nextSize = size();
      model = createAmbientMotionModel(nextSize.cssWidth, nextSize.cssHeight);
      renderer.resize(model, nextSize);
    };

    const syncPalette = () => {
      palette = readPalette();
      renderer.setPalette(palette);
    };

    const syncVisibility = () => {
      renderer.setVisibility(document.hidden);
    };

    const syncReducedMotion = () => {
      renderer.setReducedMotion(reducedMotion.matches);
    };

    const themeObserver = new MutationObserver(syncPalette);
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-ui-theme"],
    });

    renderer.mount();
    renderer.resize(model, size());
    renderer.setPalette(palette);
    renderer.setReducedMotion(reducedMotion.matches);
    renderer.setVisibility(document.hidden);

    window.addEventListener("resize", syncSize);
    document.addEventListener("visibilitychange", syncVisibility);
    reducedMotion.addEventListener("change", syncReducedMotion);

    return () => {
      renderer.destroy();
      themeObserver.disconnect();
      window.removeEventListener("resize", syncSize);
      document.removeEventListener("visibilitychange", syncVisibility);
      reducedMotion.removeEventListener("change", syncReducedMotion);
    };
  }, []);

  return <div ref={rootRef} className="nature-ambient" aria-hidden="true" />;
}
