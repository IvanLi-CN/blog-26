import { expect, type Locator, type Page, test } from "@playwright/test";
import {
  amrCapturedAsset,
  amrNonmemberAsset,
  amrResourceBase,
  assistantMarkdownFinalStep,
} from "../../../src/lib/web-demo-scenes";
import { codeCases, completeMarkdown } from "../../fixtures/assistant-markdown";

const assistantBody = '[data-message-role="assistant"] [data-message-body]';
const consoleURL = process.env.WEB_DEMO_CONSOLE_TEST_URL;
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==",
  "base64"
);

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("web-demo-inspector-open", "false");
    const values: string[] = [];
    Object.defineProperty(window, "__amrClipboard", { value: values });
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (value: string) => {
          if ((window as unknown as { __amrCopyFails?: boolean }).__amrCopyFails)
            throw new Error("mock clipboard failure");
          values.push(value);
        },
      },
    });
  });
});

async function open(page: Page, scene: string, route = "/chat", theme = "light") {
  await page.goto(
    `${route}?d_persona=admin&d_scene=assistant-markdown-${scene}&d_theme=${theme}&d_motion=reduce`
  );
  await expect(page.locator(assistantBody).first()).toBeVisible();
}
async function requests(page: Page) {
  return page.evaluate(
    () =>
      JSON.parse(sessionStorage.getItem("web-demo-assistant-request-log") || "[]") as {
        method: string;
        path: string;
      }[]
  );
}
async function counts(page: Page) {
  const log = await requests(page);
  return {
    submits: log.filter((r) => r.method === "POST" && r.path.endsWith("/chat")).length,
    stops: log.filter((r) => r.method === "POST" && r.path.endsWith("/stop")).length,
  };
}
async function consoleRequests(page: Page) {
  return page.evaluate(
    () =>
      JSON.parse(sessionStorage.getItem("web-demo-clipping-request-log") || "[]") as {
        operation: string;
        body: { text?: string } | null;
      }[]
  );
}
async function consoleCounts(page: Page) {
  const log = await consoleRequests(page);
  return {
    submits: log.filter(
      (entry) => entry.operation === "chat" && typeof entry.body?.text === "string"
    ).length,
    stops: log.filter((entry) => entry.operation.endsWith("stop")).length,
  };
}

async function openConsoleChat(page: Page) {
  await page.waitForFunction(() => {
    const island = document.querySelector('astro-island[component-url*="PublicRouter"]');
    return island instanceof HTMLElement && !island.hasAttribute("ssr");
  });
  const live = page.getByTestId("public-memo-detail-body");
  await expect(live).toBeVisible();
  if ((page.viewportSize()?.width ?? 1440) < 1280) {
    // The live launcher is portalled. Require a single visible launcher rather
    // than choosing one of the static fallback's duplicate DOM nodes.
    const launcher = page.locator('[data-testid="clipping-open-chat"]:visible');
    await expect(launcher).toHaveCount(1);
    await launcher.click();
    const dialog = page.getByRole("dialog", { name: "文章对话", exact: true });
    await expect(dialog).toHaveCount(1);
    const chat = dialog.getByTestId("clipping-chat");
    await expect(chat).toBeVisible();
    return chat;
  }
  const tab = live.getByRole("tab", { name: "文章对话", exact: true });
  if (await tab.isVisible()) await tab.click();
  const chat = live.getByTestId("clipping-chat");
  await expect(chat).toBeVisible();
  return chat;
}

