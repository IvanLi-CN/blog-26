export const PUBLIC_HEADER_SCROLL_CONFIG = {
  breakpointPx: 639,
  sampleWindowMs: 100,
  reverseDistancePx: 12,
  fastReverseSpeedPxPerMs: 0.3,
  settleDelayMs: 120,
  hideThreshold: 0.5,
  revealThreshold: 0.2,
  settleTransitionMs: 180,
} as const;

export type HeaderScrollDirection = "idle" | "hide" | "reveal";

export interface HeaderScrollSample {
  scrollY: number;
  timestamp: number;
}

export interface HeaderScrollState {
  headerHeight: number;
  visibleOffset: number;
  lastScrollY: number;
  lastTimestamp: number;
  direction: HeaderScrollDirection;
  gestureOriginOffset: number;
  gestureDistance: number;
  fastReverseEligible: boolean;
  samples: HeaderScrollSample[];
}

export interface HeaderScrollUpdate {
  scrollY: number;
  timestamp: number;
}

export interface HeaderScrollUpdateResult {
  state: HeaderScrollState;
  speedPxPerMs: number;
  effectiveDeltaPx: number;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function normalizeScrollY(scrollY: number) {
  return Math.max(0, Number.isFinite(scrollY) ? scrollY : 0);
}

function normalizeTimestamp(timestamp: number, fallback: number) {
  if (!Number.isFinite(timestamp)) {
    return fallback;
  }

  return Math.max(timestamp, fallback);
}

export function createHeaderScrollState(
  headerHeight: number,
  scrollY = 0,
  timestamp = 0
): HeaderScrollState {
  const height = Math.max(0, Number.isFinite(headerHeight) ? headerHeight : 0);
  const normalizedScrollY = normalizeScrollY(scrollY);
  const normalizedTimestamp = normalizeTimestamp(timestamp, 0);

  return {
    headerHeight: height,
    visibleOffset: height,
    lastScrollY: normalizedScrollY,
    lastTimestamp: normalizedTimestamp,
    direction: "idle",
    gestureOriginOffset: height,
    gestureDistance: 0,
    fastReverseEligible: false,
    samples: [{ scrollY: normalizedScrollY, timestamp: normalizedTimestamp }],
  };
}

function resetGesture(
  state: HeaderScrollState,
  visibleOffset = state.visibleOffset
): HeaderScrollState {
  return {
    ...state,
    visibleOffset: clamp(visibleOffset, 0, state.headerHeight),
    direction: "idle",
    gestureOriginOffset: clamp(visibleOffset, 0, state.headerHeight),
    gestureDistance: 0,
    fastReverseEligible: false,
  };
}

function getRollingSpeed(
  samples: HeaderScrollSample[],
  fallbackDelta: number,
  fallbackTime: number
) {
  const first = samples[0];
  const last = samples[samples.length - 1];
  const elapsed = last && first ? last.timestamp - first.timestamp : fallbackTime;
  if (elapsed <= 0) {
    return 0;
  }

  const distance = last && first ? Math.abs(last.scrollY - first.scrollY) : fallbackDelta;
  return distance / elapsed;
}

export function reduceHeaderScrollState(
  state: HeaderScrollState,
  update: HeaderScrollUpdate,
  config = PUBLIC_HEADER_SCROLL_CONFIG
): HeaderScrollUpdateResult {
  const scrollY = normalizeScrollY(update.scrollY);
  const timestamp = normalizeTimestamp(update.timestamp, state.lastTimestamp);
  const delta = scrollY - state.lastScrollY;
  const effectiveDeltaPx = Math.abs(delta);
  const nextSamples = [...state.samples, { scrollY, timestamp }].filter(
    (sample) => timestamp - sample.timestamp <= config.sampleWindowMs
  );
  const samples = nextSamples.length > 0 ? nextSamples : [{ scrollY, timestamp }];
  const speedPxPerMs = getRollingSpeed(samples, effectiveDeltaPx, timestamp - state.lastTimestamp);
  const next: HeaderScrollState = {
    ...state,
    lastScrollY: scrollY,
    lastTimestamp: timestamp,
    samples,
  };

  if (scrollY <= 0) {
    return {
      state: resetGesture(next, next.headerHeight),
      speedPxPerMs,
      effectiveDeltaPx,
    };
  }

  if (effectiveDeltaPx === 0) {
    return { state: next, speedPxPerMs, effectiveDeltaPx };
  }

  const direction: HeaderScrollDirection = delta > 0 ? "hide" : "reveal";
  if (direction !== state.direction) {
    next.direction = direction;
    next.gestureOriginOffset = state.visibleOffset;
    next.gestureDistance = effectiveDeltaPx;
    next.fastReverseEligible =
      direction === "reveal" && speedPxPerMs >= config.fastReverseSpeedPxPerMs;
  } else {
    next.gestureDistance += effectiveDeltaPx;
  }

  if (direction === "hide") {
    next.fastReverseEligible = false;
    next.visibleOffset = clamp(
      next.gestureOriginOffset - next.gestureDistance,
      0,
      next.headerHeight
    );
  } else {
    next.fastReverseEligible =
      next.fastReverseEligible || speedPxPerMs >= config.fastReverseSpeedPxPerMs;
    if (next.fastReverseEligible && next.gestureDistance >= config.reverseDistancePx) {
      next.visibleOffset = clamp(
        next.gestureOriginOffset + next.gestureDistance,
        0,
        next.headerHeight
      );
    }
  }

  return { state: next, speedPxPerMs, effectiveDeltaPx };
}

export function settleHeaderScrollState(
  state: HeaderScrollState,
  config = PUBLIC_HEADER_SCROLL_CONFIG
) {
  if (state.headerHeight <= 0 || state.direction === "idle") {
    return resetGesture(state);
  }

  if (state.direction === "hide") {
    const hiddenProgress = (state.headerHeight - state.visibleOffset) / state.headerHeight;
    return resetGesture(
      state,
      hiddenProgress >= config.hideThreshold ? 0 : state.gestureOriginOffset
    );
  }

  const recoveryProgress = state.gestureDistance / state.headerHeight;
  return resetGesture(
    state,
    state.fastReverseEligible && recoveryProgress >= config.revealThreshold
      ? state.headerHeight
      : state.gestureOriginOffset
  );
}

export function resizeHeaderScrollState(state: HeaderScrollState, headerHeight: number) {
  const nextHeight = Math.max(0, Number.isFinite(headerHeight) ? headerHeight : 0);
  if (nextHeight === state.headerHeight) {
    return state;
  }

  const ratio = state.headerHeight > 0 ? state.visibleOffset / state.headerHeight : 1;
  const originRatio = state.headerHeight > 0 ? state.gestureOriginOffset / state.headerHeight : 1;

  return {
    ...state,
    headerHeight: nextHeight,
    visibleOffset: clamp(ratio * nextHeight, 0, nextHeight),
    gestureOriginOffset: clamp(originRatio * nextHeight, 0, nextHeight),
  };
}

const HEADER_SELECTOR = "[data-public-header]";
const FOCUSABLE_SELECTOR = [
  "a[href]",
  "area[href]",
  "button",
  "input",
  "select",
  "textarea",
  "summary",
  '[contenteditable="true"]',
  "[tabindex]",
].join(",");
const MOBILE_MEDIA_QUERY = `(max-width: ${PUBLIC_HEADER_SCROLL_CONFIG.breakpointPx}px)`;
const BOOT_FLAG = "__publicHeaderScrollBooted";

interface RuntimeHeaderController {
  header: HTMLElement;
  state: HeaderScrollState;
  resizeObserver: ResizeObserver;
  suppressedTabIndexes: Map<HTMLElement, string | null>;
  settleTimer: number | null;
  transitionTimer: number | null;
  cleanup: () => void;
}

const controllers = new Map<HTMLElement, RuntimeHeaderController>();

function isMobileViewport() {
  return window.matchMedia(MOBILE_MEDIA_QUERY).matches;
}

function setTabOrderSuppressed(controller: RuntimeHeaderController, suppressed: boolean) {
  const { header, suppressedTabIndexes } = controller;
  if (suppressed) {
    for (const element of header.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)) {
      if (!suppressedTabIndexes.has(element)) {
        suppressedTabIndexes.set(element, element.getAttribute("tabindex"));
      }
      element.setAttribute("tabindex", "-1");
    }
    return;
  }

