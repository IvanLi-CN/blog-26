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
  pendingDirection: HeaderScrollDirection;
  pendingDistance: number;
  pendingFastReverseEligible: boolean;
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
    pendingDirection: "idle",
    pendingDistance: 0,
    pendingFastReverseEligible: false,
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
    pendingDirection: "idle",
    pendingDistance: 0,
    pendingFastReverseEligible: false,
  };
}

function getRollingSpeed(
  samples: HeaderScrollSample[],
  direction: HeaderScrollDirection,
  fallbackDelta: number,
  fallbackTime: number
) {
  if (direction === "idle" || samples.length < 2) {
    return fallbackTime > 0 ? fallbackDelta / fallbackTime : 0;
  }

  const lastIndex = samples.length - 1;
  let firstIndex = lastIndex;
  let distance = 0;

  for (let index = lastIndex; index > 0; index -= 1) {
    const delta = samples[index].scrollY - samples[index - 1].scrollY;
    if (delta === 0) {
      continue;
    }
    const matchesDirection =
      (direction === "hide" && delta > 0) || (direction === "reveal" && delta < 0);
    if (!matchesDirection) {
      break;
    }

    distance += Math.abs(delta);
    firstIndex = index - 1;
  }

  const elapsed = samples[lastIndex].timestamp - samples[firstIndex].timestamp;
  return elapsed > 0 ? distance / elapsed : 0;
}

export function reduceHeaderScrollState(
  state: HeaderScrollState,
  update: HeaderScrollUpdate,
  config = PUBLIC_HEADER_SCROLL_CONFIG,
  directFollow = false
): HeaderScrollUpdateResult {
  const scrollY = normalizeScrollY(update.scrollY);
  const timestamp = normalizeTimestamp(update.timestamp, state.lastTimestamp);
  const delta = scrollY - state.lastScrollY;
  const effectiveDeltaPx = Math.abs(delta);
  const direction: HeaderScrollDirection = delta > 0 ? "hide" : delta < 0 ? "reveal" : "idle";
  const nextSamples = [...state.samples, { scrollY, timestamp }].filter(
    (sample) => timestamp - sample.timestamp <= config.sampleWindowMs
  );
  const samples = nextSamples.length > 0 ? nextSamples : [{ scrollY, timestamp }];
  const speedPxPerMs = getRollingSpeed(
    samples,
    direction,
    effectiveDeltaPx,
    timestamp - state.lastTimestamp
  );
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

  if (directFollow && state.direction !== "idle") {
    next.direction = direction;
    next.gestureOriginOffset =
      direction !== state.direction ? state.visibleOffset : state.gestureOriginOffset;
    next.gestureDistance =
      direction !== state.direction ? effectiveDeltaPx : state.gestureDistance + effectiveDeltaPx;
    next.fastReverseEligible = direction === "reveal";
    next.pendingDirection = "idle";
    next.pendingDistance = 0;
    next.pendingFastReverseEligible = false;
    next.visibleOffset = clamp(state.visibleOffset - delta, 0, state.headerHeight);
    return { state: next, speedPxPerMs, effectiveDeltaPx };
  }

  if (direction !== state.direction && state.direction !== "idle") {
    const pendingDistance =
      state.pendingDirection === direction
        ? state.pendingDistance + effectiveDeltaPx
        : effectiveDeltaPx;
    const pendingFastReverseEligible =
      direction === "reveal" && speedPxPerMs >= config.fastReverseSpeedPxPerMs;

    if (pendingDistance < config.reverseDistancePx) {
      next.pendingDirection = direction;
      next.pendingDistance = pendingDistance;
      next.pendingFastReverseEligible = pendingFastReverseEligible;
      return { state: next, speedPxPerMs, effectiveDeltaPx };
    }

    if (direction === "reveal" && !pendingFastReverseEligible) {
      next.pendingDirection = direction;
      next.pendingDistance = pendingDistance;
      next.pendingFastReverseEligible = false;
      return { state: next, speedPxPerMs, effectiveDeltaPx };
    }

    next.direction = direction;
    next.gestureOriginOffset = state.visibleOffset;
    next.gestureDistance = pendingDistance;
    next.fastReverseEligible = pendingFastReverseEligible;
    next.pendingDirection = "idle";
    next.pendingDistance = 0;
    next.pendingFastReverseEligible = false;
  } else if (direction !== state.direction) {
    next.direction = direction;
    next.gestureOriginOffset = state.visibleOffset;
    next.gestureDistance = effectiveDeltaPx;
    next.fastReverseEligible =
      direction === "reveal" && speedPxPerMs >= config.fastReverseSpeedPxPerMs;
    next.pendingDirection = "idle";
    next.pendingDistance = 0;
    next.pendingFastReverseEligible = false;
  } else {
    const pendingReturnDistance = state.pendingDirection !== "idle" ? state.pendingDistance : 0;
    const resumedDelta = effectiveDeltaPx - pendingReturnDistance;
    if (resumedDelta <= 0 && pendingReturnDistance > 0) {
      const remainingPendingDistance = pendingReturnDistance - effectiveDeltaPx;
      next.pendingDirection = remainingPendingDistance > 0 ? state.pendingDirection : "idle";
      next.pendingDistance = Math.max(remainingPendingDistance, 0);
      next.pendingFastReverseEligible =
        remainingPendingDistance > 0 && state.pendingFastReverseEligible;
      return { state: next, speedPxPerMs, effectiveDeltaPx };
    }

    next.gestureDistance += Math.max(resumedDelta, 0);
    next.pendingDirection = "idle";
    next.pendingDistance = 0;
    next.pendingFastReverseEligible = false;
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
  touchFollowActive: boolean;
  cleanup: () => void;
}

const controllers = new Map<HTMLElement, RuntimeHeaderController>();
let touchActive = false;

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
  controller.header.removeAttribute("data-public-header-settling");
}