async function advance(page: Page) {
  await page.getByRole("button", { name: "打开 Web Demo 调试控制面板" }).click();
  await page.getByRole("button", { name: "模拟保存", exact: true }).click();
  await page.getByRole("button", { name: "收起 Web Demo 控制面板" }).click();
}
async function footnotes(body: Locator) {
  const references = body.locator("a[data-footnote-ref]");
  await expect(references).toHaveCount(1);
  expect(
    await references.evaluateAll((links) =>
      links.every((link) => {
        const target = document.getElementById(
          decodeURIComponent((link.getAttribute("href") || "").slice(1))
        );
        const label = link.getAttribute("aria-describedby");
        const back = target?.querySelector<HTMLAnchorElement>("a[data-footnote-backref]");
        return (
          target &&
          link.closest("[data-message-body]")?.contains(target) &&
          label &&
          document.getElementById(label) &&
          back &&
          document.getElementById(decodeURIComponent(back.hash.slice(1))) === link &&
          back.hasAttribute("aria-label")
        );
      })
    )
  ).toBe(true);
}

test("official route preserves dual-role source and real footnote/ARIA isolation", async ({
  page,
}) => {
  await open(page, "complete");
  const bodies = page.locator(assistantBody);
  await expect(bodies).toHaveCount(2);
  const user = page.locator('[data-message-role="user"] [data-message-body]');
  await expect(user).toHaveText(completeMarkdown.message.content);
  await expect(user.locator("h1,strong,input,a")).toHaveCount(0);
  for (const body of await bodies.all()) {
    await expect(body.locator("h1")).toHaveText("阅读合同");
    await expect(body.locator("strong")).toHaveText("粗体");
    await expect(body.locator("em")).toHaveText("强调");
    await expect(body.locator("del")).toHaveText("删除");
    await expect(body.locator("ol[start='7'] > li")).toHaveCount(2);
    await expect(body.locator("input[type=checkbox]")).toHaveCount(2);
    for (const checkbox of await body.locator("input[type=checkbox]").all())
      await expect(checkbox).toBeDisabled();
    await expect(body.locator('a[href="/posts/contract"]')).toHaveAttribute("title", "合同标题");
    await expect(body.locator("p").filter({ hasText: "同段软换行" }).locator("br")).toHaveCount(2);
    await expect(body).toContainText("正文裸编号 [3] 不是来源");
    await expect(body.locator("a").filter({ hasText: /^\[3\]$/ })).toHaveCount(0);
    await footnotes(body);
    await expect(body.getByRole("list", { name: "回答来源" })).toHaveCount(0);
  }
  expect(
    await page.locator("[id]").evaluateAll((nodes) => {
      const ids = nodes.map((node) => node.id);
      return ids.length === new Set(ids).size;
    })
  ).toBe(true);
  await expect(page.getByRole("list", { name: "回答来源" })).toHaveCount(2);
  expect(await counts(page)).toEqual({ submits: 0, stops: 0 });
});

test("copies AST source including empty/unknown/indented blocks without real clipboard access", async ({
  page,
}) => {
  await open(page, "code");
  const body = page.locator(assistantBody);
  const blocks = body.locator(".conversation-code-block");
  for (const [index, entry] of codeCases.entries()) {
    const block = blocks.nth(index);
    await expect(block.locator("pre")).toBeVisible();
    await expect(block.locator("code")).toHaveText(entry.source);
    await expect(block.locator(".conversation-code-language")).toHaveText(entry.language || "代码");
    await block.getByRole("button", { name: "复制代码", exact: true }).click();
    await expect(block.getByRole("status")).toHaveText("代码已复制");
    expect(
      await page.evaluate(() =>
        (window as unknown as { __amrClipboard: string[] }).__amrClipboard.at(-1)
      )
    ).toBe(entry.source);
  }
  await page.evaluate(() => {
    (window as unknown as { __amrCopyFails: boolean }).__amrCopyFails = true;
  });
  await blocks.first().getByRole("button", { name: "复制代码", exact: true }).click();
  await expect(blocks.first().getByRole("status")).toContainText("复制失败");
  await expect(body.locator(".katex").first()).toBeVisible();
  await expect(
    body.locator(".katex").filter({ hasText: "\\notARealCommand" }).first()
  ).toBeVisible();
  await expect(body).toContainText("后仍有正文。");
  await expect(body).toContainText("价格 $5 与 $10");
  await expect(body).toContainText("*不是强调* 与 _下划线_ 与 [不是链接]");
  await expect(body.locator("iframe,svg.mermaid")).toHaveCount(0);
});

