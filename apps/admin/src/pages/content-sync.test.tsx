import { afterEach, describe, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { cleanup, fireEvent, render } from "@testing-library/react";
import {
  ContentSyncActions,
  PlaybookStatusDetails,
  RagCoverageGrid,
  VectorizationStatsGrid,
} from "./content-sync";

GlobalRegistrator.register();

afterEach(() => {
  cleanup();
});

describe("VectorizationStatsGrid", () => {
  test("renders readable vectorization metrics instead of raw response data", () => {
    const { getByTestId, getByText } = render(
      <VectorizationStatsGrid
        stats={{
          indexed: 12,
          outdated: 3,
          unindexed: 4,
          lastIndexedAt: "2026-09-27T04:00:00.000Z",
          model: "BAAI/bge-m3",
          dim: 1024,
        }}
      />
    );

    expect(getByTestId("vectorization-stats")).toBeTruthy();
    expect(getByText("已索引")).toBeTruthy();
    expect(getByText("待处理")).toBeTruthy();
    expect(getByText("需更新")).toBeTruthy();
    expect(getByText("最近更新")).toBeTruthy();
    expect(getByText("12")).toBeTruthy();
    expect(getByText("3")).toBeTruthy();
    expect(getByText("4")).toBeTruthy();
    expect(getByText(/2026/)).toBeTruthy();
  });
});

describe("Playbook sync controls", () => {
  const playbook = {
    name: "playbook" as const,
    type: "playbook" as const,
    adopted: true,
    current: {
      edition: "a".repeat(64),
      sourceReleaseId: "100",
      sourceTag: "v3.0.0",
      generatedAt: "2026-10-13T23:34:40.000Z",
    },
    previous: null,
    lexical: { status: "ready", count: 3 },
    semantic: { model: "text-embedding-3-small", total: 3, ready: 2, pending: 1, failed: 0 },
    history: [
      {
        id: "sync-1",
        status: "success",
        operation: "sync",
        message: "ok",
        data: null,
        createdAt: Date.now(),
      },
    ],
    editions: [
      {
        edition: "a".repeat(64),
        sourceReleaseId: "100",
        sourceTag: "v3.0.0",
        generatedAt: "2026-10-13T23:34:40.000Z",
      },
    ],
  };

  test("renders adopted edition and semantic recovery counts", () => {
    const { getByText } = render(<PlaybookStatusDetails playbook={playbook} />);
    expect(getByText("已采用")).toBeTruthy();
    expect(getByText(/2 ready/)).toBeTruthy();
    expect(getByText(/1 条记录/)).toBeTruthy();
  });

  test("fires Playbook refresh and disables all actions while busy", () => {
    let refreshed = false;
    const { getByRole, rerender } = render(
      <ContentSyncActions
        busy={false}
        syncing={false}
        playbookSyncing={false}
        vectorizing={false}
        cancelling={false}
        onSync={() => undefined}
        onPlaybookSync={() => {
          refreshed = true;
        }}
        onVectorize={() => undefined}
        onCancel={() => undefined}
      />
    );
    fireEvent.click(getByRole("button", { name: /刷新 Playbook/ }));
    expect(refreshed).toBe(true);
    rerender(
      <ContentSyncActions
        busy
        syncing={false}
        playbookSyncing
        vectorizing={false}
        cancelling={false}
        onSync={() => undefined}
        onPlaybookSync={() => undefined}
        onVectorize={() => undefined}
        onCancel={() => undefined}
      />
    );
    expect(getByRole("button", { name: /刷新 Playbook/ }).hasAttribute("disabled")).toBe(true);
  });
});

describe("RAG coverage", () => {
  test("shows six parent metrics, differentiates unavailable and true zero", () => {
    const { getByText, rerender } = render(
      <RagCoverageGrid
        stats={{ total: 1, indexed: 0, unindexed: 1, outdated: 0, failed: 0, coverage: 0 }}
      />
    );
    expect(getByText("总量")).toBeTruthy();
    expect(getByText("未索引")).toBeTruthy();
    expect(getByText("失败")).toBeTruthy();
    expect(getByText("0.0%")).toBeTruthy();
    rerender(
      <RagCoverageGrid
        available={false}
        stats={{
          total: 1,
          indexed: null,
          unindexed: null,
          outdated: null,
          failed: null,
          coverage: null,
        }}
      />
    );
    expect(getByText("覆盖率").nextElementSibling?.textContent).toBe("—");
  });
});
