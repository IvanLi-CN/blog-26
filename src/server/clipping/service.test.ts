import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import matter from "gray-matter";
import { ClippingService } from "./service";
import { ClippingStore, projectClippingMemo } from "./store";

const priorContentPath = process.env.LOCAL_CONTENT_BASE_PATH;
afterEach(() => {
  if (priorContentPath === undefined) delete process.env.LOCAL_CONTENT_BASE_PATH;
  else process.env.LOCAL_CONTENT_BASE_PATH = priorContentPath;
});

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "clipping-service-"));
  const content = join(root, "authored");
  await mkdir(join(content, "Memos"), { recursive: true });
  process.env.LOCAL_CONTENT_BASE_PATH = content;
  const memoId = "Memos/article.md";
  const path = join(content, memoId);
  const authored = "https://article.example/one\n\n作者备注\n\n#剪藏";
  await writeFile(
    path,
    matter.stringify(authored, {
      public: false,
      tags: ["剪藏", "保留"],
      clipping: { id: "11111111-1111-4111-8111-111111111111", creatorId: "creator" },
    })
  );
  const store = new ClippingStore(join(root, "materials"));
  const source =
    "# Durable agents\n\nSaved progress survives a restart.\n\n## Recovery\n\nCommitted results remain available.\n\n```ts\nconst durable = true;\n```";
  const events: string[] = [];
  const modelFailures = { remaining: 0 };
  const server = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    async fetch(request) {
      const payload = await request.json();
      if (modelFailures.remaining-- > 0)
        return Response.json({ error: { message: "Temporary overload" } }, { status: 429 });
      const user = payload.messages.findLast((message: { role: string }) => message.role === "user")
        ?.content as string;
      const answer = user.includes("提取以下")
        ? "持久化与恢复要点。"
        : user.includes("生成简体中文文章摘要")
          ? "文章介绍持久执行，重启后恢复已保存的进度。"
          : user.includes("全文翻译任务")
            ? user.split("<article>\n")[1].split("\n</article>")[0]
            : "依据 [原文段落 2]，重启后进度可恢复；这是文章观点。";
      const data = [
        {
          choices: [
            { index: 0, delta: { role: "assistant", content: answer }, finish_reason: null },
          ],
        },
        { choices: [{ index: 0, delta: {}, finish_reason: "stop" }] },
      ];
      return new Response(
        `${data.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`).join("")}data: [DONE]\n\n`,
        { headers: { "content-type": "text/event-stream" } }
      );
    },
  });
  let captures = 0;
  const options = {
    store,
    runtimePath: join(root, "pi.sqlite"),
    resolveModel: async () => ({
      model: "fixture",
      baseUrl: `http://127.0.0.1:${server.port}/v1`,
      apiKey: "fixture-only",
    }),
    memoIds: async () => [memoId],
    index: async (
      _manifest: unknown,
      projection: Awaited<ReturnType<typeof projectClippingMemo>>
    ) => {
      if (projection)
        events.push(`${projection.reading.summaryState}:${projection.reading.translationState}`);
    },
    capture: async (target: string) => {
      captures++;
      return { markdown: source, title: "Durable agents", url: target, warning: null };
    },
    scanIntervalMs: 60_000,
  };
  return {
    root,
    path,
    memoId,
    store,
    source,
    authored,
    options,
    events,
    modelFailures,
    captures: () => captures,
    cleanup: async () => {
      server.stop(true);
      await rm(root, { recursive: true, force: true });
    },
  };
}

