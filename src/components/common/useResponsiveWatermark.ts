"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

export type WatermarkVariant = "a" | "b";

const useWatermarkLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

export function chooseWatermarkVariant(visibleWidth: number): WatermarkVariant {
  return visibleWidth >= 600 ? "b" : "a";
}

function getVisibleImageWidth(image: HTMLImageElement) {
  const rect = image.getBoundingClientRect();
  if (!rect.width || !rect.height) return 0;
  const naturalWidth = image.naturalWidth;
  const naturalHeight = image.naturalHeight;
  if (!naturalWidth || !naturalHeight) return rect.width;
  return Math.min(rect.width, rect.height * (naturalWidth / naturalHeight));
}

export function useResponsiveWatermark(params: {
  source: string;
  watermarkA?: string | null;
  watermarkB?: string | null;
  fallback?: WatermarkVariant;
  enabled?: boolean;
}) {
  const { source, watermarkA, watermarkB, fallback = "b", enabled = true } = params;
  const imageRef = useRef<HTMLImageElement>(null);
  const [variant, setVariant] = useState<WatermarkVariant>(fallback);

  useWatermarkLayoutEffect(() => {
    if (!source) return;
    setVariant(fallback);
  }, [fallback, source]);

  useWatermarkLayoutEffect(() => {
    if (!source) return;
    if (!enabled) return;
    const image = imageRef.current;
    if (!image) return;

    let frame = 0;
    const applyMeasurement = () => {
      const visibleWidth = getVisibleImageWidth(image);
      if (visibleWidth > 0) {
        const nextVariant = chooseWatermarkVariant(visibleWidth);
        setVariant((current) => (current === nextVariant ? current : nextVariant));
      }
    };
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(applyMeasurement);
    };

    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    observer?.observe(image);
    image.addEventListener("load", measure);
    applyMeasurement();
    measure();

    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
      image.removeEventListener("load", measure);
    };
  }, [enabled, source]);

  const selectedSource = useMemo(() => {
    const selected = variant === "b" ? watermarkB : watermarkA;
    const alternate = variant === "b" ? watermarkA : watermarkB;
    return selected || alternate || source;
  }, [source, variant, watermarkA, watermarkB]);

  return { imageRef, source: selectedSource, variant };
}
