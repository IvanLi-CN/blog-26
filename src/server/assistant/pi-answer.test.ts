import { Database } from "bun:sqlite";
import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { createAssistantStorage } from "@/lib/assistant-storage";
import { db, initializeDB } from "@/lib/db";
import { aiUsageRecords, frontendUsers } from "@/lib/schema";
import { generatePiAnswer } from "./pi-answer";

let root: string;
const oldDb = process.env.DB_PATH;
beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "assistant-pi-"));
  process.env.DB_PATH = join(root, "app.sqlite");
  const sqlite = new Database(process.env.DB_PATH);
  migrate(drizzle(sqlite), { migrationsFolder: "drizzle" });
  sqlite.close();
  await initializeDB(true);
  await db.insert(frontendUsers).values({
    id: "pi-reader",
    isAdmin: false,
    displayName: "Reader",
    avatarUrl: "",
    createdAt: 1,
    updatedAt: 1,
  });
});
afterAll(async () => {
  if (oldDb === undefined) delete process.env.DB_PATH;
  else process.env.DB_PATH = oldDb;
  await initializeDB(true);
  await rm(root, { recursive: true, force: true });
});

function sse(delta: unknown, finish = "stop") {
  return new Response(
    `${[
      { id: "fixture-response", choices: [{ index: 0, delta, finish_reason: null }] },
      {
        id: "fixture-response",
        choices: [{ index: 0, delta: {}, finish_reason: finish }],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      },
    ]
      .map((item) => `data: ${JSON.stringify(item)}\n\n`)
      .join("")}data: [DONE]\n\n`,
    { headers: { "content-type": "text/event-stream" } }
  );
}
function call(name: string, query: string, id = "tool-1") {
  return sse(
    {
      role: "assistant",
      tool_calls: [
        {
          index: 0,
          id,
          type: "function",
          function: { name, arguments: JSON.stringify({ query }) },
        },
      ],
    },
    "tool_calls"
  );
}
async function execution(question: string) {
  const storage = createAssistantStorage();
  const owner = crypto.randomUUID();
  await db.insert(frontendUsers).values({
    id: owner,
    isAdmin: false,
    displayName: "Reader",
    avatarUrl: "",
    createdAt: 1,
    updatedAt: 1,
  });
  const submission = await storage.submitTurn({
    frontendUserId: owner,
    requestId: crypto.randomUUID(),
    content: question,
    now: Date.now(),
  });
  const result = await storage.claimNextGenerationJob(Date.now(), 60_000);
  if (!result || result.job.id !== submission.generationJob.id)
    throw new Error("fixture job missing");
  return result;
}
function modelConfig(port: number | undefined) {
  const chat = {
    baseUrl: `http://127.0.0.1:${port}/v1`,
    apiKey: "fixture-key",
    model: "fixture-model",
    apiKeyAvailable: true,
    sources: {
      baseUrl: "env" as const,
      apiKey: "env" as const,
      model: "env" as const,
    },
  };
  return async () => ({ chat, embedding: chat, rerank: chat });
}
const webConfig = () => ({
  baseUrl: "https://search.example/api/tavily",
  token: "fixture-token",
  maxSearches: 12,
  timeoutMs: 1000,
});

test("Pi continues through site search and more than two web searches, preserving history, citations and usage", async () => {
  const seen: Array<Record<string, any>> = [];
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      const body = await request.json();
      seen.push(body);
      const step = seen.length;
      if (step === 1) return call("site_search", "站内项目");
      if (step <= 5) return call("web_search", `public query ${step}`, `tool-${step}`);
      return sse({ role: "assistant", content: "综合回答 [1] [2]。" });
    },
  });
  const job = await execution("站内项目与最新公开资料有什么联系？");
  job.messages.unshift({ ...job.userMessage, id: "prior-user", content: "请用中文", sequence: 0 });
  const queries: string[] = [];
  const deltas: string[] = [];
  try {
    const result = await generatePiAnswer(
      {
        execution: job,
        isAdmin: false,
        signal: new AbortController().signal,
        onDelta: async (text) => {
          deltas.push(text);
          return true;
        },
      },
      null,
      {
        resolveModel: modelConfig(server.port),
        webConfig,
        retrieve: async (_query, context) => {
          expect(context?.publishedOnly).toBe(true);
          return {
            results: [
              {
                source: "blog",
                slug: "project",
                title: "站内项目",
                snippet: "本站资料",
                href: "/posts/project",
              },
            ],
          } as any;
        },
        search: async (query) => {
          queries.push(query);
          return [
            {
              url: `https://example.com/${queries.length}`,
              title: "公开来源",
              content: "外部材料",
            },
          ];
        },
      }
    );
    expect(queries).toHaveLength(4);
    expect(seen).toHaveLength(6);
    expect(
      seen[0].messages.some((item: any) => item.role === "user" && item.content === "请用中文")
    ).toBe(true);
    expect(seen.at(-1)?.messages.filter((item: any) => item.role === "tool")).toHaveLength(5);
    expect(result.content).toBe("综合回答 [1] [2]。");
    expect(result.citations.map((item) => item.source)).toEqual([
      "blog",
      "web",
      "web",
      "web",
      "web",
    ]);
    expect(deltas.at(-1)).toBe(result.content);
    const usage = await db.select().from(aiUsageRecords);
    expect(
      usage.filter(
        (item) => item.generationJobId === job.job.id && item.feature === "assistant-answer"
      )
    ).toHaveLength(6);
    expect(
      usage.filter(
        (item) =>
          item.generationJobId === job.job.id &&
          JSON.parse(item.rawUsage ?? "{}").quota?.chargeQuestion
      )
    ).toHaveLength(1);
  } finally {
    server.stop(true);
  }
}, 20_000);