test("observes browser image requests: opt-in exact URL, failure, no raw HTML execution", async ({
  page,
}) => {
  const seen: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).hostname.endsWith(".invalid")) seen.push(request.url());
  });
  await page.route("https://**.invalid/**", async (route) => {
    if (route.request().url().includes("missing.png")) await route.abort("failed");
    else await route.fulfill({ contentType: "image/png", body: png });
  });
  await open(page, "safety");
  const body = page.locator(assistantBody);
  await expect(body).toContainText("<script>globalThis.__amrExecuted = true</script>");
  await expect(body.locator("script,iframe,video,[onerror],[data-untrusted]")).toHaveCount(0);
  await expect(
    body.locator('a[href^="javascript:"],a[href^="data:"],img[src^="data:"]')
  ).toHaveCount(0);
  await expect(body.locator("img")).toHaveCount(0);
  expect(
    await page.evaluate(() => (globalThis as { __amrExecuted?: boolean }).__amrExecuted)
  ).toBeUndefined();
  expect(seen).toEqual([]);
  const image = body.locator(".conversation-image").filter({ hasText: "外部图片 A" });
  await image.getByRole("button", { name: "加载图片", exact: true }).click();
  await expect(image.locator("img")).toHaveJSProperty("naturalWidth", 1);
  expect(seen).toEqual(["https://images.example.invalid/a.png?variant=1"]);
  const broken = body.locator(".conversation-image").filter({ hasText: "损坏图片" });
  await broken.getByRole("button", { name: "加载图片", exact: true }).click();
  await expect(broken).toContainText("图片加载失败");
  expect(seen).toEqual([
    "https://images.example.invalid/a.png?variant=1",
    "https://images.example.invalid/missing.png",
  ]);
  await expect(body).toContainText("图片之外的说明始终可读");
});

for (const width of [1440, 800, 393, 320]) {
  for (const theme of ["light", "dark"]) {
    test(`local overflow and controls ${width} ${theme}`, async ({ page }) => {
      await page.setViewportSize({
        width,
        height: width === 1440 ? 1000 : width === 320 ? 800 : 852,
      });
      await open(page, "code", "/chat", theme);
      const body = page.locator(assistantBody);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)
      ).toBe(true);
      expect(await body.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
      const wide = body.locator("pre").last();
      expect(
        await wide.evaluate(
          (node) =>
            node.scrollWidth > node.clientWidth &&
            /auto|scroll/.test(getComputedStyle(node).overflowX)
        )
      ).toBe(true);
      const table = body.locator(".table-responsive");
      await expect(table).toHaveCount(1);
      expect(
        await table.evaluate(
          (node) =>
            node.scrollWidth > node.clientWidth &&
            /auto|scroll/.test(getComputedStyle(node).overflowX)
        )
      ).toBe(true);
      const math = body.locator(".katex-display").last();
      expect(
        await math.evaluate(
          (node) =>
            node.scrollWidth > node.clientWidth &&
            /auto|scroll/.test(getComputedStyle(node).overflowX)
        )
      ).toBe(true);
      const send = page.getByRole("button", { name: "发送", exact: true });
      const box = await send.boundingBox();
      expect(box?.height).toBeGreaterThanOrEqual(width >= 1024 ? 36 : 44);
      for (const button of await body.locator("button").all()) {
        const bounds = await button.boundingBox();
        expect(bounds?.height).toBeGreaterThanOrEqual(width >= 1024 ? 36 : 44);
      }
    });
  }
}