describe("clipping lifecycle and canonical content", () => {
  test("retries transient model errors without duplicating the visible summary", async () => {
    const data = await fixture();
    data.modelFailures.remaining = 1;
    const service = await ClippingService.open(data.options);
    try {
      await service.idle();
      const projection = await projectClippingMemo(data.memoId, data.store);
      expect(projection?.reading.status).toBe("completed");
      expect(data.modelFailures.remaining).toBeLessThan(0);
      expect(projection?.content.match(/Agent 摘要/g)).toHaveLength(1);
    } finally {
      await service.close();
      await data.cleanup();
    }
  });

  test("a late capture cannot publish into a replacement target", async () => {
    const data = await fixture();
    let release: (() => void) | undefined;
    let started: (() => void) | undefined;
    const captured = new Promise<void>((resolve) => {
      started = resolve;
    });
    const stalled = new Promise<void>((resolve) => {
      release = resolve;
    });
    const service = await ClippingService.open({
      ...data.options,
      capture: async (target) => {
        if (target.endsWith("/one")) {
          started?.();
          await stalled;
        }
        return data.options.capture(target);
      },
    });
    try {
      await captured;
      const before = await projectClippingMemo(data.memoId, data.store);
      const oldVersion = before?.manifest?.activeVersionId;
      const parsed = matter(await readFile(data.path, "utf8"));
      await writeFile(
        data.path,
        matter.stringify(parsed.content.replace("/one", "/two"), parsed.data)
      );
      await service.reconcile(data.memoId);
      release?.();
      await service.idle();
      await service.scan();
      await service.idle();
      const after = await projectClippingMemo(data.memoId, data.store);
      expect(after?.reading.sourceUrl).toBe("https://article.example/two");
      if (before && oldVersion)
        expect(await data.store.read(before.id, oldVersion, "summary")).toBeNull();
      expect(after?.manifest?.versions).toHaveLength(2);
    } finally {
      release?.();
      await service.close();
      await data.cleanup();
    }
  });

  test("commits summary before translation, preserves authored input and resumes without duplicates", async () => {
    const data = await fixture();
    let service: ClippingService | undefined;
    try {
      const raw = await readFile(data.path, "utf8");
      service = await ClippingService.open(data.options);
      await service.idle();
      const projection = await projectClippingMemo(data.memoId, data.store, true);
      if (!projection) throw new Error("Missing clipping fixture projection");
      expect(projection?.content).toBe(
        "作者备注\n\n---\n\n**Agent 摘要**\n\n文章介绍持久执行，重启后恢复已保存的进度。"
      );
      expect(projection?.title).toBe("Durable agents");
      expect(projection?.reading.status).toBe("completed");
      expect(projection?.translation).toContain("const durable = true;");
      expect(await readFile(data.path, "utf8")).toBe(raw);
      expect(data.events.indexOf("completed:pending")).toBeLessThan(
        data.events.indexOf("completed:completed")
      );
      const conversation = await service.ensureConversation(data.memoId);
      await service.close();
      service = await ClippingService.open(data.options);
      await service.idle();
      expect(await service.ensureConversation(data.memoId)).toBe(conversation);
      expect(data.captures()).toBe(1);
      expect((await data.store.manifest(projection.id))?.versions).toHaveLength(1);
      const parsed = matter(await readFile(data.path, "utf8"));
      parsed.content = parsed.content.replace("作者备注", "编辑后的备注");
      await writeFile(data.path, matter.stringify(parsed.content, parsed.data));
      await service.reconcile(data.memoId);
      await service.idle();
      expect((await projectClippingMemo(data.memoId, data.store))?.content).toStartWith(
        "编辑后的备注\n\n---"
      );
      expect(data.captures()).toBe(1);
    } finally {
      await service?.close();
      await data.cleanup();
    }
  });

  test("invalid configuration leaves a recoverable error and old successful material survives failed reprocessing", async () => {
    const data = await fixture();
    let service: ClippingService | undefined;
    try {
      service = await ClippingService.open(data.options);
      await service.idle();
      const before = await projectClippingMemo(data.memoId, data.store);
      await service.close();
      service = await ClippingService.open({
        ...data.options,
        resolveModel: async () => ({ model: null, baseUrl: null, apiKey: null }),
      });
      await service.reconcile(data.memoId, true);
      await service.idle();
      const after = await projectClippingMemo(data.memoId, data.store, true);
      expect(after?.reading.status).toBe("failed");
      expect(after?.reading.error).toContain("LLM");
      expect(after?.reading.usingPreviousVersion).toBe(true);
      expect(after?.content).toBe(before?.content);
      expect(after?.reading.versionId).toBe(before?.reading.versionId);
      expect(matter(await readFile(data.path, "utf8")).content.trim()).toBe(data.authored);
    } finally {
      await service?.close();
      await data.cleanup();
    }
  });

  test("replacing the target separates conversations; removing a tag and deleting stop stale publication", async () => {
    const data = await fixture();
    let service: ClippingService | undefined;
    try {
      service = await ClippingService.open(data.options);
      await service.idle();
      const first = await service.ensureConversation(data.memoId);
      const parsed = matter(await readFile(data.path, "utf8"));
      parsed.content = parsed.content.replace("/one", "/two");
      await writeFile(data.path, matter.stringify(parsed.content, parsed.data));
      await service.reconcile(data.memoId);
      await service.idle();
      expect(await service.ensureConversation(data.memoId)).not.toBe(first);
      const projection = await projectClippingMemo(data.memoId, data.store);
      if (!projection) throw new Error("Missing clipping fixture projection");
      expect(projection?.manifest?.previousConversations[0].conversationId).toBe(first);
      parsed.content = parsed.content.replace("#剪藏", "");
      parsed.data.tags = ["保留"];
      await writeFile(data.path, matter.stringify(parsed.content, parsed.data));
      await service.reconcile(data.memoId);
      await service.idle();
      expect(await projectClippingMemo(data.memoId, data.store)).toBeNull();
      expect((await data.store.manifest(projection.id))?.enabled).toBe(false);
      await rm(data.path);
      await service.reconcile(data.memoId);
      expect((await data.store.manifest(projection.id))?.deleted).toBe(true);
    } finally {
      await service?.close();
      await data.cleanup();
    }
  });
});