test("general knowledge answers without forced retrieval or network access", async () => {
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: () => sse({ role: "assistant", content: "SQLite 是嵌入式数据库。" }),
  });
  try {
    const result = await generatePiAnswer(
      {
        execution: await execution("什么是 SQLite？"),
        isAdmin: false,
        signal: new AbortController().signal,
        onDelta: async () => true,
      },
      null,
      {
        resolveModel: modelConfig(server.port),
        webConfig,
        retrieve: async () => {
          throw new Error("must not retrieve");
        },
        search: async () => {
          throw new Error("must not search");
        },
      }
    );
    expect(result.content).toContain("SQLite");
    expect(result.citations).toEqual([]);
  } finally {
    server.stop(true);
  }
});

test("a site search miss and web failure do not prevent Pi from answering reliable parts", async () => {
  let requests = 0;
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      const body = await request.json();
      requests++;
      if (requests === 1) return call("site_search", "无命中");
      if (requests === 2) return call("web_search", "公开问题");
      expect(
        body.messages.some(
          (item: any) => item.role === "tool" && item.content.includes("Web search failed")
        )
      ).toBe(true);
      return sse({ role: "assistant", content: "搜索暂不可用。根据通用知识回答可靠部分。" });
    },
  });
  try {
    const result = await generatePiAnswer(
      {
        execution: await execution("站外问题"),
        isAdmin: false,
        signal: new AbortController().signal,
        onDelta: async () => true,
      },
      null,
      {
        resolveModel: modelConfig(server.port),
        webConfig,
        retrieve: async () => ({ results: [] }) as any,
        search: async () => {
          throw new Error("secret upstream response");
        },
      }
    );
    expect(result.content).toContain("可靠部分");
    expect(result.citations).toEqual([]);
    expect(requests).toBe(3);
  } finally {
    server.stop(true);
  }
});

test("private retrieval cannot be exported through model-generated web queries", async () => {
  let requests = 0;
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch() {
      requests++;
      if (requests === 1) return call("site_search", "私有记录");
      if (requests === 2) return call("web_search", "PRIVATE-CONTENT-DO-NOT-EXPORT");
      return sse({ role: "assistant", content: "回答。" });
    },
  });
  const question = "公开主题对比";
  try {
    await generatePiAnswer(
      {
        execution: await execution(question),
        isAdmin: true,
        signal: new AbortController().signal,
        onDelta: async () => true,
      },
      null,
      {
        resolveModel: modelConfig(server.port),
        webConfig,
        retrieve: async (_query, context) => {
          expect(context?.publishedOnly).toBe(false);
          return {
            results: [
              { slug: "private", title: "Private", snippet: "PRIVATE-CONTENT-DO-NOT-EXPORT" },
            ],
          } as any;
        },
        search: async (query) => {
          expect(query).toBe(question);
          return [];
        },
      }
    );
    expect(requests).toBe(3);
  } finally {
    server.stop(true);
  }
});

