import { WEB_DEMO_MOTION_EVENT } from "../../src/lib/web-demo-runtime";

type Target = "poster" | "panel";
interface Card {
  panel: HTMLElement;
  poster: HTMLElement;
  slot: HTMLElement;
  layers: HTMLElement[];
  target: Target;
  settled: Target;
  revision: number;
  animations: Animation[];
}

export interface RuntimeMotionClock {
  now(): number;
  frame(callback: FrameRequestCallback): number;
  cancelFrame(id: number): void;
  timeout(callback: () => void, delay: number): number;
  clearTimeout(id: number): void;
}

const ease = "cubic-bezier(.22,1,.36,1)";
const clock: RuntimeMotionClock = {
  now: () => performance.now(),
  frame: (callback) => window.requestAnimationFrame(callback),
  cancelFrame: (id) => window.cancelAnimationFrame(id),
  timeout: (callback, delay) => window.setTimeout(callback, delay),
  clearTimeout: (id) => window.clearTimeout(id),
};

/** One group owns launch spacing; retargeting a playing card never waits for another card. */
export function createProjectRuntimeMotion(root: HTMLElement, timing = clock) {
  const cards = new Map<HTMLElement, Card>();
  const queue = new Set<Card>();
  const batch = new Set<Card>();
  const media = window.matchMedia("(prefers-reduced-motion: reduce)");
  let frame: number | undefined;
  let timer: number | undefined;
  let lastStart = Number.NEGATIVE_INFINITY;
  let disposed = false;
  const immediate = () =>
    document.hidden ||
    media.matches ||
    document.documentElement.dataset.webDemoMotion === "reduce" ||
    typeof root.animate !== "function";
  const stopQueue = () => {
    if (frame !== undefined) timing.cancelFrame(frame);
    if (timer !== undefined) timing.clearTimeout(timer);
    frame = undefined;
    timer = undefined;
  };
  const moveFocus = (element: HTMLElement) => {
    if (element.contains(document.activeElement)) {
      element
        .closest(".projects-poster-card")
        ?.querySelector<HTMLElement>(".projects-poster-title-link")
        ?.focus({ preventScroll: true });
    }
  };
  const accessible = (element: HTMLElement, active: boolean) => {
    if (!active) moveFocus(element);
    element.inert = !active;
    element.setAttribute("aria-hidden", String(!active));
  };
  const inspection = (card: Card, enabled: boolean) => {
    card.panel.dataset.runtimeInspectionDisabled = String(!enabled);
    const grid = card.panel.querySelector<HTMLElement>('[role="grid"]');
    if (grid) grid.inert = !enabled;
  };
  const cancel = (card: Card) => {
    card.revision += 1;
    card.animations.forEach((animation) => {
      animation.cancel();
    });
    card.animations = [];
  };
  const settle = (card: Card) => {
    cancel(card);
    queue.delete(card);
    batch.delete(card);
    card.settled = card.target;
    const panelVisible = card.target === "panel";
    for (const [element, visible] of [
      [card.panel, panelVisible],
      [card.poster, !panelVisible],
    ] as const) {
      element.style.opacity = visible ? "1" : "0";
      element.style.transform = "none";
      element.style.visibility = visible ? "visible" : "hidden";
      element.style.zIndex = visible ? "2" : "1";
      accessible(element, visible);
    }
    card.poster.hidden = panelVisible;
    card.layers.forEach((layer) => {
      layer.style.opacity = "1";
      layer.style.transform = "none";
    });
    inspection(card, panelVisible);
    card.slot.dataset.runtimeVisualState = card.target;
  };
  const play = (card: Card) => {
    const retarget = card.animations.length > 0;
    const samples = new Map(
      [card.panel, card.poster, ...card.layers].map((element) => {
        const style = getComputedStyle(element);
        return [element, { opacity: style.opacity, transform: style.transform }] as const;
      })
    );
    cancel(card);
    const revision = card.revision;
    const entering = card.target === "panel";
    const incoming = entering ? card.panel : card.poster;
    const outgoing = entering ? card.poster : card.panel;
    card.poster.hidden = false;
    for (const element of [incoming, outgoing]) element.style.visibility = "visible";
    incoming.style.zIndex = "2";
    outgoing.style.zIndex = "1";
    accessible(outgoing, false);
    accessible(incoming, true);
    inspection(card, entering);
    card.slot.dataset.runtimeVisualState = entering ? "entering-panel" : "entering-poster";
    const run = (
      element: HTMLElement,
      start: Keyframe,
      end: Keyframe,
      duration: number,
      delay = 0
    ) => {
      const animation = element.animate([retarget ? (samples.get(element) ?? start) : start, end], {
        duration,
        delay: retarget ? 0 : delay,
        easing: ease,
        fill: "both",
      });
      card.animations.push(animation);
    };
    try {
      run(
        incoming,
        { opacity: 0, transform: entering ? "none" : "translateY(6px)" },
        { opacity: 1, transform: "none" },
        420
      );
      run(outgoing, { opacity: 1, transform: "none" }, { opacity: 0, transform: "none" }, 320);
      card.layers.forEach((layer, index) => {
        run(
          layer,
          { opacity: entering ? 0 : 1, transform: entering ? "translateY(6px)" : "none" },
          { opacity: 1, transform: "none" },
          320,
          index * 50
        );
      });
    } catch {
      settle(card);
      return;
    }
    void Promise.all(
      card.animations.map((animation) => animation.finished.catch(() => undefined))
    ).then(() => {
      if (!disposed && card.revision === revision) settle(card);
    });
  };
  const drain = () => {
    timer = undefined;
    if (disposed || queue.size === 0) return;
    if (immediate()) {
      [...queue, ...batch].forEach(settle);
      lastStart = Number.NEGATIVE_INFINITY;
      return;
    }
    const delay = Math.max(0, lastStart + 140 - timing.now());
    if (delay > 0) {
      timer = timing.timeout(drain, delay);
      return;
    }
    const next = queue.values().next().value;
    if (!next) return;
    queue.delete(next);
    lastStart = timing.now();
    play(next);
    if (queue.size > 0) timer = timing.timeout(drain, 140);
  };
  const flush = () => {
    if (!immediate()) return;
    stopQueue();
    cards.forEach(settle);
    lastStart = Number.NEGATIVE_INFINITY;
  };
  media.addEventListener("change", flush);
  window.addEventListener(WEB_DEMO_MOTION_EVENT, flush);
  document.addEventListener("visibilitychange", flush);

  return {
    register(panel: HTMLElement) {
      if (cards.has(panel)) return;
      const slot = panel.closest<HTMLElement>(".projects-poster-visual");
      const poster = slot?.querySelector<HTMLElement>("[data-runtime-fallback-poster]");
      if (!slot || !poster) return;
      slot.dataset.runtimeMotion = "true";
      const card: Card = {
        panel,
        poster,
        slot,
        layers: [
          "[data-runtime-project-logo]",
          ".runtime-metric-grid",
          "[data-runtime-motion-layer=activity]",
        ].flatMap((selector) => Array.from(panel.querySelectorAll<HTMLElement>(selector))),
        target: "poster",
        settled: "poster",
        revision: 0,
        animations: [],
      };
      cards.set(panel, card);
      settle(card);
    },
    request(panel: HTMLElement, target: Target) {
      const card = cards.get(panel);
      if (!card || disposed) return;
      if (target === "poster") {
        inspection(card, false);
        moveFocus(panel);
      }
      if (card.target === target) return;
      card.target = target;
      if (immediate()) {
        settle(card);
      } else if (card.animations.length) {
        play(card);
      } else if (card.settled === target) {
        settle(card);
      } else {
        batch.add(card);
        if (frame === undefined) {
          frame = timing.frame(() => {
            frame = undefined;
            const ready = [...batch].sort((a, b) =>
              a.slot.compareDocumentPosition(b.slot) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1
            );
            batch.clear();
            ready.forEach((queued) => {
              queue.add(queued);
            });
            if (timer === undefined) drain();
          });
        }
      }
    },
    unregister(panel: HTMLElement) {
      const card = cards.get(panel);
      if (!card) return;
      settle(card);
      cards.delete(panel);
      if (!queue.size && !batch.size) stopQueue();
    },
    dispose() {
      disposed = true;
      stopQueue();
      cards.forEach(settle);
      cards.clear();
      media.removeEventListener("change", flush);
      window.removeEventListener(WEB_DEMO_MOTION_EVENT, flush);
      document.removeEventListener("visibilitychange", flush);
    },
  };
}
