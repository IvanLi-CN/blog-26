import { expect, type Page, test } from "@playwright/test";

async function gotoWithTheme(page: Page, route: string, theme: "light" | "dark" | "system") {
  await page.goto(route, { waitUntil: "domcontentloaded" });
  await page.evaluate((value) => localStorage.setItem("theme", value), theme);
  await page.reload({ waitUntil: "domcontentloaded" });
}

async function readToggleVisualState(page: Page) {
  return page.evaluate(() => {
    const read = (label: string) => {
      const button = Array.from(document.querySelectorAll<HTMLButtonElement>("button[title]")).find(
        (candidate) => candidate.title === label
      );
      if (!button) return null;

      const styles = getComputedStyle(button);
      return {
        ariaPressed: button.getAttribute("aria-pressed"),
        backgroundColor: styles.backgroundColor,
        color: styles.color,
      };
    };

    return {
      light: read("Light"),
      dark: read("Dark"),
      auto: read("Auto"),
    };
  });
}

async function expectThemeState(
  page: Page,
  preference: "light" | "dark" | "system",
  resolved: "light" | "dark"
) {
  const html = page.locator("html");
  await expect(html).toHaveAttribute("data-ui-preference", preference);
  await expect(html).toHaveAttribute("data-ui-theme", resolved);
  await expect(html).toHaveAttribute("data-theme", resolved);
  await expect
    .poll(async () =>
      page.evaluate(() => ({
        storedTheme: localStorage.getItem("theme"),
        colorScheme: document.documentElement.style.colorScheme,
        hasDark: document.documentElement.classList.contains("dark"),
      }))
    )
    .toEqual({
      storedTheme: preference,
      colorScheme: resolved,
      hasDark: resolved === "dark",
    });
}