test("ordinary reader history cannot be exported through model-generated web queries", async () => {
  const question = "公开主题的最新资料";
  const secret = "PRIVATE-HISTORY-DO-NOT-EXPORT";
  const job = await execution(question);
  job.messages.unshift({ ...job.userMessage, id: "prior-private-user", content: secret });
  let requests = 0;
  const queries: string[] = [];
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      const body = await request.json();
      requests++;
      if (requests === 1) {
        expect(body.messages.some((item: any) => item.content === secret)).toBe(true);
        return call("web_search", `最新资料 ${secret}`);
      }
      return sse({ role: "assistant", content: "回答。" });
    },
  });
  try {
    await generatePiAnswer(
      {
        execution: job,
        isAdmin: false,
        signal: new AbortController().signal,
        onDelta: async () => true,
      },
      null,
      {
        resolveModel: modelConfig(server.port),
        webConfig,
        search: async (query) => {
          queries.push(query);
          return [];
        },
      }
    );
    expect(queries).toEqual([question]);
    expect(requests).toBe(2);
  } finally {
    server.stop(true);
  }
});

test("clipping conversations use Pi with the article instructions and no general search tools", async () => {
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      const body = await request.json();
      expect(body.tools).toBeUndefined();
      expect(
        body.messages.some((item: any) => item.content?.includes("Saved article evidence"))
      ).toBe(true);
      return sse({ role: "assistant", content: "当前文章的回答。" });
    },
  });
  try {
    const result = await generatePiAnswer(
      {
        execution: await execution("解释当前文章"),
        isAdmin: false,
        signal: new AbortController().signal,
        onDelta: async () => true,
      },
      { systemPrompt: "只阅读当前文章，不联网。", evidence: "Saved article evidence" },
      { resolveModel: modelConfig(server.port), webConfig }
    );
    expect(result.content).toBe("当前文章的回答。");
  } finally {
    server.stop(true);
  }
});

test("Pi calls the Hikari HTTP search endpoint with bearer auth and meters a search separately", async () => {
  let modelCalls = 0;
  let searchCalls = 0;
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      if (new URL(request.url).pathname === "/api/tavily/search") {
        searchCalls++;
        expect(request.headers.get("authorization")).toBe("Bearer fixture-token");
        const body = await request.json();
        expect(body.query).toBe("latest public facts");
        expect(body.max_results).toBe(6);
        expect(body.include_answer).toBe(false);
        return Response.json({
          results: [
            { title: "Valid", url: "https://example.com/facts", content: "Latest facts" },
            { title: "Unsafe", url: "javascript:alert(1)", content: "ignore" },
          ],
        });
      }
      modelCalls++;
      return modelCalls === 1
        ? call("web_search", "latest public facts")
        : sse({ role: "assistant", content: "最新资料 [1]。" });
    },
  });
  const job = await execution("请联网查最新资料");
  try {
    const result = await generatePiAnswer(
      {
        execution: job,
        isAdmin: false,
        signal: new AbortController().signal,
        onDelta: async () => true,
      },
      null,
      {
        resolveModel: modelConfig(server.port),
        webConfig: () => ({
          ...webConfig(),
          baseUrl: `http://127.0.0.1:${server.port}/api/tavily`,
        }),
      }
    );
    expect(searchCalls).toBe(1);
    expect(result.citations).toHaveLength(1);
    expect(result.citations[0]).toMatchObject({ source: "web", href: "https://example.com/facts" });
    const records = (await db.select().from(aiUsageRecords)).filter(
      (item) => item.generationJobId === job.job.id
    );
    expect(records.filter((item) => item.feature === "assistant-answer")).toHaveLength(2);
    expect(records.filter((item) => item.feature === "assistant-web-search")).toHaveLength(1);
    const storage = createAssistantStorage();
    await storage.finishGeneration(job.job.id, job.job.attempt, {
      status: "completed",
      ...result,
      now: Date.now(),
    });
    const messages = await storage.listMessages(
      job.conversation.id,
      job.conversation.frontendUserId
    );
    expect(messages.at(-1)?.citations[0]).toMatchObject({
      source: "web",
      title: "Valid",
      href: "https://example.com/facts",
    });
  } finally {
    server.stop(true);
  }
});

test("the configured search budget stops network calls but lets Pi produce an answer", async () => {
  let requests = 0;
  let searches = 0;
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      const body = await request.json();
      requests++;
      if (requests <= 4) return call("web_search", `query ${requests}`, `tool-${requests}`);
      expect(
        body.messages.some(
          (item: any) => item.role === "tool" && item.content.includes("Search budget reached")
        )
      ).toBe(true);
      return sse({ role: "assistant", content: "依据已有资料作答。" });
    },
  });
  try {
    await generatePiAnswer(
      {
        execution: await execution("联网"),
        isAdmin: false,
        signal: new AbortController().signal,
        onDelta: async () => true,
      },
      null,
      {
        resolveModel: modelConfig(server.port),
        webConfig: () => ({ ...webConfig(), maxSearches: 3 }),
        search: async () => {
          searches++;
          return [];
        },
      }
    );
    expect(searches).toBe(3);
    expect(requests).toBe(5);
  } finally {
    server.stop(true);
  }
});

