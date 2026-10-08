import * as React from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../../../src/components/ui/tooltip";
import { readLatestProjectRuntimeMetrics } from "../../lib/project-runtime-channel";
import type {
  ProjectRuntimeMetrics,
  RuntimeActivityPoint,
} from "../../lib/project-runtime-metrics";
import { calculateFreshnessLayout } from "../../lib/runtime-freshness-layout";
import { createRuntimeTouchGestureController } from "./runtime-cell-gesture";
import "./runtime-cell-grid.css";

export type ActivityKind = "tokens" | "requests";
export type GridKind = ActivityKind | "freshness";

interface Props {
  kind: GridKind;
  label: string;
  points?: RuntimeActivityPoint[];
  freshness?: number[];
  navigationUrl?: string;
}

export interface RuntimeCellData {
  index: number;
  date?: string;
  value?: number | null;
  statusCode?: number;
  week?: number;
  weekday?: number;
}

interface RuntimeMetricsUpdatedDetail {
  panel?: HTMLElement;
  metrics?: ProjectRuntimeMetrics;
}

const freshnessStatusClasses = [
  "within-4-hours",
  "4-to-12-hours",
  "12-to-24-hours",
  "over-24-hours",
  "no-success",
] as const;

const freshnessStatusLabels = [
  "最近成功刷新：4 小时内",
  "最近成功刷新：4–12 小时前",
  "最近成功刷新：12–24 小时前",
  "最近成功刷新：超过 24 小时",
  "从未成功刷新",
] as const;

const dayMilliseconds = 24 * 60 * 60 * 1000;

function parseUtcDate(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return Date.UTC(year, month - 1, day);
}

function formatUtcDate(timestamp: number) {
  return new Date(timestamp).toISOString().slice(0, 10);
}

export function formatExactValue(value: number) {
  return Number.isInteger(value)
    ? value.toLocaleString("en-US")
    : value.toLocaleString("en-US", { maximumFractionDigits: 6 });
}

export function buildActivityCells(points: RuntimeActivityPoint[]) {
  const firstTimestamp = parseUtcDate(points[0]?.date ?? "1970-01-01");
  const lastTimestamp = parseUtcDate(points.at(-1)?.date ?? points[0]?.date ?? "1970-01-01");
  const calendarStart = firstTimestamp - new Date(firstTimestamp).getUTCDay() * dayMilliseconds;
  const calendarEnd = lastTimestamp + (6 - new Date(lastTimestamp).getUTCDay()) * dayMilliseconds;
  const weekCount = Math.floor((calendarEnd - calendarStart) / (7 * dayMilliseconds)) + 1;
  const pointsByDate = new Map(points.map((point) => [point.date, point]));

  return {
    weekCount,
    cells: Array.from({ length: weekCount * 7 }, (_, index) => {
      const date = formatUtcDate(calendarStart + index * dayMilliseconds);
      const point = pointsByDate.get(date);
      return {
        index,
        date,
        value: point?.value,
        week: Math.floor(index / 7) + 1,
        weekday: (index % 7) + 1,
      } satisfies RuntimeCellData;
    }),
  };
}

function valueLabel(kind: ActivityKind) {
  return kind === "tokens" ? "Token 消耗量" : "请求次数";
}

export function formatRuntimeCellText(kind: GridKind, cell: RuntimeCellData) {
  if (kind === "freshness") {
    return freshnessStatusLabels[cell.statusCode ?? 4] ?? freshnessStatusLabels[4];
  }
  const unit = kind === "tokens" ? "Token" : "次";
  return `${cell.date ?? ""} · ${valueLabel(kind)}：${formatExactValue(cell.value ?? 0)} ${unit}`;
}

function isElementTarget(target: EventTarget | null): target is Element {
  return target instanceof Element;
}

function getPointFromTarget(target: EventTarget | null, grid: HTMLElement) {
  if (!isElementTarget(target)) return null;
  const point = target.closest<HTMLElement>("[data-runtime-cell]");
  return point && grid.contains(point) ? point : null;
}

function getFocusTarget(cell: HTMLElement) {
  return cell.querySelector<HTMLElement>("[data-runtime-link]") ?? cell;
}

