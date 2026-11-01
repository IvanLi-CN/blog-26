import { Database } from "bun:sqlite";
import { afterAll, beforeAll, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import matter from "gray-matter";
import { createAssistantStorage } from "@/lib/assistant-storage";
import { db, initializeDB } from "@/lib/db";
import { frontendUsers } from "@/lib/schema";
import { createAssistantRuntimeForTest } from "@/server/assistant/runtime";
import { createAssistantServiceForTest } from "@/server/assistant/service";
import { ClippingService } from "./service";
import { ClippingStore, clippingManifestSchema } from "./store";

const previousDbPath = process.env.DB_PATH;
let root: string;
const memoId = "Memos/unified-chat.md";
const clippingId = "11111111-1111-4111-8111-111111111111";
const principal = {
  id: "frontend-unified-chat-user",
  kind: "reader" as const,
  isAdmin: false,
  displayName: "Unified Chat User",
  email: "unified@example.com",
  avatarUrl: "/site-assets/default-avatar.svg",
  profileUrl: null,
  adminUserId: null,
  readerId: null,
  github: null,
};

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "clipping-assistant-adapter-"));
  process.env.DB_PATH = join(root, "app.sqlite");
  const sqlite = new Database(process.env.DB_PATH);
  migrate(drizzle(sqlite), { migrationsFolder: "drizzle" });
  sqlite.close();
  await initializeDB(true);
  await db.insert(frontendUsers).values({
    id: principal.id,
    adminUserId: null,
    isAdmin: false,
    displayName: principal.displayName,
    email: principal.email,
    avatarUrl: principal.avatarUrl,
    profileUrl: null,
    createdAt: 1,
    updatedAt: 1,
  });
});

afterAll(async () => {
  if (previousDbPath === undefined) delete process.env.DB_PATH;
  else process.env.DB_PATH = previousDbPath;
  await rm(root, { recursive: true, force: true });
});

