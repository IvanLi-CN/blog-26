"use client";

import type React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { chooseWatermarkVariant, type WatermarkVariant } from "./useResponsiveWatermark";

export interface ResponsiveWatermarkedVideoProps
  extends React.VideoHTMLAttributes<HTMLVideoElement> {
  posterA?: string | null;
  posterB?: string | null;
  fallback?: WatermarkVariant;
}

function getVisiblePosterWidth(video: HTMLVideoElement, poster: HTMLImageElement) {
  const rect = video.getBoundingClientRect();
  if (!rect.width || !rect.height) return 0;
  if (!poster.naturalWidth || !poster.naturalHeight) return rect.width;
  return Math.min(rect.width, rect.height * (poster.naturalWidth / poster.naturalHeight));
}

export function ResponsiveWatermarkedVideo({
  poster,
  posterA,
  posterB,
  fallback = "b",
  ...props
}: ResponsiveWatermarkedVideoProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [variant, setVariant] = useState<WatermarkVariant>(fallback);

  useEffect(() => {
    setVariant(fallback);
    const video = videoRef.current;
    const posterSource = posterB || posterA || poster;
    if (!video || !posterSource) return;

    const posterImage = new Image();
    let frame = 0;
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const visibleWidth = getVisiblePosterWidth(video, posterImage);
        if (visibleWidth > 0) setVariant(chooseWatermarkVariant(visibleWidth));
      });
    };

    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    observer?.observe(video);
    posterImage.addEventListener("load", measure);
    posterImage.src = posterSource;
    if (posterImage.complete) measure();
    measure();

    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
      posterImage.removeEventListener("load", measure);
    };
  }, [poster, posterA, posterB, fallback]);

  const selectedPoster = useMemo(() => {
    const selected = variant === "b" ? posterB : posterA;
    const alternate = variant === "b" ? posterA : posterB;
    return selected || alternate || poster || undefined;
  }, [poster, posterA, posterB, variant]);

  return (
    <video ref={videoRef} {...props} poster={selectedPoster} data-watermark-variant={variant} />
  );
}

export default ResponsiveWatermarkedVideo;
