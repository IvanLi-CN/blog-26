"use client";

import { useEffect, useRef } from "react";

type Particle = {
  x: number;
  y: number;
  r: number;
  dx: number;
  dy: number;
  alpha: number;
};

function readRgbVar(name: string, fallback: string) {
  if (typeof window === "undefined") return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

function buildParticles(width: number, height: number, count: number): Particle[] {
  return Array.from({ length: count }, () => ({
    x: Math.random() * width,
    y: Math.random() * height,
    r: 1.2 + Math.random() * 2.8,
    dx: (Math.random() - 0.5) * 0.12,
    dy: (Math.random() - 0.5) * 0.12,
    alpha: 0.04 + Math.random() * 0.08,
  }));
}

export default function AmbientScene() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let width = 0;
    let height = 0;
    let raf = 0;
    let particles = buildParticles(window.innerWidth, window.innerHeight, 14);

    const resize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      particles = buildParticles(width, height, reducedMotion.matches ? 5 : 14);
    };

    const draw = () => {
      const accent = readRgbVar("--nature-accent-rgb", "92, 142, 119");
      const mist = readRgbVar("--nature-mist-rgb", "245, 248, 244");

      ctx.clearRect(0, 0, width, height);

      for (const particle of particles) {
        particle.x += particle.dx;
        particle.y += particle.dy;

        if (particle.x < -24) particle.x = width + 24;
        if (particle.x > width + 24) particle.x = -24;
        if (particle.y < -24) particle.y = height + 24;
        if (particle.y > height + 24) particle.y = -24;

        ctx.beginPath();
        ctx.fillStyle = `rgba(${accent}, ${particle.alpha})`;
        ctx.arc(particle.x, particle.y, particle.r, 0, Math.PI * 2);
        ctx.fill();

        ctx.beginPath();
        ctx.fillStyle = `rgba(${mist}, ${particle.alpha * 0.6})`;
        ctx.arc(
          particle.x + particle.r * 0.5,
          particle.y - particle.r * 0.5,
          particle.r * 0.45,
          0,
          Math.PI * 2
        );
        ctx.fill();
      }

      raf = window.requestAnimationFrame(draw);
    };

    resize();
    draw();

    window.addEventListener("resize", resize);
    reducedMotion.addEventListener("change", resize);

    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      reducedMotion.removeEventListener("change", resize);
    };
  }, []);

  return (
    <div className="nature-ambient" aria-hidden="true">
      <div className="nature-ambient-layer nature-ambient-layer-a" />
      <div className="nature-ambient-layer nature-ambient-layer-b" />
      <div className="nature-ambient-glow" />
      <canvas ref={canvasRef} className="nature-ambient-canvas" />
    </div>
  );
}
