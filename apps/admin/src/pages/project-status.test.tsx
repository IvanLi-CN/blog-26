import { afterEach, describe, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, within } from "@testing-library/react";
import { getProjectStatusCatalogEntries } from "@/lib/project-catalog";
import type { ProjectStatusOverviewResponse } from "@/lib/project-status";
import { ProjectStatusPage } from "./project-status";

GlobalRegistrator.register();

afterEach(() => {
  cleanup();
});

function buildOverview(): ProjectStatusOverviewResponse {
  const catalog = getProjectStatusCatalogEntries();
  const results = catalog.map((entry, index) => ({
    id: `result-${index}`,
    runId: "run-1",
    entryKey: entry.entryKey,
    projectSlug: entry.projectSlug,
    projectTitle: entry.projectTitle,
    domain: entry.domain,
    entryKind: entry.kind,
    entryLabel: entry.label,
    href: entry.href,
    status: index === 0 ? ("unavailable" as const) : ("available" as const),
    freshness: "fresh" as const,
    attempted: true,
    httpStatus: index === 0 ? 503 : 200,
    finalUrl: null,
    redirected: false,
    latencyMs: 120,
    attemptCount: index === 0 ? 2 : 1,
    errorKind: index === 0 ? "http_503" : null,
    errorMessage: index === 0 ? "目标返回 HTTP 503" : null,
    checkedAt: Date.now(),
  }));
  return {
    catalog,
    latestRun: {
      id: "run-1",
      status: "completed",
      triggeredBy: "scheduler",
      targetCount: catalog.length,
      attemptedCount: catalog.length,
      availableCount: catalog.length - 1,
      unavailableCount: 1,
      startedAt: Date.now() - 60_000,
      finishedAt: Date.now() - 30_000,
      durationMs: 30_000,
      errorMessage: null,
    },
    activeRun: null,
    summary: {
      total: catalog.length,
      available: catalog.length - 1,
      unavailable: 1,
      unknown: 0,
      stale: 0,
    },
    results,
  };
}

describe("ProjectStatusPage", () => {
  test("renders the shared directory and enters checking after a manual trigger", async () => {
    const overview = buildOverview();
    let active = false;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input, init) => {
      const path = String(input);
      if (path.includes("/overview")) {
        return new Response(
          JSON.stringify({ ...overview, activeRun: active ? overview.latestRun : null }),
          {
            headers: { "content-type": "application/json" },
          }
        );
      }
      if (path.includes("/history")) {
        return new Response(JSON.stringify({ runs: [overview.latestRun] }), {
          headers: { "content-type": "application/json" },
        });
      }
      if (path.includes("/trigger") && init?.method === "POST") {
        active = true;
        return new Response(
          JSON.stringify({ success: true, queued: true, runKey: "project-entry-status" }),
          {
            status: 202,
            headers: { "content-type": "application/json" },
          }
        );
      }
      throw new Error(`Unexpected request: ${path}`);
    }) as typeof fetch;

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { findByText, findByRole, getAllByRole, getByRole } = render(
      <QueryClientProvider client={client}>
        <ProjectStatusPage />
      </QueryClientProvider>
    );

    expect(await findByText("项目入口状态")).toBeTruthy();
    expect(await findByRole("heading", { name: "问题列表" })).toBeTruthy();
    expect(await findByRole("table", { name: "项目入口问题列表" })).toBeTruthy();
    const matrixTable = await findByRole("table", {
      name: "项目与链接分组状态一览表（异常项目优先）",
    });
    expect(within(matrixTable).getByRole("columnheader", { name: "项目" })).toBeTruthy();
    expect(within(matrixTable).getByRole("columnheader", { name: /项目站点/ })).toBeTruthy();
    expect(within(matrixTable).getByRole("columnheader", { name: /开源仓库/ })).toBeTruthy();
    expect(await findByText("目标返回 HTTP 503")).toBeTruthy();
    fireEvent.click(getAllByRole("button", { name: /展开 .* 入口详情/ })[0]);
    expect(await findByRole("button", { name: /收起 .* 入口详情/ })).toBeTruthy();
    fireEvent.click(getByRole("button", { name: "手动检查" }));
    expect(await findByRole("button", { name: "检查中" })).toBeTruthy();

    globalThis.fetch = originalFetch;
  });
});