test("Inspector advances real snapshots, preserves code collapse and terminal source", async ({
  page,
}) => {
  await open(page, "incremental");
  const body = page.locator(assistantBody).last();
  await expect(body.locator("code")).toHaveText("int");
  await body.getByRole("button", { name: "折叠代码" }).click();
  await advance(page);
  await expect(body).toContainText("https://example.invalid/pa");
  await expect(body.locator('a[href="https://example.invalid/pa"]')).toHaveCount(0);
  await expect(body.getByRole("button", { name: "展开代码" })).toBeVisible();
  for (let step = 2; step <= assistantMarkdownFinalStep; step++) {
    await advance(page);
    if (step === 2) await expect(body).toContainText("| 项目 | 说明 |");
    if (step === 3) await expect(body).toContainText("\\frac{a");
    await expect(body.getByRole("button", { name: "展开代码" })).toBeVisible();
  }
  await expect(body).toContainText("恢复后的服务端终态");
  await expect(body.locator('a[href="https://example.invalid/path"]')).toBeVisible();
  await expect(body.getByRole("button", { name: "展开代码" })).toBeVisible();
  await expect(body.locator("pre")).toBeHidden();
  expect(await counts(page)).toEqual({ submits: 0, stops: 0 });
  const source = await page.evaluate(() => sessionStorage.getItem("web-demo-assistant-state"));
  await page.reload();
  await expect(page.locator(assistantBody).last()).toContainText("恢复后的服务端终态");
  await expect(page.locator(assistantBody).last().locator("code").first()).toHaveText("int x = 1;");
  expect(await page.evaluate(() => sessionStorage.getItem("web-demo-assistant-state"))).toBe(
    source
  );
  expect(await counts(page)).toEqual({ submits: 0, stops: 0 });
});

for (const scene of ["failed", "stopped", "final"]) {
  test(`terminal ${scene} retains complete body and avoids submissions`, async ({ page }) => {
    await open(page, scene);
    const body = page.locator(assistantBody);
    await expect(body).toContainText("恢复后的服务端终态");
    await expect(body.locator("strong").first()).toHaveText("完整正文");
    await expect(body.locator("code").first()).toHaveText("int x = 1;");
    await expect(body.locator("..")).toHaveAttribute(
      "data-message-status",
      scene === "failed" ? "failed" : scene === "stopped" ? "cancelled" : "completed"
    );
    if (scene === "failed")
      await expect(page.getByRole("button", { name: "重试", exact: true })).toBeVisible();
    expect(await counts(page)).toEqual({ submits: 0, stops: 0 });
  });
}

test("Console legacy entry enforces captured-resource facade membership", async ({ page }) => {
  test.skip(!consoleURL, "Requires a separately built and leased Console Web Demo.");
  const resourceRequests: string[] = [];
  const resourceResponses: { url: string; status: number }[] = [];
  const externalRequests: string[] = [];
  page.on("response", (response) => {
    if (response.url().includes(amrResourceBase))
      resourceResponses.push({ url: response.url(), status: response.status() });
  });
  page.on("request", (request) => {
    if (request.url().includes(amrResourceBase)) resourceRequests.push(request.url());
    if (new URL(request.url()).hostname.endsWith(".invalid")) externalRequests.push(request.url());
  });
  await page.route(`**${amrResourceBase}**`, (route) =>
    route.request().url().endsWith(amrCapturedAsset.slice(7))
      ? route.fulfill({ contentType: "image/png", body: png })
      : route.fulfill({ status: 404 })
  );
  await page.goto(
    `${consoleURL}/memos/console-demo-clipping-durable-workflows/?d_persona=admin&d_scene=assistant-markdown-safety`
  );
  const chat = await openConsoleChat(page);
  const body = chat.locator(assistantBody).last();
  const captured = body.locator(".conversation-image").filter({ hasText: "捕获图片" });
  await captured.scrollIntoViewIfNeeded();
  await expect(captured.locator("img")).toHaveCount(1);
  await expect(body.getByAltText("捕获图片")).toHaveJSProperty("naturalWidth", 1);
  const forged = body.locator(".conversation-image").filter({ hasText: "伪造图片" });
  await forged.scrollIntoViewIfNeeded();
  await expect(forged).toContainText("图片加载失败");
  await expect(forged.locator("img")).toHaveCount(0);
  const capturedURL = new URL(amrResourceBase + amrCapturedAsset.slice(7), consoleURL).href;
  const deniedURL = new URL(amrResourceBase + amrNonmemberAsset.slice(7), consoleURL).href;
  expect(resourceRequests).toEqual([capturedURL, deniedURL]);
  expect(resourceResponses).toEqual([
    { url: capturedURL, status: 200 },
    { url: deniedURL, status: 404 },
  ]);
  expect(externalRequests).toEqual([]);
  await expect(body).toContainText("安全场景尾部正文。");
  expect(await consoleCounts(page)).toEqual({ submits: 0, stops: 0 });
});

