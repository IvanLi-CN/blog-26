import type { Locator, Page } from "@playwright/test";
import { expect, adminTest as test } from "./fixtures";

const DEMO_EDITOR_URL = "/admin/posts/editor?demo=true&slug=react-hooks-deep-dive";
const ADDITIVE_SELECTION_MODIFIER = process.platform === "darwin" ? "Meta" : "Control";

async function openDemoEditor(page: Page) {
  const response = await page.goto(DEMO_EDITOR_URL, {
    timeout: 60_000,
    waitUntil: "domcontentloaded",
  });
  expect(response?.status()).toBe(200);
  await expect(page.getByRole("heading", { name: "文章编辑器" })).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByRole("button", { name: "WYSIWYG" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Source" })).toBeVisible();
  await expect(page.getByRole("button", { name: "对照" })).toBeVisible();
}

async function expectSourceMarkdown(textarea: Locator) {
  await expect(textarea).toHaveValue(/# React Hooks 深度解析/);
  await expect(textarea).toHaveValue(/`useState`/);
  await expect(textarea).toHaveValue(/- 状态更新必须围绕用户动作组织。/);
  await expect(textarea).toHaveValue(/> 依赖数组不是优化开关/);
  await expect(textarea).toHaveValue(/```tsx/);
  await expect(textarea).toHaveValue(/function Counter\(\)/);
  await expect(textarea).toHaveValue(/useEffect\(\(\) =>/);
}

async function richMarkdownState(page: Page, rootSelector: string) {
  return page.locator(rootSelector).evaluate((root) => {
    const h1 = root.querySelector("h1");
    const h2 = root.querySelector("h2");
    const paragraph = root.querySelector("p");
    const inlineCode = root.querySelector("p code");
    const listItem = root.querySelector("li");
    const blockquote = root.querySelector("blockquote");
    const codeEditor = root.querySelector(".cm-editor");
    const tokenSpans = Array.from(root.querySelectorAll(".cm-content span[class]")).filter(
      (node) => (node.textContent ?? "").trim().length > 0
    );
    const tokenColors = Array.from(new Set(tokenSpans.map((node) => getComputedStyle(node).color)));

    return {
      text: root.textContent ?? "",
      h1Text: h1?.textContent ?? "",
      h2Text: h2?.textContent ?? "",
      h1Size: h1 ? parseFloat(getComputedStyle(h1).fontSize) : 0,
      paragraphSize: paragraph ? parseFloat(getComputedStyle(paragraph).fontSize) : 0,
      inlineCodeText: inlineCode?.textContent ?? "",
      inlineCodeBackground: inlineCode ? getComputedStyle(inlineCode).backgroundColor : "",
      listText: listItem?.textContent ?? "",
      blockquoteText: blockquote?.textContent ?? "",
      blockquoteBorderStyle: blockquote ? getComputedStyle(blockquote).borderTopStyle : "",
      codeText: codeEditor?.textContent ?? "",
      tokenCount: tokenSpans.length,
      tokenColorCount: tokenColors.length,
      contentEditable: root.querySelector(".ProseMirror")?.getAttribute("contenteditable"),
    };
  });
}

async function shellLayoutState(page: Page) {
  return page.locator(".admin-app-shell-grid").evaluate((grid) => {
    const sidebar = grid.querySelector("aside");
    const main = grid.querySelector('[data-testid="admin-shell-main"]');
    const sidebarRect = sidebar?.getBoundingClientRect();
    const mainRect = main?.getBoundingClientRect();

    return {
      sidebarWidth: sidebarRect?.width ?? 0,
      mainX: mainRect?.x ?? 0,
      mainWidth: mainRect?.width ?? 0,
      storedWidth: window.localStorage.getItem("admin-sidebar-width"),
    };
  });
}

function treeNameButton(page: Page, name: string) {
  return page.getByRole("button", { name, exact: true });
}

function expectRichMarkdownRendering(state: Awaited<ReturnType<typeof richMarkdownState>>) {
  expect(state.h1Text).toContain("React Hooks 深度解析");
  expect(state.h2Text).toContain("基础 Hooks");
  expect(state.h1Size).toBeGreaterThan(state.paragraphSize);
  expect(state.inlineCodeText).toContain("useState");
  expect(state.inlineCodeBackground).not.toBe("rgba(0, 0, 0, 0)");
  expect(state.listText).toContain("状态更新必须围绕用户动作组织");
  expect(state.blockquoteText).toContain("依赖数组不是优化开关");
  expect(state.blockquoteBorderStyle).toBe("solid");
  expect(state.codeText).toContain("function Counter()");
  expect(state.codeText).toContain("useEffect");
  expect(state.text).not.toContain("```tsx");
  expect(state.tokenCount).toBeGreaterThan(3);
  expect(state.tokenColorCount).toBeGreaterThan(1);
}

test.describe("Post editor Markdown modes", () => {
  test("source mode keeps raw Markdown syntax visible", async ({ page }) => {
    await openDemoEditor(page);

    await page.getByRole("button", { name: "Source" }).click();
    await expectSourceMarkdown(page.getByRole("textbox", { name: "Markdown source editor" }));
  });

  test("WYSIWYG renders Markdown structure and highlighted code", async ({ page }) => {
    await openDemoEditor(page);

    await page.getByRole("button", { name: "WYSIWYG" }).click();
    await expect(page.locator('[data-testid="content-input"] .ProseMirror')).toBeVisible();

    expectRichMarkdownRendering(await richMarkdownState(page, '[data-testid="content-input"]'));
  });

  test("compare preview renders Markdown with Milkdown read-only highlighting", async ({
    page,
  }) => {
    await openDemoEditor(page);

    await page.getByRole("button", { name: "对照" }).click();
    await expectSourceMarkdown(page.getByRole("textbox", { name: "Markdown source editor" }));
    await expect(page.locator('[data-testid="content-preview"] .ProseMirror')).toBeVisible();

    const previewState = await richMarkdownState(page, '[data-testid="content-preview"]');
    expectRichMarkdownRendering(previewState);
    expect(previewState.contentEditable).toBe("false");
  });

  test("desktop sidebar drag handle resizes the shell and persists width", async ({ page }) => {
    await openDemoEditor(page);

    const before = await shellLayoutState(page);
    const handle = page.getByRole("separator", { name: /调整侧边栏宽度/ });
    await expect(handle).toHaveAttribute("aria-valuemin", "232");
    await expect(handle).toHaveAttribute("aria-valuemax", "460");
    await expect(handle).toHaveAttribute("aria-valuenow", String(Math.round(before.sidebarWidth)));
    await handle.hover();
    await expect(page.getByText("拖动调整侧栏宽度，双击恢复默认")).toBeVisible();

    const box = await handle.boundingBox();
    if (!box) {
      throw new Error("Sidebar resize handle is not visible");
    }

    await page.mouse.move(box.x + box.width / 2, box.y + 120);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 116, box.y + 120, { steps: 8 });
    await page.mouse.up();

    const after = await shellLayoutState(page);
    expect(after.sidebarWidth).toBeGreaterThan(before.sidebarWidth + 90);
    expect(after.mainX).toBeGreaterThan(before.mainX + 90);
    expect(after.mainWidth).toBeLessThan(before.mainWidth - 90);
    expect(Number(after.storedWidth)).toBeGreaterThan(before.sidebarWidth + 90);
    await expect(handle).toHaveAttribute("aria-valuenow", String(Math.round(after.sidebarWidth)));

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "文章编辑器" })).toBeVisible();
    const reloaded = await shellLayoutState(page);
    expect(Math.abs(reloaded.sidebarWidth - after.sidebarWidth)).toBeLessThanOrEqual(2);

    await handle.dblclick();
    const reset = await shellLayoutState(page);
    expect(Math.abs(reset.sidebarWidth - 272)).toBeLessThanOrEqual(2);
    expect(reset.storedWidth).toBe("272");
  });

  test("file tree creates items in the selected directory and renames inline", async ({ page }) => {
    await openDemoEditor(page);

    await treeNameButton(page, "posts").click();

    await page.getByRole("button", { name: "新建文件" }).click();
    const fileNameInput = page.getByRole("textbox", { name: "文件名称" });
    await expect(fileNameInput).toHaveValue("untitled.md");
    await fileNameInput.fill("notes.md");
    await fileNameInput.press("Enter");
    const newFile = treeNameButton(page, "notes.md");
    await expect(newFile).toBeVisible();
    await newFile.click();
    await expect(page.getByText("local:content/posts/notes.md")).toBeVisible();
    await page.getByRole("button", { name: "Source" }).click();
    await expect(page.getByRole("textbox", { name: "Markdown source editor" })).toHaveValue("");

    await treeNameButton(page, "posts").click();
    await page.getByRole("button", { name: "新建目录" }).click();
    const directoryNameInput = page.getByRole("textbox", { name: "目录名称" });
    await expect(directoryNameInput).toHaveValue("new-folder");
    await directoryNameInput.fill("research");
    await directoryNameInput.press("Enter");
    await expect(treeNameButton(page, "research")).toBeVisible();
  });

  test("file tree context menu deletes an empty directory after confirmation", async ({ page }) => {
    await openDemoEditor(page);

    await treeNameButton(page, "posts").click();
    await page.getByRole("button", { name: "新建目录" }).click();
    const directoryNameInput = page.getByRole("textbox", { name: "目录名称" });
    await directoryNameInput.fill("to-delete");
    await directoryNameInput.press("Enter");
    await expect(treeNameButton(page, "to-delete")).toBeVisible();

    await page.getByRole("button", { name: "to-delete 更多操作" }).click();
    await page.getByRole("menuitem", { name: "删除" }).click();
    const deleteDialog = page.getByRole("dialog", { name: "确认删除" });
    await expect(deleteDialog).toBeVisible();
    await deleteDialog.getByRole("button", { name: "删除" }).click();
    await expect(treeNameButton(page, "to-delete")).toHaveCount(0);
  });

  test("file tree supports modifier multi-select and batch delete", async ({ page }) => {
    await openDemoEditor(page);

    await treeNameButton(page, "posts").click();

    for (const name of ["alpha.md", "beta.md", "gamma.md"]) {
      await page.getByRole("button", { name: "新建文件" }).click();
      const fileNameInput = page.getByRole("textbox", { name: "文件名称" });
      await fileNameInput.fill(name);
      await fileNameInput.press("Enter");
    }

    await treeNameButton(page, "alpha.md").click({ modifiers: [ADDITIVE_SELECTION_MODIFIER] });
    await treeNameButton(page, "gamma.md").click({ modifiers: ["Shift"] });
    await expect(page.getByText("已选中 3 项")).toBeVisible();

    await page.getByRole("button", { name: "删除" }).click();
    const deleteDialog = page.getByRole("dialog", { name: "确认删除" });
    await expect(deleteDialog).toBeVisible();
    await deleteDialog.getByRole("button", { name: "删除" }).click();

    await expect(treeNameButton(page, "alpha.md")).toHaveCount(0);
    await expect(treeNameButton(page, "beta.md")).toHaveCount(0);
    await expect(treeNameButton(page, "gamma.md")).toHaveCount(0);
  });

  test("file tree checkbox mode supports copy and paste into another directory", async ({
    page,
  }) => {
    await openDemoEditor(page);

    await treeNameButton(page, "posts").click();
    await page.getByRole("button", { name: "新建目录" }).click();
    const directoryNameInput = page.getByRole("textbox", { name: "目录名称" });
    await directoryNameInput.fill("archive");
    await directoryNameInput.press("Enter");
    await expect(treeNameButton(page, "archive")).toBeVisible();

    await page.getByRole("button", { name: "切换批量选择模式" }).click();
    await page.getByRole("checkbox", { name: "选择 react-hooks-deep-dive.md" }).click();
    await page.getByRole("button", { name: "复制" }).click();
    await expect(page.getByText("复制 1 项，右键目录或空白处后可粘贴。")).toBeVisible();

    const archiveDirectoryButton = page.getByRole("button", { name: "archive 目录" });
    await archiveDirectoryButton.focus();
    await page.keyboard.press("Shift+F10");
    await page.getByRole("menuitem", { name: "粘贴" }).click();
    await archiveDirectoryButton.press("Enter");
    await expect(treeNameButton(page, "react-hooks-deep-dive.md")).toHaveCount(2);
  });

  test("file tree blocks deleting a non-empty directory and surfaces the reason", async ({
    page,
  }) => {
    await openDemoEditor(page);

    await page.getByRole("button", { name: "posts 更多操作" }).click();
    await page.getByRole("menuitem", { name: "删除" }).click();
    const deleteDialog = page.getByRole("dialog", { name: "确认删除" });
    await expect(deleteDialog).toBeVisible();
    await deleteDialog.getByRole("button", { name: "删除" }).click();

    await expect(page.getByText("目录不为空，无法删除: content/posts")).toBeVisible();
    await expect(treeNameButton(page, "posts")).toBeVisible();
  });
});
