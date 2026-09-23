"use client";

import { useEffect, useRef } from "react";
import {
  type AmbientRenderer,
  type AmbientRendererRequest,
  createAmbientRenderer,
} from "./ambient-renderer";
import {
  type AmbientPalette,
  createAmbientDiagnostics,
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

function readRendererRequest(): AmbientRendererRequest {
  const value = String(import.meta.env.PUBLIC_AMBIENT_RENDERER || "canvas");
  return value === "svg" || value === "webgpu" ? value : "canvas";
}

export default function AmbientScene() {
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const rendererRequest = readRendererRequest();
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const diagnostics = createAmbientDiagnostics(
      import.meta.env.PUBLIC_AMBIENT_DIAGNOSTICS === "1",
      rendererRequest
    );
    let palette = readPalette();
    let model = createAmbientMotionModel(window.innerWidth, window.innerHeight);
    let renderer: AmbientRenderer | null = null;
    let disposed = false;

    const size = () =>
      getAmbientCanvasSize(window.innerWidth, window.innerHeight, window.devicePixelRatio || 1);

    const syncSize = () => {
      const nextSize = size();
      model = createAmbientMotionModel(nextSize.cssWidth, nextSize.cssHeight);
      renderer?.resize(model, nextSize);
      diagnostics?.setBackingSize(nextSize.backingWidth, nextSize.backingHeight);
    };

    const syncPalette = () => {
      palette = readPalette();
      renderer?.setPalette(palette);
    };

    const syncVisibility = () => {
      diagnostics?.setVisibility(document.hidden);
      renderer?.setVisibility(document.hidden);
    };

    const syncReducedMotion = () => {
      renderer?.setReducedMotion(reducedMotion.matches);
    };

    const themeObserver = new MutationObserver(syncPalette);
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-ui-theme"],
    });

    window.addEventListener("resize", syncSize);
    document.addEventListener("visibilitychange", syncVisibility);
    reducedMotion.addEventListener("change", syncReducedMotion);

    void createAmbientRenderer(rendererRequest, {
      root,
      model,
      palette,
      reducedMotion: reducedMotion.matches,
      diagnostics,
    }).then((created) => {
      if (disposed) {
        created.destroy();
        return;
      }
      renderer = created;
      created.mount();
      created.resize(model, size());
      created.setPalette(palette);
      created.setReducedMotion(reducedMotion.matches);
      created.setVisibility(document.hidden);
    });

    return () => {
      disposed = true;
      renderer?.destroy();
      themeObserver.disconnect();
      window.removeEventListener("resize", syncSize);
      document.removeEventListener("visibilitychange", syncVisibility);
      reducedMotion.removeEventListener("change", syncReducedMotion);
    };
  }, []);

  return <div ref={rootRef} className="nature-ambient" aria-hidden="true" />;
}