for (const width of [1440, 393, 320]) {
  for (const theme of ["light", "dark"]) {
    test(`panel lifecycle and explicit stop ${width} ${theme}`, async ({ page }) => {
      await page.setViewportSize({
        width,
        height: width === 1440 ? 1000 : width === 320 ? 800 : 852,
      });
      await page.goto(
        `/?d_persona=admin&d_scene=assistant-markdown-incremental&d_theme=${theme}&d_motion=reduce`
      );
      await page.getByTestId("assistant-fab").click();
      const panel = page.getByTestId("assistant-panel");
      await expect(panel.locator(assistantBody).last()).toContainText("int");
      await panel.getByRole("button", { name: /^切换对话/ }).click();
      await page
        .getByTestId("assistant-conversation-list")
        .getByRole("button", { name: "新建对话" })
        .first()
        .click();
      await panel.getByLabel("知识对话问题").fill("回归测试：保持同一次生成");
      await panel.getByRole("button", { name: "发送", exact: true }).click();
      await expect(panel.locator(assistantBody).last()).toContainText("int");
      expect(await counts(page)).toEqual({ submits: 1, stops: 0 });
      await expect(panel.getByRole("button", { name: "停止生成", exact: true })).toBeVisible();
      await panel.getByRole("button", { name: "关闭知识对话", exact: true }).click();
      await expect(panel).toHaveCount(0);
      expect(await counts(page)).toEqual({ submits: 1, stops: 0 });
      await page.getByTestId("assistant-fab").click();
      await expect(panel.locator(assistantBody).last()).toContainText("int");
      await panel.getByRole("button", { name: /^切换对话/ }).click();
      const list = page.getByTestId("assistant-conversation-list");
      await expect(list).toBeVisible();
      await list.locator(".knowledge-assistant-list-select").first().click();
      await expect(list).toBeHidden();
      expect(await counts(page)).toEqual({ submits: 1, stops: 0 });
      await panel.getByRole("button", { name: "停止生成", exact: true }).click();
      await expect(panel.getByRole("button", { name: "停止生成", exact: true })).toHaveCount(0);
      await expect(
        panel.locator('[data-message-status="cancelled"] [data-message-body]')
      ).toContainText("int");
      expect(await counts(page)).toEqual({ submits: 1, stops: 1 });
    });
  }
}

test("history snapshots preserve position; explicit return to tail restores following", async ({
  page,
}) => {
  await open(page, "incremental");
  const scrollHost = await page
    .getByTestId("assistant-messages")
    .evaluate((node) =>
      node.scrollHeight > node.clientHeight
        ? '[data-testid="assistant-messages"]'
        : document.scrollingElement?.tagName.toLowerCase() || "html"
    );
  const messages = page.locator(scrollHost);
  await expect
    .poll(() => messages.evaluate((node) => node.scrollHeight - node.clientHeight))
    .toBeGreaterThan(100);
  await messages.evaluate((node) => {
    node.scrollTop = 60;
    node.dispatchEvent(new Event("scroll"));
  });
  const position = await messages.evaluate((node) => node.scrollTop);
  expect(position).toBeGreaterThan(0);
  await advance(page);
  await expect(page.locator(assistantBody).last()).toContainText("https://example.invalid/pa");
  expect(await messages.evaluate((node) => node.scrollTop)).toBeCloseTo(position, 0);
  await messages.evaluate((node) => {
    node.scrollTop = node.scrollHeight;
    node.dispatchEvent(new Event("scroll"));
  });
  for (let step = 2; step <= assistantMarkdownFinalStep; step++) await advance(page);
  await expect(page.locator(assistantBody).last()).toContainText("恢复后的服务端终态");
  expect(await counts(page)).toEqual({ submits: 0, stops: 0 });
  await expect
    .poll(() => messages.evaluate((node) => node.scrollHeight - node.scrollTop - node.clientHeight))
    .toBeLessThanOrEqual(24);
  expect(await counts(page)).toEqual({ submits: 0, stops: 0 });
});

