import type {
  ClippingArticle,
  ClippingChat,
  ClippingTransport,
} from "@/components/memos/ClippingDetail";
import type { PublicMemoRecord } from "@/public-site/snapshot";
import { WEB_DEMO_CLIPPING_SLUG, type WebDemoState } from "./web-demo-runtime";

const targetUrl = "https://earendil.com/posts/pi-durable/";
const currentVersion = "11111111-1111-4111-8111-111111111111";
const previousVersion = "22222222-2222-4222-8222-222222222222";
const fixtureTime = Date.UTC(2026, 8, 30, 12) - 1180 * 60 * 60 * 1000;
const summary =
  "**Agent 摘要**\n\n这份演示材料介绍持久执行：保存已提交的进度，在进程重启后继续处理，并为文章提供可恢复的对话。";
const notes = "作者备注：关注中断后的恢复方式，以及文章处理与对话的边界。";
const source = `## Durable article workflows

Durable execution saves committed progress. When a process stops, the next owner can resume from a saved checkpoint.

## Reading and discussion

The article, summary, and translation belong to the saved reading version. A private conversation uses the captured article as its source.

| Stage | Saved result |
| --- | --- |
| Capture | Source Markdown |
| Summary | A concise overview |
| Translation | Ordered translated sections |

\`\`\`ts
await saveCheckpoint();
await resumeFromCheckpoint();
\`\`\`

This is deterministic Web Demo material, not a full copy of the linked article.`;
const translation = `## 持久文章工作流

持久执行会保存已提交的进度。进程停止后，下一个有效处理器可以从保存的检查点继续。

## 阅读与讨论

原文、摘要和译文属于同一个阅读版本。私有对话以已保存的文章为来源。

| 阶段 | 保存的结果 |
| --- | --- |
| 抓取 | Markdown 原文 |
| 摘要 | 核心内容概览 |
| 翻译 | 按顺序保存的译文章节 |

\`\`\`ts
await saveCheckpoint();
await resumeFromCheckpoint();
\`\`\`

这是固定的 Web Demo 材料，并非链接文章的全文副本。`;

export function getClippingWebDemoArticle(state: WebDemoState): ClippingArticle {
  const processing = state.scene === "clipping-processing";
  const failed = state.scene === "clipping-translation-failure";
  const previous = state.scene === "clipping-previous-version";
  const long = state.scene === "clipping-long-article" || state.data === "dense";
  const empty = state.data === "empty";
  return {
    title: "Pi Durable：可恢复的 Agent 工作流",
    content: empty ? notes : `${notes}\n\n---\n\n${summary}`,
    source: empty
      ? null
      : long
        ? `${source}\n\n${Array.from({ length: 18 }, (_, i) => `## Section ${i + 1}\n\nSaved progress keeps the article available while the discussion scrolls independently. Each section belongs to this deterministic capture.`).join("\n\n")}\n\n| First section | Second section | Third section | Fourth section | Fifth section |\n| --- | --- | --- | --- | --- |\n| Capture checkpoint | Saved conversation | Article translation | Ordered Markdown | Independent reading |\n\n\`\`\`ts\nconst example = "${"long-code-".repeat(30)}";\n\`\`\``
        : source,
    translation: empty
      ? null
      : processing || failed
        ? translation.split("## 阅读与讨论")[0]
        : long
          ? `${translation}\n\n${Array.from({ length: 18 }, (_, i) => `## 第 ${i + 1} 节\n\n保存的进度让文章持续可读，对话可以独立滚动。这些章节属于同一份固定的演示材料。`).join("\n\n")}`
          : translation,
    canDiscuss: state.persona === "admin" && !empty,
    processorEnabled: true,
    reading: {
      targetUrl,
      sourceUrl: targetUrl,
      versionId: previous ? previousVersion : currentVersion,
      status: empty
        ? "queued"
        : failed || previous
          ? "failed"
          : processing
            ? "processing"
            : "completed",
      summaryState: empty ? "pending" : "completed",
      translationState: empty
        ? "pending"
        : failed || previous
          ? "failed"
          : processing
            ? "processing"
            : "completed",
      sourceTranslationState: empty ? "pending" : processing || failed ? "processing" : "completed",
      translatedSegments: processing || failed ? 1 : empty ? 0 : 3,
      segmentCount: 3,
      usingPreviousVersion: previous,
      error: failed
        ? "模拟模型连接中断；已保存的原文、摘要和部分译文仍可阅读。"
        : previous
          ? "模拟本次处理失败，保留先前的成功版本。"
          : null,
      warning: null,
    },
  };
}

export function getClippingWebDemoMemo(): PublicMemoRecord {
  const article = getClippingWebDemoArticle({
    scene: "clipping-ready",
    persona: "guest",
    network: "healthy",
    data: "fixture",
  });
  return {
    id: WEB_DEMO_CLIPPING_SLUG,
    slug: WEB_DEMO_CLIPPING_SLUG,
    title: article.title ?? null,
    excerpt: "持久执行如何保存进度，并在中断后继续文章处理与对话。",
    content: article.content ?? "",
    clipping: article.reading,
    tags: ["剪藏", "Agent", "Web Demo"],
    inlineTags: [],
    isPublic: true,
    createdAt: new Date(fixtureTime).toISOString(),
    publishedAt: null,
    updatedAt: null,
    dataSource: "web-demo",
    filePath: "demo/memos/1181.md",
    image: null,
    media: { primary: null, cover: null, content: [], attachments: [] },
  };
}