test("uses per-user unified conversations across same-target versions and separates targets", async () => {
  const contentRoot = join(root, "authored");
  const store = new ClippingStore(join(root, "materials"));
  await mkdir(join(contentRoot, "Memos"), { recursive: true });
  process.env.LOCAL_CONTENT_BASE_PATH = contentRoot;
  await writeFile(
    join(contentRoot, memoId),
    matter.stringify("https://article.example/one\n\nAuthor remarks\n\n#剪藏", {
      public: true,
      tags: ["剪藏"],
      clipping: { id: clippingId, creatorId: "legacy-creator" },
    })
  );
  const source = "# Saved source\n\nThe first target has durable context.";
  const sourceHash = createHash("sha256").update(source).digest("hex");
  await store.save(
    clippingManifestSchema.parse({
      schemaVersion: 1,
      id: clippingId,
      memoId,
      creatorId: "legacy-creator",
      revision: 1,
      enabled: true,
      deleted: false,
      targetUrl: "https://article.example/one",
      conversationId: null,
      previousConversations: [],
      currentVersionId: "22222222-2222-4222-8222-222222222222",
      activeVersionId: "22222222-2222-4222-8222-222222222222",
      versions: [
        {
          id: "22222222-2222-4222-8222-222222222222",
          revision: 1,
          targetUrl: "https://article.example/one",
          createdAt: 1,
          status: "completed",
          summaryState: "completed",
          translationState: "completed",
          sourceHash,
        },
      ],
    })
  );
  await store.write(clippingId, "22222222-2222-4222-8222-222222222222", "source", source);
  await store.write(
    clippingId,
    "22222222-2222-4222-8222-222222222222",
    "summary",
    "First target summary"
  );
  await store.write(
    clippingId,
    "22222222-2222-4222-8222-222222222222",
    "translation",
    "第一目标译文"
  );

  const assistantDatabase = new Database(":memory:");
  const assistantDb = drizzle(assistantDatabase);
  migrate(assistantDb, { migrationsFolder: "drizzle" });
  await assistantDb.insert(frontendUsers).values({
    id: principal.id,
    adminUserId: null,
    isAdmin: false,
    displayName: principal.displayName,
    email: principal.email,
    avatarUrl: principal.avatarUrl,
    profileUrl: null,
    createdAt: 1,
    updatedAt: 1,
  });
  const assistantStorage = createAssistantStorage(assistantDb);
  const assistantRuntime = createAssistantRuntimeForTest({
    storage: assistantStorage,
    pumpDelayMs: 0,
    generate: async ({ onDelta }) => {
      await onDelta("Unified answer");
      return { content: "Unified answer", citations: [] };
    },
  });
  const assistantService = createAssistantServiceForTest({
    storage: assistantStorage,
    runtime: assistantRuntime,
  });
  const service = await ClippingService.open({
    store,
    assistantService,
    runtimePath: join(root, "pi.sqlite"),
    memoIds: async () => [memoId],
    resolveModel: async () => ({ model: null, baseUrl: null, apiKey: null }),
    scanIntervalMs: 60_000,
    index: async () => undefined,
  });
  try {
    const migratedConversation = await assistantStorage.createConversation({
      frontendUserId: principal.id,
      kind: "clipping",
      title: "https://article.example/one",
      clippingMemoId: memoId,
      clippingVersionId: null,
      now: 0,
    });
    const first = await service.assistantChat(
      memoId,
      principal,
      "What does it preserve?",
      "chat-one"
    );
    expect(first.createdConversation).toBe(false);
    expect(first.conversationId).toBe(migratedConversation.id);
    let snapshot = await service.assistantSnapshot(memoId, principal);
    for (let attempt = 0; attempt < 100 && snapshot?.activeGenerationJob; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 2));
      snapshot = await service.assistantSnapshot(memoId, principal);
    }
    expect(snapshot?.conversation).toMatchObject({
      kind: "clipping",
      clippingMemoId: memoId,
      clippingVersionId: "22222222-2222-4222-8222-222222222222",
    });
    expect(snapshot?.messages.at(-1)?.content).toBe("Unified answer");

    const manifest = await store.manifest(clippingId);
    if (!manifest) throw new Error("Clipping manifest is missing");
    manifest.revision = 2;
    manifest.currentVersionId = "33333333-3333-4333-8333-333333333333";
    manifest.activeVersionId = "33333333-3333-4333-8333-333333333333";
    manifest.versions.push({
      id: "33333333-3333-4333-8333-333333333333",
      revision: 2,
      targetUrl: "https://article.example/one",
      createdAt: 2,
      status: "completed",
      summaryState: "completed",
      translationState: "completed",
      sourceHash,
    });
    await store.save(manifest);
    await store.write(clippingId, "33333333-3333-4333-8333-333333333333", "source", source);
    const sameTarget = await service.assistantSnapshot(memoId, principal);
    expect(sameTarget?.conversation.id).toBe(first.conversationId);
    expect(sameTarget?.conversation.clippingVersionId).toBe("33333333-3333-4333-8333-333333333333");

    const changed = matter(await Bun.file(join(contentRoot, memoId)).text());
    changed.content = changed.content.replace("/one", "/two");
    await writeFile(join(contentRoot, memoId), matter.stringify(changed.content, changed.data));
    manifest.revision = 3;
    manifest.targetUrl = "https://article.example/two";
    manifest.currentVersionId = "44444444-4444-4444-8444-444444444444";
    manifest.activeVersionId = "44444444-4444-4444-8444-444444444444";
    manifest.versions.push({
      id: "44444444-4444-4444-8444-444444444444",
      revision: 3,
      targetUrl: "https://article.example/two",
      createdAt: 3,
      status: "completed",
      summaryState: "completed",
      translationState: "completed",
      sourceHash,
    });
    await store.save(manifest);
    await store.write(clippingId, "44444444-4444-4444-8444-444444444444", "source", source);
    const staleEmpty = await assistantStorage.createConversation({
      frontendUserId: principal.id,
      kind: "clipping",
      title: "https://article.example/one",
      clippingMemoId: memoId,
      clippingVersionId: null,
      now: 2.5,
    });
    expect(await service.assistantSnapshot(memoId, principal)).toBeNull();
    expect(
      (await assistantStorage.getConversation(staleEmpty.id, principal.id))?.clippingVersionId
    ).toBeNull();
    const pending = await assistantStorage.submitTurn({
      frontendUserId: principal.id,
      kind: "clipping",
      clippingMemoId: memoId,
      clippingVersionId: "44444444-4444-4444-8444-444444444444",
      requestId: "chat-pending",
      content: "Pending old target",
      now: 4,
    });
    const changedAgain = matter(await Bun.file(join(contentRoot, memoId)).text());
    changedAgain.content = changedAgain.content.replace("/two", "/three");
    await writeFile(
      join(contentRoot, memoId),
      matter.stringify(changedAgain.content, changedAgain.data)
    );
    await service.reconcile(memoId);
    expect(
      await assistantStorage.getGenerationJob(pending.generationJob.id, principal.id)
    ).toMatchObject({
      status: "cancelled",
      cancelRequested: true,
    });
    const invalidTargetPending = await assistantStorage.submitTurn({
      frontendUserId: principal.id,
      kind: "clipping",
      clippingMemoId: memoId,
      clippingVersionId: "44444444-4444-4444-8444-444444444444",
      requestId: "chat-invalid-target-pending",
      content: "Pending invalid target",
      now: 5,
    });
    await writeFile(
      join(contentRoot, memoId),
      matter.stringify("Author remarks\n\n#剪藏", changedAgain.data)
    );
    await service.reconcile(memoId);
    expect(
      await assistantStorage.getGenerationJob(invalidTargetPending.generationJob.id, principal.id)
    ).toMatchObject({
      status: "cancelled",
      cancelRequested: true,
    });
  } finally {
    await service.close();
    await assistantRuntime.stop();
    assistantDatabase.close();
    delete process.env.LOCAL_CONTENT_BASE_PATH;
  }
});
