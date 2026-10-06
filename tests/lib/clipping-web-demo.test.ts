import { describe, expect, it } from "bun:test";
import { getMemoListWebDemoInitialPage } from "../../site/lib/memo-list-web-demo";
import type { ClippingArticle, ClippingChat } from "../../src/components/memos/ClippingDetail";
import {
  createClippingWebDemoModel,
  getClippingWebDemoArticle,
} from "../../src/lib/clipping-web-demo";
import {
  getDefaultWebDemoState,
  getWebDemoSceneOptions,
  getWebDemoState,
  WEB_DEMO_CLIPPING_SLUG,
  type WebDemoState,
} from "../../src/lib/web-demo-runtime";

const admin: WebDemoState = {
  scene: "clipping-ready",
  persona: "admin",
  network: "healthy",
  data: "fixture",
};
const path = `/memos/${WEB_DEMO_CLIPPING_SLUG}/`;

describe("clipping Web Demo on the official route", () => {
  it("shares route-specific scenes without enabling them on the ordinary memo list", () => {
    expect(getDefaultWebDemoState(path).scene).toBe("clipping-ready");
    expect(getWebDemoSceneOptions(path).map(({ value }) => value)).toContain(
      "clipping-translation-failure"
    );
    expect(
      getWebDemoState({
        pathname: path,
        search: "?d_scene=clipping-long-article&d_persona=admin&d_data=dense",
      })
    ).toMatchObject({ scene: "clipping-long-article", persona: "admin", data: "dense" });
    expect(getWebDemoState({ pathname: "/memos/", search: "?d_scene=clipping-ready" }).scene).toBe(
      "memo-middle"
    );
  });

  it("includes a clipping alongside ordinary memos only when the build flag is enabled", () => {
    const saved = process.env.PUBLIC_WEB_DEMO_BUILD;
    try {
      process.env.PUBLIC_WEB_DEMO_BUILD = "true";
      const page = getMemoListWebDemoInitialPage();
      expect(page.memos[0]?.clipping?.status).toBe("completed");
      expect(page.memos[0]?.tags).toContain("剪藏");
      expect(page.memos[1]?.clipping).toBeUndefined();
      process.env.PUBLIC_WEB_DEMO_BUILD = "false";
      expect(getMemoListWebDemoInitialPage().memos[0]?.clipping).toBeUndefined();
    } finally {
      if (saved === undefined) delete process.env.PUBLIC_WEB_DEMO_BUILD;
      else process.env.PUBLIC_WEB_DEMO_BUILD = saved;
    }
  });

  it("keeps failed translations partial and does not claim an uncaptured article has a summary", () => {
    const failure = getClippingWebDemoArticle({ ...admin, scene: "clipping-translation-failure" });
    expect(failure.source).toContain("Reading and discussion");
    expect(failure.translation).not.toContain("阅读与讨论");
    expect(failure.reading).toMatchObject({
      summaryState: "completed",
      translationState: "failed",
      translatedSegments: 1,
    });
    const empty = getClippingWebDemoArticle({ ...admin, data: "empty" });
    expect(empty.source).toBeNull();
    expect(empty.content).not.toContain("Agent 摘要");
    expect(empty.canDiscuss).toBe(false);
    const previous = getClippingWebDemoArticle({ ...admin, scene: "clipping-previous-version" });
    expect(previous.reading).toMatchObject({
      usingPreviousVersion: true,
      sourceTranslationState: "completed",
    });
  });

  it("restricts discussion and version mutations to the simulated admin, including delayed requests", async () => {
    const model = createClippingWebDemoModel({ ...admin, persona: "guest" });
    expect((await model.transport.request<ClippingArticle>("")).canDiscuss).toBe(false);
    await expect(model.transport.request("chat")).rejects.toThrow("访客");
    await expect(model.transport.request("restore", { versionId: "anything" })).rejects.toThrow(
      "访客"
    );
    model.setState({ ...admin, network: "slow" });
    const pending = model.transport.request("chat", { text: "private", requestId: "delayed" });
    model.setState({ ...admin, persona: "guest" });
    await expect(pending).rejects.toThrow("访客");
    model.setState(admin);
    expect((await model.transport.request<ClippingChat>("chat")).messages).toHaveLength(2);
  });

  it("deduplicates messages, publishes snapshots, and restores materials without losing the conversation", async () => {
    const mutations: string[] = [];
    const snapshots: ClippingChat[] = [];
    const model = createClippingWebDemoModel(admin, (label) => mutations.push(label));
    const unsubscribe = model.transport.subscribe(
      (value) => snapshots.push(value),
      () => undefined
    );
    const request = { text: "How does resume work?", requestId: "same-request" };
    await model.transport.request("chat", request);
    await model.transport.request("chat", request);
    const chat = await model.transport.request<ClippingChat>("chat");
    expect(chat.messages).toHaveLength(4);
    expect(chat.messages.at(-1)?.text).toContain("原文段落 1");
    expect(mutations).toHaveLength(1);
    expect(snapshots).toHaveLength(2);
    const history = await model.transport.request<{ versions: { id: string }[] }>("history");
    await model.transport.request("restore", { versionId: history.versions[0]?.id });
    expect((await model.transport.request<ClippingChat>("chat")).messages).toEqual(chat.messages);
    await expect(model.transport.request("history?versionId=unknown")).rejects.toThrow("不存在");
    unsubscribe();
    model.reset(admin);
    expect((await model.transport.request<ClippingChat>("chat")).messages).toHaveLength(2);
  });

  it("resumes simulated translation progress and keeps requests closed to live endpoints", async () => {
    const model = createClippingWebDemoModel({ ...admin, scene: "clipping-translation-failure" });
    await model.transport.request("reprocess", {});
    expect(model.getArticle().reading.translatedSegments).toBe(1);
    expect(
      (await model.transport.request<ClippingArticle>("status")).reading.translatedSegments
    ).toBe(2);
    const done = await model.transport.request<ClippingArticle>("status");
    expect(done.reading.status).toBe("completed");
    expect(done.translation).toContain("阅读与讨论");
    await expect(model.transport.request("/api/private/unrecognized")).rejects.toThrow("不支持");
    model.setState({ ...admin, network: "offline" });
    await expect(model.transport.request("chat", { text: "offline" })).rejects.toThrow("没有发送");
    model.setState(admin);
    expect((await model.transport.request<ClippingChat>("chat")).messages).toHaveLength(2);
    model.simulateSave();
    expect(model.getArticle().content).toContain("新增的备注");
    model.reset(admin);
    expect(model.getArticle().content).not.toContain("新增的备注");
  });
});