/** A closed in-memory implementation of the production clipping transport. Never falls back to fetch/SSE. */
export function createClippingWebDemoModel(
  initialState: WebDemoState,
  onMutation: (label: string, detail: string) => void = () => undefined
) {
  let state = { ...initialState };
  let article = getClippingWebDemoArticle(state);
  let sequence = 0;
  let processingStep = 0;
  const requests = new Set<string>();
  const listeners = new Set<(snapshot: ClippingChat) => void>();
  const initialChat: ClippingChat = {
    messages: [
      { id: "demo-user-1", role: "user", text: "持久执行解决了什么问题？", timestamp: fixtureTime },
      {
        id: "demo-assistant-1",
        role: "assistant",
        text: "依据 [原文段落 1]，已提交的进度可在中断后恢复。推断：这可以减少重新处理文章时的重复工作。\n\n这是本地模拟回答。",
        timestamp: fixtureTime + 1,
      },
    ],
    generating: false,
    partial: "",
    conversationId: "demo-article-conversation",
  };
  let chat = structuredClone(initialChat);
  const snapshot = () => structuredClone(chat);
  const permitted = () => {
    if (state.persona !== "admin") throw new Error("模拟访客没有对话或重新处理权限。");
  };
  const publish = () => {
    if (state.persona === "admin") for (const listener of listeners) listener(snapshot());
  };
  const transport: ClippingTransport = {
    async request<T>(operation: string, body?: unknown): Promise<T> {
      if (state.network === "offline")
        throw new Error("模拟网络故障：请求没有发送到真实服务。请选择正常网络后重试。");
      if (state.network === "slow") await new Promise((resolve) => setTimeout(resolve, 900));
      if (state.network === "offline") throw new Error("模拟网络连接已中断。");
      if (operation !== "" && operation !== "status") permitted();
      const input = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
      let result: unknown;
      if (operation === "" || operation === "status") {
        if (operation === "status" && processingStep) {
          processingStep += 1;
          if (processingStep >= 3) {
            article = getClippingWebDemoArticle({ ...state, scene: "clipping-ready" });
            processingStep = 0;
          } else article.reading.translatedSegments = 2;
        }
        result = { ...article, canDiscuss: state.persona === "admin" && Boolean(article.source) };
      } else if (operation === "chat") {
        if (!article.source) throw new Error("模拟文章尚未抓取，暂时不能讨论。");
        if (body !== undefined && typeof input.text === "string") {
          const requestId = String(input.requestId ?? `demo-request-${++sequence}`);
          if (!requests.has(requestId)) {
            requests.add(requestId);
            chat.messages.push({
              id: `demo-user-${++sequence}`,
              role: "user",
              text: input.text,
              timestamp: fixtureTime + sequence,
            });
            chat.messages.push({
              id: `demo-assistant-${++sequence}`,
              role: "assistant",
              text: "依据 [原文段落 1]，文章强调保存已提交的检查点；[原文段落 2] 描述阅读版本与私有对话的边界。推断：恢复时应沿用同一份来源材料。\n\n这是内存模拟回答，未调用模型。",
              timestamp: fixtureTime + sequence,
            });
            onMutation("模拟文章对话", "消息及模拟回答仅保存在当前页面内存中。");
            publish();
          }
        }
        result = snapshot();
      } else if (operation === "reprocess") {
        article = getClippingWebDemoArticle({ ...state, scene: "clipping-processing" });
        processingStep = 1;
        onMutation("模拟重新处理", "只更新内存进度，未抓取网页或调用模型。");
        result = { ok: true };
      } else throw new Error(`不支持的模拟操作：${operation}`);
      return structuredClone(result) as T;
    },
    subscribe(onSnapshot) {
      permitted();
      listeners.add(onSnapshot);
      onSnapshot(snapshot());
      return () => {
        listeners.delete(onSnapshot);
      };
    },
  };
  return {
    transport,
    getArticle: () =>
      structuredClone({
        ...article,
        canDiscuss: state.persona === "admin" && Boolean(article.source),
      }),
    setState(next: WebDemoState) {
      if (next.scene !== state.scene || next.data !== state.data) {
        article = getClippingWebDemoArticle(next);
        processingStep = 0;
      }
      state = { ...next };
    },
    simulateSave() {
      article.content = `${notes}\n\n模拟保存：新增的备注仅存在于当前演示内存。${article.source ? `\n\n---\n\n${summary}` : ""}`;
    },
    reset(next: WebDemoState) {
      state = { ...next };
      article = getClippingWebDemoArticle(next);
      processingStep = 0;
      requests.clear();
      sequence = 0;
      chat = structuredClone(initialChat);
    },
  };
}
