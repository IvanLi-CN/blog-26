import { afterEach, expect, test } from "bun:test";
import { Window } from "happy-dom";
import {
  createProjectRuntimeMotion,
  type RuntimeMotionClock,
} from "../../site/lib/project-runtime-motion";

const globals = ["window", "document", "Node", "getComputedStyle"] as const;
const originals = new Map(
  globals.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)])
);
let dispose: (() => void) | undefined;
afterEach(() => {
  dispose?.();
  dispose = undefined;
  for (const key of globals) {
    const descriptor = originals.get(key);
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else Reflect.deleteProperty(globalThis, key);
  }
});

function setup() {
  const browser = new Window();
  Object.assign(globalThis, {
    window: browser,
    document: browser.document,
    Node: browser.Node,
    getComputedStyle: browser.getComputedStyle.bind(browser),
  });
  let now = 0;
  let nextId = 0;
  const timers = new Map<number, { at: number; callback: () => void }>();
  const frames = new Map<number, FrameRequestCallback>();
  const timing: RuntimeMotionClock = {
    now: () => now,
    frame(callback) {
      const id = ++nextId;
      frames.set(id, callback);
      return id;
    },
    cancelFrame(id) {
      frames.delete(id);
    },
    timeout(callback, delay) {
      const id = ++nextId;
      timers.set(id, { at: now + delay, callback });
      return id;
    },
    clearTimeout(id) {
      timers.delete(id);
    },
  };
  const records: {
    element: HTMLElement;
    frames: Keyframe[];
    duration: number;
    delay: number;
    at: number;
  }[] = [];
  Object.defineProperty(browser.HTMLElement.prototype, "animate", {
    configurable: true,
    value(this: HTMLElement, keyframes: Keyframe[], options: KeyframeAnimationOptions) {
      const duration = Number(options.duration);
      const delay = Number(options.delay ?? 0);
      records.push({ element: this, frames: keyframes, duration, delay, at: now });
      let complete: () => void = () => undefined;
      const finished = new Promise<void>((resolve) => {
        complete = resolve;
      });
      const id = timing.timeout(complete, duration + delay);
      return {
        finished,
        cancel() {
          timing.clearTimeout(id);
          complete();
        },
      };
    },
  });
  document.body.innerHTML = `<div id="rail">${["a", "b", "c"].map((id) => `<article class="projects-poster-card"><div class="projects-poster-visual"><a data-runtime-fallback-poster href="/${id}">poster</a><div id="${id}" data-project-runtime-panel><div data-runtime-project-logo></div><div class="runtime-metric-grid"></div><section data-runtime-motion-layer="activity"><div role="grid" tabindex="0"></div></section></div></div><a class="projects-poster-title-link" href="/${id}">title</a></article>`).join("")}</div>`;
  const rail = document.querySelector<HTMLElement>("#rail");
  if (!rail) throw new Error("rail is missing");
  const panels = ["a", "b", "c"].map((id) => {
    const panel = document.querySelector<HTMLElement>(`#${id}`);
    if (!panel) throw new Error("panel is missing");
    return panel;
  });
  const motion = createProjectRuntimeMotion(rail, timing);
  panels.forEach((panel) => {
    motion.register(panel);
  });
  dispose = () => motion.dispose();
  const frame = () => {
    const callbacks = [...frames.values()];
    frames.clear();
    callbacks.forEach((callback) => {
      callback(now);
    });
  };
  const advance = (elapsed: number) => {
    const end = now + elapsed;
    for (;;) {
      const next = [...timers]
        .filter(([, timer]) => timer.at <= end)
        .sort((a, b) => a[1].at - b[1].at)[0];
      if (!next) break;
      now = next[1].at;
      timers.delete(next[0]);
      next[1].callback();
    }
    now = end;
  };
  const starts = () => records.filter((record) => record.duration === 420);
  return { motion, panels, records, frame, advance, starts, browser, timers, frames };
}

async function flushPromises() {
  for (let i = 0; i < 6; i++) await Promise.resolve();
}

