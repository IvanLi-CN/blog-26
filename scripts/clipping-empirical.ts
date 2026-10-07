/** Private, opt-in acceptance runner. Keep its working directory outside the public content root. */
import { Database } from "bun:sqlite";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import matter from "gray-matter";
import { db, initializeDB } from "../src/lib/db";
import { posts } from "../src/lib/schema";
import { AgentRuntimeFacade } from "../src/server/clipping/agent-runtime";
import { fetchArticle } from "../src/server/clipping/extract";
import { ClippingService } from "../src/server/clipping/service";
import {
  attachClippingReference,
  ClippingStore,
  projectClippingMemo,
} from "../src/server/clipping/store";
import { getResolvedLlmConfig } from "../src/server/services/llm-settings";

const directory = process.env.CLIPPING_ACCEPTANCE_DIR;
if (!directory) throw new Error("Set CLIPPING_ACCEPTANCE_DIR to a private acceptance directory.");
const root = resolve(directory);
process.env.DB_PATH = join(root, "app.sqlite");
process.env.LOCAL_CONTENT_BASE_PATH = join(root, "authored");
process.env.CLIPPING_CONTENT_BASE_PATH = join(root, "materials");
process.env.PI_DURABLE_DB_PATH = join(root, "pi.sqlite");
await mkdir(join(root, "authored", "Memos"), { recursive: true });
const sqlite = new Database(process.env.DB_PATH);
migrate(drizzle(sqlite), { migrationsFolder: "drizzle" });
sqlite.close();
await initializeDB(true);
const target = "https://earendil.com/posts/pi-durable/";
const model = (await getResolvedLlmConfig()).chat;
if (process.argv.includes("--extract-only")) {
  const source = await fetchArticle(target);
  const evidence = {
    mode: "extraction",
    target,
    observedAt: new Date().toISOString(),
    sourceTitle: source.title,
    sourceCharacters: source.markdown.length,
    sourceHash: createHash("sha256").update(source.markdown).digest("hex"),
    warning: source.warning,
  };
  await writeFile(join(root, "extracted-source.md"), source.markdown, { mode: 0o600 });
  await writeFile(join(root, "extraction.json"), JSON.stringify(evidence, null, 2), {
    mode: 0o600,
  });
  console.log(JSON.stringify(evidence));
} else if (process.argv.includes("--probe")) {
  const source = await fetchArticle(target);
  const runtime = await AgentRuntimeFacade.open({
    path: join(root, "probe-pi.sqlite"),
    resolveModel: async () => model,
  });
  try {
    const conversation = await runtime.createConversation("请使用简体中文忠实总结提供的段落。");
    const submission = await runtime.submit(
      conversation,
      source.markdown.slice(0, 1200),
      "probe-v1"
    );
    const answer = await runtime.answer(conversation, submission);
    console.log(
      JSON.stringify({
        mode: "preflight",
        model: model.model,
        sourceCharacters: source.markdown.length,
        sourceTitle: source.title,
        warning: source.warning,
        answerCharacters: answer.length,
      })
    );
  } finally {
    await runtime.close();
  }
} else {
  const candidate = process.env.CANDIDATE_SHA;
  if (!candidate || !/^[a-f0-9]{40}$/.test(candidate))
    throw new Error("Set CANDIDATE_SHA to the reviewed implementation commit.");
  const id = "Memos/pi-durable.md";
  const path = join(root, "authored", id);
  if (!(await Bun.file(path).exists())) {
    const body = `${target}\n\n重点关注恢复与事务边界。\n\n#剪藏`;
    const frontmatter: Record<string, unknown> = { title: "", public: false, tags: ["剪藏"] };
    await attachClippingReference(body, frontmatter, "empirical-owner", id);
    await writeFile(path, matter.stringify(body, frontmatter));
    await db
      .insert(posts)
      .values({
        id,
        slug: "pi-durable",
        type: "memo",
        body,
        title: "",
        public: false,
        draft: false,
        publishDate: Date.now(),
        filePath: id,
        source: "local",
        dataSource: "local",
        tags: '["剪藏"]',
        metadata: JSON.stringify(frontmatter),
        contentHash: createHash("sha256").update(body).digest("hex"),
      })
      .onConflictDoNothing();
  }
  const service = await ClippingService.open();
  try {
    await service.idle();
    const store = new ClippingStore();
    const projection = await projectClippingMemo(id, store, true);
    if (projection?.reading.status !== "completed")
      throw new Error(
        `Actual clipping did not complete: ${projection?.reading.error ?? "unavailable"}`
      );
    const conversationId = await service.ensureConversation(id);
    await service.chat(
      id,
      "文章如何处理模型调用期间进程崩溃？请定位原文段落，并区分文章事实与推断。",
      "empirical-question-v1"
    );
    let snapshot = await service.chatSnapshot(conversationId);
    const deadline = Date.now() + 120_000;
    while (
      (snapshot.generating || !snapshot.messages.some((message) => message.role === "assistant")) &&
      Date.now() < deadline
    ) {
      await Bun.sleep(500);
      snapshot = await service.chatSnapshot(conversationId);
    }
    if (!snapshot.messages.some((message) => message.role === "assistant") || snapshot.error)
      throw new Error("Actual article conversation did not complete.");
    const version = projection.manifest?.versions.find(
      (entry) => entry.id === projection.reading.versionId
    );
    const evidence = {
      candidateSha: candidate,
      scenario:
        "Pi Durable article, actual configured provider, persisted translation and cited conversation",
      observedAt: new Date().toISOString(),
      model: model.model,
      sourceTitle: projection.title,
      sourceHash: createHash("sha256")
        .update(projection.source ?? "")
        .digest("hex"),
      sourceCharacters: projection.source?.length,
      translationCharacters: projection.translation?.length,
      translatedSegments: version?.translatedSegments,
      segmentCount: version?.segmentCount,
      warning: projection.reading.warning,
      status: projection.reading.status,
      authoredHash: createHash("sha256")
        .update(await readFile(path))
        .digest("hex"),
      answer: snapshot.messages
        .filter((message) => message.role === "assistant")
        .map((message) => message.text),
    };
    await writeFile(join(root, "evidence.json"), JSON.stringify(evidence, null, 2));
    console.log(
      JSON.stringify({
        candidateSha: candidate,
        status: evidence.status,
        segmentCount: evidence.segmentCount,
        sourceCharacters: evidence.sourceCharacters,
        translationCharacters: evidence.translationCharacters,
        evidencePath: join(root, "evidence.json"),
      })
    );
  } finally {
    await service.close();
  }
}
