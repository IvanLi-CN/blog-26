const SELECTOR = "[data-scrollbar-auto-hide]";
const SCROLL_HIDE_DELAY_MS = 760;
const LEAVE_HIDE_DELAY_MS = 180;
const BOOT_FLAG = "__publicScrollbarBooted";

interface ScrollbarController {
  element: HTMLElement;
  hideTimer: number | null;
  resizeObserver: ResizeObserver;
  overlay: HTMLElement | null;
  track: HTMLElement | null;
  thumb: HTMLElement | null;
  rafId: number | null;
  cleanup: () => void;
}

const controllers = new Map<HTMLElement, ScrollbarController>();

function isOverflowing(element: HTMLElement) {
  return element.scrollWidth - element.clientWidth > 2;
}

function setVisible(element: HTMLElement, visible: boolean) {
  if (visible) {
    element.dataset.scrollbarVisible = "true";
    return;
  }

  delete element.dataset.scrollbarVisible;
}

function setControllerVisible(controller: ScrollbarController, visible: boolean) {
  setVisible(controller.element, visible);
  if (controller.overlay) {
    if (visible) {
      controller.overlay.dataset.scrollbarVisible = "true";
      return;
    }

    delete controller.overlay.dataset.scrollbarVisible;
  }
}

function updateOverlayMetrics(controller: ScrollbarController) {
  if (!controller.overlay || !controller.track || !controller.thumb) {
    return;
  }

  const { element, overlay, track, thumb } = controller;
  const maxScroll = Math.max(element.scrollWidth - element.clientWidth, 0);
  const hasOverflow = maxScroll > 2;
  overlay.dataset.scrollbarOverflow = hasOverflow ? "true" : "false";

  if (!hasOverflow) {
    setControllerVisible(controller, false);
    thumb.style.setProperty("--scrollbar-thumb-size", "0px");
    thumb.style.setProperty("--scrollbar-thumb-offset", "0px");
    return;
  }

  const trackWidth = track?.clientWidth ?? overlay.clientWidth;
  if (trackWidth <= 0) {
    return;
  }

  const visibilityRatio = element.clientWidth / element.scrollWidth;
  const thumbSize = Math.max(trackWidth * visibilityRatio, 68);
  const travel = Math.max(trackWidth - thumbSize, 0);
  const progress = maxScroll === 0 ? 0 : element.scrollLeft / maxScroll;
  const thumbOffset = travel * progress;

  thumb.style.setProperty("--scrollbar-thumb-size", `${thumbSize}px`);
  thumb.style.setProperty("--scrollbar-thumb-offset", `${thumbOffset}px`);
}

function syncOverlaySoon(controller: ScrollbarController) {
  if (controller.rafId !== null) {
    window.cancelAnimationFrame(controller.rafId);
  }

  controller.rafId = window.requestAnimationFrame(() => {
    controller.rafId = null;
    updateOverlayMetrics(controller);
  });
}

function syncOverflowState(element: HTMLElement) {
  const overflowing = isOverflowing(element);
  element.dataset.scrollbarOverflow = overflowing ? "true" : "false";

  if (!overflowing) {
    delete element.dataset.scrollbarVisible;
  }

  return overflowing;
}

function clearHideTimer(controller: ScrollbarController) {
  if (controller.hideTimer !== null) {
    window.clearTimeout(controller.hideTimer);
    controller.hideTimer = null;
  }
}

function scheduleHide(controller: ScrollbarController, delayMs: number) {
  clearHideTimer(controller);
  controller.hideTimer = window.setTimeout(() => {
    if (controller.element.matches(":hover") || controller.element.matches(":focus-within")) {
      return;
    }

    setControllerVisible(controller, false);
  }, delayMs);
}

function reveal(controller: ScrollbarController) {
  clearHideTimer(controller);
  if (syncOverflowState(controller.element)) {
    setControllerVisible(controller, true);
    syncOverlaySoon(controller);
  }
}

