import { expect } from "@playwright/test";
import { adminTest as test } from "../fixtures";

test.describe("Quick Memo Editor focus (admin)", () => {
  test("typing does not blur the editor", async ({ page }) => {
    await page.goto("/memos");

    // 页面中该 testid 同时用于容器与编辑器根节点，这里以可访问名称限定容器
    const container = page.getByRole("region", { name: "快速发布区域" });
    await container.waitFor({ state: "visible" });

    const editor = container.locator(".ProseMirror");
    await editor.waitFor({ state: "visible" });

    // Focus the editor and ensure it's focused
    await editor.click();
    await expect(editor).toBeFocused();

    // Type in small chunks and assert focus remains
    // NOTE: Use keyboard.insertText to avoid IME issues in headless CI
    const chunks = ["这是一次", " 焦点", " 稳定性", " 测试"];
    for (const chunk of chunks) {
      await editor.click(); // ensure caret inside editor
      await expect(editor).toBeFocused();
      await page.keyboard.insertText(chunk);
      await expect(editor).toBeFocused();
    }

    // Content should reflect typed text (final chunk)
    await expect(editor).toContainText("测试");

    // Publish button should become enabled after typing
    const publishButton = container.getByRole("button", { name: "发布 Memo" });
    await expect(publishButton).toBeEnabled();
  });
});
