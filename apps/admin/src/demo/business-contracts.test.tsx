import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { cleanup, render, within } from "@testing-library/react";
import type {
  AdminAiUsageOverview,
  AdminUsersResponse,
  UnifiedContentSyncStatus,
} from "@/lib/admin-api-client";
import { cancelWebDemoRequests, dispatchWebDemoAction } from "@/lib/web-demo-runtime";
import { PlaybookSyncStatusDetails } from "../pages/content-sync";
import { setupAdminDemoApiMocks } from "./mock-admin-api";

GlobalRegistrator.register({ url: "http://localhost" });
const clock = Date.now;
let restoreClock: (() => void) | undefined;

function scene(query = "d_scene=admin-dashboard") {
  window.history.replaceState(
    null,
    "",
    `http://localhost/admin/content-sync?${query}&d_delay=custom&d_delay_ms=0`
  );
}
function api(path: string, init?: RequestInit) {
  return window.fetch(`http://localhost/api/admin/${path}`, init);
}
async function usage(query: string) {
  const response = await api(`ai-usage?${query}`);
  expect(response.status).toBe(200);
  return (await response.json()) as AdminAiUsageOverview;
}

beforeEach(() => {
  scene();
  document.documentElement.dataset.webDemoBuild = "true";
  setupAdminDemoApiMocks();
  dispatchWebDemoAction("reset-state", "Reset test state");
});
afterEach(() => {
  restoreClock?.();
  restoreClock = undefined;
  dispatchWebDemoAction("reset-state", "Reset test state");
  cancelWebDemoRequests();
  cleanup();
});

describe("Web Demo business contracts without Chromium", () => {
  for (const [query, label] of [
    ["admin-dashboard", "当前"],
    ["admin-sync-unindexed", "当前"],
    ["admin-sync-outdated", "过时"],
    ["admin-sync-failed", "失败"],
    ["admin-sync-failed&d_data=empty", "无效快照"],
    ["admin-sync-disabled", "不可用"],
    ["admin-sync-unconfigured", "未配置"],
  ]) {
    test(`renders real adapter Playbook scene ${query} as ${label}`, async () => {
      scene(`d_scene=${query}`);
      const response = await api("content-sync/status");
      expect(response.status).toBe(200);
      const status = (await response.json()) as UnifiedContentSyncStatus;
      const view = render(
        <PlaybookSyncStatusDetails playbook={status.playbook} rag={status.rag} />
      );
      expect(
        within(view.getByTestId("playbook-sync-status")).getByText(label, { exact: true })
      ).toBeTruthy();
      expect(view.getByTestId("playbook-source-identity").textContent).toContain(
        "IvanLi-CN/style-playbook-skills"
      );
      for (const text of ["当前 commit", "当前 content hash", "上一快照"]) {
        expect(view.getByTestId("playbook-sync-status").textContent).toContain(text);
      }
    });
  }

  test("denies the real admin adapter status endpoint to guests", async () => {
    scene("d_persona=guest");
    const response = await api("content-sync/status");
    expect(response.status).toBe(403);
    expect(await response.text()).toContain("管理员权限");
  });

  test("keeps daily values stable across ranges and applies user/status grouping", async () => {
    const month = await usage("range=30d");
    expect(month.trend).toHaveLength(30);
    const from = month.trend.at(-3)!.day;
    const to = month.trend.at(-1)!.day;
    const custom = await usage(`range=custom&from=${from}&to=${to}`);
    expect(custom.trend).toHaveLength(3);
    expect(custom.trend).toEqual(month.trend.slice(-3));
    const grouped = await usage("range=7d&groupBy=user");
    expect(grouped.groups.some((group) => group.label === "Rui Reader")).toBe(true);
    const missing = await usage("range=7d&groupBy=user&status=missing");
    expect(missing.details.length).toBeGreaterThan(0);
    expect(missing.details.every((detail) => detail.status === "missing")).toBe(true);
    expect(missing.groups.length).toBeGreaterThan(0);
  });

  test("policy writes persist and quota reset changes only its target user", async () => {
    const policy = await (await api("ai-usage/policy")).json();
    const updated = { ...policy, tokenHourlyLimit: 1200000 };
    const saved = await api("ai-usage/policy", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(updated),
    });
    expect(saved.status).toBe(200);
    expect(await (await api("ai-usage/policy")).json()).toEqual(updated);
    const before = (await (await api("users")).json()) as AdminUsersResponse;
    const rui = before.users.find((user) => user.id === "demo-user-rui")!;
    const ming = before.users.find((user) => user.id === "demo-user-ming")!;
    const reset = await api("users/demo-user-ming/quota-reset", { method: "POST" });
    expect(reset.status).toBe(200);
    const after = (await (await api("users")).json()) as AdminUsersResponse;
    expect(after.users.find((user) => user.id === rui.id)).toEqual(rui);
    const restored = after.users.find((user) => user.id === ming.id)!;
    expect(restored.quota.cycleId).not.toBe(ming.quota.cycleId);
    expect(restored.quota).toMatchObject({
      tokenHour: 0,
      tokenWeek: 0,
      questionHour: 0,
      questionWeek: 0,
    });
    expect(restored.quotaStatus).toBe("available");
  });

  test("manual project checks enter running state and expose completed manual history", async () => {
    let now = clock();
    const mocked = spyOn(Date, "now").mockImplementation(() => now);
    restoreClock = () => mocked.mockRestore();
    const historyBefore = await (await api("project-status/history")).json();
    expect((await api("project-status/trigger", { method: "POST" })).status).toBe(202);
    expect((await (await api("project-status/overview")).json()).activeRun).not.toBeNull();
    expect((await api("project-status/trigger", { method: "POST" })).status).toBe(409);
    now += 2000;
    expect((await (await api("project-status/overview")).json()).activeRun).toBeNull();
    const historyAfter = await (await api("project-status/history")).json();
    expect(historyAfter.runs.length).toBe(historyBefore.runs.length);
    expect(historyBefore.runs[0].triggeredBy).toBe("scheduler");
    expect(historyAfter.runs[0]).toMatchObject({ triggeredBy: "manual", status: "partial" });
  });
});
