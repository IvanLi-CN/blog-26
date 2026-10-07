import { describe, expect, it } from "bun:test";
import {
  assertWebDemoRequestAvailable,
  getDefaultWebDemoState,
  getWebDemoEnvironment,
  getWebDemoRequestDelayMs,
  getWebDemoSceneOptions,
  getWebDemoShareUrl,
  getWebDemoState,
  getWebDemoStateChangeKeys,
  normalizeWebDemoEnvironment,
  normalizeWebDemoState,
} from "../../src/lib/web-demo-runtime";

describe("Web Demo runtime state", () => {
  it("reads inspector state from shareable d_* parameters", () => {
    const environment = getWebDemoEnvironment({
      pathname: "/memos/",
      search:
        "?d_scene=memo-oldest&d_persona=admin&d_connection=offline&d_delay=custom&d_delay_ms=2300&d_theme=dark&d_motion=reduce&d_data=dense",
    });

    expect(environment).toEqual({
      persona: "admin",
      connection: "offline",
      delay: "custom",
      delayMs: 2300,
      theme: "dark",
      motion: "reduce",
    });

    expect(
      getWebDemoState({
        pathname: "/memos/",
        search: "?d_scene=memo-oldest&d_persona=admin&d_network=offline&d_data=dense",
      })
    ).toEqual({
      scene: "memo-oldest",
      persona: "admin",
      network: "offline",
      data: "dense",
    });
  });

  it("normalizes invalid or cross-app states to the current formal route", () => {
    expect(getDefaultWebDemoState("/admin/dashboard")).toMatchObject({
      scene: "admin-dashboard",
      persona: "admin",
    });
    expect(
      normalizeWebDemoState(
        { scene: "memo-newest", network: "healthy" },
        "/admin/dashboard",
        "admin"
      ).scene
    ).toBe("admin-dashboard");
    expect(
      normalizeWebDemoState(
        { scene: "memo-network-fault", network: "healthy" },
        "/memos/",
        "public"
      )
    ).toMatchObject({ scene: "memo-network-fault", network: "healthy" });
  });

  it("keeps share URLs on the current product route", () => {
    const location = {
      href: "http://127.0.0.1:38110/memos/?source=review",
      pathname: "/memos/",
      search: "?source=review",
    } as Location;
    const url = getWebDemoShareUrl(
      { scene: "memo-middle", persona: "guest", network: "slow", data: "fixture" },
      location
    );

    expect(new URL(url).pathname).toBe("/memos/");
    expect(url).toContain("d_scene=memo-middle");
    expect(url).toContain("d_connection=online");
    expect(url).toContain("d_delay=slow");
    expect(url).not.toContain("d_network=");
  });

  it("exposes route-specific scene choices for public and admin surfaces", () => {
    expect(getWebDemoSceneOptions("/memos/", "public").map((option) => option.value)).toContain(
      "memo-network-fault"
    );
    expect(
      getWebDemoSceneOptions("/admin/dashboard", "admin").map((option) => option.value)
    ).toEqual(["admin-dashboard", "admin-editor"]);
  });

  it("keeps environment controls independent and applies request policy", () => {
    const environment = normalizeWebDemoEnvironment({
      persona: "user",
      connection: "online",
      delay: "custom",
      delayMs: 30_000,
      theme: "dark",
      motion: "reduce",
    });

    expect(environment).toEqual({
      persona: "user",
      connection: "online",
      delay: "custom",
      delayMs: 30_000,
      theme: "dark",
      motion: "reduce",
    });
    expect(getWebDemoRequestDelayMs(environment)).toBe(30_000);
    expect(getWebDemoRequestDelayMs({ ...environment, delay: "slow" })).toBe(1500);
    expect(getWebDemoRequestDelayMs({ ...environment, delay: "normal" })).toBe(0);

    expect(() => assertWebDemoRequestAvailable({ ...environment, connection: "offline" })).toThrow(
      "Failed to fetch"
    );
    const controller = new AbortController();
    controller.abort();
    expect(() => assertWebDemoRequestAvailable(environment, controller.signal)).toThrow("aborted");
  });

  it("reports environment changes without treating them as scene or data changes", () => {
    const previous = {
      sceneState: { scene: "memo-middle" as const, data: "fixture" as const },
      environment: normalizeWebDemoEnvironment({}),
    };
    const next = {
      sceneState: previous.sceneState,
      environment: normalizeWebDemoEnvironment({ theme: "dark", motion: "reduce" }),
    };

    expect(getWebDemoStateChangeKeys(previous, next)).toEqual(["theme", "motion"]);
  });
});