function applyHeaderState(
  controller: RuntimeHeaderController,
  phase: "scroll" | "settle" | "steady"
) {
  const { header } = controller;
  let state = controller.state;
  let offset = clamp(state.visibleOffset, 0, state.headerHeight);
  const activeElement = document.activeElement;
  if (
    state.headerHeight > 0 &&
    offset <= 0 &&
    activeElement instanceof HTMLElement &&
    header.contains(activeElement)
  ) {
    state = resetGesture(state, state.headerHeight);
    controller.state = state;
    offset = state.headerHeight;
  }
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
  if (touchActive) {
    clearSettleTimers(controller);
    return;
  }

  if (controller.settleTimer !== null) {
    window.clearTimeout(controller.settleTimer);
    controller.settleTimer = null;
  }
  if (controller.transitionTimer !== null) {
    window.clearTimeout(controller.transitionTimer);
    controller.transitionTimer = null;
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

function handleTouchStart() {
  touchActive = true;
  for (const controller of controllers.values()) {
    clearSettleTimers(controller);
    controller.state = resetGesture(controller.state, controller.state.visibleOffset);
    controller.touchFollowActive = false;
  }
}

function handleTouchEnd(event: TouchEvent) {
  touchActive = (event.touches?.length ?? 0) > 0;
  if (touchActive) {
    return;
  }

  for (const controller of controllers.values()) {
    controller.touchFollowActive = false;
    if (controller.state.direction !== "idle") {
      scheduleSettle(controller);
    }
  }
}

function handleWindowScroll() {
  const timestamp = performance.now();
  for (const controller of controllers.values()) {
    const previousOffset = controller.state.visibleOffset;
    const delta = window.scrollY - controller.state.lastScrollY;
    const canMoveHeader =
      (delta > 0 && controller.state.visibleOffset > 0) ||
      (delta < 0 && controller.state.visibleOffset < controller.state.headerHeight);
    const result = reduceHeaderScrollState(
      controller.state,
      {
        scrollY: window.scrollY,
        timestamp,
      },
      PUBLIC_HEADER_SCROLL_CONFIG,
      touchActive && controller.touchFollowActive && canMoveHeader
    );
    controller.state = result.state;
    if (touchActive && result.state.visibleOffset !== previousOffset) {
      controller.touchFollowActive = true;
    }
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
  controller.touchFollowActive = false;
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
  touchActive = false;
  for (const [header, controller] of controllers) {
    clearSettleTimers(controller);
    if (header.isConnected && isMobileViewport()) {
      controller.state = resetGesture(controller.state, controller.state.visibleOffset);
      controller.touchFollowActive = false;
      applyHeaderState(controller, "steady");
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
    window.addEventListener("touchstart", handleTouchStart, { passive: true });
    window.addEventListener("touchend", handleTouchEnd, { passive: true });
    window.addEventListener("touchcancel", handleTouchEnd, { passive: true });
    window.matchMedia(MOBILE_MEDIA_QUERY).addEventListener("change", refreshControllers);
  }
}
