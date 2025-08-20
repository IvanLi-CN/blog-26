"use client";

import { useEffect } from "react";

import type { Metric } from "web-vitals";

interface WebVitalsProps {
  onMetric?: (metric: Metric) => void;
}

export default function WebVitals({ onMetric }: WebVitalsProps) {
  useEffect(() => {
    // 动态导入 web-vitals 库
    import("web-vitals")
      .then(({ onCLS, onINP, onFCP, onLCP, onTTFB }) => {
        const reportMetric = (metric: Metric) => {
          // 发送到分析服务
          if (onMetric) {
            onMetric(metric);
          }

          // 发送到 Google Analytics（如果配置了）
          const gtag =
            typeof window !== "undefined"
              ? (window as unknown as { gtag?: (...args: unknown[]) => void }).gtag
              : undefined;
          gtag?.("event", metric.name, {
            event_category: "Web Vitals",
            event_label: metric.id,
            value: Math.round(metric.name === "CLS" ? metric.value * 1000 : metric.value),
            non_interaction: true,
          });

          // 控制台输出（开发环境）
          if (process.env.NODE_ENV === "development") {
            console.log(`[Web Vitals] ${metric.name}:`, metric.value);
          }
        };

        // 监听各项性能指标
        onCLS(reportMetric); // Cumulative Layout Shift
        onINP(reportMetric); // Interaction to Next Paint (替代 FID)
        onFCP(reportMetric); // First Contentful Paint
        onLCP(reportMetric); // Largest Contentful Paint
        onTTFB(reportMetric); // Time to First Byte
      })
      .catch((error) => {
        console.warn("Failed to load web-vitals:", error);
      });
  }, [onMetric]);

  return null; // 这个组件不渲染任何内容
}
