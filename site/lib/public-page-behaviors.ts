import uPlot from "uplot";
import { initializeProjectRuntimeLiveData } from "./project-runtime-live";
import "@/lib/public-playbook-outline";
import "@/lib/public-playbook-resources";

(() => {
  const adaptiveProjectLinkObservers: ResizeObserver[] = [];
  const initAdaptiveProjectLinks = () => {
    adaptiveProjectLinkObservers.forEach((observer) => {
      observer.disconnect();
    });
    adaptiveProjectLinkObservers.length = 0;
    if (typeof ResizeObserver === "undefined") return;

    const roots = Array.from(
      document.querySelectorAll<HTMLElement>('[data-project-external-links][data-adaptive="true"]')
    );

    roots.forEach((root) => {
      const footer = root.closest<HTMLElement>("[data-featured-project-footer]");
      const caseLink = footer?.querySelector<HTMLElement>("[data-project-case-link]");
      if (!footer || !caseLink) return;

      let lastFooterWidth = -1;
      const update = () => {
        const footerWidth = footer.clientWidth;
        if (footerWidth === lastFooterWidth) return;
        lastFooterWidth = footerWidth;
        root.dataset.ready = "true";

        root.dataset.compact = "false";
        const footerStyle = getComputedStyle(footer);
        const gap = Number.parseFloat(footerStyle.columnGap) || 0;
        const requiredWidth = caseLink.offsetWidth + root.scrollWidth + gap;
        const nextCompactState = requiredWidth > footerWidth + 1 ? "true" : "false";
        if (root.dataset.compact !== nextCompactState) root.dataset.compact = nextCompactState;
      };

      const observer = new ResizeObserver(update);
      observer.observe(root);
      observer.observe(footer);
      adaptiveProjectLinkObservers.push(observer);
      requestAnimationFrame(update);
      void document.fonts?.ready.then(() => {
        lastFooterWidth = -1;
        update();
      });
    });
  };
  initAdaptiveProjectLinks();
  document.addEventListener("astro:page-load", initAdaptiveProjectLinks);
})();
(() => {
  const imageSelector = "img[data-project-poster-image]";
  const updateImageState = (image: HTMLImageElement) => {
    image.classList.toggle("is-loaded", image.complete && image.naturalWidth > 0);
    image.classList.toggle("is-error", image.complete && image.naturalWidth === 0);
  };
  const updateThemedProjectImages = () => {
    const theme = document.documentElement.dataset.uiTheme === "dark" ? "dark" : "light";

    document
      .querySelectorAll<HTMLPictureElement>("picture[data-themed-project-picture]")
      .forEach((picture) => {
        if (picture.dataset.projectPosterTheme === theme) return;

        const image = picture.querySelector<HTMLImageElement>(imageSelector);
        const avif = picture.querySelector<HTMLSourceElement>("source[data-project-poster-avif]");
        const webp = picture.querySelector<HTMLSourceElement>("source[data-project-poster-webp]");
        const avifSrcSet =
          theme === "dark" ? picture.dataset.darkAvifSrcset : picture.dataset.lightAvifSrcset;
        const webpSrcSet =
          theme === "dark" ? picture.dataset.darkWebpSrcset : picture.dataset.lightWebpSrcset;
        const fallbackSrc = theme === "dark" ? picture.dataset.darkSrc : picture.dataset.lightSrc;
        const placeholder =
          theme === "dark" ? picture.dataset.darkPlaceholder : picture.dataset.lightPlaceholder;
        if (!image || !avif || !webp || !avifSrcSet || !webpSrcSet || !fallbackSrc || !placeholder)
          return;

        picture.dataset.projectPosterTheme = theme;
        image.classList.remove("is-loaded", "is-error");
        avif.srcset = avifSrcSet;
        webp.srcset = webpSrcSet;
        image.srcset = webpSrcSet;
        image.src = fallbackSrc;
        picture
          .closest<HTMLElement>(".project-poster")
          ?.style.setProperty("--project-poster-placeholder", `url("${placeholder}")`);
        queueMicrotask(() => updateImageState(image));
      });
  };
  document.addEventListener(
    "load",
    (event) => {
      if (event.target instanceof HTMLImageElement && event.target.matches(imageSelector)) {
        updateImageState(event.target);
      }
    },
    true
  );
  document.addEventListener(
    "error",
    (event) => {
      if (event.target instanceof HTMLImageElement && event.target.matches(imageSelector)) {
        event.target.classList.remove("is-loaded");
        event.target.classList.add("is-error");
      }
    },
    true
  );
  updateThemedProjectImages();
  document.querySelectorAll<HTMLImageElement>(imageSelector).forEach(updateImageState);
  document.addEventListener("astro:page-load", updateThemedProjectImages);
  new MutationObserver(updateThemedProjectImages).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-ui-theme"],
  });
})();
(() => {
  const socialImageSelector = "img[data-project-social-preview-image]";
  const updateImageState = (image: HTMLImageElement) => {
    image.classList.toggle("is-loaded", image.complete && image.naturalWidth > 0);
    image.classList.toggle("is-error", image.complete && image.naturalWidth === 0);
  };
  const updateThemedSocialPreviews = () => {
    const theme = document.documentElement.dataset.uiTheme === "dark" ? "dark" : "light";

    document
      .querySelectorAll<HTMLPictureElement>("picture[data-themed-project-social-picture]")
      .forEach((picture) => {
        if (picture.dataset.projectSocialTheme === theme) return;

        const image = picture.querySelector<HTMLImageElement>(socialImageSelector);
        const avif = picture.querySelector<HTMLSourceElement>(
          "source[data-project-social-preview-avif]"
        );
        const webp = picture.querySelector<HTMLSourceElement>(
          "source[data-project-social-preview-webp]"
        );
        const prefix = theme === "dark" ? "dark" : "light";
        const avifSrcSet = picture.dataset[`${prefix}AvifSrcset`];
        const webpSrcSet = picture.dataset[`${prefix}WebpSrcset`];
        const fallbackSrc = picture.dataset[`${prefix}Src`];
        const placeholder = picture.dataset[`${prefix}Placeholder`];
        if (
          !image ||
          !avif ||
          !webp ||
          !avifSrcSet ||
          !webpSrcSet ||
          !fallbackSrc ||
          !placeholder
        ) {
          return;
        }

        picture.dataset.projectSocialTheme = theme;
        image.classList.remove("is-loaded", "is-error");
        avif.srcset = avifSrcSet;
        webp.srcset = webpSrcSet;
        image.srcset = webpSrcSet;
        image.src = fallbackSrc;
        picture
          .closest<HTMLElement>(".project-social-preview")
          ?.style.setProperty("--project-social-preview-placeholder", `url("${placeholder}")`);
        queueMicrotask(() => updateImageState(image));
      });
  };
  document.addEventListener(
    "load",
    (event) => {
      if (event.target instanceof HTMLImageElement && event.target.matches(socialImageSelector)) {
        updateImageState(event.target);
      }
    },
    true
  );
  document.addEventListener(
    "error",
    (event) => {
      if (event.target instanceof HTMLImageElement && event.target.matches(socialImageSelector)) {
        event.target.classList.remove("is-loaded");
        event.target.classList.add("is-error");
      }
    },
    true
  );
  updateThemedSocialPreviews();
  document.querySelectorAll<HTMLImageElement>(socialImageSelector).forEach(updateImageState);
  document.addEventListener("astro:page-load", updateThemedSocialPreviews);
  new MutationObserver(updateThemedSocialPreviews).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-ui-theme"],
  });
})();
(() => {
  const bindRuntimeCharts = () => {
    document.querySelectorAll<HTMLElement>("[data-runtime-chart]").forEach((chart) => {
      if (chart.dataset.runtimeBound === "true") return;
      chart.dataset.runtimeBound = "true";
      const tooltip = chart.querySelector<HTMLElement>("[data-runtime-tooltip]");
      if (!tooltip) return;

      const hideTooltip = () => {
        tooltip.hidden = true;
        tooltip.textContent = "";
        tooltip.style.removeProperty("left");
        tooltip.style.removeProperty("top");
      };

      const positionTooltip = (point: HTMLElement) => {
        const chartBounds = chart.getBoundingClientRect();
        const pointBounds = point.getBoundingClientRect();
        const tooltipBounds = tooltip.getBoundingClientRect();
        const gap = 0.45 * parseFloat(getComputedStyle(chart).fontSize || "16");
        const edge = 0.35 * parseFloat(getComputedStyle(chart).fontSize || "16");
        const maxLeft = Math.max(edge, chartBounds.width - tooltipBounds.width - edge);
        const maxTop = Math.max(edge, chartBounds.height - tooltipBounds.height - edge);
        let left =
          pointBounds.left - chartBounds.left + pointBounds.width / 2 - tooltipBounds.width / 2;
        let top = pointBounds.top - chartBounds.top - tooltipBounds.height - gap;

        if (top < edge) top = pointBounds.bottom - chartBounds.top + gap;
        left = Math.min(Math.max(left, edge), maxLeft);
        top = Math.min(Math.max(top, edge), maxTop);
        tooltip.style.left = `${left}px`;
        tooltip.style.top = `${top}px`;
      };
      const showTooltip = (point: HTMLElement) => {
        tooltip.textContent = `${point.dataset.date} · ${point.dataset.label}: ${point.dataset.value}`;
        tooltip.hidden = false;
        positionTooltip(point);
      };
      const pointFromTarget = (target: EventTarget | null) => {
        if (!(target instanceof Element)) return null;
        const point = target.closest<HTMLElement>("[data-runtime-point]");
        return point && chart.contains(point) ? point : null;
      };

      chart.addEventListener("pointerover", (event) => {
        const point = pointFromTarget(event.target);
        if (point) showTooltip(point);
      });
      chart.addEventListener("pointerout", (event) => {
        const nextPoint = pointFromTarget(event.relatedTarget);
        if (!nextPoint) hideTooltip();
      });
      chart.addEventListener("focusin", (event) => {
        const point = pointFromTarget(event.target);
        if (point) showTooltip(point);
      });
      chart.addEventListener("focusout", (event) => {
        if (!pointFromTarget(event.relatedTarget)) hideTooltip();
      });
      chart.addEventListener("click", (event) => {
        const point = pointFromTarget(event.target);
        if (!point) return;
        event.preventDefault();
        event.stopPropagation();
        if (tooltip.hidden) showTooltip(point);
        else hideTooltip();
      });
      chart.addEventListener("keydown", (event) => {
        const point = pointFromTarget(event.target);
        if (!point) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          event.stopPropagation();
          showTooltip(point);
        }
        if (event.key === "Escape") hideTooltip();
      });
    });
  };
  bindRuntimeCharts();
  document.addEventListener("astro:page-load", bindRuntimeCharts);
})();
(() => {
  let measureNode: HTMLSpanElement | null = null;
  const runtimeValueRefreshers = new WeakMap<HTMLElement, () => void>();
  const getMeasureNode = () => {
    if (measureNode) return measureNode;
    if (!document.body) return null;
    measureNode = document.createElement("span");
    measureNode.style.position = "absolute";
    measureNode.style.visibility = "hidden";
    measureNode.style.pointerEvents = "none";
    measureNode.style.whiteSpace = "nowrap";
    measureNode.style.inset = "-9999px auto auto -9999px";
    document.body.appendChild(measureNode);
    return measureNode;
  };
  const readOptions = (value: HTMLElement) => {
    try {
      const options = JSON.parse(value.dataset.runtimeValueOptions ?? "[]");
      return Array.isArray(options)
        ? options.filter((option): option is string => typeof option === "string")
        : [];
    } catch {
      return [];
    }
  };
  const setMeasureStyle = (value: HTMLElement) => {
    const node = getMeasureNode();
    if (!node) return;
    const styles = getComputedStyle(value);
    node.style.font = styles.font;
    node.style.letterSpacing = styles.letterSpacing;
    node.style.fontKerning = styles.fontKerning;
    node.style.fontFeatureSettings = styles.fontFeatureSettings;
  };
  const measuredWidth = (candidate: string) => {
    const node = getMeasureNode();
    if (!node) return Number.POSITIVE_INFINITY;
    node.textContent = candidate;
    return node.getBoundingClientRect().width;
  };
  const hideTooltip = (tooltip: HTMLElement) => {
    tooltip.hidden = true;
    tooltip.textContent = "";
    tooltip.style.removeProperty("left");
    tooltip.style.removeProperty("top");
  };
  const positionTooltip = (value: HTMLElement, tooltip: HTMLElement) => {
    const metric = value.closest<HTMLElement>(".runtime-metric");
    const panel = value.closest<HTMLElement>("[data-project-runtime-panel]");
    if (!metric || !panel) return;

    const metricBounds = metric.getBoundingClientRect();
    const panelBounds = panel.getBoundingClientRect();
    const valueBounds = value.getBoundingClientRect();
    const tooltipBounds = tooltip.getBoundingClientRect();
    const gap = 6;
    const edge = 6;
    const maxLeft = Math.max(
      edge,
      panelBounds.right - metricBounds.left - tooltipBounds.width - edge
    );
    let left = valueBounds.left - metricBounds.left;
    let top = valueBounds.bottom - metricBounds.top + gap;

    if (metricBounds.top + top + tooltipBounds.height > panelBounds.bottom - edge) {
      top = valueBounds.top - metricBounds.top - tooltipBounds.height - gap;
    }
    left = Math.min(Math.max(left, panelBounds.left - metricBounds.left + edge), maxLeft);
    top = Math.max(top, panelBounds.top - metricBounds.top + edge);
    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
  };
  const bindRuntimeValues = () => {
    document.querySelectorAll<HTMLElement>("[data-runtime-value]").forEach((value) => {
      if (value.dataset.runtimeValueBound === "true") return;
      const tooltip = value.parentElement?.querySelector<HTMLElement>(
        "[data-runtime-value-tooltip]"
      );
      if (!tooltip) return;

      const applyValue = () => {
        const options = readOptions(value);
        const fullValue = value.dataset.runtimeValueFull ?? options[0] ?? "0";
        setMeasureStyle(value);
        const availableWidth = value.getBoundingClientRect().width;
        const selectedValue =
          options.find((option) => measuredWidth(option) <= availableWidth + 0.5) ??
          options.at(-1) ??
          fullValue;
        const isTruncated =
          selectedValue !== fullValue || measuredWidth(fullValue) > availableWidth + 0.5;
        value.textContent = selectedValue;
        value.dataset.runtimeValueTruncated = String(isTruncated);
        value.tabIndex = isTruncated ? 0 : -1;
        if (!isTruncated) hideTooltip(tooltip);
      };
      const showTooltip = () => {
        if (value.dataset.runtimeValueTruncated !== "true") return;
        const fullValue = value.dataset.runtimeValueFull ?? readOptions(value)[0] ?? "0";
        tooltip.textContent = fullValue;
        tooltip.hidden = false;
        positionTooltip(value, tooltip);
      };

      value.dataset.runtimeValueBound = "true";
      value.addEventListener("pointerenter", showTooltip);
      value.addEventListener("pointerleave", () => hideTooltip(tooltip));
      value.addEventListener("focus", showTooltip);
      value.addEventListener("blur", () => hideTooltip(tooltip));
      value.addEventListener("keydown", (event) => {
        if (event.key === "Escape") hideTooltip(tooltip);
      });

      const resizeObserver = new ResizeObserver(applyValue);
      resizeObserver.observe(value);
      runtimeValueRefreshers.set(value, applyValue);
      applyValue();
    });
  };
  const refreshRuntimeValues = () => {
    document.querySelectorAll<HTMLElement>("[data-runtime-value]").forEach((value) => {
      runtimeValueRefreshers.get(value)?.();
    });
  };
  const scheduleBind = () => window.requestAnimationFrame(bindRuntimeValues);
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", scheduleBind, { once: true });
  } else {
    scheduleBind();
  }
  document.addEventListener("astro:page-load", scheduleBind);
  document.fonts?.ready.then(scheduleBind);
  window.addEventListener("project-runtime-metrics-updated", refreshRuntimeValues);
})();
(() => {
  interface TrendPoint {
    timestamp: string;
    value: number | null;
  }
  interface TrendData {
    points: TrendPoint[];
  }
  const getColor = (element: HTMLElement) => {
    const styles = getComputedStyle(element);
    if (element.classList.contains("runtime-sparkline--bars")) {
      return styles.getPropertyValue("--runtime-bar").trim();
    }
    if (element.classList.contains("runtime-sparkline--secondary")) {
      return styles.getPropertyValue("--runtime-secondary").trim();
    }
    if (element.classList.contains("runtime-sparkline--warm")) {
      return styles.getPropertyValue("--runtime-warm").trim();
    }
    return styles.getPropertyValue("--runtime-accent").trim();
  };
  const withAlpha = (color: string, alpha: number) => {
    const match = color.match(/^rgba?\(([^)]+)\)$/);
    if (!match) return color;
    const channels = match[1]
      .split(",")
      .slice(0, 3)
      .map((channel) => channel.trim());
    return `rgba(${channels.join(", ")}, ${alpha})`;
  };
  const sparklineInstances = new Map<
    HTMLElement,
    { plot: uPlot; resizeObserver: ResizeObserver }
  >();
  const bindSparklines = (force = false) => {
    document.querySelectorAll<HTMLElement>("[data-runtime-sparkline]").forEach((element) => {
      if (element.dataset.runtimeSparklineBound === "true") {
        if (!force) return;
        const previous = sparklineInstances.get(element);
        previous?.resizeObserver.disconnect();
        previous?.plot.destroy();
        sparklineInstances.delete(element);
        element.dataset.runtimeSparklineBound = "false";
      }
      const trend = JSON.parse(element.dataset.runtimeTrend ?? "{}") as TrendData;
      if (!trend.points?.length) return;

      const xValues = trend.points.map((point) => Math.floor(Date.parse(point.timestamp) / 1000));
      const yValues = trend.points.map((point) => point.value);
      const numericYValues = yValues.filter((value): value is number => value !== null);
      const minY = numericYValues.length ? Math.min(...numericYValues) : 0;
      const maxY = numericYValues.length ? Math.max(...numericYValues) : 0;
      const variant = element.dataset.runtimeChartVariant === "bars" ? "bars" : "line";
      const placement = element.dataset.runtimeChartPlacement === "right" ? "right" : "full";
      const rangeSpan = Math.max(maxY - minY, Math.abs(maxY) * 0.08, 1);
      const rangePadding = rangeSpan * 0.2;
      const isFlatZero = minY === 0 && maxY === 0;
      const yMin = variant === "bars" ? 0 : isFlatZero ? -1 : Math.max(0, minY - rangePadding);
      const yMax = isFlatZero ? 1 : variant === "bars" ? maxY * 1.14 : maxY + rangePadding;
      const xStart = xValues[0] ?? 0;
      const xEnd = xValues[xValues.length - 1] ?? xStart;
      const xStep = xValues.length > 1 ? (xEnd - xStart) / (xValues.length - 1) : 60;
      const xRange =
        variant === "bars"
          ? ([xStart - xStep / 2, xEnd + xStep / 2] as [number, number])
          : undefined;
      const color = getColor(element) || "currentColor";
      const getSize = () => ({
        width: Math.max(Math.floor(element.getBoundingClientRect().width), 8),
        height: Math.max(Math.floor(element.getBoundingClientRect().height), 24),
      });
      const getChartPadding = () => {
        const topPadding = variant === "bars" ? 4 : placement === "full" ? 48 : 16;
        const bottomPadding = variant === "bars" ? 5 : 8;
        return [topPadding, 0, bottomPadding, 0] as [number, number, number, number];
      };
      const styles = getComputedStyle(element);
      const areaOpacity =
        Number.parseFloat(styles.getPropertyValue("--runtime-area-opacity")) || 0.16;
      const barOpacity =
        Number.parseFloat(styles.getPropertyValue("--runtime-bar-opacity")) || 0.86;
      const lineSeries = {
        stroke: color,
        fill: withAlpha(color, areaOpacity),
        width: 1.5,
        paths: uPlot.paths.spline?.(),
        points: { show: false },
        spanGaps: false,
      };
      const barSeries = {
        stroke: color,
        fill: withAlpha(color, barOpacity),
        width: 0,
        paths: uPlot.paths.bars?.({
          size: [0.72, 14, 1],
          gap: 1,
          radius: [0, 0],
        }),
        points: { show: false },
        spanGaps: false,
      };
      const chartSeries = variant === "bars" ? [barSeries] : [lineSeries];
      const chartData: uPlot.AlignedData = [xValues, yValues];

      const plot = new uPlot(
        {
          width: getSize().width,
          height: getSize().height,
          padding: getChartPadding(),
          scales: {
            x: {
              time: true,
              ...(xRange ? { range: xRange } : {}),
            },
            y: {
              range: [yMin, yMax],
            },
          },
          axes: [{ show: false }, { show: false }],
          legend: { show: false },
          cursor: { show: false },
          select: { show: false, left: 0, top: 0, width: 0, height: 0 },
          series: [{}, ...chartSeries],
        },
        chartData,
        element
      );

      const resizeObserver = new ResizeObserver(() => {
        plot.setSize(getSize());
      });
      resizeObserver.observe(element);
      sparklineInstances.set(element, { plot, resizeObserver });
      element.dataset.runtimeSparklineBound = "true";
    });
  };
  const scheduleBind = () => window.requestAnimationFrame(() => bindSparklines());
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", scheduleBind, { once: true });
  } else {
    scheduleBind();
  }
  document.addEventListener("astro:page-load", scheduleBind);
  document.addEventListener("astro:before-swap", () => {
    for (const [element, instance] of sparklineInstances) {
      instance.resizeObserver.disconnect();
      instance.plot.destroy();
      element.dataset.runtimeSparklineBound = "false";
    }
    sparklineInstances.clear();
  });
  window.addEventListener("project-runtime-metrics-updated", () =>
    window.requestAnimationFrame(() => bindSparklines(true))
  );
})();
(() => {
  initializeProjectRuntimeLiveData();
  document.addEventListener("astro:page-load", initializeProjectRuntimeLiveData);
})();