  for (const [element, previousTabIndex] of suppressedTabIndexes) {
    if (previousTabIndex === null) {
      element.removeAttribute("tabindex");
    } else {
      element.setAttribute("tabindex", previousTabIndex);
    }
  }
  suppressedTabIndexes.clear();
}

function clearSettleTimers(controller: RuntimeHeaderController) {
  if (controller.settleTimer !== null) {
    window.clearTimeout(controller.settleTimer);
    controller.settleTimer = null;
  }
  if (controller.transitionTimer !== null) {
    window.clearTimeout(controller.transitionTimer);
    controller.transitionTimer = null;
  }
}

function applyHeaderState(
  controller: RuntimeHeaderController,
  phase: "scroll" | "settle" | "steady"
) {
  const { header, state } = controller;
  const offset = clamp(state.visibleOffset, 0, state.headerHeight);
  const top = offset - state.headerHeight;
  header.style.setProperty("--public-header-sticky-top", `${top}px`);
  header.dataset.publicHeaderOffset = `${offset}`;
  header.dataset.publicHeaderHeight = `${state.headerHeight}`;

  if (phase === "scroll") {
    header.dataset.publicHeaderScrolling = "true";
    header.removeAttribute("data-public-header-settling");
  } else {
    header.removeAttribute("data-public-header-scrolling");
    if (phase === "settle") {
      header.dataset.publicHeaderSettling = "true";
    } else {
      header.removeAttribute("data-public-header-settling");
    }
  }

  const isCollapsed = state.headerHeight > 0 && offset <= 0;
  header.dataset.publicHeaderState = isCollapsed
    ? "collapsed"
    : offset >= state.headerHeight
      ? "expanded"
      : "partial";
  setTabOrderSuppressed(controller, isCollapsed);
}

