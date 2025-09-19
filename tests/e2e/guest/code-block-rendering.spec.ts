import { expect, test } from "@playwright/test";

test.describe("Code Block Rendering", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/posts/nodejs-performance-optimization");
    await page.waitForLoadState("networkidle");
  });

  test("should display code blocks with correct JavaScript content", async ({ page }) => {
    const codeBlocks = page.locator("code");
    await expect(codeBlocks).toHaveCount(2);

    const firstCodeBlock = codeBlocks.first();
    await expect(firstCodeBlock).toContainText("// 使用 async/await");
    await expect(firstCodeBlock).toContainText("async function processData()");
    await expect(firstCodeBlock).toContainText("const data = await fetchData()");
    await expect(firstCodeBlock).toContainText("console.error('处理失败:', error)");
    await expect(firstCodeBlock).not.toContainText("[object Object]");

    const secondCodeBlock = codeBlocks.nth(1);
    await expect(secondCodeBlock).toContainText("const cluster = require('cluster')");
    await expect(secondCodeBlock).toContainText("const numCPUs = require('os').cpus().length");
    await expect(secondCodeBlock).toContainText("if (cluster.isMaster)");
    await expect(secondCodeBlock).toContainText("cluster.fork()");
    await expect(secondCodeBlock).not.toContainText("[object Object]");
  });

  test("should not have hydration errors in console", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });
    await page.reload();
    await page.waitForLoadState("networkidle");
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
    const codeBlocks = page.locator('code[class*="language-"]');
    await expect(codeBlocks).toHaveCount(2);
    const jsCodeBlocks = page.locator("code.language-javascript");
    await expect(jsCodeBlocks).toHaveCount(2);
  });

  test("should preserve code formatting and indentation", async ({ page }) => {
    const firstCodeBlock = page.locator("code").first();
    const codeText = await firstCodeBlock.textContent();
    expect(codeText).toContain("async function processData()");
    expect(codeText).toContain("try {");
    expect(codeText).toContain("} catch (error) {");
    expect(codeText).toMatch(/async function processData\(\)\s*\{/);
  });

  test("should handle code blocks without [object Object] artifacts", async ({ page }) => {
    const allCodeBlocks = page.locator("code");
    const count = await allCodeBlocks.count();
    for (let i = 0; i < count; i++) {
      const text = await allCodeBlocks.nth(i).textContent();
      expect(text).not.toContain("[object Object]");
      if (text && text.trim().length > 0) expect(text.trim().length).toBeGreaterThan(0);
    }
  });

  test("should display readable JavaScript code", async ({ page }) => {
    const codeBlocks = page.locator("code");
    const firstCode = await codeBlocks.first().textContent();
    expect(firstCode).toMatch(/async\s+function\s+processData/);
    expect(firstCode).toMatch(/await\s+fetchData/);
    expect(firstCode).toMatch(/await\s+processResult/);
    expect(firstCode).toContain("console.error");

    const secondCode = await codeBlocks.nth(1).textContent();
    expect(secondCode).toMatch(/const\s+cluster\s*=\s*require/);
    expect(secondCode).toMatch(/const\s+numCPUs/);
    expect(secondCode).toContain("cluster.isMaster");
    expect(secondCode).toContain("cluster.fork");
  });

  test("should not break page layout", async ({ page }) => {
    await expect(page.locator("main")).toBeVisible();
    await expect(page.locator("article")).toBeVisible();
    const codeBlocks = page.locator("code");
    for (let i = 0; i < (await codeBlocks.count()); i++) {
      const box = await codeBlocks.nth(i).boundingBox();
      expect(box?.width).toBeGreaterThan(0);
      expect(box?.height).toBeGreaterThan(0);
    }
  });
});