function attachScrollbarController(element: HTMLElement) {
  if (controllers.has(element)) {
    const controller = controllers.get(element);
    if (!controller) {
      return;
    }

    syncOverflowState(element);
    updateOverlayMetrics(controller);
    setControllerVisible(controller, element.dataset.scrollbarVisible === "true");
    return;
  }

  const controller: ScrollbarController = {
    element,
    hideTimer: null,
    overlay: element.parentElement?.querySelector<HTMLElement>("[data-scrollbar-overlay]") ?? null,
    track: element.parentElement?.querySelector<HTMLElement>("[data-scrollbar-track]") ?? null,
    thumb: element.parentElement?.querySelector<HTMLElement>("[data-scrollbar-thumb]") ?? null,
    rafId: null,
    resizeObserver: new ResizeObserver(() => {
      const overflowing = syncOverflowState(element);
      updateOverlayMetrics(controller);
      if (!overflowing) {
        clearHideTimer(controller);
        setControllerVisible(controller, false);
        return;
      }

      if (
        element.matches(":hover") ||
        element.matches(":focus-within") ||
        element.dataset.scrollbarVisible === "true"
      ) {
        setControllerVisible(controller, true);
      }
    }),
    cleanup: () => undefined,
  };

  const handleScroll = () => {
    reveal(controller);
    scheduleHide(controller, SCROLL_HIDE_DELAY_MS);
  };
  const handlePointerEnter = () => reveal(controller);
  const handlePointerLeave = () => scheduleHide(controller, LEAVE_HIDE_DELAY_MS);
  const handleFocusIn = () => reveal(controller);
  const handleFocusOut = () => scheduleHide(controller, LEAVE_HIDE_DELAY_MS);

  element.addEventListener("scroll", handleScroll, { passive: true });
  element.addEventListener("pointerenter", handlePointerEnter);
  element.addEventListener("pointerleave", handlePointerLeave);
  element.addEventListener("focusin", handleFocusIn);
  element.addEventListener("focusout", handleFocusOut);
  controller.resizeObserver.observe(element);
  syncOverflowState(element);
  updateOverlayMetrics(controller);
  setControllerVisible(controller, false);

  controller.cleanup = () => {
    clearHideTimer(controller);
    if (controller.rafId !== null) {
      window.cancelAnimationFrame(controller.rafId);
    }
    controller.resizeObserver.disconnect();
    element.removeEventListener("scroll", handleScroll);
    element.removeEventListener("pointerenter", handlePointerEnter);
    element.removeEventListener("pointerleave", handlePointerLeave);
    element.removeEventListener("focusin", handleFocusIn);
    element.removeEventListener("focusout", handleFocusOut);
    delete element.dataset.scrollbarOverflow;
    delete element.dataset.scrollbarVisible;
    if (controller.overlay) {
      delete controller.overlay.dataset.scrollbarOverflow;
      delete controller.overlay.dataset.scrollbarVisible;
    }
  };

  controllers.set(element, controller);
}

function refreshScrollbarControllers() {
  for (const [element, controller] of controllers) {
    if (element.isConnected) {
      continue;
    }

    controller.cleanup();
    controllers.delete(element);
  }

  const elements = document.querySelectorAll<HTMLElement>(SELECTOR);
  for (const element of elements) {
    attachScrollbarController(element);
  }
}

function handleWindowResize() {
  for (const controller of controllers.values()) {
    syncOverflowState(controller.element);
    updateOverlayMetrics(controller);
  }
}

if (typeof window !== "undefined" && typeof document !== "undefined") {
  const scopedWindow = window as Window & { [BOOT_FLAG]?: boolean };
  if (!scopedWindow[BOOT_FLAG]) {
    scopedWindow[BOOT_FLAG] = true;
    refreshScrollbarControllers();
    window.addEventListener("resize", handleWindowResize);
    document.addEventListener("astro:page-load", refreshScrollbarControllers);
    document.addEventListener("astro:after-swap", refreshScrollbarControllers);
  }
}
