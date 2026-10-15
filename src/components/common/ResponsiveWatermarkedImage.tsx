"use client";

import type { ImgHTMLAttributes } from "react";
import { useResponsiveWatermark, type WatermarkVariant } from "./useResponsiveWatermark";

export interface ResponsiveWatermarkedImageProps
  extends Omit<ImgHTMLAttributes<HTMLImageElement>, "src"> {
  src: string;
  watermarkA?: string | null;
  watermarkB?: string | null;
  fallback?: WatermarkVariant;
}

export function ResponsiveWatermarkedImage({
  src,
  watermarkA,
  watermarkB,
  fallback = "b",
  ...props
}: ResponsiveWatermarkedImageProps) {
  const selected = useResponsiveWatermark({
    source: src,
    watermarkA,
    watermarkB,
    fallback,
  });

  return (
    // biome-ignore lint/performance/noImgElement: The public Astro surface uses native images for static media.
    <img
      ref={selected.imageRef}
      src={selected.source}
      data-watermark-variant={selected.variant}
      alt={props.alt ?? ""}
      {...props}
    />
  );
}

export default ResponsiveWatermarkedImage;
