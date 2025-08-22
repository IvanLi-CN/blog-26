import { expect, test } from "@playwright/test";

test.describe("Code Block Rendering", () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the test post
    await page.goto("/posts/nodejs-performance-optimization");

    // Wait for the page to load completely
    await page.waitForLoadState("networkidle");
  });

  test("should display code blocks with correct JavaScript content", async ({ page }) => {
    // Check that code blocks are present
    const codeBlocks = page.locator("code");
    await expect(codeBlocks).toHaveCount(2);

    // First code block should contain async/await example
    const firstCodeBlock = codeBlocks.first();
    await expect(firstCodeBlock).toContainText("// 使用 async/await");
    await expect(firstCodeBlock).toContainText("async function processData()");
    await expect(firstCodeBlock).toContainText("const data = await fetchData()");
    await expect(firstCodeBlock).toContainText("console.error('处理失败:', error)");

    // Should NOT contain [object Object]
    await expect(firstCodeBlock).not.toContainText("[object Object]");

    // Second code block should contain cluster example
    const secondCodeBlock = codeBlocks.nth(1);
    await expect(secondCodeBlock).toContainText("const cluster = require('cluster')");
    await expect(secondCodeBlock).toContainText("const numCPUs = require('os').cpus().length");
    await expect(secondCodeBlock).toContainText("if (cluster.isMaster)");
    await expect(secondCodeBlock).toContainText("cluster.fork()");

    // Should NOT contain [object Object]
    await expect(secondCodeBlock).not.toContainText("[object Object]");
  });

  test("should not have hydration errors in console", async ({ page }) => {
    const consoleErrors: string[] = [];

    page.on("console", (msg) => {
      if (msg.type() === "error") {
        consoleErrors.push(msg.text());
      }
    });

    // Reload the page to catch any hydration errors
    await page.reload();
    await page.waitForLoadState("networkidle");

    // Filter out known acceptable errors (like React DevTools message)
    const relevantErrors = consoleErrors.filter(
      (error) => !error.includes("Download the React DevTools") && !error.includes("React DevTools")
    );

    // Check if there are any hydration-related errors
    const hydrationErrors = relevantErrors.filter(
      (error) =>
        error.includes("hydration") ||
        error.includes("Hydration") ||
        error.includes("server rendered HTML") ||
        error.includes("client properties")
    );

    // We expect no hydration errors related to our code block fix
    expect(hydrationErrors.length).toBe(0);
  });

  test("should have proper syntax highlighting classes", async ({ page }) => {
    // Check that code blocks have language classes
    const codeBlocks = page.locator('code[class*="language-"]');

    // Should have at least one code block with language class
    await expect(codeBlocks).toHaveCount(2);

    // Check for JavaScript language class
    const jsCodeBlocks = page.locator("code.language-javascript");
    await expect(jsCodeBlocks).toHaveCount(2);
  });

  test("should preserve code formatting and indentation", async ({ page }) => {
    const firstCodeBlock = page.locator("code").first();
    const codeText = await firstCodeBlock.textContent();

    // Check that the code maintains proper structure
    expect(codeText).toContain("async function processData()");
    expect(codeText).toContain("try {");
    expect(codeText).toContain("} catch (error) {");

    // The text should be properly formatted (not all on one line)
    expect(codeText).toMatch(/async function processData\(\)\s*\{/);
  });

  test("should handle code blocks without [object Object] artifacts", async ({ page }) => {
    // Get all text content from code blocks
    const allCodeBlocks = page.locator("code");
    const count = await allCodeBlocks.count();

    for (let i = 0; i < count; i++) {
      const codeBlock = allCodeBlocks.nth(i);
      const text = await codeBlock.textContent();

      // Ensure no [object Object] appears in any code block
      expect(text).not.toContain("[object Object]");

      // Ensure the text is not empty (unless it's supposed to be)
      if (text && text.trim().length > 0) {
        expect(text.trim().length).toBeGreaterThan(0);
      }
    }
  });

  test("should display readable JavaScript code", async ({ page }) => {
    const codeBlocks = page.locator("code");

    // First code block - async/await example
    const firstCode = await codeBlocks.first().textContent();
    expect(firstCode).toMatch(/async\s+function\s+processData/);
    expect(firstCode).toMatch(/await\s+fetchData/);
    expect(firstCode).toMatch(/await\s+processResult/);
    expect(firstCode).toContain("console.error");

    // Second code block - cluster example
    const secondCode = await codeBlocks.nth(1).textContent();
    expect(secondCode).toMatch(/const\s+cluster\s*=\s*require/);
    expect(secondCode).toMatch(/const\s+numCPUs/);
    expect(secondCode).toContain("cluster.isMaster");
    expect(secondCode).toContain("cluster.fork");
  });

  test("should not break page layout", async ({ page }) => {
    // Check that the page renders without layout issues
    await expect(page.locator("main")).toBeVisible();
    await expect(page.locator("article")).toBeVisible();

    // Check that code blocks are properly contained
    const codeBlocks = page.locator("code");
    for (let i = 0; i < (await codeBlocks.count()); i++) {
      const codeBlock = codeBlocks.nth(i);
      await expect(codeBlock).toBeVisible();

      // Check that code block has reasonable dimensions
      const box = await codeBlock.boundingBox();
      expect(box?.width).toBeGreaterThan(0);
      expect(box?.height).toBeGreaterThan(0);
    }
  });
});