function getPointFromCoordinates(grid: HTMLElement, clientX: number, clientY: number) {
  const bounds = grid.getBoundingClientRect();
  if (
    clientX < bounds.left ||
    clientX > bounds.right ||
    clientY < bounds.top ||
    clientY > bounds.bottom
  ) {
    return null;
  }
  const emptySlots = Array.from(grid.querySelectorAll<HTMLElement>(".runtime-activity-slot"));
  if (
    emptySlots.some((slot) => {
      const rect = slot.getBoundingClientRect();
      return (
        clientX >= rect.left &&
        clientX <= rect.right &&
        clientY >= rect.top &&
        clientY <= rect.bottom
      );
    })
  )
    return null;
  const cells = Array.from(
    grid.querySelectorAll<HTMLElement>(".runtime-activity-cell, .runtime-freshness-cell")
  );
  let best: HTMLElement | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const cell of cells) {
    const rect = cell.getBoundingClientRect();
    const inside =
      clientX >= rect.left &&
      clientX <= rect.right &&
      clientY >= rect.top &&
      clientY <= rect.bottom;
    const horizontalGap =
      clientX < rect.left ? rect.left - clientX : clientX > rect.right ? clientX - rect.right : 0;
    const verticalGap =
      clientY < rect.top ? rect.top - clientY : clientY > rect.bottom ? clientY - rect.bottom : 0;
    const candidateDistance = horizontalGap ** 2 + verticalGap ** 2;
    if (inside && candidateDistance === 0)
      return cell.hasAttribute("data-runtime-cell") ? cell : null;
    if (candidateDistance < bestDistance) {
      best = cell;
      bestDistance = candidateDistance;
    }
  }
  if (!best?.hasAttribute("data-runtime-cell")) return null;
  const bestRect = best.getBoundingClientRect();
  const gridStyle = getComputedStyle(grid);
  const columnGap = Number.parseFloat(gridStyle.columnGap) || 0;
  const rowGap = Number.parseFloat(gridStyle.rowGap) || 0;
  const gapRadius = Math.hypot(columnGap, rowGap) / 2 + 1;
  const maxGap = Math.max(Math.max(bestRect.width, bestRect.height) * 0.6, gapRadius);
  if (Math.sqrt(bestDistance) > maxGap) return null;
  return best;
}

function getDirectionalCell(
  cells: HTMLElement[],
  current: HTMLElement,
  direction: "ArrowRight" | "ArrowDown" | "ArrowLeft" | "ArrowUp"
) {
  const currentRect = current.getBoundingClientRect();
  const currentCenter = {
    x: currentRect.left + currentRect.width / 2,
    y: currentRect.top + currentRect.height / 2,
  };
  const candidates = cells
    .filter((candidate) => candidate !== current)
    .map((candidate) => {
      const rect = candidate.getBoundingClientRect();
      const center = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
      return {
        candidate,
        primary:
          direction === "ArrowRight" || direction === "ArrowLeft"
            ? Math.abs(center.x - currentCenter.x)
            : Math.abs(center.y - currentCenter.y),
        secondary:
          direction === "ArrowRight" || direction === "ArrowLeft"
            ? Math.abs(center.y - currentCenter.y)
            : Math.abs(center.x - currentCenter.x),
        deltaX: center.x - currentCenter.x,
        deltaY: center.y - currentCenter.y,
      };
    })
    .filter(({ deltaX, deltaY }) => {
      if (direction === "ArrowRight") return deltaX > 1;
      if (direction === "ArrowLeft") return deltaX < -1;
      if (direction === "ArrowDown") return deltaY > 1;
      return deltaY < -1;
    })
    .sort((left, right) => left.primary - right.primary || left.secondary - right.secondary);
  return candidates[0]?.candidate ?? null;
}

function getStableTouchAnchorRect(grid: HTMLElement) {
  const bounds = grid.getBoundingClientRect();
  return {
    left: Math.min(Math.max(bounds.width / 2 - 1, 0), Math.max(bounds.width - 2, 0)),
    top: 0,
  };
}