test("missing Tavily credentials are explicit to Pi without blocking general answers", async () => {
  let calls = 0;
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      const body = await request.json();
      if (++calls === 1) return call("web_search", "最新信息");
      expect(
        body.messages.some(
          (item: any) => item.role === "tool" && item.content.includes("not configured")
        )
      ).toBe(true);
      return sse({ role: "assistant", content: "联网未配置，以下是通用解释。" });
    },
  });
  try {
    const result = await generatePiAnswer(
      {
        execution: await execution("最新问题"),
        isAdmin: false,
        signal: new AbortController().signal,
        onDelta: async () => true,
      },
      null,
      {
        resolveModel: modelConfig(server.port),
        webConfig: () => ({ ...webConfig(), token: null }),
        search: async () => {
          throw new Error("must not call");
        },
      }
    );
    expect(result.content).toContain("未配置");
    expect(calls).toBe(2);
  } finally {
    server.stop(true);
  }
});

test("explicit cancellation aborts an in-flight tool and prevents another model request", async () => {
  let calls = 0;
  const controller = new AbortController();
  let started!: () => void;
  const searching = new Promise<void>((resolve) => {
    started = resolve;
  });
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch() {
      calls++;
      return call("web_search", "slow search");
    },
  });
  try {
    const answer = generatePiAnswer(
      {
        execution: await execution("联网"),
        isAdmin: false,
        signal: controller.signal,
        onDelta: async () => true,
      },
      null,
      {
        resolveModel: modelConfig(server.port),
        webConfig,
        search: async (_query, options) => {
          started();
          await new Promise((_, reject) =>
            options.signal.addEventListener("abort", () => reject(options.signal.reason), {
              once: true,
            })
          );
          return [];
        },
      }
    );
    await searching;
    controller.abort(new DOMException("User stopped", "AbortError"));
    await expect(answer).rejects.toThrow();
    expect(calls).toBe(1);
  } finally {
    server.stop(true);
  }
}, 10_000);

test("Pi rejects a truncated provider stream instead of committing partial output", async () => {
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch() {
      return new Response(
        'data: {"choices":[{"index":0,"delta":{"role":"assistant","content":"partial"},"finish_reason":null}]}\n\n',
        { headers: { "content-type": "text/event-stream" } }
      );
    },
  });
  try {
    await expect(
      generatePiAnswer(
        {
          execution: await execution("回答"),
          isAdmin: false,
          signal: new AbortController().signal,
          onDelta: async () => true,
        },
        null,
        { resolveModel: modelConfig(server.port), webConfig }
      )
    ).rejects.toThrow();
  } finally {
    server.stop(true);
  }
}, 10_000);

test("follow-up turns restore prior source evidence with stable per-turn citation numbers", async () => {
  const job = await execution("上一条结论的依据是什么？");
  const source = {
    id: "citation",
    messageId: "old-answer",
    createdAt: 1,
    source: "web" as const,
    sourceId: null,
    sourceType: "web",
    slug: null,
    title: "Prior source",
    href: "https://example.com/prior",
    location: null,
    snippet: "Prior evidence",
  };
  job.messages.unshift({
    ...job.userMessage,
    id: "old-answer",
    role: "assistant",
    content: "之前的结论 [1]。",
    citations: [source],
  });
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      const body = await request.json();
      expect(
        body.messages.some(
          (item: any) =>
            item.role === "assistant" &&
            item.content.includes("Prior evidence") &&
            item.content.includes("https://example.com/prior")
        )
      ).toBe(true);
      return sse({ role: "assistant", content: "依据是之前的来源 [1]。" });
    },
  });
  try {
    const result = await generatePiAnswer(
      {
        execution: job,
        isAdmin: false,
        signal: new AbortController().signal,
        onDelta: async () => true,
      },
      null,
      { resolveModel: modelConfig(server.port), webConfig }
    );
    expect(result.citations[0]).toMatchObject({ source: "web", href: source.href });
    expect(result.citations[0]).not.toHaveProperty("id");
    expect(result.citations[0]).not.toHaveProperty("messageId");
  } finally {
    server.stop(true);
  }
});