test.describe("Astro public front (phase 1)", () => {
  test("renders migrated public routes and islands", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: /Ivan's Blog/i })).toBeVisible();
    await expect(page.getByRole("link", { name: "浏览文章" })).toBeVisible();

    await page.goto("/posts", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "文章" })).toBeVisible();
    await expect(page.locator('a[href="/posts/react-hooks-deep-dive"]').first()).toBeVisible();

    await page.goto("/posts/react-hooks-deep-dive", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "React Hooks 深度解析" }).first()).toBeVisible();
    await expect(page.getByText("Feedback")).toBeVisible();
    await expect(page.getByRole("heading", { name: "留言" })).toBeVisible();
    await expect(page.getByText("暂无评论")).toBeVisible();

    await page.goto("/memos", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Memos" })).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Local Development Environment Setup" })
    ).toBeVisible();

    await page.goto("/memos/local-development-environment-setup", {
      waitUntil: "domcontentloaded",
    });
    await expect(
      page.getByRole("heading", { name: "Local Development Environment Setup" })
    ).toBeVisible();

    await page.goto("/tags", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "浏览所有标签" })).toBeVisible();
    await expect(page.getByRole("link", { name: /React/i })).toBeVisible();

    await page.goto("/tags/React", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "React", exact: true })).toBeVisible();
    await expect(page.locator('a[href="/posts/react-hooks-deep-dive"]').first()).toBeVisible();

    await page.goto("/search?q=React", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "搜索" })).toBeVisible();
    await expect(page.locator('a[href="/posts/react-hooks-deep-dive"]').first()).toBeVisible();
  });

  test("serves feed, sitemap, and public APIs through the gateway", async ({ request }) => {
    const feed = await request.get("/feed.xml");
    expect(feed.ok()).toBeTruthy();
    expect(feed.headers()["content-type"]).toContain("application/xml");
    expect(await feed.text()).toContain("<rss");

    const rss = await request.get("/rss.xml");
    expect(rss.ok()).toBeTruthy();
    expect(await rss.text()).toContain("<rss");

    const memoFeed = await request.get("/memos/feed.xml");
    expect(memoFeed.ok()).toBeTruthy();
    expect(await memoFeed.text()).toContain("<rss");

    const tagFeed = await request.get("/tags/React/feed.xml");
    expect(tagFeed.ok()).toBeTruthy();
    expect(await tagFeed.text()).toContain("React Hooks 深度解析");

    const sitemap = await request.get("/sitemap.xml");
    expect(sitemap.ok()).toBeTruthy();
    expect(await sitemap.text()).toContain("/posts/react-hooks-deep-dive");

    const robots = await request.get("/robots.txt");
    expect(robots.ok()).toBeTruthy();
    expect(await robots.text()).toContain("Sitemap:");

    const auth = await request.get("/api/public/auth/me");
    expect(auth.ok()).toBeTruthy();
    expect(await auth.json()).toBeNull();

    const search = await request.get("/api/public/search?q=React&topK=10");
    expect(search.ok()).toBeTruthy();
    expect(await search.json()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ slug: "react-hooks-deep-dive", type: "post" }),
      ])
    );

    const comments = await request.get(
      "/api/public/comments?slug=react-hooks-deep-dive&page=1&limit=10"
    );
    expect(comments.ok()).toBeTruthy();
    expect(await comments.json()).toEqual(
      expect.objectContaining({
        comments: expect.any(Array),
        totalPages: expect.any(Number),
      })
    );

    const toggle = await request.post("/api/public/reactions/toggle", {
      data: {
        targetType: "post",
        targetId: "react-hooks-deep-dive",
        emoji: "👍",
      },
    });
    expect(toggle.ok()).toBeTruthy();
    expect(await toggle.json()).toEqual(
      expect.objectContaining({ reacted: expect.any(Boolean), count: expect.any(Number) })
    );

    const reactions = await request.get(
      "/api/public/reactions?targetType=post&targetId=react-hooks-deep-dive"
    );
    expect(reactions.ok()).toBeTruthy();
    expect(await reactions.json()).toEqual(
      expect.objectContaining({
        reactions: expect.arrayContaining([
          expect.objectContaining({ emoji: "👍", count: expect.any(Number) }),
        ]),
      })
    );
  });

  test("shows the stored light theme in the toggle before hydration finishes", async ({ page }) => {
    await page.route(/ThemeToggle\..*\.js$/, async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 2_000));
      await route.continue();
    });

    await gotoWithTheme(page, "/", "light");
    await expectThemeState(page, "light", "light");

    await expect
      .poll(async () => readToggleVisualState(page))
      .toEqual({
        light: expect.objectContaining({
          ariaPressed: "false",
          backgroundColor: "rgba(124, 169, 139, 0.16)",
          color: "rgb(78, 126, 96)",
        }),
        dark: expect.objectContaining({
          ariaPressed: "false",
          backgroundColor: "rgba(0, 0, 0, 0)",
        }),
        auto: expect.objectContaining({
          ariaPressed: "false",
          backgroundColor: "rgba(0, 0, 0, 0)",
        }),
      });

    await expect(page.getByRole("button", { name: "Light" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    await expect(page.getByRole("button", { name: "Auto" })).toHaveAttribute(
      "aria-pressed",
      "false"
    );
  });

  test("keeps dark theme across Astro public page navigation", async ({ page }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));

    await gotoWithTheme(page, "/", "dark");
    await expectThemeState(page, "dark", "dark");

    await page.goto("/posts", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "文章" })).toBeVisible();
    await expectThemeState(page, "dark", "dark");

    await page.goto("/memos", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Memos" })).toBeVisible();
    await expectThemeState(page, "dark", "dark");

    expect(pageErrors).not.toContain("UI is not defined");
  });

  test.describe("system theme follows dark OS across Astro public page navigation", () => {
    test.use({ colorScheme: "dark" });

    test("keeps resolved dark state on home, posts, and memos", async ({ page }) => {
      const pageErrors: string[] = [];
      page.on("pageerror", (error) => pageErrors.push(error.message));

      await gotoWithTheme(page, "/", "system");
      await expectThemeState(page, "system", "dark");

      await page.goto("/posts", { waitUntil: "domcontentloaded" });
      await expect(page.getByRole("heading", { name: "文章" })).toBeVisible();
      await expectThemeState(page, "system", "dark");

      await page.goto("/memos", { waitUntil: "domcontentloaded" });
      await expect(page.getByRole("heading", { name: "Memos" })).toBeVisible();
      await expectThemeState(page, "system", "dark");

      expect(pageErrors).not.toContain("UI is not defined");
    });
  });
});
