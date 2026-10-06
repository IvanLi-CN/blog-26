/** Production-console smoke coverage. Deterministic materials; no model calls or screenshots. */
import { Database } from "bun:sqlite";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import matter from "gray-matter";
import { type Browser, chromium } from "playwright";
import {
  attachClippingReference,
  ClippingStore,
  clippingManifestSchema,
  clippingVersionSchema,
} from "../../src/server/clipping/store";

const fixtureRoot = await mkdtemp(join(tmpdir(), "clipping-console-smoke-"));
async function runSmoke() {
  const databasePath = join(fixtureRoot, "app.sqlite");
  const contentRoot = join(fixtureRoot, "authored");
  process.env.CLIPPING_CONTENT_BASE_PATH = join(fixtureRoot, "materials");
  process.env.DB_PATH = databasePath;
  process.env.LOCAL_CONTENT_BASE_PATH = contentRoot;
  const slug = `clipping-smoke-${randomUUID()}`;
  const id = `Memos/${slug}.md`;
  const target = "https://example.com/article";
  const source = "# Durable article\n\nA saved checkpoint survives interruption.";
  const frontmatter: Record<string, unknown> = {
    title: "剪藏阅读测试",
    public: true,
    tags: ["剪藏"],
  };
  const body = `${target}\n\n保留我的备注。\n\n#剪藏`;
  await mkdir(join(contentRoot, "Memos"), { recursive: true });
  await attachClippingReference(body, frontmatter, "smoke-author", id);
  const clippingId = (frontmatter.clipping as { id: string }).id;
  const versionId = randomUUID();
  await writeFile(join(contentRoot, id), matter.stringify(body, frontmatter));
  const sqlite = new Database(databasePath);
  migrate(drizzle(sqlite), { migrationsFolder: "drizzle" });
  sqlite
    .query(
      "INSERT INTO posts (id,slug,type,title,body,publish_date,public,draft,source,data_source,file_path,tags,metadata,content_hash) VALUES (?,?,?,?,?,?,1,0,'local','local',?,?,?,?)"
    )
    .run(
      id,
      slug,
      "memo",
      "剪藏阅读测试",
      body,
      Date.now(),
      id,
      '["剪藏"]',
      JSON.stringify(frontmatter),
      createHash("sha256").update(body).digest("hex")
    );
  sqlite.close();
  const store = new ClippingStore();
  await store.save(
    clippingManifestSchema.parse({
      schemaVersion: 1,
      id: clippingId,
      memoId: id,
      creatorId: "smoke-author",
      revision: 1,
      enabled: true,
      targetUrl: target,
      conversationId: null,
      previousConversations: [],
      activeVersionId: versionId,
      currentVersionId: versionId,
      versions: [
        clippingVersionSchema.parse({
          id: versionId,
          revision: 1,
          targetUrl: target,
          createdAt: Date.now(),
          status: "completed",
          summaryState: "completed",
          translationState: "completed",
          translatedSegments: 1,
          segmentCount: 1,
          sourceHash: createHash("sha256").update(source).digest("hex"),
          pageTitle: "Durable article",
        }),
      ],
    })
  );
  await store.write(clippingId, versionId, "source", source);
  await store.write(clippingId, versionId, "summary", "已保存的进度可以恢复。");
  await store.write(
    clippingId,
    versionId,
    "translation",
    "# 持久文章\n\n已保存的检查点能够在中断后恢复。"
  );

  const probe = createServer();
  await new Promise<void>((done) => probe.listen(0, "127.0.0.1", done));
  const address = probe.address();
  if (!address || typeof address === "string") throw new Error("No test port");
  const port = address.port;
  await new Promise<void>((done) => probe.close(() => done()));
  const base = `http://127.0.0.1:${port}`;
  const email = process.env.ADMIN_EMAIL || "admin@example.com";
  const child = Bun.spawn([process.execPath, "scripts/start-console.ts"], {
    env: {
      ...process.env,
      NODE_ENV: "production",
      PORT: String(port),
      BIND_HOST: "127.0.0.1",
      ADMIN_EMAIL: email,
      ENABLE_DEV_ENDPOINTS: "true",
      ALLOW_ADMIN_SESSION_IN_PRODUCTION: "true",
      CONSOLE_RUNTIME: "true",
      PLAYBOOK_SYNC_ENABLED: "false",
      PI_DURABLE_DB_PATH: join(dirname(databasePath), `smoke-${slug}.sqlite`),
    },
    stdout: "ignore",
    stderr: "pipe",
  });
  let browser: Browser | undefined;
  try {
    browser = await chromium.launch({
      headless: true,
      executablePath: process.env.CLIPPING_BROWSER_EXECUTABLE,
    });
    const deadline = Date.now() + 30_000;
    while (true) {
      if ((await fetch(`${base}/api/health`).catch(() => null))?.ok) break;
      if (Date.now() > deadline) throw new Error("Console did not become ready");
      await Bun.sleep(200);
    }
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const login = await context.request.post(`${base}/api/dev/login`, { data: { email } });
    if (!login.ok()) throw new Error(`Dev login failed: ${login.status()}`);
    const page = await context.newPage();
    await page.goto(`${base}/admin/preview/memos/${slug}`);
    await page.getByRole("heading", { name: "Durable article", exact: true }).waitFor();
    const sourceLink = page
      .locator(".clipping-reading-card .clipping-article-toolbar")
      .getByRole("link", { name: "打开原网页", exact: true });
    if ((await sourceLink.getAttribute("rel")) !== "nofollow noopener noreferrer")
      throw new Error("Clipping source link policy is missing");
    await page.getByRole("button", { name: "简体中文译文", exact: true }).click();
    await page.getByText("已保存的检查点能够在中断后恢复。", { exact: true }).waitFor();
    await page.getByRole("button", { name: "原文", exact: true }).click();
    await page.locator('aside[aria-label="文章对话"]').waitFor();
    const columns = await page.evaluate(() => {
      const reader = document.querySelector('[data-testid="clipping-detail"]');
      const source = document.querySelector('[data-testid="clipping-article-source"]');
      const chat = document.querySelector('aside[aria-label="文章对话"]');
      return {
        display: reader ? getComputedStyle(reader).display : null,
        sourceRight: source?.getBoundingClientRect().right,
        chatLeft: chat?.getBoundingClientRect().left,
      };
    });
    if (columns.display !== "grid" || (columns.sourceRight ?? Infinity) > (columns.chatLeft ?? 0))
      throw new Error(`Article and discussion are not adjacent: ${JSON.stringify(columns)}`);
    await page.goto(`${base}/memos/${slug}`);
    await page.locator('[data-testid="public-memo-detail-controls"] .clipping-chat-card').waitFor();
    const memoBadge = page.locator(
      '[data-testid="public-memo-detail-controls"] .clipping-memo-card [data-content-kind="clipping"]'
    );
    if (
      !(await memoBadge.textContent())?.includes("剪藏") ||
      !(await memoBadge.locator("svg").count())
    )
      throw new Error("Console clipping identity is missing");
    if (await page.locator(".clipping-memo-card").getByText("#剪藏", { exact: true }).count())
      throw new Error("Reading header repeats the clipping marker as a tag");
    const memoRecord = await context.request.get(`${base}/api/public/memos/${slug}`);
    if (!(await memoRecord.json()).tags.includes("剪藏"))
      throw new Error("Presentation filtering changed the authored clipping tag");
    const publicCards = await page.evaluate(() => {
      const layout = document.querySelector(
        '[data-testid="public-memo-detail-controls"] .clipping-detail-layout'
      );
      const reader = layout?.querySelector(".clipping-reading-card");
      const column = layout?.querySelector(".clipping-reading-column");
      const memo = layout?.querySelector(".clipping-memo-card");
      const discussion = layout?.querySelector(".clipping-chat-card");
      return {
        width: layout?.getBoundingClientRect().width ?? 0,
        siblings: column?.parentElement === discussion?.parentElement,
        readingSiblings: memo?.parentElement === reader?.parentElement,
        readingGap:
          memo && reader
            ? reader.getBoundingClientRect().top - memo.getBoundingClientRect().bottom
            : 0,
        nested: Boolean(layout?.closest(".nature-panel")),
        gap:
          reader && discussion
            ? discussion.getBoundingClientRect().left - reader.getBoundingClientRect().right
            : 0,
        overflow: document.documentElement.scrollWidth > innerWidth,
      };
    });
    if (
      publicCards.width <= 920 ||
      !publicCards.siblings ||
      !publicCards.readingSiblings ||
      publicCards.readingGap !== 24 ||
      publicCards.nested ||
      publicCards.gap !== 24 ||
      publicCards.overflow
    )
      throw new Error(
        `Public memo clips its reading/discussion cards: ${JSON.stringify(publicCards)}`
      );
    console.log("PASS console memo page: independent cards and wide reading container");
    const desktopDraft = page.getByRole("textbox", { name: "向文章助手提问" });
    await desktopDraft.fill("保留跨视口草稿。");
    for (const width of [320, 360, 375, 393, 768]) {
      await page.setViewportSize({ width, height: 852 });
      const trigger = page.getByRole("button", { name: "讨论文章", exact: true });
      await page.waitForFunction(() => {
        const bounds = document
          .querySelector('[data-testid="clipping-open-chat"]')
          ?.getBoundingClientRect();
        return bounds && bounds.y >= 0 && bounds.bottom <= innerHeight;
      });
      await trigger.click();
      const dialog = page.getByRole("dialog", { name: "文章对话", exact: true });
      await dialog.waitFor();
      if ((await dialog.getByRole("textbox").inputValue()) !== "保留跨视口草稿。")
        throw new Error("Discussion draft was lost");
      if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth))
        throw new Error(`Horizontal overflow at ${width}px`);
      await dialog.getByRole("button", { name: "关闭", exact: true }).click();
      await page.waitForFunction(() => document.activeElement?.textContent === "讨论文章");
      console.log(`PASS production clipping detail @${width}`);
    }
    const guest = await browser.newContext();
    const reading = await guest.request.get(`${base}/api/public/memos/${slug}/clipping`);
    if (!reading.ok() || !(await reading.json()).source?.includes("saved checkpoint"))
      throw new Error("Guest cannot read public clipping material");
    for (const operation of ["chat", "history"])
      if ((await guest.request.get(`${base}/api/public/memos/${slug}/clipping/${operation}`)).ok())
        throw new Error("Guest can access private discussion/history");
    console.log("PASS production source/translation, authenticated discussion, guest boundary");
  } finally {
    await browser?.close();
    child.kill("SIGTERM");
    await child.exited;
  }
}
try {
  await runSmoke();
} finally {
  await rm(fixtureRoot, { recursive: true, force: true });
}
