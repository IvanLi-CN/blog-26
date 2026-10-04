import { Database } from "bun:sqlite";
import { expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import matter from "gray-matter";
import { ClippingStore } from "./store";

test("SIGKILL during translation resumes committed segments without repeating summary or capture", async () => {
  const root = await mkdtemp(join(tmpdir(), "clipping-process-recovery-"));
  const id = "11111111-1111-4111-8111-111111111111";
  await mkdir(join(root, "authored", "Memos"), { recursive: true });
  const body = "https://article.example/one\n\n备注\n\n#剪藏";
  await writeFile(
    join(root, "authored", "Memos/article.md"),
    matter.stringify(body, { clipping: { id }, tags: ["剪藏"] })
  );
  await writeFile(
    join(root, "source.md"),
    `# One\n\n${"Recovery survives a committed checkpoint. ".repeat(220)}\n\n## Two\n\n${"All translated segments retain their order. ".repeat(220)}`
  );
  let translationCalls = 0;
  let summaryCalls = 0;
  let interrupted = false;
  let announce: (() => void) | undefined;
  let release: (() => void) | undefined;
  const reached = new Promise<void>((resolve) => {
    announce = resolve;
  });
  const stalled = new Promise<void>((resolve) => {
    release = resolve;
  });
  const server = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    async fetch(request) {
      const payload = await request.json();
      const text = String(
        payload.messages.findLast((m: { role: string }) => m.role === "user")?.content
      );
      let answer = "章节要点。";
      if (text.includes("生成简体中文文章摘要")) {
        summaryCalls++;
        answer = "恢复摘要。";
      }
      if (text.includes("全文翻译任务")) {
        translationCalls++;
        if (translationCalls === 2 && !interrupted) {
          announce?.();
          await stalled;
        }
        answer = text.split("<article>\n")[1].split("\n</article>")[0];
      }
      return new Response(
        `data: ${JSON.stringify({ choices: [{ index: 0, delta: { role: "assistant", content: answer }, finish_reason: null }] })}\n\ndata: ${JSON.stringify({ choices: [{ index: 0, delta: {}, finish_reason: "stop" }] })}\n\ndata: [DONE]\n\n`,
        { headers: { "content-type": "text/event-stream" } }
      );
    },
  });
  const launch = () =>
    Bun.spawn(
      [
        process.execPath,
        join(import.meta.dir, "service-interruption.fixture.ts"),
        root,
        `http://127.0.0.1:${server.port}/v1`,
      ],
      { stdout: "pipe", stderr: "pipe" }
    );
  let child = launch();
  try {
    await Promise.race([
      reached,
      child.exited.then(async (code) => {
        throw new Error(
          `Child exited before interruption: ${code} ${await new Response(child.stderr).text()}`
        );
      }),
    ]);
    const store = new ClippingStore(join(root, "materials"));
    const before = await store.manifest(id);
    const version = before?.versions[0];
    expect(version?.translatedSegments).toBe(1);
    expect(version?.summaryState).toBe("completed");
    child.kill("SIGKILL");
    await child.exited;
    interrupted = true;
    const sqlite = new Database(join(root, "pi.sqlite"), { readonly: true });
    const lease = sqlite
      .query<{ expires: number }, []>(
        "SELECT expires FROM clipping_runtime_owner WHERE singleton=1"
      )
      .get();
    sqlite.close();
    // Observe the real production lease rather than modifying its timestamp for the test.
    await Bun.sleep(Math.max(0, (lease?.expires ?? 0) - Date.now()) + 50);
    child = launch();
    expect(await child.exited).toBe(0);
    const after = await store.manifest(id);
    expect(after?.versions[0].status).toBe("completed");
    expect(after?.versions[0].translatedSegments).toBe(after?.versions[0].segmentCount);
    expect(summaryCalls).toBe(1);
    expect((await readFile(join(root, "captures.txt"), "utf8")).trim().split("\n")).toHaveLength(1);
    if (!version) throw new Error("Missing saved version");
    expect(await store.read(id, version.id, "summary")).toBe("恢复摘要。");
    expect(await store.read(id, version.id, 0)).toBeTruthy();
  } finally {
    release?.();
    child.kill();
    await child.exited;
    server.stop(true);
    await rm(root, { recursive: true, force: true });
  }
}, 60_000);