function scheduleSettle(controller: RuntimeHeaderController) {
  if (controller.settleTimer !== null) {
    window.clearTimeout(controller.settleTimer);
  }

  controller.settleTimer = window.setTimeout(() => {
    controller.settleTimer = null;
    controller.state = settleHeaderScrollState(controller.state);
    applyHeaderState(controller, "settle");
    controller.transitionTimer = window.setTimeout(() => {
      controller.transitionTimer = null;
      controller.header.removeAttribute("data-public-header-settling");
    }, PUBLIC_HEADER_SCROLL_CONFIG.settleTransitionMs);
  }, PUBLIC_HEADER_SCROLL_CONFIG.settleDelayMs);
}

function handleWindowScroll() {
  const timestamp = performance.now();
  for (const controller of controllers.values()) {
    const result = reduceHeaderScrollState(controller.state, {
      scrollY: window.scrollY,
      timestamp,
    });
    controller.state = result.state;
    if (result.effectiveDeltaPx > 0 || window.scrollY <= 0) {
      applyHeaderState(controller, "scroll");
      scheduleSettle(controller);
    }
  }
}

function handleHeaderFocus(event: FocusEvent) {
  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return;
  }

  for (const controller of controllers.values()) {
    if (
      !controller.header.contains(target) ||
      controller.state.visibleOffset >= controller.state.headerHeight
    ) {
      continue;
    }

    clearSettleTimers(controller);
    controller.state = resetGesture(controller.state, controller.state.headerHeight);
    applyHeaderState(controller, "steady");
  }
}

function attachController(header: HTMLElement) {
  if (controllers.has(header) || !isMobileViewport()) {
    return;
  }

  const height = header.getBoundingClientRect().height;
  const controller = {} as RuntimeHeaderController;
  controller.header = header;
  controller.state = createHeaderScrollState(height, window.scrollY, performance.now());
  controller.suppressedTabIndexes = new Map();
  controller.settleTimer = null;
  controller.transitionTimer = null;
  controller.resizeObserver = new ResizeObserver(() => {
    const nextHeight = header.getBoundingClientRect().height;
    controller.state = resizeHeaderScrollState(controller.state, nextHeight);
    applyHeaderState(controller, "steady");
  });

  controller.cleanup = () => {
    clearSettleTimers(controller);
    controller.resizeObserver.disconnect();
    setTabOrderSuppressed(controller, false);
    header.removeAttribute("data-public-header-state");
    header.removeAttribute("data-public-header-offset");
    header.removeAttribute("data-public-header-height");
    header.removeAttribute("data-public-header-scrolling");
    header.removeAttribute("data-public-header-settling");
    header.style.removeProperty("--public-header-sticky-top");
  };

  controller.resizeObserver.observe(header);
  controllers.set(header, controller);
  applyHeaderState(controller, "steady");

  if (window.scrollY > 0) {
    handleWindowScroll();
  }
}

function refreshControllers() {
  for (const [header, controller] of controllers) {
    if (header.isConnected && isMobileViewport()) {
      continue;
    }

    controller.cleanup();
    controllers.delete(header);
  }

  if (!isMobileViewport()) {
    return;
  }

  for (const header of document.querySelectorAll<HTMLElement>(HEADER_SELECTOR)) {
    attachController(header);
  }
}

if (typeof window !== "undefined" && typeof document !== "undefined") {
  const scopedWindow = window as Window & { [BOOT_FLAG]?: boolean };
  if (!scopedWindow[BOOT_FLAG]) {
    scopedWindow[BOOT_FLAG] = true;
    refreshControllers();
    window.addEventListener("scroll", handleWindowScroll, { passive: true });
    window.addEventListener("resize", refreshControllers);
    document.addEventListener("focus", handleHeaderFocus, true);
    document.addEventListener("astro:page-load", refreshControllers);
    document.addEventListener("astro:after-swap", refreshControllers);
    document.addEventListener("DOMContentLoaded", refreshControllers, { once: true });
    window.matchMedia(MOBILE_MEDIA_QUERY).addEventListener("change", refreshControllers);
  }
}