test("same-frame readiness uses DOM order and overlapping 140ms starts", async () => {
  const { motion, panels, records, frame, advance, starts } = setup();
  [...panels].reverse().forEach((panel) => {
    motion.request(panel, "panel");
  });
  frame();
  advance(280);
  expect(starts().map(({ element, at }) => [element.id, at])).toEqual([
    ["a", 0],
    ["b", 140],
    ["c", 280],
  ]);
  expect(
    records
      .filter(({ element }) => panels[0].contains(element) && element !== panels[0])
      .map(({ duration, delay }) => [duration, delay])
  ).toEqual([
    [320, 0],
    [320, 50],
    [320, 100],
  ]);
  motion.register(panels[0]); // Reinitialization must not reset a playing card.
  advance(140);
  await flushPromises();
  expect(
    panels.map(
      (panel) => panel.closest<HTMLElement>(".projects-poster-visual")?.dataset.runtimeVisualState
    )
  ).toEqual(["panel", "entering-panel", "entering-panel"]);
  advance(140);
  await flushPromises();
  expect(
    panels.map(
      (panel) => panel.closest<HTMLElement>(".projects-poster-visual")?.dataset.runtimeVisualState
    )
  ).toEqual(["panel", "panel", "entering-panel"]);
  advance(140);
  await flushPromises();
  expect(
    panels.map(
      (panel) => panel.closest<HTMLElement>(".projects-poster-visual")?.dataset.runtimeVisualState
    )
  ).toEqual(["panel", "panel", "panel"]);
  expect(panels.every((panel) => panel.getAttribute("aria-hidden") === "false")).toBe(true);
});

test("later ready cards join without holding ready cards or replaying refreshes", () => {
  const { motion, panels, frame, advance, starts } = setup();
  motion.request(panels[2], "panel");
  frame();
  advance(50);
  motion.request(panels[1], "panel");
  frame();
  advance(300);
  motion.request(panels[0], "panel");
  frame();
  motion.request(panels[2], "panel");
  expect(starts().map(({ element, at }) => [element.id, at])).toEqual([
    ["c", 0],
    ["b", 140],
    ["a", 350],
  ]);
});

test("obsolete queued requests disappear and reversal samples the visible state", async () => {
  const { motion, panels, frame, advance, starts, records } = setup();
  motion.request(panels[0], "panel");
  motion.request(panels[1], "panel");
  frame();
  motion.request(panels[1], "poster");
  advance(60);
  panels[0].style.opacity = "0.45";
  motion.request(panels[0], "poster");
  expect(starts()).toHaveLength(2);
  expect(starts()[1].at).toBe(60);
  expect(records.findLast((record) => record.element === panels[0])?.frames[0].opacity).toBe(
    "0.45"
  );
  advance(420);
  await flushPromises();
  expect(panels[0].style.opacity).toBe("0");
  expect(
    panels[0].closest<HTMLElement>(".projects-poster-visual")?.dataset.runtimeVisualState
  ).toBe("poster");
  expect(
    panels[1].closest<HTMLElement>(".projects-poster-visual")?.dataset.runtimeVisualState
  ).toBe("poster");
});

test("fallback immediately removes inspection and restores focus outside the fading layer", () => {
  const { motion, panels, frame } = setup();
  motion.request(panels[0], "panel");
  frame();
  const grid = panels[0].querySelector<HTMLElement>('[role="grid"]');
  if (!grid) throw new Error("grid is missing");
  grid.focus();
  motion.request(panels[0], "poster");
  expect(panels[0].dataset.runtimeInspectionDisabled).toBe("true");
  expect(document.activeElement?.className).toBe("projects-poster-title-link");
  expect(panels[0].getAttribute("aria-hidden")).toBe("true");
});

test("reduced motion flushes playing and queued cards and skips future delays", async () => {
  const { motion, panels, frame, records } = setup();
  panels.forEach((panel) => {
    motion.request(panel, "panel");
  });
  frame();
  document.documentElement.dataset.webDemoMotion = "reduce";
  window.dispatchEvent(new window.Event("web-demo:motion-change"));
  await flushPromises();
  expect(panels.map((panel) => panel.style.opacity)).toEqual(["1", "1", "1"]);
  const count = records.length;
  panels.forEach((panel) => {
    motion.request(panel, "poster");
  });
  expect(records).toHaveLength(count);
  expect(panels.map((panel) => panel.style.opacity)).toEqual(["0", "0", "0"]);
});

test("hidden pages settle targets and dispose removes delayed callbacks", async () => {
  const { motion, panels, frame, advance, records, timers, frames } = setup();
  panels.forEach((panel) => {
    motion.request(panel, "panel");
  });
  frame();
  Object.defineProperty(document, "hidden", { configurable: true, value: true });
  document.dispatchEvent(new window.Event("visibilitychange"));
  expect(panels.every((panel) => panel.style.opacity === "1")).toBe(true);
  motion.dispose();
  const count = records.length;
  advance(1000);
  await flushPromises();
  expect(records).toHaveLength(count);
  expect(timers.size + frames.size).toBe(0);
});

test("unsupported animation API switches immediately", () => {
  const { motion, panels, records } = setup();
  Object.defineProperty(window.HTMLElement.prototype, "animate", {
    configurable: true,
    value: undefined,
  });
  panels.forEach((panel) => {
    motion.request(panel, "panel");
  });
  expect(records).toHaveLength(0);
  expect(panels.every((panel) => panel.style.opacity === "1")).toBe(true);
});