test("expanding and returning retains message collapse and reading position without lifecycle writes", async ({
  page,
}) => {
  await page.goto(
    "/?d_persona=admin&d_scene=assistant-markdown-code&d_theme=dark&d_motion=reduce&d_delay=custom&d_delay_ms=25"
  );
  await page.getByTestId("assistant-fab").click();
  const panel = page.getByTestId("assistant-panel");
  const first = panel.locator(assistantBody).locator(".conversation-code-block").first();
  await first.getByRole("button", { name: "折叠代码" }).click();
  const messages = panel.getByTestId("assistant-messages");
  await messages.evaluate((node) => {
    node.scrollTop = 120;
    node.dispatchEvent(new Event("scroll"));
  });
  const position = await messages.evaluate((node) => node.scrollTop);
  await panel.getByRole("button", { name: "展开完整页面" }).click();
  await expect(page.getByTestId("assistant-page")).toBeVisible();
  const navigation = new URL(page.url());
  for (const [key, value] of Object.entries({
    d_scene: "assistant-markdown-code",
    d_persona: "admin",
    d_theme: "dark",
    d_motion: "reduce",
    d_delay: "custom",
    d_delay_ms: "25",
  }))
    expect(navigation.searchParams.get(key)).toBe(value);
  expect(navigation.searchParams.get("conversation")).toBeTruthy();
  await expect(
    page
      .locator(assistantBody)
      .locator(".conversation-code-block")
      .first()
      .getByRole("button", { name: "展开代码" })
  ).toBeVisible();
  const fullPageScrollHost = await page
    .getByTestId("assistant-messages")
    .evaluate((node) =>
      node.scrollHeight > node.clientHeight
        ? '[data-testid="assistant-messages"]'
        : document.scrollingElement?.tagName.toLowerCase() || "html"
    );
  await expect
    .poll(() => page.locator(fullPageScrollHost).evaluate((node) => node.scrollTop))
    .toBeCloseTo(position, 0);
  await page.goBack();
  if (!(await page.getByTestId("assistant-panel").isVisible()))
    await page.getByTestId("assistant-fab").click();
  await expect(
    page
      .getByTestId("assistant-panel")
      .locator(assistantBody)
      .locator(".conversation-code-block")
      .first()
      .getByRole("button", { name: "展开代码" })
  ).toBeVisible();
  await expect
    .poll(() =>
      page
        .getByTestId("assistant-panel")
        .getByTestId("assistant-messages")
        .evaluate((node) => node.scrollTop)
    )
    .toBeCloseTo(position, 0);
  expect(await counts(page)).toEqual({ submits: 0, stops: 0 });
});

