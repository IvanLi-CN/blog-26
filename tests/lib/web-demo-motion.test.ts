import { afterEach, expect, test } from "bun:test";
import { Window } from "happy-dom";
import {
  getWebDemoRuntimeState,
  setWebDemoRuntimeState,
  WEB_DEMO_MOTION_EVENT,
} from "../../src/lib/web-demo-runtime";

const browserGlobals = globalThis as {
  window?: unknown;
  document?: unknown;
  CustomEvent: unknown;
};
const original = {
  window: browserGlobals.window,
  document: browserGlobals.document,
  CustomEvent: browserGlobals.CustomEvent,
};

afterEach(() => Object.assign(browserGlobals, original));

test("motion listeners read the new preference before React effects run", () => {
  const browser = new Window({ url: "http://localhost/memos/?d_motion=system" });
  Object.assign(browserGlobals, {
    window: browser,
    document: browser.document,
    CustomEvent: browser.CustomEvent,
  });
  browser.document.documentElement.dataset.webDemoBuild = "true";
  browser.document.documentElement.dataset.webDemoMotion = "system";
  const observed: Array<string | undefined> = [];
  browser.addEventListener(WEB_DEMO_MOTION_EVENT, () => {
    observed.push(browser.document.documentElement.dataset.webDemoMotion);
  });
  const state = getWebDemoRuntimeState(window.location, "public");
  setWebDemoRuntimeState(
    { ...state, environment: { ...state.environment, motion: "reduce" } },
    { syncTheme: false }
  );
  // Match the Inspector effect that runs after the synchronous notification.
  browser.document.documentElement.dataset.webDemoMotion = "reduce";
  setWebDemoRuntimeState(state, { syncTheme: false });
  expect(observed).toEqual(["reduce", "system"]);
});
