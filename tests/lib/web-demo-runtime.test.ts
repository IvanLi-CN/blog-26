import { describe, expect, it } from "bun:test";
import {
  getDefaultWebDemoState,
  getWebDemoSceneOptions,
  getWebDemoShareUrl,
  getWebDemoState,
  normalizeWebDemoState,
} from "../../src/lib/web-demo-runtime";

describe("Web Demo runtime state", () => {
  it("reads inspector state from shareable d_* parameters", () => {
    const state = getWebDemoState({
      pathname: "/memos/",
      search: "?d_scene=memo-oldest&d_persona=admin&d_network=offline&d_data=dense",
    });

    expect(state).toEqual({
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
    ).toMatchObject({ scene: "memo-network-fault", network: "offline" });
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
    expect(url).toContain("d_network=slow");
  });

  it("exposes route-specific scene choices for public and admin surfaces", () => {
    expect(getWebDemoSceneOptions("/memos/", "public").map((option) => option.value)).toContain(
      "memo-network-fault"
    );
    expect(
      getWebDemoSceneOptions("/admin/dashboard", "admin").map((option) => option.value)
    ).toEqual(["admin-dashboard", "admin-editor"]);
  });
});
