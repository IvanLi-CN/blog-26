import { expect, type Page, test } from "@playwright/test";

const TARGET_POST_PATH = "/posts/code-block-fixture";
const TEMPLATE_RETURN_LINE = `  return \`hello ${"name"}\`;`;

function articleBody(page: Page) {
  return page.locator("main section article").first();
}

function codeBlock(page: Page) {
  return articleBody(page).locator("pre code").first();
}

async function openTargetPost(page: Page) {
  await page.goto(TARGET_POST_PATH, { timeout: 60_000, waitUntil: "commit" });
  await expect(articleBody(page)).toBeVisible({ timeout: 30_000 });
  await expect(codeBlock(page)).toBeVisible({ timeout: 30_000 });
}

test.describe("Code Block Rendering", () => {
  test.beforeEach(async ({ page }) => {
    await openTargetPost(page);
  });

  test("should display code blocks with correct JavaScript content", async ({ page }) => {
    const codeBlocks = articleBody(page).locator("pre code");
    expect(await codeBlocks.count()).toBeGreaterThan(0);

    const firstCodeBlock = codeBlocks.first();
    await expect(firstCodeBlock).toContainText("tiny");
    await expect(firstCodeBlock).toContainText("console.log");
    await expect(firstCodeBlock).not.toContainText("[object Object]");
  });

  test("should not have hydration errors in console", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });
    await page.reload({ timeout: 60_000, waitUntil: "commit" });
    await expect(articleBody(page)).toBeVisible({ timeout: 30_000 });
    await expect(codeBlock(page)).toBeVisible({ timeout: 30_000 });
    const relevantErrors = consoleErrors.filter(
      (e) => !e.includes("Download the React DevTools") && !e.includes("React DevTools")
    );
    const hydrationErrors = relevantErrors.filter((e) =>
      ["hydration", "Hydration", "server rendered HTML", "client properties"].some((k) =>
        e.includes(k)
      )
    );
    expect(hydrationErrors.length).toBe(0);
  });

  test("should have proper syntax highlighting classes", async ({ page }) => {
    const codeBlocks = articleBody(page).locator('pre code[class*="language-"]');
    expect(await codeBlocks.count()).toBeGreaterThan(0);
  });

  test("should preserve code formatting and indentation", async ({ page }) => {
    const firstCodeBlock = codeBlock(page);
    const codeText = await firstCodeBlock.textContent();
    expect(codeText).toContain("tiny");
    expect(codeText).toContain(TEMPLATE_RETURN_LINE);
  });

  test("should handle code blocks without [object Object] artifacts", async ({ page }) => {
    const allCodeBlocks = articleBody(page).locator("pre code");
    const count = await allCodeBlocks.count();
    for (let i = 0; i < count; i++) {
      const text = await allCodeBlocks.nth(i).textContent();
      expect(text).not.toContain("[object Object]");
      if (text && text.trim().length > 0) expect(text.trim().length).toBeGreaterThan(0);
    }
  });

  test("should display readable JavaScript code", async ({ page }) => {
    const codeBlocks = articleBody(page).locator("pre code");
    const firstCode = await codeBlocks.first().textContent();
    expect(firstCode).toContain("tiny");
    expect(firstCode).toContain("greet");
  });

  test("should not break page layout", async ({ page }) => {
    await expect(page.locator("main")).toBeVisible();
    await expect(articleBody(page)).toBeVisible();
    const codeBlocks = articleBody(page).locator("pre code");
    for (let i = 0; i < (await codeBlocks.count()); i++) {
      const box = await codeBlocks.nth(i).boundingBox();
      expect(box?.width).toBeGreaterThan(0);
      expect(box?.height).toBeGreaterThan(0);
    }
  });
});