function RuntimeCellGrid({ kind, label, points = [], freshness = [], navigationUrl }: Props) {
  const gridRef = React.useRef<HTMLDivElement | null>(null);
  const hoverTimer = React.useRef<number | undefined>(undefined);
  const pendingMetrics = React.useRef<ProjectRuntimeMetrics | null>(null);
  const suppressContextMenuUntil = React.useRef(0);
  const suppressClickUntil = React.useRef(0);
  const activeCellIndex = React.useRef<number | null>(null);
  const touchGestureRef = React.useRef<ReturnType<
    typeof createRuntimeTouchGestureController
  > | null>(null);
  const [activityPoints, setActivityPoints] = React.useState(points);
  const [freshnessValues, setFreshnessValues] = React.useState(freshness);
  const [activeCell, setActiveCell] = React.useState<RuntimeCellData | null>(null);
  const [open, setOpen] = React.useState(false);
  const [touchAnchor, setTouchAnchor] = React.useState<{ left: number; top: number } | null>(null);
  const [freshnessLayout, setFreshnessLayout] = React.useState<ReturnType<
    typeof calculateFreshnessLayout
  > | null>(null);
  const focusRestoreIndex = React.useRef<number | null>(null);

  const isFreshness = kind === "freshness";
  const activity = React.useMemo(
    () => (isFreshness ? null : buildActivityCells(activityPoints)),
    [activityPoints, isFreshness]
  );
  const cells = isFreshness
    ? freshnessValues.map((statusCode, index) => ({ index, statusCode }))
    : (activity?.cells ?? []);
  const freshnessColumns = freshnessLayout?.columns ?? 30;
  const freshnessRows = Math.ceil(cells.length / freshnessColumns);
  const firstDataIndex =
    cells.find((cell) => (isFreshness ? true : cell.value !== undefined && cell.value !== null))
      ?.index ?? 0;
  const currentCellText = activeCell ? formatRuntimeCellText(kind, activeCell) : "";

  React.useEffect(() => {
    if (!isFreshness) {
      setFreshnessLayout(null);
      return;
    }
    const grid = gridRef.current;
    if (!grid) return;
    const setLayout = (nextLayout: NonNullable<ReturnType<typeof calculateFreshnessLayout>>) => {
      setFreshnessLayout((previous) => {
        if (
          previous &&
          previous.columns === nextLayout.columns &&
          previous.rows === nextLayout.rows &&
          previous.gap === nextLayout.gap &&
          previous.cellSize === nextLayout.cellSize &&
          previous.gridHeight === nextLayout.gridHeight
        ) {
          return previous;
        }
        const focusedCell = getPointFromTarget(document.activeElement, grid);
        if (focusedCell) {
          focusRestoreIndex.current = Number(focusedCell.dataset.runtimeCellIndex ?? -1);
        }
        return nextLayout;
      });
    };
    const applyColumnsRows = (columns: number, rows: number) => {
      setFreshnessLayout((previous) => {
        if (previous?.columns === columns && previous.rows === rows) return previous;
        const focusedCell = getPointFromTarget(document.activeElement, grid);
        if (focusedCell) {
          focusRestoreIndex.current = Number(focusedCell.dataset.runtimeCellIndex ?? -1);
        }
        return {
          columns,
          rows,
          gap: previous?.gap ?? 0,
          cellSize: previous?.cellSize ?? 0,
          gridHeight: previous?.gridHeight ?? 0,
        };
      });
    };
    const readPublishedLayout = () => {
      const columns = Number.parseInt(grid.dataset.runtimeFreshnessColumns ?? "", 10);
      const rows = Number.parseInt(grid.dataset.runtimeFreshnessRows ?? "", 10);
      if (Number.isSafeInteger(columns) && columns > 0 && Number.isSafeInteger(rows) && rows >= 0) {
        applyColumnsRows(columns, rows);
        return true;
      }
      return false;
    };
    const readCssLayout = () => {
      const computedStyle = getComputedStyle(grid);
      const columns = Number.parseInt(
        computedStyle.getPropertyValue("--runtime-freshness-columns"),
        10
      );
      const rows = Number.parseInt(computedStyle.getPropertyValue("--runtime-freshness-rows"), 10);
      if (Number.isSafeInteger(columns) && columns > 0 && Number.isSafeInteger(rows) && rows >= 0) {
        applyColumnsRows(columns, rows);
        return true;
      }
      return false;
    };
    const updateLayout = () => {
      if (readPublishedLayout() || readCssLayout()) return;
      const bounds = grid.getBoundingClientRect();
      const designGap =
        Number.parseFloat(getComputedStyle(document.documentElement).fontSize) * 0.18;
      const nextLayout = calculateFreshnessLayout(
        cells.length,
        bounds.width,
        bounds.height,
        designGap
      );
      if (!nextLayout) return;
      setLayout(nextLayout);
    };
    updateLayout();
    const mutationObserver =
      typeof MutationObserver === "undefined" ? null : new MutationObserver(updateLayout);
    mutationObserver?.observe(grid, {
      attributes: true,
      attributeFilter: ["data-runtime-freshness-columns", "data-runtime-freshness-rows", "style"],
    });
    const resizeObserver =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(updateLayout);
    resizeObserver?.observe(grid);
    const onPublishedLayout = () => updateLayout();
    grid.addEventListener("runtime-freshness-layout", onPublishedLayout);
    return () => {
      mutationObserver?.disconnect();
      resizeObserver?.disconnect();
      grid.removeEventListener("runtime-freshness-layout", onPublishedLayout);
    };
  }, [cells.length, isFreshness]);

  React.useLayoutEffect(() => {
    const index = focusRestoreIndex.current;
    if (!isFreshness || index === null || freshnessLayout === null) return;
    const cell = gridRef.current?.querySelector<HTMLElement>(
      `[data-runtime-cell-index="${index}"]`
    );
    if (cell) getFocusTarget(cell).focus();
    focusRestoreIndex.current = null;
  }, [freshnessLayout, isFreshness]);

  const clearHover = React.useCallback(() => {
    if (hoverTimer.current !== undefined) {
      window.clearTimeout(hoverTimer.current);
      hoverTimer.current = undefined;
    }
  }, []);

  const clearActiveCell = React.useCallback(() => {
    gridRef.current?.querySelectorAll<HTMLElement>("[data-runtime-cell]").forEach((cell) => {
      delete cell.dataset.runtimeActive;
    });
    setOpen(false);
    setActiveCell(null);
    activeCellIndex.current = null;
    setTouchAnchor(null);
  }, []);

  const hide = React.useCallback(() => {
    touchGestureRef.current?.cancel();
    clearHover();
    clearActiveCell();
  }, [clearActiveCell, clearHover]);

  const applyMetrics = React.useCallback(
    (metrics: ProjectRuntimeMetrics) => {
      const nextCells =
        metrics.kind === "octo-rill"
          ? Array.from(metrics.freshness, (statusCode, index) => ({ index, statusCode }))
          : buildActivityCells(
              kind === "tokens" ? metrics.tokenActivity90d : metrics.requestActivity90d
            ).cells;
      if (metrics.kind === "octo-rill") {
        setFreshnessValues(nextCells.map((cell) => cell.statusCode ?? 4));
      } else {
        setActivityPoints(
          kind === "tokens" ? metrics.tokenActivity90d : metrics.requestActivity90d
        );
      }
      const currentIndex = activeCellIndex.current;
      if (currentIndex !== null) {
        const nextCell = nextCells[currentIndex];
        if (
          !nextCell ||
          (!isFreshness && (nextCell.value === undefined || nextCell.value === null))
        ) {
          setOpen(false);
          setActiveCell(null);
          activeCellIndex.current = null;
        } else {
          setActiveCell(nextCell);
        }
      }
    },
    [isFreshness, kind]
  );

  React.useEffect(() => {
    const panel = gridRef.current?.closest<HTMLElement>("[data-project-runtime-panel]") ?? null;
    const onMetricsUpdated = (event: Event) => {
      const detail = (event as CustomEvent<RuntimeMetricsUpdatedDetail>).detail;
      if (detail?.panel !== panel || !detail.metrics) return;
      const expectedKind = isFreshness
        ? "octo-rill"
        : kind === "tokens"
          ? "codex-vibe-monitor"
          : "tavily-hikari";
      if (detail.metrics.kind !== expectedKind) return;
      if (touchGestureRef.current?.isInspecting()) pendingMetrics.current = detail.metrics;
      else applyMetrics(detail.metrics);
    };
    const onFallback = (event: Event) => {
      const detail = (event as CustomEvent<{ panel?: HTMLElement }>).detail;
      if (detail?.panel === panel) {
        pendingMetrics.current = null;
        hide();
      }
    };
    const onVisibility = () => {
      if (document.hidden) {
        pendingMetrics.current = null;
        hide();
      }
    };
    const onPageHide = () => {
      pendingMetrics.current = null;
      hide();
    };
    window.addEventListener("project-runtime-metrics-updated", onMetricsUpdated);
    window.addEventListener("project-runtime-metrics-fallback", onFallback);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHide);
    document.addEventListener("astro:before-swap", onPageHide);
    if (panel) {
      const latestMetrics = readLatestProjectRuntimeMetrics(panel);
      if (latestMetrics) applyMetrics(latestMetrics);
    }
    return () => {
      window.removeEventListener("project-runtime-metrics-updated", onMetricsUpdated);
      window.removeEventListener("project-runtime-metrics-fallback", onFallback);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
      document.removeEventListener("astro:before-swap", onPageHide);
      hide();
    };
  }, [applyMetrics, hide, isFreshness, kind]);

  const setCell = React.useCallback(
    (element: HTMLElement | null, touch = false) => {
      if (!element) {
        clearActiveCell();
        return;
      }
      const cell: RuntimeCellData = {
        index: Number(element.dataset.runtimeCellIndex ?? 0),
        date: element.dataset.date,
        value: element.dataset.value === undefined ? undefined : Number(element.dataset.value),
        statusCode:
          element.dataset.statusCode === undefined ? undefined : Number(element.dataset.statusCode),
        week: element.dataset.week === undefined ? undefined : Number(element.dataset.week),
        weekday:
          element.dataset.weekday === undefined ? undefined : Number(element.dataset.weekday),
      };
      const allCells = gridRef.current?.querySelectorAll<HTMLElement>("[data-runtime-cell]");
      allCells?.forEach((candidate) => {
        getFocusTarget(candidate).tabIndex = candidate === element ? 0 : -1;
        candidate.dataset.runtimeActive = String(candidate === element);
      });
      setActiveCell(cell);
      activeCellIndex.current = cell.index;
      setOpen(true);
      if (!touch) setTouchAnchor(null);
    },
    [clearActiveCell]
  );

  React.useEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;
    const interactionRoot = grid.closest<HTMLElement>("[data-project-runtime-panel]") ?? grid;
    const gesture = createRuntimeTouchGestureController({
      onRecognized: (point) => {
        const cell = getPointFromCoordinates(grid, point.x, point.y);
        if (!cell) return;
        setCell(cell, true);
        setTouchAnchor(getStableTouchAnchorRect(grid));
      },
    });
    touchGestureRef.current = gesture;

    const schedulePointerCell = (cell: HTMLElement, resetDelay: boolean) => {
      const nextIndex = Number(cell.dataset.runtimeCellIndex ?? -1);
      if (activeCellIndex.current === nextIndex) return;
      if (activeCellIndex.current !== null) {
        clearHover();
        setCell(cell);
        return;
      }
      if (resetDelay) clearHover();
      if (hoverTimer.current === undefined) {
        hoverTimer.current = window.setTimeout(() => {
          hoverTimer.current = undefined;
          setCell(cell);
        }, 150);
      }
    };

    const onPointerOver = (event: PointerEvent) => {
      if (event.pointerType === "touch") return;
      const cell = getPointFromTarget(event.target, grid);
      if (!cell) return;
      schedulePointerCell(cell, true);
    };
    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerType === "touch") return;
      const cell = getPointFromTarget(event.target, grid);
      if (cell) schedulePointerCell(cell, false);
    };
    const onPointerDown = (event: PointerEvent) => {
      if (event.pointerType === "mouse") suppressClickUntil.current = 0;
    };
    const onPointerOut = (event: PointerEvent) => {
      if (event.pointerType === "touch") return;
      const next = getPointFromTarget(event.relatedTarget, grid);
      const relatedElement = isElementTarget(event.relatedTarget) ? event.relatedTarget : null;
      const remainsInGrid = relatedElement ? grid.contains(relatedElement) : false;
      const remainsOnCellByCoordinates = getPointFromCoordinates(
        grid,
        event.clientX,
        event.clientY
      );
      if (
        !next &&
        !remainsInGrid &&
        !remainsOnCellByCoordinates &&
        !relatedElement?.closest("[data-radix-tooltip-content]")
      ) {
        hide();
      }
    };
    const onFocusIn = (event: FocusEvent) => {
      const cell = getPointFromTarget(event.target, grid);
      if (cell) setCell(cell);
    };
    const onFocusOut = (event: FocusEvent) => {
      if (!getPointFromTarget(event.relatedTarget, grid)) hide();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      const cell = getPointFromTarget(event.target, grid);
      if (!cell) return;
      if (event.key === "Escape") {
        event.preventDefault();
        hide();
        return;
      }
      if (event.key === "Enter" && navigationUrl) return;
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        setCell(cell);
        return;
      }
      const allCells = Array.from(grid.querySelectorAll<HTMLElement>("[data-runtime-cell]"));
      const currentIndex = allCells.indexOf(cell);
      let nextCell: HTMLElement | null = null;
      if (event.key === "Home") nextCell = allCells[0] ?? null;
      else if (event.key === "End") nextCell = allCells.at(-1) ?? null;
      else if (
        event.key === "ArrowRight" ||
        event.key === "ArrowDown" ||
        event.key === "ArrowLeft" ||
        event.key === "ArrowUp"
      ) {
        nextCell = getDirectionalCell(allCells, cell, event.key);
      }
      if (nextCell && allCells.indexOf(nextCell) !== currentIndex) {
        event.preventDefault();
        getFocusTarget(nextCell).focus();
      }
    };
    const onClick = (event: MouseEvent) => {
      const cell = getPointFromTarget(event.target, grid);
      if (!cell) return;
      const sourceCapabilities = (
        event as MouseEvent & { sourceCapabilities?: { firesTouchEvents?: boolean } }
      ).sourceCapabilities;
      const explicitMouseClick = sourceCapabilities?.firesTouchEvents === false;
      const keyboardActivated = event.detail === 0 && !sourceCapabilities?.firesTouchEvents;
      if (explicitMouseClick) suppressClickUntil.current = 0;
      if (Date.now() < suppressClickUntil.current && !keyboardActivated) {
        suppressClickUntil.current = 0;
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      suppressClickUntil.current = 0;
      if (!isFreshness) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    const onTouchStart = (event: TouchEvent) => {
      suppressClickUntil.current = 0;
      suppressContextMenuUntil.current = 0;
      if (event.touches.length !== 1) {
        hide();
        pendingMetrics.current = null;
        return;
      }
      const touch = event.touches[0];
      const rect = grid.getBoundingClientRect();
      if (
        touch.clientX < rect.left ||
        touch.clientX > rect.right ||
        touch.clientY < rect.top ||
        touch.clientY > rect.bottom
      )
        return;
      if (!getPointFromCoordinates(grid, touch.clientX, touch.clientY)) {
        gesture.cancel();
        pendingMetrics.current = null;
        return;
      }
      pendingMetrics.current = null;
      suppressContextMenuUntil.current = Date.now() + 800;
      gesture.start({
        id: touch.identifier,
        x: touch.clientX,
        y: touch.clientY,
        radius: Math.max(touch.radiusX || 0, touch.radiusY || 0),
      });
    };
    const onTouchMove = (event: TouchEvent) => {
      if (gesture.phase === "idle") return;
      const result = gesture.move(
        Array.from(event.touches, (touch) => ({
          id: touch.identifier,
          x: touch.clientX,
          y: touch.clientY,
          radius: Math.max(touch.radiusX || 0, touch.radiusY || 0),
        }))
      );
      if (result.cancelled) {
        pendingMetrics.current = null;
        suppressContextMenuUntil.current = 0;
        hide();
        return;
      }
      if (result.preventDefault && event.cancelable) event.preventDefault();
      if (!result.point) return;
      const cell = getPointFromCoordinates(grid, result.point.x, result.point.y);
      if (!cell) {
        clearActiveCell();
        return;
      }
      setCell(cell, true);
    };
    const onTouchEnd = () => {
      const recognized = gesture.end().recognized;
      const nextMetrics = pendingMetrics.current;
      if (recognized) {
        const suppressUntil = Date.now() + 700;
        suppressContextMenuUntil.current = suppressUntil;
        suppressClickUntil.current = suppressUntil;
        hide();
        if (nextMetrics) applyMetrics(nextMetrics);
      } else {
        suppressContextMenuUntil.current = 0;
      }
      pendingMetrics.current = null;
    };
    const onTouchCancel = () => {
      gesture.cancel();
      pendingMetrics.current = null;
      hide();
      suppressClickUntil.current = 0;
      suppressContextMenuUntil.current = 0;
    };
    const onContextMenu = (event: MouseEvent) => {
      if (gesture.phase !== "idle" || Date.now() < suppressContextMenuUntil.current) {
        event.preventDefault();
        event.stopPropagation();
      }
    };

    grid.addEventListener("pointerover", onPointerOver);
    grid.addEventListener("pointermove", onPointerMove);
    grid.addEventListener("pointerdown", onPointerDown);
    grid.addEventListener("pointerout", onPointerOut);
    grid.addEventListener("focusin", onFocusIn);
    grid.addEventListener("focusout", onFocusOut);
    grid.addEventListener("keydown", onKeyDown);
    grid.addEventListener("click", onClick);
    interactionRoot.addEventListener("touchstart", onTouchStart, {
      capture: true,
      passive: true,
    });
    interactionRoot.addEventListener("touchmove", onTouchMove, {
      capture: true,
      passive: false,
    });
    interactionRoot.addEventListener("touchend", onTouchEnd, { capture: true, passive: true });
    interactionRoot.addEventListener("touchcancel", onTouchCancel, {
      capture: true,
      passive: true,
    });
    interactionRoot.addEventListener("contextmenu", onContextMenu, { capture: true });
    return () => {
      grid.removeEventListener("pointerover", onPointerOver);
      grid.removeEventListener("pointermove", onPointerMove);
      grid.removeEventListener("pointerdown", onPointerDown);
      grid.removeEventListener("pointerout", onPointerOut);
      grid.removeEventListener("focusin", onFocusIn);
      grid.removeEventListener("focusout", onFocusOut);
      grid.removeEventListener("keydown", onKeyDown);
      grid.removeEventListener("click", onClick);
      interactionRoot.removeEventListener("touchstart", onTouchStart, { capture: true });
      interactionRoot.removeEventListener("touchmove", onTouchMove, { capture: true });
      interactionRoot.removeEventListener("touchend", onTouchEnd, { capture: true });
      interactionRoot.removeEventListener("touchcancel", onTouchCancel, { capture: true });
      interactionRoot.removeEventListener("contextmenu", onContextMenu, { capture: true });
      gesture.cancel();
      suppressContextMenuUntil.current = 0;
      if (touchGestureRef.current === gesture) touchGestureRef.current = null;
    };
  }, [applyMetrics, clearActiveCell, clearHover, hide, isFreshness, navigationUrl, setCell]);

  const activeCellElement = activeCell
    ? gridRef.current?.querySelector<HTMLElement>(`[data-runtime-cell-index="${activeCell.index}"]`)
    : null;
  const anchorStyle: React.CSSProperties = touchAnchor
    ? { left: `${touchAnchor.left}px`, top: `${touchAnchor.top}px` }
    : activeCellElement && gridRef.current
      ? (() => {
          const gridBounds = gridRef.current.getBoundingClientRect();
          const cellBounds = activeCellElement.getBoundingClientRect();
          return {
            left: `${cellBounds.left - gridBounds.left}px`,
            top: `${cellBounds.top - gridBounds.top}px`,
            width: `${cellBounds.width}px`,
            height: `${cellBounds.height}px`,
          };
        })()
      : {};

  const renderCell = (cell: RuntimeCellData) => {
    const isEmptyActivity = !isFreshness && (cell.value === undefined || cell.value === null);
    if (isEmptyActivity) {
      return (
        <span
          key={`empty-${cell.index}`}
          className="runtime-activity-slot runtime-activity-slot--empty"
          style={
            {
              "--runtime-week": cell.week,
              "--runtime-weekday": cell.weekday,
            } as React.CSSProperties
          }
          aria-hidden="true"
        />
      );
    }
    const statusCode = cell.statusCode ?? 0;
    const tabIndex = cell.index === (activeCell?.index ?? firstDataIndex) ? 0 : -1;
    const cellProps = {
      className: isFreshness
        ? `runtime-freshness-cell runtime-freshness-cell--${freshnessStatusClasses[statusCode] ?? "no-success"}`
        : "runtime-activity-cell",
      "data-runtime-cell": "",
      "data-runtime-cell-index": cell.index,
      "data-runtime-point": !isFreshness ? "" : undefined,
      "data-date": cell.date,
      "data-value": cell.value,
      "data-label": !isFreshness ? valueLabel(kind) : undefined,
      "data-status-code": isFreshness ? statusCode : undefined,
      "data-week": cell.week,
      "data-weekday": cell.weekday,
      "data-runtime-active": activeCell?.index === cell.index ? "true" : undefined,
      style: isFreshness
        ? undefined
        : ({
            "--runtime-week": cell.week,
            "--runtime-weekday": cell.weekday,
            "--runtime-intensity": Math.min(
              (cell.value ?? 0) / Math.max(...activityPoints.map((point) => point.value ?? 0), 1),
              1
            ),
          } as React.CSSProperties),
      role: "gridcell" as const,
      tabIndex,
      "aria-label": formatRuntimeCellText(kind, cell),
      "aria-colindex": isFreshness ? (cell.index % freshnessColumns) + 1 : cell.week,
      "aria-rowindex": isFreshness ? Math.floor(cell.index / freshnessColumns) + 1 : cell.weekday,
    };
    if (navigationUrl) {
      const { tabIndex: _tabIndex, ...gridCellProps } = cellProps;
      return (
        <div key={`${kind}-${cell.index}`} {...gridCellProps}>
          <a
            className="runtime-freshness-link"
            data-runtime-link=""
            href={navigationUrl}
            tabIndex={tabIndex}
            aria-label={formatRuntimeCellText(kind, cell)}
          >
            <span className="sr-only">{formatRuntimeCellText(kind, cell)}</span>
          </a>
        </div>
      );
    }
    return <span key={`${kind}-${cell.index}`} {...cellProps} />;
  };

  const rootClass = isFreshness ? "runtime-freshness" : "runtime-activity";
  const renderedCells = isFreshness
    ? Array.from({ length: freshnessRows }, (_, rowIndex) => (
        // biome-ignore lint/a11y/useSemanticElements: Heatmap rows use display: contents to preserve the existing CSS grid geometry.
        <div
          key={`row-${cells[rowIndex * freshnessColumns]?.index ?? "empty"}`}
          role="row"
          aria-rowindex={rowIndex + 1}
          tabIndex={-1}
          style={{ display: "contents" }}
        >
          {cells
            .slice(rowIndex * freshnessColumns, rowIndex * freshnessColumns + freshnessColumns)
            .map(renderCell)}
        </div>
      ))
    : [1, 2, 3, 4, 5, 6, 7].map((weekday) => (
        // biome-ignore lint/a11y/useSemanticElements: CSS grid rows use display: contents to preserve the existing heatmap geometry.
        <div
          key={`row-${weekday}`}
          role="row"
          aria-rowindex={weekday}
          tabIndex={-1}
          style={{ display: "contents" }}
        >
          {cells.filter((cell) => cell.weekday === weekday).map(renderCell)}
        </div>
      ));
  return (
    <section
      className={rootClass}
      data-runtime-chart={!isFreshness || undefined}
      data-runtime-empty={isFreshness && cells.length === 0 ? "true" : "false"}
      aria-label={label}
    >
      <h3 className="runtime-chart-title">{isFreshness ? "刷新新鲜度" : label}</h3>
      <TooltipProvider delayDuration={150} skipDelayDuration={100}>
        <Tooltip open={open} onOpenChange={(nextOpen) => (nextOpen ? setOpen(true) : hide())}>
          <div className="runtime-grid-shell">
            {/* biome-ignore lint/a11y/useSemanticElements: The public heatmaps expose the ARIA grid pattern required for roving keyboard inspection. */}
            <div
              ref={gridRef}
              className={isFreshness ? "runtime-freshness-grid" : "runtime-activity-grid"}
              role="grid"
              aria-label={label}
              aria-rowcount={isFreshness ? freshnessRows : 7}
              aria-colcount={isFreshness ? freshnessColumns : activity?.weekCount}
              data-week-count={!isFreshness ? activity?.weekCount : undefined}
              data-weekday-count={!isFreshness ? 7 : undefined}
              style={
                isFreshness
                  ? ({
                      "--runtime-freshness-count": cells.length,
                      "--runtime-freshness-columns": freshnessColumns,
                      "--runtime-freshness-rows": freshnessRows,
                    } as React.CSSProperties)
                  : ({ "--runtime-week-count": activity?.weekCount ?? 1 } as React.CSSProperties)
              }
            >
              {renderedCells}
            </div>
            <TooltipTrigger asChild>
              <span aria-hidden="true" className="runtime-tooltip-anchor" style={anchorStyle} />
            </TooltipTrigger>
          </div>
          <TooltipContent side="top" align="center" sideOffset={8}>
            {currentCellText}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </section>
  );
}

export default RuntimeCellGrid;