test("async chosen image completion preserves the actual history scroll host", async ({ page }) => {
  let completeImage: (() => void) | undefined;
  const ready = new Promise<void>((resolve) => {
    completeImage = resolve;
  });
  const seen: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("images.example.invalid")) seen.push(request.url());
  });
  await page.route("https://images.example.invalid/**", async (route) => {
    await ready;
    await route.fulfill({ contentType: "image/png", body: png });
  });
  await open(page, "safety");
  const body = page.locator(assistantBody);
  const image = body.locator(".conversation-image").filter({ hasText: "外部图片 A" });
  expect(seen).toEqual([]);
  await image.getByRole("button", { name: "加载图片", exact: true }).click();
  await expect.poll(() => seen.length).toBe(1);
  const scrollHost = await page
    .getByTestId("assistant-messages")
    .evaluate((node) =>
      node.scrollHeight > node.clientHeight
        ? '[data-testid="assistant-messages"]'
        : document.scrollingElement?.tagName.toLowerCase() || "html"
    );
  const scroller = page.locator(scrollHost);
  await scroller.evaluate((node) => {
    node.scrollTop = 80;
    node.dispatchEvent(new Event("scroll"));
  });
  const position = await scroller.evaluate((node) => node.scrollTop);
  expect(position).toBeGreaterThan(0);
  completeImage?.();
  await expect(image.locator("img")).toHaveJSProperty("naturalWidth", 1);
  expect(await scroller.evaluate((node) => node.scrollTop)).toBeCloseTo(position, 0);
  expect(seen).toEqual(["https://images.example.invalid/a.png?variant=1"]);
});

for (const width of [1440, 393, 320]) {
  for (const theme of ["light", "dark"]) {
    for (const scene of ["failed", "stopped"]) {
      test(`Console terminal body and top-level feedback ${scene} ${width} ${theme}`, async ({
        page,
      }) => {
        test.skip(!consoleURL, "Requires separately built Console artifact and owned preview.");
        await page.setViewportSize({
          width,
          height: width === 1440 ? 1000 : width === 320 ? 800 : 852,
        });
        await page.goto(
          `${consoleURL}/memos/console-demo-clipping-durable-workflows/?d_persona=admin&d_scene=assistant-markdown-${scene}&d_theme=${theme}&d_motion=reduce`
        );
        const chat = await openConsoleChat(page);
        const body = chat.locator(assistantBody).last();
        await expect(body).toContainText("恢复后的服务端终态");
        await expect(body.locator("strong").first()).toHaveText("完整正文");
        await expect(body.locator("code").first()).toHaveText("int x = 1;");
        await expect(body.locator("..")).toHaveAttribute(
          "data-message-status",
          scene === "failed" ? "failed" : "cancelled"
        );
        await expect(chat.getByRole("alert")).toContainText(
          scene === "failed" ? "生成失败" : "已停止生成"
        );
        const log = await consoleRequests(page);
        expect(log.some((entry) => entry.operation === "chat" && entry.body === null)).toBe(true);
        expect(await consoleCounts(page)).toEqual({ submits: 0, stops: 0 });
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)
        ).toBe(true);
      });
    }
  }
}

for (const width of [1440, 393]) {
  test(`Console Inspector snapshots preserve message identity and collapse ${width}`, async ({
    page,
  }) => {
    test.skip(!consoleURL, "Requires separately built Console artifact.");
    await page.setViewportSize({ width, height: width === 1440 ? 1000 : 852 });
    await page.goto(
      `${consoleURL}/memos/console-demo-clipping-durable-workflows/?d_persona=admin&d_scene=assistant-markdown-incremental&d_motion=reduce`
    );
    const chat = await openConsoleChat(page);
    const body = chat.locator(assistantBody).last();
    await expect(body.locator("code")).toHaveText("int");
    const identity = await body.locator("..").getAttribute("data-message-id");
    await body.getByRole("button", { name: "折叠代码" }).click();
    for (let step = 1; step <= assistantMarkdownFinalStep; step++) {
      if (width < 1280)
        await page
          .getByRole("dialog", { name: "文章对话", exact: true })
          .getByRole("button", { name: "关闭", exact: true })
          .click();
      await advance(page);
      if (width < 1280) await openConsoleChat(page);
      expect(await body.locator("..").getAttribute("data-message-id")).toBe(identity);
      await expect(body.getByRole("button", { name: "展开代码" })).toBeVisible();
    }
    await expect(body).toContainText("恢复后的服务端终态");
    await expect(body.locator("pre")).toBeHidden();
    expect(await consoleCounts(page)).toEqual({ submits: 0, stops: 0 });
  });
}
