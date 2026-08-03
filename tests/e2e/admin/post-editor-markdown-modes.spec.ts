import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
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

async function openFileBrowserItem(page: Page, name: string, options: { dblClick?: boolean } = {}) {
  const item = page
    .getByTestId("editor-file-browser")
    .getByRole("button", { name, exact: true })
    .first();
  await expect(item).toBeVisible({ timeout: 30_000 });
  if (options.dblClick) {
    await item.dblclick();
    return;
  }
  await item.click();
}

async function expectSourceMarkdown(textarea: Locator) {
  await expect(textarea).toHaveValue(/^---\n[\s\S]*?\n---/);
  await expect(textarea).toHaveValue(/title: React Hooks 深度解析/);
  await expect(textarea).toHaveValue(/slug: react-hooks-deep-dive/);
  await expect(textarea).toHaveValue(/# React Hooks 深度解析/);
  await expect(textarea).toHaveValue(/`useState`/);
  await expect(textarea).toHaveValue(/- 状态更新必须围绕用户动作组织。/);
  await expect(textarea).toHaveValue(/> 依赖数组不是优化开关/);
  await expect(textarea).toHaveValue(/```tsx/);
  await expect(textarea).toHaveValue(/function Counter\(\)/);
  await expect(textarea).toHaveValue(/useEffect\(\(\) =>/);
}

function frontmatterEditor(page: Page) {
  return page.locator('[data-testid="frontmatter-block"] .cm-content');
}

async function expectFrontmatterText(page: Page, pattern: RegExp) {
  await expect(frontmatterEditor(page)).toContainText(pattern);
}

async function setFrontmatterText(page: Page, text: string) {
  const editor = page.getByRole("textbox", { name: "Frontmatter YAML editor" });
  await editor.click();
  await page.keyboard.press(`${ADDITIVE_SELECTION_MODIFIER}+A`);
  await page.keyboard.press("Backspace");
  await page.keyboard.insertText(text);
}

async function getDiagnosticLineEndCenters(page: Page, severity: "error" | "warning") {
  return page
    .locator(`[data-testid="frontmatter-block"] [data-frontmatter-diagnostic-line="${severity}"]`)
    .evaluateAll(
      (elements, currentSeverity) =>
        elements.map((element) => {
          const marker = element.querySelector<HTMLElement>(
            `[data-frontmatter-diagnostic-line-end="${currentSeverity}"]`
          );
          const markerRect = marker?.getBoundingClientRect();
          return {
            text: element.textContent || "",
            afterWidth: markerRect?.width ?? 0,
            centerX: markerRect ? markerRect.left + markerRect.width / 2 : 0,
          };
        }),
      severity
    );
}

async function getFrontmatterFirstGlyphX(page: Page, lineText: string) {
  return page
    .locator('[data-testid="frontmatter-block"] .cm-line')
    .filter({ hasText: lineText })
    .first()
    .evaluate((line) => {
      const walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        const text = walker.currentNode;
        const value = text.textContent ?? "";
        const firstNonWhitespace = value.search(/\S/);
        if (firstNonWhitespace < 0) continue;
        const range = document.createRange();
        range.setStart(text, firstNonWhitespace);
        range.setEnd(text, firstNonWhitespace + 1);
        return range.getBoundingClientRect().left;
      }
      return null;
    });
}

async function dragSelectFrontmatterText(page: Page, selector: string) {
  const target = page.locator(selector).first();
  const box = await target.boundingBox();
  expect(box).not.toBeNull();
  if (!box) return;

  await page.mouse.move(box.x + 120, box.y + 18);
  await page.mouse.down();
  await page.mouse.move(box.x + 360, box.y + 18, { steps: 12 });
  await page.mouse.up();
}

async function getSelectedFrontmatterText(page: Page) {
  return page.evaluate(() => window.getSelection()?.toString() ?? "");
}

async function getFrontmatterSelectionVisualState(page: Page, selector: string) {
  return page
    .locator(selector)
    .first()
    .evaluate((element) => {
      const root = element.closest('[data-testid="frontmatter-block"]');
      const selection = window.getSelection();
      const range = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
      const rect = range?.getBoundingClientRect() ?? null;
      const highlight = root?.querySelector(".cm-selectionBackground");
      const highlightBackgroundColor =
        highlight instanceof HTMLElement ? getComputedStyle(highlight).backgroundColor : null;

      return {
        selectionText: selection?.toString() ?? "",
        rangeWidth: rect?.width ?? 0,
        rangeHeight: rect?.height ?? 0,
        highlightCount: root?.querySelectorAll(".cm-selectionBackground").length ?? 0,
        highlightBackgroundColor,
      };
    });
}

async function getFrontmatterAutosizeMetrics(page: Page) {
  return page.getByTestId("frontmatter-block").evaluate((block) => {
    const content = block.querySelector(".frontmatter-codemirror .cm-content");
    const scroller = block.querySelector(".frontmatter-codemirror .cm-scroller");
    const lines = content ? Array.from(content.querySelectorAll(".cm-line")) : [];
    const contentRect = content?.getBoundingClientRect();
    const lastLineBottom = lines.length
      ? Math.max(
          ...lines.map((line) => {
            const lineRect = line.getBoundingClientRect();
            return lineRect.bottom - (contentRect?.top ?? 0);
          })
        )
      : 0;

    return {
      rootHeight: block.getBoundingClientRect().height,
      contentHeight: contentRect?.height ?? 0,
      scrollerHeight: scroller?.getBoundingClientRect().height ?? 0,
      scrollerScrollHeight: scroller instanceof HTMLElement ? scroller.scrollHeight : 0,
      scrollerScrollTop: scroller instanceof HTMLElement ? scroller.scrollTop : 0,
      lineCount: lines.length,
      bottomGap: (contentRect?.height ?? 0) - lastLineBottom,
    };
  });
}

async function expectFrontmatterBlock(page: Page) {
  await expect(page.getByTestId("frontmatter-block")).toBeVisible();
  await expectFrontmatterText(page, /title: React Hooks 深度解析/);
  await expectFrontmatterText(page, /slug: react-hooks-deep-dive/);
  const frontmatterMetrics = await page
    .getByRole("textbox", { name: "Frontmatter YAML editor" })
    .evaluate((element) => ({
      clientHeight: element.clientHeight,
      scrollHeight: element.scrollHeight,
      overflowY: getComputedStyle(element).overflowY,
    }));
  expect(["hidden", "visible"]).toContain(frontmatterMetrics.overflowY);
  expect(frontmatterMetrics.scrollHeight).toBeLessThanOrEqual(frontmatterMetrics.clientHeight + 1);
}

async function expectFrontmatterFocusState(page: Page) {
  const focusState = await page.getByTestId("frontmatter-block").evaluate((element) => {
    const styles = getComputedStyle(element);
    return {
      borderColor: styles.borderColor,
      boxShadow: styles.boxShadow,
    };
  });

  expect(focusState.boxShadow).not.toBe("none");
  expect(focusState.boxShadow).toContain("rgb");
  expect(focusState.borderColor).not.toBe("rgba(0, 0, 0, 0)");
}

async function expectWysiwygTextColumnAlignment(page: Page) {
  const titleLeft = await page
    .locator("div.text-base.font-semibold")
    .filter({ hasText: "React Hooks 深度解析" })
    .first()
    .evaluate((element) => element.getBoundingClientRect().left);
  const frontmatterTextLeft = await page
    .locator('[data-testid="frontmatter-block"] .cm-content')
    .evaluate((element) => {
      const styles = getComputedStyle(element);
      return element.getBoundingClientRect().left + parseFloat(styles.paddingLeft || "0");
    });
  const bodyTextLeft = await page
    .locator('[data-testid="content-input"] .ProseMirror')
    .evaluate((element) => {
      const styles = getComputedStyle(element);
      return element.getBoundingClientRect().left + parseFloat(styles.paddingLeft || "0");
    });

  expect(Math.abs(frontmatterTextLeft - bodyTextLeft)).toBeLessThanOrEqual(2);
  expect(titleLeft).toBeLessThan(bodyTextLeft);
}

async function expectFrontmatterBodyRhythm(page: Page) {
  const spacing = await page.evaluate(() => {
    const frontmatter = document.querySelector('[data-testid="frontmatter-block"]');
    const prose = document.querySelector('[data-testid="content-input"] .ProseMirror');
    const firstHeading = document.querySelector('[data-testid="content-input"] .ProseMirror h1');

    if (
      !(frontmatter instanceof Element) ||
      !(prose instanceof Element) ||
      !(firstHeading instanceof Element)
    ) {
      return null;
    }

    const frontRect = frontmatter.getBoundingClientRect();
    const proseRect = prose.getBoundingClientRect();
    const headingRect = firstHeading.getBoundingClientRect();

    return {
      gapFrontToProse: Math.round(proseRect.top - frontRect.bottom),
      gapFrontToHeading: Math.round(headingRect.top - frontRect.bottom),
      gapProseToHeading: Math.round(headingRect.top - proseRect.top),
    };
  });

  expect(spacing).not.toBeNull();
  expect(spacing?.gapFrontToProse).toBe(16);
  expect(spacing?.gapProseToHeading).toBeLessThanOrEqual(28);
  expect(spacing?.gapFrontToHeading).toBeLessThanOrEqual(44);
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
      blockquoteQuote: blockquote ? getComputedStyle(blockquote, "::before").content : "",
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

async function sidebarSelectionFooterState(page: Page) {
  return page.getByTestId("sidebar-selection-footer").evaluate((footer) => {
    const footerRect = footer.getBoundingClientRect();
    const aside = footer.closest("aside");
    const host = footer.parentElement;
    const card = aside?.querySelector<HTMLElement>('[data-testid="admin-sidebar-card"]');
    const asideRect = aside?.getBoundingClientRect();
    const hostRect = host?.getBoundingClientRect();
    const cardRect = card?.getBoundingClientRect();
    const count = footer.querySelector<HTMLElement>('[data-testid="sidebar-selection-count"]');
    const countRect = count?.getBoundingClientRect();
    const countStyle = count ? getComputedStyle(count) : null;
    const items = Array.from(
      footer.querySelectorAll<HTMLElement>('button,[data-testid="sidebar-selection-count"]')
    ).filter((item) => getComputedStyle(item).visibility !== "hidden");
    const buttons = Array.from(footer.querySelectorAll<HTMLButtonElement>("button")).filter(
      (button) => getComputedStyle(button).visibility !== "hidden"
    );
    const firstButtonRect = buttons[0]?.getBoundingClientRect();
    const rowTops: number[] = [];
    for (const item of items) {
      const top = Math.round(item.getBoundingClientRect().top - footerRect.top);
      if (!rowTops.some((value) => Math.abs(value - top) <= 4)) {
        rowTops.push(top);
      }
    }

    return {
      footerMode: footer.getAttribute("data-footer-mode"),
      hasHorizontalOverflow: footer.scrollWidth - footer.clientWidth > 1,
      rowCount: rowTops.length,
      countText: count?.textContent?.trim() ?? "",
      countTop: countRect ? countRect.top - footerRect.top : 0,
      countLeft: countRect ? countRect.left - footerRect.left : 0,
      countWidth: countRect?.width ?? 0,
      countHeight: countRect?.height ?? 0,
      countWhiteSpace: countStyle?.whiteSpace ?? "",
      countFlexShrink: countStyle?.flexShrink ?? "",
      countRight: countRect ? countRect.right - footerRect.left : 0,
      firstButtonLeft: firstButtonRect ? firstButtonRect.left - footerRect.left : 0,
      firstButtonWidth: firstButtonRect?.width ?? 0,
      firstButtonHeight: firstButtonRect?.height ?? 0,
      footerWidth: footerRect.width,
      hostWidth: hostRect?.width ?? 0,
      asideWidth: asideRect?.width ?? 0,
      cardWidth: cardRect?.width ?? 0,
      iconOnlyButtonCount: buttons.filter((button) => button.textContent?.trim().length === 0)
        .length,
      textButtonCount: buttons.filter((button) => button.textContent?.trim().length !== 0).length,
    };
  });
}

async function sidebarSelectionFooterRows(page: Page) {
  return page.getByTestId("sidebar-selection-footer").evaluate((footer) => {
    const footerRect = footer.getBoundingClientRect();
    const items = Array.from(
      footer.querySelectorAll<HTMLElement>('button,[data-testid="sidebar-selection-count"]')
    ).filter((item) => getComputedStyle(item).visibility !== "hidden");

    const rows = new Map<number, Array<{ left: number; label: string }>>();

    for (const item of items) {
      const rect = item.getBoundingClientRect();
      const top = Math.round(rect.top - footerRect.top);
      const left = Math.round(rect.left - footerRect.left);
      const label =
        item.getAttribute("aria-label")?.trim() ||
        item.textContent?.trim() ||
        item.getAttribute("title")?.trim() ||
        "";
      const bucket = Array.from(rows.keys()).find((value) => Math.abs(value - top) <= 4) ?? top;
      const row = rows.get(bucket) ?? [];
      row.push({ left, label });
      rows.set(bucket, row);
    }

    return Array.from(rows.entries())
      .sort((left, right) => left[0] - right[0])
      .map(([, row]) =>
        row.sort((left, right) => left.left - right.left).map((item) => item.label)
      );
  });
}

async function sidebarFloatingFooterHostState(page: Page) {
  return page.getByTestId("admin-sidebar-floating-footer-host").evaluate((host) => {
    const aside = host.closest("aside");
    const card = aside?.querySelector<HTMLElement>('[data-testid="admin-sidebar-card"]');
    const footer = host.querySelector<HTMLElement>('[data-testid="sidebar-selection-footer"]');
    const hostRect = host.getBoundingClientRect();
    const asideRect = aside?.getBoundingClientRect();
    const cardRect = card?.getBoundingClientRect();
    const footerRect = footer?.getBoundingClientRect();

    return {
      hostParentTestId:
        host.parentElement?.getAttribute("data-testid") ??
        host.parentElement?.closest("[data-testid]")?.getAttribute("data-testid") ??
        "",
      hostPosition: getComputedStyle(host).position,
      hostWidth: hostRect.width,
      asideWidth: asideRect?.width ?? 0,
      cardWidth: cardRect?.width ?? 0,
      footerWidth: footerRect?.width ?? 0,
      hostLeftInset: asideRect ? hostRect.left - asideRect.left : 0,
      hostRightInset: asideRect ? asideRect.right - hostRect.right : 0,
      hostBottomInset: asideRect ? asideRect.bottom - hostRect.bottom : 0,
      footerLeftInset: footerRect ? footerRect.left - hostRect.left : 0,
      footerRightInset: footerRect ? hostRect.right - footerRect.right : 0,
    };
  });
}

async function sidebarTreeBottomState(page: Page, lastVisibleName: string) {
  const treeScroll = page.locator('[data-testid="editor-file-browser"] .admin-scrollbar').first();
  await treeScroll.evaluate((node) => {
    node.scrollTop = node.scrollHeight;
  });
  await expect(treeNameButton(page, lastVisibleName)).toBeVisible();

  const scrollBox = await treeScroll.boundingBox();
  const rowBox = await treeNameButton(page, lastVisibleName).boundingBox();
  const footerHostBox = await page.getByTestId("admin-sidebar-floating-footer-host").boundingBox();

  expect(scrollBox).not.toBeNull();
  expect(rowBox).not.toBeNull();
  expect(footerHostBox).not.toBeNull();

  return {
    bottomGap:
      scrollBox && rowBox
        ? scrollBox.y + scrollBox.height - (rowBox.y + rowBox.height)
        : Number.POSITIVE_INFINITY,
    footerGap:
      rowBox && footerHostBox
        ? footerHostBox.y - (rowBox.y + rowBox.height)
        : Number.POSITIVE_INFINITY,
  };
}

async function ensureBlogDirectoryExpanded(page: Page) {
  if (
    (await treeNameButton(page, "alpha.md").count()) > 0 ||
    (await treeNameButton(page, "01-react-hooks-deep-dive.md").count()) > 0
  ) {
    return;
  }

  const blogDirectory = treeDirectoryButton(page, "blog");
  if (await blogDirectory.count()) {
    await blogDirectory.click();
    if ((await treeNameButton(page, "alpha.md").count()) > 0) {
      await expect(treeNameButton(page, "alpha.md")).toBeVisible();
    } else {
      await expect(treeNameButton(page, "01-react-hooks-deep-dive.md")).toBeVisible();
    }
    return;
  }

  await expect(blogDirectory).toBeVisible();
  await blogDirectory.click();
  if ((await treeNameButton(page, "alpha.md").count()) > 0) {
    await expect(treeNameButton(page, "alpha.md")).toBeVisible();
  } else {
    await expect(treeNameButton(page, "01-react-hooks-deep-dive.md")).toBeVisible();
  }
}

async function ensureHardwareDirectoryExpanded(page: Page) {
  if (
    (await treeNameButton(page, "电子负载开发笔记.md").count()) > 0 &&
    (await treeNameButton(page, "USB-C Safe5V 诱骗器").count()) > 0 &&
    (await treeNameButton(page, "oversized-log.txt").count()) > 0
  ) {
    return;
  }

  const hardwareDirectory = treeDirectoryButton(page, "Hardware");
  await expect(hardwareDirectory).toBeVisible();
  await hardwareDirectory.click();
  await expect(treeNameButton(page, "电子负载开发笔记.md")).toBeVisible();
  await expect(treeNameButton(page, "USB-C Safe5V 诱骗器")).toBeVisible();
  await expect(treeNameButton(page, "oversized-log.txt")).toBeVisible();
}

async function maybeCaptureSidebarProof(page: Page, filename: string) {
  if (process.env.PLAYWRIGHT_CAPTURE_PROOF !== "1") {
    return;
  }

  const outputDir = resolve(process.cwd(), "test-results/proofs");
  mkdirSync(outputDir, { recursive: true });
  const screenshotPath = resolve(outputDir, filename);
  await page.getByTestId("admin-sidebar-card").screenshot({ path: screenshotPath });
  console.log(`proof-screenshot=${screenshotPath}`);
}

function treeNameButton(page: Page, name: string) {
  return page.getByTestId("editor-file-browser").getByRole("button", { name, exact: true }).first();
}

function treeDirectoryButton(page: Page, name: string) {
  return page.locator(`button.pointer-events-auto[aria-label="${name} 目录"]`).first();
}

async function clickTreeRowBackground(page: Page, name: string) {
  const button = treeNameButton(page, name);
  await button.scrollIntoViewIfNeeded();

  const point = await button.evaluate((node) => {
    const row = node.parentElement?.parentElement;
    const rowRect = row?.getBoundingClientRect();
    const nameRect = node.getBoundingClientRect();
    if (!rowRect) {
      throw new Error(`Tree row not found for ${node.textContent ?? "unknown"}`);
    }

    return {
      x: Math.min(rowRect.right - 52, nameRect.left + 12),
      y: rowRect.top + 6,
    };
  });

  await page.mouse.click(point.x, point.y);
}

async function treeRowPoint(page: Page, name: string) {
  const button = treeNameButton(page, name);
  await button.scrollIntoViewIfNeeded();

  return button.evaluate((node) => {
    const rect = node.getBoundingClientRect();

    return {
      x: rect.left + Math.min(rect.width / 2, 24),
      y: rect.top + rect.height / 2,
    };
  });
}

function treeMoreActionsButton(page: Page, name: string) {
  return page.getByRole("button", { name: `${name} 更多操作`, exact: true }).first();
}

function fileTreeOpenMenu(page: Page) {
  return page
    .locator('[role="menu"]')
    .filter({ has: page.locator('[role="menuitem"]') })
    .last();
}

async function fileTreeContextMenuState(page: Page) {
  return fileTreeOpenMenu(page).evaluate((menu) => {
    const sidebarCard = document.querySelector<HTMLElement>('[data-testid="admin-sidebar-card"]');
    const menuRect = menu.getBoundingClientRect();
    const sidebarRect = sidebarCard?.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    const probeX =
      menuRect.right > (sidebarRect?.right ?? 0)
        ? Math.min(menuRect.right - 6, (sidebarRect?.right ?? 0) + 24)
        : menuRect.right - 6;
    const probeY = menuRect.top + menuRect.height / 2;
    const hit = document.elementFromPoint(probeX, probeY) as HTMLElement | null;
    const hitMenu = hit?.closest('[role="menu"]');

    return {
      menuLeft: menuRect.left,
      menuRight: menuRect.right,
      menuTop: menuRect.top,
      menuBottom: menuRect.bottom,
      sidebarRight: sidebarRect?.right ?? 0,
      viewportWidth,
      viewportHeight,
      escapesSidebar: menuRect.right > (sidebarRect?.right ?? 0) + 1,
      probeInsideVisibleMenu: Boolean(hitMenu),
    };
  });
}

async function fileTreeMenuItems(page: Page) {
  return fileTreeOpenMenu(page)
    .locator('[role="menuitem"]')
    .evaluateAll((items) =>
      items.map((item) => ({
        label: item.textContent?.replace(/\s+/g, " ").trim() ?? "",
        disabled:
          item.getAttribute("aria-disabled") === "true" ||
          item.getAttribute("data-disabled") !== null ||
          item.hasAttribute("disabled"),
      }))
    );
}

async function treeRowVisualState(page: Page, name: string) {
  const button = treeNameButton(page, name);
  return button.evaluate((node) => {
    const row = node.closest<HTMLElement>('[data-tree-row="true"]');
    const className = row?.className ?? "";
    const style = row ? getComputedStyle(row) : null;
    const pendingBadge = row?.querySelector<HTMLElement>('[data-testid^="tree-pending-badge:"]');

    return {
      className,
      cutPending: row?.dataset.cutPending ?? "",
      selectedLike: className.includes("bg-primary/10"),
      activeLike: className.includes("bg-primary/6"),
      opacity: style?.opacity ?? "",
      busy: node.getAttribute("aria-busy") ?? "",
      pendingText: pendingBadge?.textContent?.replace(/\s+/g, " ").trim() ?? "",
    };
  });
}

async function expectTreeSelectionState(
  page: Page,
  selectedNames: string[],
  unselectedNames: string[]
) {
  for (const name of selectedNames) {
    const state = await treeRowVisualState(page, name);
    expect(state.selectedLike).toBe(true);
  }
  for (const name of unselectedNames) {
    const state = await treeRowVisualState(page, name);
    expect(state.selectedLike || state.activeLike).toBe(false);
  }
}

async function treeRowIconState(page: Page, name: string) {
  const button = treeNameButton(page, name);
  return button.evaluate((node) => {
    const row = node.parentElement?.parentElement as HTMLElement | null;
    const icon = row?.querySelector('span[title$="文件"]') as HTMLElement | null;
    const className = icon?.className ?? "";

    return {
      className,
      activeLike: className.includes("text-primary"),
    };
  });
}

function expectRichMarkdownRendering(state: Awaited<ReturnType<typeof richMarkdownState>>) {
  expect(state.h1Text).toContain("React Hooks 深度解析");
  expect(state.h2Text).toContain("基础 Hooks");
  expect(state.h1Size).toBeGreaterThan(state.paragraphSize);
  expect(state.inlineCodeText).toContain("useState");
  expect(state.inlineCodeBackground).not.toBe("rgba(0, 0, 0, 0)");
  expect(state.listText).toContain("状态更新必须围绕用户动作组织");
  expect(state.blockquoteText).toContain("依赖数组不是优化开关");
  expect(state.blockquoteBorderStyle).toBe("none");
  expect(state.blockquoteQuote).toContain("“");
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
    await expectFrontmatterBlock(page);
    await expect(page.locator('[data-testid="content-input"] .ProseMirror')).toBeVisible();

    expectRichMarkdownRendering(await richMarkdownState(page, '[data-testid="content-input"]'));
  });

  test("frontmatter block exposes a visible keyboard focus state", async ({ page }) => {
    await openDemoEditor(page);

    await page.getByRole("button", { name: "WYSIWYG" }).click();
    const frontmatter = page.getByRole("textbox", { name: "Frontmatter YAML editor" });
    await frontmatter.focus();

    await expectFrontmatterFocusState(page);
  });

  test("WYSIWYG body text aligns with the frontmatter text column", async ({ page }) => {
    await openDemoEditor(page);

    await page.getByRole("button", { name: "WYSIWYG" }).click();
    await expectFrontmatterBlock(page);
    await expectWysiwygTextColumnAlignment(page);
  });

  test("WYSIWYG keeps frontmatter and body in one vertical writing rhythm", async ({ page }) => {
    await openDemoEditor(page);

    await page.getByRole("button", { name: "WYSIWYG" }).click();
    await expectFrontmatterBlock(page);
    await expectFrontmatterBodyRhythm(page);
  });

  test("compare preview renders Markdown with Milkdown read-only highlighting", async ({
    page,
  }) => {
    await openDemoEditor(page);

    await page.getByRole("button", { name: "对照" }).click();
    await expectFrontmatterBlock(page);
    await expectSourceMarkdown(page.getByRole("textbox", { name: "Markdown source editor" }));
    await expect(page.locator('[data-testid="content-preview"] .ProseMirror')).toBeVisible();

    const previewState = await richMarkdownState(page, '[data-testid="content-preview"]');
    expectRichMarkdownRendering(previewState);
    expect(previewState.contentEditable).toBe("false");
  });

  test("WYSIWYG frontmatter block writes back to source frontmatter", async ({ page }) => {
    await openDemoEditor(page);

    await page.getByRole("button", { name: "WYSIWYG" }).click();
    await setFrontmatterText(
      page,
      "title: React Hooks 深度解析\nslug: react-hooks-deep-dive\ndraft: false\ncreatedVia: demo"
    );

    await page.getByRole("button", { name: "Source" }).click();
    await expect(page.getByRole("textbox", { name: "Markdown source editor" })).toHaveValue(
      /^---\n[\s\S]*?\n---/
    );
    await expect(page.getByRole("textbox", { name: "Markdown source editor" })).toHaveValue(
      /title: React Hooks 深度解析/
    );
    await expect(page.getByRole("textbox", { name: "Markdown source editor" })).toHaveValue(
      /slug: react-hooks-deep-dive/
    );
    await expect(page.getByRole("textbox", { name: "Markdown source editor" })).toHaveValue(
      /draft: false/
    );
    await expect(page.getByRole("textbox", { name: "Markdown source editor" })).toHaveValue(
      /createdVia: demo/
    );
  });

  test("WYSIWYG frontmatter block accepts keyboard spaces and new lines", async ({ page }) => {
    await openDemoEditor(page);

    await page.getByRole("button", { name: "WYSIWYG" }).click();
    await setFrontmatterText(page, "title: Draft Title\nsubtitle: First line");

    await page.getByRole("button", { name: "Source" }).click();
    await expect(page.getByRole("textbox", { name: "Markdown source editor" })).toHaveValue(
      /^---\ntitle: Draft Title\nsubtitle: First line\n---\n/
    );
  });

  test("WYSIWYG frontmatter block supports Tab and Shift-Tab indentation", async ({ page }) => {
    await openDemoEditor(page);

    await page.getByRole("button", { name: "WYSIWYG" }).click();
    await setFrontmatterText(page, "title: React Hooks 深度解析\ntags:\n  - React\n  - Hooks");

    const editor = page.getByRole("textbox", { name: "Frontmatter YAML editor" });
    await editor.focus();
    await page.keyboard.press(`${ADDITIVE_SELECTION_MODIFIER}+A`);
    await page.keyboard.press("Tab");

    await page.getByRole("button", { name: "Source" }).click();
    const source = page.getByRole("textbox", { name: "Markdown source editor" });
    await expect(source).toHaveValue(
      /^---\n {2}title: React Hooks 深度解析\n {2}tags:\n {4}- React\n {4}- Hooks\n---\n/
    );

    await page.getByRole("button", { name: "WYSIWYG" }).click();
    await editor.focus();
    await page.keyboard.press(`${ADDITIVE_SELECTION_MODIFIER}+A`);
    await page.keyboard.press("Shift+Tab");

    await page.getByRole("button", { name: "Source" }).click();
    await expect(source).toHaveValue(
      /^---\ntitle: React Hooks 深度解析\ntags:\n {2}- React\n {2}- Hooks\n---\n/
    );
  });

  test("WYSIWYG frontmatter block auto-sizes to short content", async ({ page }) => {
    await openDemoEditor(page);

    await page.getByRole("button", { name: "WYSIWYG" }).click();
    const initialMetrics = await getFrontmatterAutosizeMetrics(page);

    await setFrontmatterText(page, "title: Compact Note\nslug: compact-note");

    await expect.poll(async () => (await getFrontmatterAutosizeMetrics(page)).lineCount).toBe(2);

    const compactMetrics = await getFrontmatterAutosizeMetrics(page);
    expect(compactMetrics.rootHeight).toBeLessThan(initialMetrics.rootHeight - 48);
    expect(compactMetrics.bottomGap).toBeLessThan(28);
    expect(compactMetrics.scrollerScrollHeight).toBeLessThanOrEqual(
      compactMetrics.scrollerHeight + 1
    );
    expect(compactMetrics.scrollerScrollTop).toBe(0);
  });

  test("frontmatter block remains text-selectable in WYSIWYG and compare preview", async ({
    page,
  }) => {
    await openDemoEditor(page);

    await page.getByRole("button", { name: "WYSIWYG" }).click();
    await dragSelectFrontmatterText(page, '[data-testid="frontmatter-block"] .cm-content');
    await expect.poll(async () => getSelectedFrontmatterText(page)).toContain("Hooks 深度解析");
    await expect
      .poll(async () =>
        getFrontmatterSelectionVisualState(page, '[data-testid="frontmatter-block"] .cm-content')
      )
      .toMatchObject(
        expect.objectContaining({
          selectionText: expect.stringContaining("Hooks 深度解析"),
          highlightCount: expect.any(Number),
        })
      );
    await expect
      .poll(async () =>
        getFrontmatterSelectionVisualState(page, '[data-testid="frontmatter-block"] .cm-content')
      )
      .not.toMatchObject({
        highlightBackgroundColor: "rgba(0, 0, 0, 0)",
      });

    await page.getByRole("button", { name: "对照" }).click();
    await dragSelectFrontmatterText(
      page,
      '[data-testid="frontmatter-block"][data-frontmatter-readonly="true"] .cm-content'
    );
    await expect.poll(async () => getSelectedFrontmatterText(page)).toContain("Hooks 深度解析");
    await expect
      .poll(async () =>
        getFrontmatterSelectionVisualState(
          page,
          '[data-testid="frontmatter-block"][data-frontmatter-readonly="true"] .cm-content'
        )
      )
      .toMatchObject(
        expect.objectContaining({
          selectionText: expect.stringContaining("Hooks 深度解析"),
          highlightCount: expect.any(Number),
        })
      );
    await expect
      .poll(async () =>
        getFrontmatterSelectionVisualState(
          page,
          '[data-testid="frontmatter-block"][data-frontmatter-readonly="true"] .cm-content'
        )
      )
      .not.toMatchObject({
        highlightBackgroundColor: "rgba(0, 0, 0, 0)",
      });
  });

  test("frontmatter title change updates the tab label and preserves unknown keys", async ({
    page,
  }) => {
    await openDemoEditor(page);

    await page.getByRole("button", { name: "WYSIWYG" }).click();
    await setFrontmatterText(
      page,
      "title: Hooks Title From Frontmatter\nslug: react-hooks-deep-dive\ndraft: false\ncreatedVia: demo"
    );

    await expect(page.getByTestId("editor-active-title")).toHaveText(
      "Hooks Title From Frontmatter"
    );

    await page.getByRole("button", { name: "Source" }).click();
    const source = page.getByRole("textbox", { name: "Markdown source editor" });
    await expect(source).toHaveValue(/title: Hooks Title From Frontmatter/);
    await expect(source).toHaveValue(/createdVia: demo/);
  });

  test("frontmatter block respects explicit YAML deletion of unknown keys", async ({ page }) => {
    await openDemoEditor(page);

    await page.getByRole("button", { name: "WYSIWYG" }).click();
    await setFrontmatterText(
      page,
      "title: React Hooks 深度解析\nslug: react-hooks-deep-dive\ndraft: false"
    );

    await page.getByRole("button", { name: "Source" }).click();
    await expect(page.getByRole("textbox", { name: "Markdown source editor" })).not.toHaveValue(
      /createdVia: demo/
    );
  });

  test("frontmatter editor shows field completion and tag suggestions", async ({ page }) => {
    await openDemoEditor(page);

    await page.getByRole("button", { name: "WYSIWYG" }).click();
    await setFrontmatterText(page, "pub");
    await expect(page.locator(".cm-tooltip-autocomplete")).toContainText("publishDate");

    await setFrontmatterText(page, "tags:\n  - Re");
    await expect(page.locator(".cm-tooltip-autocomplete")).toContainText("React");
  });

  test("frontmatter errors block saving until fixed", async ({ page }) => {
    await openDemoEditor(page);
    const frontmatterHeader = page.getByTestId("frontmatter-block-header");
    const initialHeaderHeight = await frontmatterHeader.evaluate(
      (element) => element.getBoundingClientRect().height
    );

    await page.getByRole("button", { name: "Source" }).click();
    const sourceEditor = page.getByRole("textbox", { name: "Markdown source editor" });
    await sourceEditor.fill(`---
title: Broken Draft
slug: broken-draft
tags: true
publishDate: not-a-date
---

# Broken Draft`);
    await expect(sourceEditor).toHaveValue(/title: Broken Draft/);
    await expect(page.getByTestId("editor-status-badge")).toContainText("未保存");
    await expect(
      page.locator("div.text-base.font-semibold").filter({ hasText: "Broken Draft" }).first()
    ).toBeVisible();
    await page.getByRole("button", { name: "WYSIWYG" }).click();
    const errorMarker = page.getByTestId("frontmatter-diagnostics-error");
    await expect(errorMarker).toBeVisible();
    await expect(page.getByText("tags 必须写成数组：")).toHaveCount(0);
    await expect(page.getByText("publishDate 必须是可解析的日期文本。")).toHaveCount(0);
    await expect(
      page.locator('[data-testid="frontmatter-block"] [data-frontmatter-diagnostic-line]')
    ).toHaveCount(2);
    await expect(
      page.locator('[data-testid="frontmatter-block"] [data-frontmatter-diagnostic-mark="error"]')
    ).toHaveCount(2);
    await expect(
      page.locator(
        '[data-testid="frontmatter-block"] [data-frontmatter-diagnostic-line-end="error"]'
      )
    ).toHaveCount(2);
    const lineEndCenters = await getDiagnosticLineEndCenters(page, "error");
    expect(lineEndCenters).toHaveLength(2);
    expect(lineEndCenters[0]?.afterWidth ?? 0).toBeGreaterThan(0);
    expect(
      Math.abs((lineEndCenters[0]?.centerX ?? 0) - (lineEndCenters[1]?.centerX ?? 0))
    ).toBeLessThanOrEqual(1);
    await expect(
      page
        .locator('[data-testid="frontmatter-block"] [data-frontmatter-diagnostic-line-end="error"]')
        .first()
    ).toHaveCSS("cursor", "help");
    await expect(
      page
        .locator('[data-testid="frontmatter-block"] [data-frontmatter-diagnostic-line-end="error"]')
        .first()
    ).not.toHaveAttribute("title", /.+/);
    await expect(
      page
        .locator('[data-testid="frontmatter-block"] [data-frontmatter-diagnostic-mark="error"]')
        .first()
    ).not.toHaveAttribute("title", /.+/);
    const erroredHeaderHeight = await frontmatterHeader.evaluate(
      (element) => element.getBoundingClientRect().height
    );
    expect(Math.abs(erroredHeaderHeight - initialHeaderHeight)).toBeLessThanOrEqual(1);
    const titleFirstGlyphX = await getFrontmatterFirstGlyphX(page, "title: Broken Draft");
    const tagsFirstGlyphX = await getFrontmatterFirstGlyphX(page, "tags: true");
    const publishDateFirstGlyphX = await getFrontmatterFirstGlyphX(page, "publishDate: not-a-date");
    expect(titleFirstGlyphX).not.toBeNull();
    expect(tagsFirstGlyphX).not.toBeNull();
    expect(publishDateFirstGlyphX).not.toBeNull();
    expect(Math.abs((titleFirstGlyphX ?? 0) - (tagsFirstGlyphX ?? 0))).toBeLessThanOrEqual(1);
    expect(Math.abs((titleFirstGlyphX ?? 0) - (publishDateFirstGlyphX ?? 0))).toBeLessThanOrEqual(
      1
    );

    await errorMarker.hover();
    const tooltip = page.getByRole("tooltip");
    await expect(tooltip).toContainText("tags 必须写成数组：");
    await expect(tooltip).toContainText("- React");
    await expect(tooltip).toContainText("- Hooks");
    await expect(tooltip).toContainText("publishDate 必须是可解析的日期文本。");
    await page
      .locator('[data-testid="frontmatter-block"] [data-frontmatter-diagnostic-line-end="error"]')
      .first()
      .hover();
    await expect(page.getByTestId("frontmatter-diagnostic-tooltip")).toContainText(
      "tags 必须写成数组："
    );

    await page.getByTestId("editor-save").click();
    await expect(
      page
        .getByTestId("admin-toast-content")
        .filter({ hasText: "Frontmatter 里还有错误，修复后才能保存。" })
    ).toContainText("Frontmatter 里还有错误，修复后才能保存。");
    await expect(
      page.getByTestId("admin-toast-content").filter({
        hasText: "tags 必须写成数组：",
      })
    ).toContainText("tags 必须写成数组：");
    await expect(
      page.getByTestId("admin-toast-content").filter({ hasText: "- React" })
    ).toContainText("- React");
    await expect(
      page.getByTestId("admin-toast-content").filter({ hasText: "- Hooks" })
    ).toContainText("- Hooks");
    await expect(
      page
        .getByTestId("admin-toast-content")
        .filter({ hasText: "publishDate 必须是可解析的日期文本。" })
    ).toContainText("publishDate 必须是可解析的日期文本。");
    await expect(
      page.getByTestId("admin-toast-content").filter({ hasText: "文章保存成功。" })
    ).toHaveCount(0);

    await page.getByRole("button", { name: "Source" }).click();
    await sourceEditor.fill(`---
title: Fixed Draft
publishDate: 2026-06-17
tags:
  - React
  - Hooks
category: frontend
---

# Fixed Draft`);
    await expect(sourceEditor).toHaveValue(/title: Fixed Draft/);
    await expect(page.getByTestId("editor-status-badge")).toContainText("未保存");
    await expect(
      page.locator("div.text-base.font-semibold").filter({ hasText: "Fixed Draft" }).first()
    ).toBeVisible();
    await page.getByRole("button", { name: "WYSIWYG" }).click();

    await expect(page.getByTestId("frontmatter-diagnostics-error")).toHaveCount(0);

    await page.getByTestId("editor-save").click();
    await expect(
      page.getByTestId("admin-toast-content").filter({ hasText: "文章保存成功。" })
    ).toContainText("文章保存成功。");
  });

  test("saving auto-fixes frontmatter tags indentation style", async ({ page }) => {
    await openDemoEditor(page);

    await page.getByRole("button", { name: "Source" }).click();
    const sourceEditor = page.getByRole("textbox", { name: "Markdown source editor" });
    await sourceEditor.fill(`---
title: Style Draft
slug: style-draft
tags:
    - React
    - Hooks
category: frontend
---

# Style Draft`);

    await page.getByRole("button", { name: "WYSIWYG" }).click();
    await expect(page.getByTestId("frontmatter-diagnostics-error")).toHaveCount(0);
    await expect(page.getByTestId("frontmatter-diagnostics-warning")).toHaveCount(0);

    await page.getByTestId("editor-save").click();
    await expect(
      page.getByTestId("admin-toast-content").filter({ hasText: "文章保存成功。" })
    ).toContainText("文章保存成功。");
    await expect(
      page
        .getByTestId("admin-toast-content")
        .filter({ hasText: "保存时已自动修复 Frontmatter 样式。" })
    ).toContainText("tags 列表缩进已整理为标准 YAML 数组样式。");
    await expect(page.getByTestId("editor-status-badge")).toContainText("已保存");
    await expectFrontmatterText(page, /tags:\s+- React\s+- Hooks/);

    await page.getByRole("button", { name: "Source" }).click();
    await expect(sourceEditor).toHaveValue(/tags:\n {2}- React\n {2}- Hooks/);
  });

  test("creating a new post keeps auto-fixed frontmatter on the saved tab", async ({ page }) => {
    await openDemoEditor(page);

    await page.getByTestId("editor-create-post").click();
    await expect(page.getByTestId("editor-status-badge")).toContainText("未保存");

    await page.getByRole("button", { name: "Source" }).click();
    const sourceEditor = page.getByRole("textbox", { name: "Markdown source editor" });
    await sourceEditor.fill(`---
title: Style Draft
slug: style-draft
tags:
    - React
    - Hooks
category: frontend
---

# Style Draft`);

    await page.getByTestId("editor-save").click();
    await expect(
      page.getByTestId("admin-toast-content").filter({ hasText: "已创建新草稿。" })
    ).toContainText("已创建新草稿。");
    await expect(
      page
        .getByTestId("admin-toast-content")
        .filter({ hasText: "保存时已自动修复 Frontmatter 样式。" })
    ).toContainText("tags 列表缩进已整理为标准 YAML 数组样式。");

    const savedTab = page.getByTestId("editor-tab").filter({ hasText: "Style Draft" }).first();
    await expect(savedTab).toBeVisible();
    await expect(page.getByTestId("editor-status-badge")).toContainText("已保存");
    await expect(savedTab.getByTestId("editor-tab-dirty-dot")).toHaveCount(0);
    await expect(page.getByTestId("editor-tab").filter({ hasText: "未命名文章" })).toHaveCount(0);
    await expect(sourceEditor).toHaveValue(/tags:\n {2}- React\n {2}- Hooks/);

    await page.waitForTimeout(600);

    await expect(page.getByTestId("editor-status-badge")).toContainText("已保存");
    await expect(savedTab.getByTestId("editor-tab-dirty-dot")).toHaveCount(0);
    await expect(sourceEditor).toHaveValue(/tags:\n {2}- React\n {2}- Hooks/);
  });

  test("opening a sample file keeps it saved until the user edits it", async ({ page }) => {
    await openDemoEditor(page);

    await openFileBrowserItem(page, "电子负载开发笔记.md");
    await expect(page.getByTestId("editor")).toContainText("已保存");
    await expect(page.getByTestId("editor-tab")).toHaveCount(2);

    await page.getByRole("button", { name: "Source" }).click();
    const source = page.getByRole("textbox", { name: "Markdown source editor" });
    await expect(source).toHaveValue(/title: 电子负载开发笔记/);
    await expect(source).toHaveValue(/!\[控制板\]\(\.\/assets\/load-board\.png\)/);
    await expect(source).toHaveValue(/\| OPA2277 \| SGM8552 \| AD8666 \|/);
    await expect(page.getByText("未保存")).toHaveCount(0);

    await source.fill(
      `---
title: 电子负载开发笔记
slug: electronic-load-notes
draft: false
public: true
tags:
  - Hardware
  - Circuit
---

# 电子负载开发笔记

更新正文`
    );
    await expect(page.getByText("未保存").first()).toBeVisible();
    const dirtyTab = page.getByTestId("editor-tab").filter({ hasText: "电子负载开发笔记" });
    await expect(dirtyTab.getByText("未保存")).toHaveCount(0);
    await expect(dirtyTab.getByTestId("editor-tab-dirty-dot")).toBeVisible();
    await dirtyTab.hover();
    await expect(page.getByRole("tooltip")).toContainText("电子负载开发笔记，未保存");
  });

  test("saving a file tab stays saved after the autosync loop runs", async ({ page }) => {
    await openDemoEditor(page);

    await openFileBrowserItem(page, "电子负载开发笔记.md");
    await page.getByRole("button", { name: "Source" }).click();

    const source = page.getByRole("textbox", { name: "Markdown source editor" });
    await source.fill(`---
title: 电子负载开发笔记
slug: electronic-load-notes
draft: false
public: true
tags:
  - Hardware
  - Circuit
---

# 电子负载开发笔记

保存后不应该重新变回未保存`);

    await expect(page.getByTestId("editor-status-badge")).toContainText("未保存");

    await page.getByTestId("editor-save").click();
    await expect(
      page.getByTestId("admin-toast-content").filter({ hasText: "文件保存成功。" })
    ).toContainText("文件保存成功。");
    await expect(page.getByTestId("editor-status-badge")).toContainText("已保存");

    await page.waitForTimeout(600);

    const fileTab = page.getByTestId("editor-tab").filter({ hasText: "电子负载开发笔记" }).first();
    await expect(page.getByTestId("editor-status-badge")).toContainText("已保存");
    await expect(fileTab.getByTestId("editor-tab-dirty-dot")).toHaveCount(0);
  });

  test("single click creates a temporary tab and double click promotes it to permanent", async ({
    page,
  }) => {
    await openDemoEditor(page);

    await openFileBrowserItem(page, "电子负载开发笔记.md");
    await expect(page.getByTestId("editor-tab")).toHaveCount(2);
    const temporaryTab = page.getByTestId("editor-tab").first();
    await expect(temporaryTab).toContainText("电子负载开发笔记");
    await expect(temporaryTab).toHaveAttribute("data-temporary", "true");
    await expect(temporaryTab.getByText("电子负载开发笔记")).toHaveCSS("font-style", "italic");

    await openFileBrowserItem(page, "使用 CH335F 构建一个支持独立供电的 2A2C USB HUB.md");
    await expect(page.getByTestId("editor-tab")).toHaveCount(2);
    await expect(page.getByTestId("editor-tab").first()).toContainText(
      "使用 CH335F 构建一个支持独立供电的 2A2C USB HUB"
    );

    await openFileBrowserItem(page, "通过 WebUSB 和 STM32 MCU 实现 SPI Flash 资源更新.md", {
      dblClick: true,
    });
    await expect(page.getByTestId("editor-tab")).toHaveCount(3);
    const permanentTab = page.getByTestId("editor-tab").first();
    await expect(permanentTab).toContainText("通过 WebUSB 和 STM32 MCU 实现 SPI Flash 资源更新");
    await expect(permanentTab).toHaveAttribute("data-temporary", "false");
    await expect(page.getByTestId("editor").locator("div.text-base.font-semibold")).toHaveText(
      "通过 WebUSB 和 STM32 MCU 实现 SPI Flash 资源更新"
    );

    await openFileBrowserItem(page, "学习笔记：电子负载实现原理.md");
    await expect(page.getByTestId("editor-tab")).toHaveCount(3);
    await expect(page.getByTestId("editor-tab").first()).toContainText(
      "学习笔记：电子负载实现原理"
    );
    await expect(
      page.getByRole("tab", { name: /通过 WebUSB 和 STM32 MCU 实现 SPI/ })
    ).toBeVisible();
    await expect(page.getByTestId("editor").locator("div.text-base.font-semibold")).toHaveText(
      "学习笔记：电子负载实现原理"
    );
  });

  test("file tree opens markdown files from the configured Hardware root", async ({ page }) => {
    await openDemoEditor(page);

    await ensureHardwareDirectoryExpanded(page);
    await openFileBrowserItem(page, "电子负载开发笔记.md");

    await expect(page.getByTestId("editor-tab").first()).toContainText("电子负载开发笔记");
    await expect(page.getByTestId("editor-tab").first()).toHaveAttribute("data-temporary", "true");
    await expectFrontmatterText(page, /title: 电子负载开发笔记/);
    await expect(page.getByText(/未找到文件/)).toHaveCount(0);
  });

  test("extensionless text files open in source-only mode without markdown-only controls", async ({
    page,
  }) => {
    await openDemoEditor(page);

    await ensureHardwareDirectoryExpanded(page);
    await openFileBrowserItem(page, "USB-C Safe5V 诱骗器", { dblClick: true });

    await expect(page.getByRole("heading", { name: "纯文本编辑器" })).toBeVisible();
    await expect(page.getByRole("link", { name: "返回文件浏览器" })).toBeVisible();
    await expect(page.getByRole("button", { name: "新建文章" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Source" })).toBeVisible();
    await expect(page.getByRole("button", { name: "WYSIWYG" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "对照" })).toHaveCount(0);
    await expect(page.getByTestId("frontmatter-block")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "前台预览" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "插入附件" })).toHaveCount(0);
    await expect(page.getByRole("textbox", { name: "Plain text editor" })).toHaveValue(
      /title=USB-C Safe5V 诱骗器/
    );
    await expect(page.getByRole("textbox", { name: "Plain text editor" })).toHaveValue(
      /cc_pull_down=5.1k/
    );
    await expect(page.getByRole("textbox", { name: "Plain text editor" })).toHaveValue(
      /image_sample=\.\/assets\/plain-preview-sample\.png/
    );
    await expect(page.getByRole("textbox", { name: "Plain text editor" })).toHaveValue(
      /video_sample=\.\/assets\/plain-preview-sample\.mp4/
    );
    await expect(page.getByRole("textbox", { name: "Plain text editor" })).toHaveValue(
      /markdown_image=!\[sample image\]\(\.\/assets\/plain-preview-sample\.png\)/
    );
    await expect(page.getByRole("textbox", { name: "Plain text editor" })).toHaveValue(
      /html_video=<video controls src="\.\/assets\/plain-preview-sample\.mp4"><\/video>/
    );
    await expect(page.getByRole("textbox", { name: "Plain text editor" })).toHaveValue(
      /markdown_link=\[sample video\]\(\.\/assets\/plain-preview-sample\.mp4\)/
    );
  });

  test("oversized text files are blocked with a clear error before opening", async ({ page }) => {
    await openDemoEditor(page);

    await ensureHardwareDirectoryExpanded(page);
    await openFileBrowserItem(page, "oversized-log.txt", { dblClick: true });

    await expect(
      page
        .locator(".Toastify__toast-container")
        .getByText("文件过大，禁止直接打开：Hardware/oversized-log.txt（最大支持 2 MiB）")
        .first()
    ).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Plain text editor" })).toHaveCount(0);
  });

  test("tab overflow exposes the opened files list on desktop and mobile", async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 900 });
    await openDemoEditor(page);

    for (const name of [
      "电子负载开发笔记.md",
      "使用 CH335F 构建一个支持独立供电的 2A2C USB HUB.md",
      "通过 WebUSB 和 STM32 MCU 实现 SPI Flash 资源更新.md",
      "学习笔记：电子负载实现原理.md",
    ]) {
      await openFileBrowserItem(page, name, { dblClick: true });
    }

    const strip = page.getByTestId("editor-tab-strip");
    const stripBox = await strip.boundingBox();
    expect(stripBox?.height).toBeLessThanOrEqual(42);
    const tops = await strip
      .locator('[data-testid="editor-tab"]')
      .evaluateAll((tabs) =>
        Array.from(new Set(tabs.map((tab) => Math.round(tab.getBoundingClientRect().top))))
      );
    expect(tops).toHaveLength(1);
    await expect(strip.getByText("未保存")).toHaveCount(0);

    const currentTab = strip.getByRole("tab", { name: /已保存/ }).first();
    await currentTab.hover();
    await expect(page.getByRole("tooltip")).toContainText("已保存");

    await page.getByTestId("editor-tabs-overflow").click();
    const overflowList = page.getByTestId("editor-tab-overflow-list");
    await expect(overflowList).toBeVisible();
    await expect(overflowList).toContainText("通过 WebUSB 和 STM32 MCU 实现 SPI Flash 资源更新");
    await overflowList
      .getByRole("button", {
        name: "通过 WebUSB 和 STM32 MCU 实现 SPI Flash 资源更新，已保存",
      })
      .click();
    await expect(overflowList).toBeHidden();
    await expect(page.getByTestId("editor").locator("div.text-base.font-semibold")).toHaveText(
      "通过 WebUSB 和 STM32 MCU 实现 SPI Flash 资源更新"
    );

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByTestId("editor-tabs-overflow")).toBeVisible();
    await page.getByTestId("editor-tabs-overflow").click();
    await expect(page.getByRole("heading", { name: "已打开文件" })).toBeVisible();
    await page.locator('[data-vaul-drawer][data-state="open"]').waitFor();
    await page.waitForTimeout(650);
    const drawerMetrics = await page
      .locator('[data-vaul-drawer][data-state="open"]')
      .evaluate((element) => {
        const rect = element.getBoundingClientRect();
        const styles = getComputedStyle(element);
        return {
          bottomGap: Math.abs(window.innerHeight - rect.bottom),
          direction: element.getAttribute("data-vaul-drawer-direction"),
          leftGap: Math.abs(rect.left),
          position: styles.position,
          rightGap: Math.abs(window.innerWidth - rect.right),
        };
      });
    expect(drawerMetrics.direction).toBe("bottom");
    expect(drawerMetrics.position).toBe("fixed");
    expect(drawerMetrics.bottomGap).toBeLessThanOrEqual(2);
    expect(drawerMetrics.leftGap).toBeLessThanOrEqual(2);
    expect(drawerMetrics.rightGap).toBeLessThanOrEqual(2);
  });

  test("WYSIWYG preserves a body-leading YAML fence instead of converting it into frontmatter", async ({
    page,
  }) => {
    await openDemoEditor(page);

    const source = page.getByRole("textbox", { name: "Markdown source editor" });
    await page.getByRole("button", { name: "Source" }).click();
    await source.fill(`---
title: React Hooks 深度解析
slug: react-hooks-deep-dive
draft: false
---
\`\`\`yaml
kind: example
value: true
\`\`\`

# React Hooks 深度解析

Body paragraph`);

    await page.getByRole("button", { name: "WYSIWYG" }).click();
    const prose = page.locator('[data-testid="content-input"] .ProseMirror');
    await prose.click();
    await page.keyboard.press("End");
    await page.keyboard.type(" updated");

    await page.getByRole("button", { name: "Source" }).click();
    await expect(source).toHaveValue(/```yaml\nkind: example\nvalue: true(?: updated)?\n```/);
    await expect(source).not.toHaveValue(/^---\nkind: example\nvalue: true\n---/);
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

    await treeNameButton(page, "blog").click();

    await page.getByRole("button", { name: "新建文件" }).click();
    const fileNameInput = page.getByRole("textbox", { name: "文件名称" });
    await expect(fileNameInput).toHaveValue("untitled.md");
    await fileNameInput.fill("notes.md");
    await fileNameInput.press("Enter");
    const newFile = treeNameButton(page, "notes.md");
    await expect(newFile).toBeVisible();
    await newFile.click();
    await expect(page.getByText("local:blog/notes.md")).toBeVisible();
    await page.getByRole("button", { name: "Source" }).click();
    await expect(page.getByRole("textbox", { name: "Markdown source editor" })).toHaveValue("");

    await treeNameButton(page, "blog").click();
    await page.getByRole("button", { name: "新建目录" }).click();
    const directoryNameInput = page.getByRole("textbox", { name: "目录名称" });
    await expect(directoryNameInput).toHaveValue("new-folder");
    await directoryNameInput.fill("research");
    await directoryNameInput.press("Enter");
    await expect(treeNameButton(page, "research")).toBeVisible();
  });

  test("file tree Enter enters inline rename for files and directories", async ({ page }) => {
    await openDemoEditor(page);

    await ensureBlogDirectoryExpanded(page);
    const fileButton = treeNameButton(page, "05-redis-caching-strategies.md");
    await fileButton.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("textbox", { name: "文件名称" })).toHaveValue(
      "05-redis-caching-strategies.md"
    );
    await page.keyboard.press("Escape");

    const archiveButton = treeNameButton(page, "archive");
    await archiveButton.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("textbox", { name: "目录名称" })).toHaveValue("archive");
    await page.keyboard.press("Escape");
  });

  test("file tree Space and arrow keys keep primary keyboard actions after Enter is reassigned", async ({
    page,
  }) => {
    await openDemoEditor(page);

    await ensureBlogDirectoryExpanded(page);
    const archiveButton = treeNameButton(page, "archive");
    await archiveButton.focus();
    await page.keyboard.press("ArrowLeft");
    await expect(treeNameButton(page, "2024-retrospective.md")).toHaveCount(0);
    await page.keyboard.press("ArrowRight");
    await expect(treeNameButton(page, "2024-retrospective.md")).toBeVisible();

    await page.keyboard.press(" ");
    await expect(treeNameButton(page, "2024-retrospective.md")).toHaveCount(0);

    const fileButton = treeNameButton(page, "05-redis-caching-strategies.md");
    await fileButton.focus();
    await page.keyboard.press(" ");
    await expect(page.getByRole("heading", { name: "Redis 缓存策略与坑位" })).toBeVisible();
  });

  test("file tree shows row-level pending feedback while inline rename is submitting", async ({
    page,
  }) => {
    await openDemoEditor(page);

    await ensureBlogDirectoryExpanded(page);
    const fileButton = treeNameButton(page, "05-redis-caching-strategies.md");
    await fileButton.focus();
    await page.keyboard.press("Enter");
    const fileNameInput = page.getByRole("textbox", { name: "文件名称" });
    await fileNameInput.fill("05-redis-caching-strategies-renamed.md");
    await fileNameInput.press("Enter");

    await expect(page.getByRole("textbox", { name: "文件名称" })).toHaveCount(0);
    await expect
      .poll(async () => (await treeRowVisualState(page, "05-redis-caching-strategies.md")).busy)
      .toBe("true");
    await expect
      .poll(
        async () => (await treeRowVisualState(page, "05-redis-caching-strategies.md")).pendingText
      )
      .toContain("重命名中");
    await expect(
      page.getByRole("button", { name: "05-redis-caching-strategies.md 更多操作" })
    ).toBeDisabled();

    await expect(treeNameButton(page, "05-redis-caching-strategies-renamed.md")).toBeVisible();
    await expect(treeNameButton(page, "05-redis-caching-strategies.md")).toHaveCount(0);
  });

  test("file tree rename failure keeps inline editing active with persistent error feedback", async ({
    page,
  }) => {
    await openDemoEditor(page);

    await ensureBlogDirectoryExpanded(page);
    const fileButton = treeNameButton(page, "05-redis-caching-strategies.md");
    await fileButton.focus();
    await page.keyboard.press("Enter");
    const fileNameInput = page.getByRole("textbox", { name: "文件名称" });
    await fileNameInput.fill("02-typescript-advanced-types.md");
    await fileNameInput.press("Enter");

    await expect(page.getByRole("textbox", { name: "文件名称" })).toHaveValue(
      "02-typescript-advanced-types.md"
    );
    await expect(page.getByRole("textbox", { name: "文件名称" })).toHaveAttribute(
      "aria-invalid",
      "true"
    );
    await expect(page.getByTestId("tree-inline-rename-error-input")).toBeVisible();
    await expect(page.getByTestId("editor-file-browser").getByText("重命名失败：")).toHaveCount(0);

    const toastViewport = page.locator(".Toastify__toast-container");
    const errorToast = toastViewport
      .getByTestId("admin-toast-content")
      .filter({ has: page.locator(".text-destructive") });
    await expect(errorToast).toBeVisible();
    await expect(errorToast).toContainText("失败");
    await page.waitForTimeout(4200);
    await expect(errorToast).toBeVisible();
    await expect(page.getByTestId("tree-inline-rename-error-input")).toBeVisible();
    await expect(treeNameButton(page, "02-typescript-advanced-types.md")).toBeVisible();
  });

  test("file tree row background opens the file even outside the text hit area", async ({
    page,
  }) => {
    await openDemoEditor(page);

    await clickTreeRowBackground(page, "05-redis-caching-strategies.md");

    await expect(page.getByRole("heading", { name: "Redis 缓存策略与坑位" })).toBeVisible();
    await expect(page.getByText("local:blog/05-redis-caching-strategies.md")).toBeVisible();
  });

  test("file tree context menu deletes an empty directory after confirmation", async ({ page }) => {
    await openDemoEditor(page);

    await treeNameButton(page, "blog").click();
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

    await treeNameButton(page, "blog").click();

    for (const name of ["alpha.md", "beta.md", "gamma.md"]) {
      await page.getByRole("button", { name: "新建文件" }).click();
      const fileNameInput = page.getByRole("textbox", { name: "文件名称" });
      await fileNameInput.fill(name);
      await fileNameInput.press("Enter");
    }

    await treeNameButton(page, "alpha.md").click({ modifiers: [ADDITIVE_SELECTION_MODIFIER] });
    await treeNameButton(page, "gamma.md").click({ modifiers: ["Shift"] });
    await expect(page.getByTestId("sidebar-selection-footer")).toBeVisible();
    await expect(page.getByTestId("sidebar-selection-count")).toHaveText("3项");

    await page.getByRole("button", { name: "删除" }).click();
    const deleteDialog = page.getByRole("dialog", { name: "确认删除" });
    await expect(deleteDialog).toBeVisible();
    await deleteDialog.getByRole("button", { name: "删除" }).click();

    await expect(treeNameButton(page, "alpha.md")).toHaveCount(0);
    await expect(treeNameButton(page, "beta.md")).toHaveCount(0);
    await expect(treeNameButton(page, "gamma.md")).toHaveCount(0);
  });

  test("plain click collapses an existing multi-selection to the clicked record", async ({
    page,
  }) => {
    await openDemoEditor(page);

    await treeNameButton(page, "blog").click();

    for (const name of ["alpha.md", "beta.md", "gamma.md"]) {
      await page.getByRole("button", { name: "新建文件" }).click();
      const fileNameInput = page.getByRole("textbox", { name: "文件名称" });
      await fileNameInput.fill(name);
      await fileNameInput.press("Enter");
    }

    await treeNameButton(page, "alpha.md").click({ modifiers: [ADDITIVE_SELECTION_MODIFIER] });
    await treeNameButton(page, "gamma.md").click({ modifiers: ["Shift"] });
    await expect(page.getByTestId("sidebar-selection-count")).toHaveText("3项");

    await treeNameButton(page, "beta.md").click();

    await expect(page.getByTestId("sidebar-selection-count")).toHaveText("1项");
    await expect(page.getByText("local:blog/beta.md")).toBeVisible();
  });

  test("file tree keeps the original shift anchor until Shift is released", async ({ page }) => {
    await openDemoEditor(page);

    await treeNameButton(page, "blog").click();

    for (const name of ["alpha.md", "bravo.md", "charlie.md", "delta.md"]) {
      await page.getByRole("button", { name: "新建文件" }).click();
      const fileNameInput = page.getByRole("textbox", { name: "文件名称" });
      await fileNameInput.fill(name);
      await fileNameInput.press("Enter");
    }

    await treeNameButton(page, "alpha.md").click();

    await page.keyboard.down("Shift");
    await treeNameButton(page, "charlie.md").click();
    await expect(page.getByTestId("sidebar-selection-footer")).toBeVisible();
    await expect(page.getByTestId("sidebar-selection-count")).toHaveText("3项");
    await expectTreeSelectionState(page, ["alpha.md", "bravo.md", "charlie.md"], ["delta.md"]);

    await treeNameButton(page, "delta.md").click();
    await expect(page.getByTestId("sidebar-selection-count")).toHaveText("4项");
    await expectTreeSelectionState(page, ["alpha.md", "bravo.md", "charlie.md", "delta.md"], []);

    await treeNameButton(page, "bravo.md").click();
    await expect(page.getByTestId("sidebar-selection-count")).toHaveText("2项");
    await expectTreeSelectionState(page, ["alpha.md", "bravo.md"], ["charlie.md", "delta.md"]);
    await page.keyboard.up("Shift");
  });

  test("demo file tree exposes nested directories that can be selected", async ({ page }) => {
    await openDemoEditor(page);

    if ((await treeDirectoryButton(page, "archive").count()) === 0) {
      await ensureBlogDirectoryExpanded(page);
    }
    await expect(treeDirectoryButton(page, "archive")).toBeVisible();
    await expect(treeDirectoryButton(page, "series")).toBeVisible();

    await treeNameButton(page, "archive").click({ modifiers: [ADDITIVE_SELECTION_MODIFIER] });
    await expect(page.getByTestId("sidebar-selection-footer")).toBeVisible();
    await expect(page.getByTestId("sidebar-selection-count")).toHaveText("1项");

    await treeNameButton(page, "01-react-hooks-deep-dive.md").click({
      modifiers: [ADDITIVE_SELECTION_MODIFIER],
    });
    await expect(page.getByTestId("sidebar-selection-count")).toHaveText("2项");
  });

  test("demo file tree includes a realistic blog directory with at least twelve immediate files", async ({
    page,
  }) => {
    await openDemoEditor(page);

    await ensureBlogDirectoryExpanded(page);

    await expect(treeNameButton(page, "01-react-hooks-deep-dive.md")).toBeVisible();
    await expect(treeNameButton(page, "12-content-taxonomy-migration-plan.md")).toBeVisible();
    await expect(page.getByRole("button", { name: /^\d{2}-.*\.md$/, exact: false })).toHaveCount(
      12
    );
  });

  test("file tree checkbox mode supports copy and paste into another directory", async ({
    page,
  }) => {
    await openDemoEditor(page);

    await ensureBlogDirectoryExpanded(page);
    await page.getByRole("button", { name: "切换批量选择模式" }).click();
    await expect(
      page.getByRole("checkbox", { name: "选择 01-react-hooks-deep-dive.md" })
    ).toBeVisible();
    await page.getByRole("checkbox", { name: "选择 01-react-hooks-deep-dive.md" }).click();
    await page.getByRole("button", { name: "复制" }).click();
    await expect(page.getByText("复制 1 项，右键目录或空白处后可粘贴。")).toBeVisible();

    const archiveDirectoryButton = treeDirectoryButton(page, "archive");
    await archiveDirectoryButton.focus();
    await page.keyboard.press("Shift+F10");
    await page.getByRole("menuitem", { name: "粘贴" }).click();
    await expect(
      page
        .getByTestId("editor-file-browser")
        .getByRole("button", { name: "01-react-hooks-deep-dive.md", exact: true })
    ).toHaveCount(2);
  });

  test("file tree supports keyboard copy and paste into another directory", async ({ page }) => {
    await openDemoEditor(page);

    await ensureBlogDirectoryExpanded(page);
    await treeNameButton(page, "01-react-hooks-deep-dive.md").click();
    await page.keyboard.press(`${ADDITIVE_SELECTION_MODIFIER}+C`);
    await expect(page.getByText("复制 1 项，右键目录或空白处后可粘贴。")).toBeVisible();

    await treeNameButton(page, "archive").click();
    await page.keyboard.press(`${ADDITIVE_SELECTION_MODIFIER}+V`);

    await expect(
      page
        .getByTestId("editor-file-browser")
        .getByRole("button", { name: "01-react-hooks-deep-dive.md", exact: true })
    ).toHaveCount(2);
  });

  test("file tree supports keyboard copy and paste for multiple selected files", async ({
    page,
  }) => {
    await openDemoEditor(page);

    await ensureBlogDirectoryExpanded(page);
    await treeNameButton(page, "01-react-hooks-deep-dive.md").click();
    await treeNameButton(page, "02-typescript-advanced-types.md").click({
      modifiers: [ADDITIVE_SELECTION_MODIFIER],
    });
    await expect(page.getByTestId("sidebar-selection-count")).toHaveText("2项");

    await page.keyboard.press(`${ADDITIVE_SELECTION_MODIFIER}+C`);
    await expect(page.getByText("复制 2 项，右键目录或空白处后可粘贴。")).toBeVisible();

    await treeNameButton(page, "archive").click();
    await page.keyboard.press(`${ADDITIVE_SELECTION_MODIFIER}+V`);

    await expect(
      page
        .getByTestId("editor-file-browser")
        .getByRole("button", { name: "01-react-hooks-deep-dive.md", exact: true })
    ).toHaveCount(2);
    await expect(
      page
        .getByTestId("editor-file-browser")
        .getByRole("button", { name: "02-typescript-advanced-types.md", exact: true })
    ).toHaveCount(2);
  });

  test("file tree move dialog moves a file into another directory", async ({ page }) => {
    await openDemoEditor(page);

    await page
      .getByRole("button", { name: "12-content-taxonomy-migration-plan.md 更多操作" })
      .click();
    await page.getByRole("menuitem", { name: "移动" }).click();

    const moveDialog = page.getByRole("dialog", { name: "选择目标目录" });
    await expect(moveDialog).toBeVisible();
    await moveDialog.getByRole("button", { name: "archive" }).click();
    await expect(moveDialog.getByText("blog/archive", { exact: true })).toBeVisible();
    await moveDialog.getByRole("button", { name: "确认移动" }).click();

    await expect(
      page
        .getByTestId("editor-file-browser")
        .getByRole("button", { name: "12-content-taxonomy-migration-plan.md", exact: true })
    ).toHaveCount(1);
    await expect(treeNameButton(page, "12-content-taxonomy-migration-plan.md")).toBeVisible();
  });

  test("file tree checkbox mode supports cut and paste into another directory", async ({
    page,
  }) => {
    await openDemoEditor(page);

    await ensureBlogDirectoryExpanded(page);
    await page.getByRole("button", { name: "切换批量选择模式" }).click();
    await expect(
      page.getByRole("checkbox", { name: "选择 02-typescript-advanced-types.md" })
    ).toBeVisible();
    await page.getByRole("checkbox", { name: "选择 02-typescript-advanced-types.md" }).click();
    await page.getByRole("button", { name: "剪切" }).click();
    await expect(page.getByText("剪切 1 项，右键目录或空白处后可粘贴。")).toBeVisible();

    const archiveDirectoryButton = treeDirectoryButton(page, "archive");
    await archiveDirectoryButton.focus();
    await page.keyboard.press("Shift+F10");
    await page.getByRole("menuitem", { name: "粘贴" }).click();

    await expect(page.getByText("剪切 1 项，右键目录或空白处后可粘贴。")).toHaveCount(0);

    await expect(treeNameButton(page, "02-typescript-advanced-types.md")).toHaveCount(1);
    await expect(page.getByTestId("sidebar-selection-count")).toHaveText("1项");
    await expectTreeSelectionState(page, ["02-typescript-advanced-types.md"], []);
    await expect(treeNameButton(page, "blog")).toBeVisible();
  });

  test("file tree supports keyboard cut and paste into another directory", async ({ page }) => {
    await openDemoEditor(page);

    await ensureBlogDirectoryExpanded(page);
    await treeNameButton(page, "02-typescript-advanced-types.md").click();
    await page.keyboard.press(`${ADDITIVE_SELECTION_MODIFIER}+X`);
    await expect(page.getByText("剪切 1 项，右键目录或空白处后可粘贴。")).toBeVisible();

    await treeNameButton(page, "archive").click();
    await page.keyboard.press(`${ADDITIVE_SELECTION_MODIFIER}+V`);

    await expect(page.getByTestId("sidebar-selection-count")).toHaveText("1项");
    await expect(page.getByText("剪切 1 项，右键目录或空白处后可粘贴。")).toHaveCount(0);
    await expect(treeNameButton(page, "02-typescript-advanced-types.md")).toHaveCount(1);
    await expectTreeSelectionState(page, ["02-typescript-advanced-types.md"], []);
    await expect(treeNameButton(page, "blog")).toBeVisible();
  });

  test("file tree shows cut selections in a ghosted state until they are pasted", async ({
    page,
  }) => {
    await openDemoEditor(page);

    await ensureBlogDirectoryExpanded(page);
    await treeNameButton(page, "01-react-hooks-deep-dive.md").click();
    await treeNameButton(page, "02-typescript-advanced-types.md").click({
      modifiers: [ADDITIVE_SELECTION_MODIFIER],
    });
    await expect(page.getByTestId("sidebar-selection-count")).toHaveText("2项");

    await page.keyboard.press(`${ADDITIVE_SELECTION_MODIFIER}+X`);
    await expect(page.getByText("剪切 2 项，右键目录或空白处后可粘贴。")).toBeVisible();

    const firstCutRow = await treeRowVisualState(page, "01-react-hooks-deep-dive.md");
    const secondCutRow = await treeRowVisualState(page, "02-typescript-advanced-types.md");

    expect(firstCutRow.selectedLike).toBe(true);
    expect(secondCutRow.selectedLike).toBe(true);
    expect(firstCutRow.cutPending).toBe("true");
    expect(secondCutRow.cutPending).toBe("true");
    await expect
      .poll(async () =>
        Number((await treeRowVisualState(page, "01-react-hooks-deep-dive.md")).opacity)
      )
      .toBeLessThan(1);
    await expect
      .poll(async () =>
        Number((await treeRowVisualState(page, "02-typescript-advanced-types.md")).opacity)
      )
      .toBeLessThan(1);
  });

  test("file tree selects all pasted items after keyboard paste", async ({ page }) => {
    await openDemoEditor(page);

    await ensureBlogDirectoryExpanded(page);
    await treeNameButton(page, "01-react-hooks-deep-dive.md").click();
    await treeNameButton(page, "02-typescript-advanced-types.md").click({
      modifiers: [ADDITIVE_SELECTION_MODIFIER],
    });
    await expect(page.getByTestId("sidebar-selection-count")).toHaveText("2项");

    await page.keyboard.press(`${ADDITIVE_SELECTION_MODIFIER}+C`);
    await expect(page.getByText("复制 2 项，右键目录或空白处后可粘贴。")).toBeVisible();

    await treeNameButton(page, "archive").click();
    await page.keyboard.press(`${ADDITIVE_SELECTION_MODIFIER}+V`);

    await expect(page.getByTestId("sidebar-selection-count")).toHaveText("2项");
    await expectTreeSelectionState(
      page,
      ["01-react-hooks-deep-dive.md", "02-typescript-advanced-types.md"],
      [
        "03-graphql-api-best-practices.md",
        "04-kubernetes-cluster-management.md",
        "05-redis-caching-strategies.md",
      ]
    );
  });

  test("file tree operation feedback is shown as floating toast notifications", async ({
    page,
  }) => {
    await openDemoEditor(page);

    await ensureBlogDirectoryExpanded(page);
    await treeNameButton(page, "02-typescript-advanced-types.md").click();
    await page.keyboard.press(`${ADDITIVE_SELECTION_MODIFIER}+X`);
    const toastViewport = page.locator(".Toastify__toast-container");
    await expect(toastViewport.getByText("剪切 1 项，右键目录或空白处后可粘贴。")).toBeVisible();
    await expect(
      page.getByTestId("editor-file-browser").getByText("剪切 1 项，右键目录或空白处后可粘贴。")
    ).toHaveCount(0);

    await treeNameButton(page, "archive").click();
    await page.keyboard.press(`${ADDITIVE_SELECTION_MODIFIER}+V`);

    await expect(toastViewport.getByText("已移动 1 项。")).toBeVisible();

    await expect
      .poll(async () =>
        toastViewport.evaluate((viewport) => {
          const toast = viewport.querySelector<HTMLElement>(".Toastify__toast");
          return toast ? getComputedStyle(toast).transform : "";
        })
      )
      .toBe("none");

    const settledToastState = await toastViewport.evaluate((viewport) => {
      const content = viewport.querySelector<HTMLElement>('[data-testid="admin-toast-content"]');
      const closeButton = viewport.querySelector<HTMLElement>('[data-testid="admin-toast-close"]');
      const contentRect = content?.getBoundingClientRect();
      const closeRect = closeButton?.getBoundingClientRect();
      const rect = viewport.getBoundingClientRect();
      const style = getComputedStyle(viewport);
      const contentBackground = content
        ? getComputedStyle(content).backgroundColor
        : "rgba(0, 0, 0, 0)";
      const context = document.createElement("canvas").getContext("2d");
      let alpha = 1;
      const colorFunctionAlphaMatch = contentBackground.match(/\/\s*([0-9.]+%?)\s*\)?$/);
      if (colorFunctionAlphaMatch?.[1]) {
        alpha = colorFunctionAlphaMatch[1].endsWith("%")
          ? Number(colorFunctionAlphaMatch[1].slice(0, -1)) / 100
          : Number(colorFunctionAlphaMatch[1]);
      }
      if (context) {
        context.fillStyle = "rgba(0, 0, 0, 0)";
        context.fillStyle = contentBackground;
        const normalizedColor = context.fillStyle;
        const alphaMatch = normalizedColor.match(/rgba?\(([^)]+)\)/);
        if (alphaMatch?.[1]) {
          alpha =
            alphaMatch[1].split(",").map((part) => Number(part.trim()))[3] ??
            (normalizedColor.startsWith("rgb(") ? 1 : alpha);
        }
      }
      return {
        position: style.position,
        top: rect.top,
        rightGap: window.innerWidth - rect.right,
        contentRightGap: contentRect ? window.innerWidth - contentRect.right : 0,
        contentBackgroundAlpha: alpha,
        closeInside:
          Boolean(contentRect && closeRect) &&
          closeRect.left >= contentRect.left &&
          closeRect.right <= contentRect.right &&
          closeRect.top >= contentRect.top &&
          closeRect.bottom <= contentRect.bottom,
      };
    });
    expect(settledToastState.position).toBe("fixed");
    expect(settledToastState.top).toBeGreaterThanOrEqual(12);
    expect(settledToastState.top).toBeLessThanOrEqual(32);
    expect(settledToastState.rightGap).toBeGreaterThanOrEqual(12);
    expect(settledToastState.contentRightGap).toBeGreaterThanOrEqual(12);
    expect(settledToastState.contentRightGap).toBeLessThanOrEqual(32);
    expect(settledToastState.contentBackgroundAlpha).toBeGreaterThanOrEqual(0.92);
    expect(settledToastState.closeInside).toBe(true);

    await page.keyboard.press(`${ADDITIVE_SELECTION_MODIFIER}+C`);
    await page.keyboard.press(`${ADDITIVE_SELECTION_MODIFIER}+V`);

    await expect(
      toastViewport.getByText("目标已存在: blog/archive/02-typescript-advanced-types.md")
    ).toBeVisible();
    await expect(
      page
        .getByTestId("admin-shell-main")
        .locator('[role="alert"], .rounded-3xl, .lg\\:rounded-\\[1rem\\]')
        .filter({ hasText: /已移动 1 项。|目标已存在/ })
    ).toHaveCount(0);
  });

  test("batch footer degrades responsively without wrapping the count badge", async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem("admin-sidebar-width", "320");
    });
    await openDemoEditor(page);

    await treeNameButton(page, "blog").click();

    for (const name of ["alpha.md", "beta.md"]) {
      await page.getByRole("button", { name: "新建文件" }).click();
      const fileNameInput = page.getByRole("textbox", { name: "文件名称" });
      await fileNameInput.fill(name);
      await fileNameInput.press("Enter");
    }

    async function selectBatchFooterScenario() {
      await ensureBlogDirectoryExpanded(page);
      await page.getByRole("button", { name: "切换批量选择模式" }).click();
      await expect(page.getByRole("checkbox", { name: "选择 alpha.md" })).toBeVisible();
      if (await page.getByTestId("sidebar-selection-footer").count()) {
        await page.getByRole("button", { name: "清空选择" }).click();
        await expect(page.getByTestId("sidebar-selection-footer")).toHaveCount(0);
      }
      await page.getByRole("checkbox", { name: "选择 alpha.md" }).click();
      await page.getByRole("checkbox", { name: "选择 beta.md" }).click();
      await expect(page.getByTestId("sidebar-selection-footer")).toBeVisible();
    }

    await selectBatchFooterScenario();

    const medium = await sidebarSelectionFooterState(page);
    const mediumRows = await sidebarSelectionFooterRows(page);
    expect(medium.countText).toBe("2项");
    expect(medium.countWhiteSpace).toBe("nowrap");
    expect(medium.countFlexShrink).toBe("0");
    expect(medium.countWidth).toBeGreaterThan(medium.countHeight);
    expect(medium.countWidth).toBeLessThanOrEqual(64);
    expect(medium.rowCount).toBeLessThanOrEqual(2);
    expect(medium.hasHorizontalOverflow).toBe(false);
    expect(medium.footerMode).toBe("full");
    expect(Math.abs(medium.footerWidth - medium.hostWidth)).toBeLessThanOrEqual(2);
    expect(Math.abs(medium.hostWidth - medium.cardWidth)).toBeLessThanOrEqual(2);
    expect(medium.hostWidth).toBeLessThan(medium.asideWidth);
    expect(medium.textButtonCount).toBe(6);
    expect(mediumRows).toEqual([
      ["2项", "移动", "复制", "剪切"],
      ["粘贴", "删除", "清空选择"],
    ]);

    const resizeHandle = page.getByRole("separator", { name: /调整侧边栏宽度/ });
    await resizeHandle.dblclick();
    await expect(resizeHandle).toHaveAttribute("aria-valuenow", "272");

    const defaultWidth = await sidebarSelectionFooterState(page);
    expect(defaultWidth.countText).toBe("2项");
    expect(defaultWidth.countWhiteSpace).toBe("nowrap");
    expect(defaultWidth.countFlexShrink).toBe("0");
    expect(defaultWidth.rowCount).toBeLessThanOrEqual(2);
    expect(defaultWidth.hasHorizontalOverflow).toBe(false);
    expect(defaultWidth.countRight).toBeLessThanOrEqual(defaultWidth.firstButtonLeft - 4);
    expect(Math.abs(defaultWidth.footerWidth - defaultWidth.hostWidth)).toBeLessThanOrEqual(2);
    expect(Math.abs(defaultWidth.hostWidth - defaultWidth.cardWidth)).toBeLessThanOrEqual(2);
    expect(defaultWidth.hostWidth).toBeLessThan(defaultWidth.asideWidth);
    expect(defaultWidth.footerMode === "full" || defaultWidth.footerMode === "icons").toBe(true);
    if (defaultWidth.footerMode === "full") {
      expect(defaultWidth.textButtonCount).toBe(6);
    } else {
      expect(defaultWidth.textButtonCount).toBe(0);
      expect(defaultWidth.iconOnlyButtonCount).toBe(6);
    }

    await resizeHandle.focus();
    await resizeHandle.press("End");
    await expect(resizeHandle).toHaveAttribute("aria-valuenow", "460");
    await expect(page.getByTestId("sidebar-selection-footer")).toHaveAttribute(
      "data-footer-mode",
      "full"
    );

    const wide = await sidebarSelectionFooterState(page);
    const wideRows = await sidebarSelectionFooterRows(page);
    expect(wide.countText).toBe("2项");
    expect(wide.countWhiteSpace).toBe("nowrap");
    expect(wide.countFlexShrink).toBe("0");
    expect(wide.rowCount).toBeLessThanOrEqual(2);
    expect(wide.hasHorizontalOverflow).toBe(false);
    expect(wide.countRight).toBeLessThanOrEqual(wide.firstButtonLeft - 4);
    expect(Math.abs(wide.footerWidth - wide.hostWidth)).toBeLessThanOrEqual(2);
    expect(Math.abs(wide.hostWidth - wide.cardWidth)).toBeLessThanOrEqual(2);
    expect(wide.hostWidth).toBeLessThan(wide.asideWidth);
    expect(wide.textButtonCount).toBe(6);
    expect(wideRows).toEqual([
      ["2项", "移动", "复制", "剪切"],
      ["粘贴", "删除", "清空选择"],
    ]);

    await resizeHandle.focus();
    await resizeHandle.press("Home");
    await expect(resizeHandle).toHaveAttribute("aria-valuenow", "232");
    await expect(page.getByTestId("sidebar-selection-footer")).toHaveAttribute(
      "data-footer-mode",
      "icons"
    );

    const narrow = await sidebarSelectionFooterState(page);
    expect(narrow.footerMode).toBe("icons");
    expect(narrow.countText).toBe("2项");
    expect(narrow.countWhiteSpace).toBe("nowrap");
    expect(narrow.countFlexShrink).toBe("0");
    expect(narrow.countTop).toBeGreaterThanOrEqual(17);
    expect(narrow.countLeft).toBeGreaterThanOrEqual(16);
    expect(narrow.countRight).toBeLessThanOrEqual(narrow.firstButtonLeft - 4);
    expect(narrow.countHeight).toBeLessThan(narrow.firstButtonHeight);
    expect(narrow.countWidth).toBeLessThanOrEqual(narrow.firstButtonWidth + 4);
    expect(narrow.countWidth).toBeGreaterThan(narrow.countHeight);
    expect(narrow.countWidth).toBeLessThanOrEqual(64);
    expect(narrow.rowCount).toBeLessThanOrEqual(2);
    expect(narrow.hasHorizontalOverflow).toBe(false);
    expect(Math.abs(narrow.footerWidth - narrow.hostWidth)).toBeLessThanOrEqual(2);
    expect(Math.abs(narrow.hostWidth - narrow.cardWidth)).toBeLessThanOrEqual(2);
    expect(narrow.hostWidth).toBeLessThan(narrow.asideWidth);
    expect(narrow.textButtonCount).toBe(0);
    expect(narrow.iconOnlyButtonCount).toBe(6);

    await maybeCaptureSidebarProof(page, "sidebar-selection-footer-proof.png");
  });

  test("floating batch footer is mounted in the sidebar host and matches the sidebar width", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem("admin-sidebar-width", "272");
    });
    await openDemoEditor(page);

    await ensureBlogDirectoryExpanded(page);
    await page.getByRole("button", { name: "切换批量选择模式" }).click();
    await page.getByRole("checkbox", { name: "选择 01-react-hooks-deep-dive.md" }).click();
    await expect(page.getByTestId("sidebar-selection-footer")).toBeVisible();

    const state = await sidebarFloatingFooterHostState(page);
    expect(state.hostParentTestId).not.toBe("editor-file-browser");
    expect(state.hostPosition).toBe("absolute");
    expect(Math.abs(state.hostWidth - state.cardWidth)).toBeLessThanOrEqual(2);
    expect(Math.abs(state.footerWidth - state.hostWidth)).toBeLessThanOrEqual(2);
    expect(state.hostLeftInset).toBeGreaterThanOrEqual(14);
    expect(state.hostRightInset).toBeGreaterThanOrEqual(14);
    expect(state.hostBottomInset).toBeGreaterThanOrEqual(14);
    expect(state.hostBottomInset).toBeLessThanOrEqual(18);
    expect(state.footerLeftInset).toBeLessThanOrEqual(1);
    expect(state.footerRightInset).toBeLessThanOrEqual(1);
  });

  test("file tree floating footer does not leave a large blank gap at the bottom", async ({
    page,
  }) => {
    await openDemoEditor(page);

    await ensureBlogDirectoryExpanded(page);
    await page.getByRole("button", { name: "切换批量选择模式" }).click();
    await page.getByRole("checkbox", { name: "选择 01-react-hooks-deep-dive.md" }).click();
    await expect(page.getByTestId("sidebar-selection-footer")).toBeVisible();

    const state = await sidebarTreeBottomState(page, "projects");
    expect(state.bottomGap).toBeLessThan(48);
    expect(state.bottomGap).toBeGreaterThanOrEqual(-8);
    expect(state.footerGap).toBeGreaterThanOrEqual(0);
  });

  test("right-clicking a file and dismissing the menu does not add extra blank space above the floating footer", async ({
    page,
  }) => {
    await openDemoEditor(page);

    await ensureBlogDirectoryExpanded(page);
    await treeNameButton(page, "05-redis-caching-strategies.md").click();
    await expect(page.getByTestId("sidebar-selection-footer")).toBeVisible();

    const baseline = await sidebarTreeBottomState(page, "projects");

    await treeNameButton(page, "06-posts-cover-fallback.md").click({ button: "right" });
    await expect(page.getByRole("menuitem", { name: "移动" })).toBeVisible();
    await page.keyboard.press("Escape");

    await expect(page.getByTestId("sidebar-selection-footer")).toBeVisible();

    const after = await sidebarTreeBottomState(page, "projects");
    expect(after.bottomGap).toBeLessThanOrEqual(baseline.bottomGap + 8);
    expect(after.footerGap).toBeLessThanOrEqual(baseline.footerGap + 8);
  });

  test("file tree more-actions menu can escape the sidebar card while staying inside the viewport", async ({
    page,
  }) => {
    await openDemoEditor(page);

    await ensureBlogDirectoryExpanded(page);
    await treeMoreActionsButton(page, "06-posts-cover-fallback.md").click();
    await expect(page.getByRole("menuitem", { name: "移动" })).toBeVisible();

    const state = await fileTreeContextMenuState(page);

    expect(state.escapesSidebar).toBe(true);
    expect(state.probeInsideVisibleMenu).toBe(true);
    expect(state.menuLeft).toBeGreaterThanOrEqual(0);
    expect(state.menuTop).toBeGreaterThanOrEqual(0);
    expect(state.menuRight).toBeLessThanOrEqual(state.viewportWidth);
    expect(state.menuBottom).toBeLessThanOrEqual(state.viewportHeight);
  });

  test("file tree right-click menu and more-actions menu expose the same command set", async ({
    page,
  }) => {
    await openDemoEditor(page);

    await ensureBlogDirectoryExpanded(page);

    await treeMoreActionsButton(page, "06-posts-cover-fallback.md").click();
    await expect(page.getByRole("menuitem", { name: "移动" })).toBeVisible();
    const moreActionsItems = await fileTreeMenuItems(page);
    await page.keyboard.press("Escape");

    await treeNameButton(page, "06-posts-cover-fallback.md").click({ button: "right" });
    await expect(page.getByRole("menuitem", { name: "移动" })).toBeVisible();
    const contextMenuItems = await fileTreeMenuItems(page);

    expect(contextMenuItems).toEqual(moreActionsItems);
  });

  test("file tree keyboard menu key opens the current file menu without losing selection", async ({
    page,
  }) => {
    await openDemoEditor(page);

    await ensureBlogDirectoryExpanded(page);
    const target = treeNameButton(page, "06-posts-cover-fallback.md");
    await target.click();
    await expect(page.getByTestId("sidebar-selection-count")).toHaveText("1项");
    await target.focus();

    await page.keyboard.press("Shift+F10");
    await expect(page.getByRole("menuitem", { name: "移动" })).toBeVisible();

    const row = await treeRowVisualState(page, "06-posts-cover-fallback.md");
    expect(row.selectedLike).toBe(true);

    await page.keyboard.press("Escape");
    await expect(page.getByRole("menuitem", { name: "移动" })).toHaveCount(0);
    await expect(page.getByTestId("sidebar-selection-count")).toHaveText("1项");
  });

  test("right-clicking a different file then left-clicking the same spot keeps a single current selection", async ({
    page,
  }) => {
    await openDemoEditor(page);

    await ensureBlogDirectoryExpanded(page);
    await treeNameButton(page, "05-redis-caching-strategies.md").click();
    await expect(page.getByTestId("sidebar-selection-count")).toHaveText("1项");
    await expect(page.getByText("local:blog/05-redis-caching-strategies.md")).toBeVisible();

    const point = await treeRowPoint(page, "06-posts-cover-fallback.md");
    await page.mouse.click(point.x, point.y, { button: "right" });
    await expect(page.getByRole("menuitem", { name: "移动" })).toBeVisible();

    await page.mouse.click(point.x, point.y);

    await expect(page.getByTestId("sidebar-selection-count")).toHaveText("1项");

    const previousRow = await treeRowVisualState(page, "05-redis-caching-strategies.md");
    const currentRow = await treeRowVisualState(page, "06-posts-cover-fallback.md");

    expect(previousRow.selectedLike || previousRow.activeLike).toBe(false);
    expect(currentRow.selectedLike).toBe(true);
  });

  test("right-clicking another file clears the previous file icon highlight", async ({ page }) => {
    await openDemoEditor(page);

    await ensureBlogDirectoryExpanded(page);
    await treeNameButton(page, "05-redis-caching-strategies.md").click();
    await expect(page.getByText("local:blog/05-redis-caching-strategies.md")).toBeVisible();

    await treeNameButton(page, "03-graphql-api-best-practices.md").click({ button: "right" });
    await expect(page.getByRole("menuitem", { name: "移动" })).toBeVisible();

    const previousIcon = await treeRowIconState(page, "05-redis-caching-strategies.md");
    const currentIcon = await treeRowIconState(page, "03-graphql-api-best-practices.md");

    expect(previousIcon.activeLike).toBe(false);
    expect(currentIcon.activeLike).toBe(true);
  });

  test("right-clicking a directory switches the current selection to that directory only", async ({
    page,
  }) => {
    await openDemoEditor(page);

    await ensureBlogDirectoryExpanded(page);
    await treeNameButton(page, "05-redis-caching-strategies.md").click();
    await expect(page.getByText("local:blog/05-redis-caching-strategies.md")).toBeVisible();

    await treeNameButton(page, "archive").click({ button: "right" });
    await expect(page.getByRole("menuitem", { name: "移动" })).toBeVisible();

    const previousRow = await treeRowVisualState(page, "05-redis-caching-strategies.md");
    const currentRow = await treeRowVisualState(page, "archive");

    expect(previousRow.selectedLike || previousRow.activeLike).toBe(false);
    expect(currentRow.selectedLike).toBe(true);
  });

  test("right-clicking a directory then left-clicking the same spot keeps a single current selection", async ({
    page,
  }) => {
    await openDemoEditor(page);

    await ensureBlogDirectoryExpanded(page);
    await treeNameButton(page, "05-redis-caching-strategies.md").click();
    await expect(page.getByText("local:blog/05-redis-caching-strategies.md")).toBeVisible();

    const point = await treeRowPoint(page, "archive");
    await page.mouse.click(point.x, point.y, { button: "right" });
    await expect(page.getByRole("menuitem", { name: "移动" })).toBeVisible();

    await page.mouse.click(point.x, point.y);

    const previousRow = await treeRowVisualState(page, "05-redis-caching-strategies.md");
    const currentRow = await treeRowVisualState(page, "archive");

    expect(previousRow.selectedLike || previousRow.activeLike).toBe(false);
    expect(currentRow.selectedLike).toBe(true);
  });

  test("file tree does not offer unsupported commands on configured root directories", async ({
    page,
  }) => {
    await openDemoEditor(page);

    await page.getByRole("button", { name: "blog 更多操作" }).click();
    await expect(page.getByRole("menuitem", { name: "重命名" })).toHaveCount(0);
    await expect(page.getByRole("menuitem", { name: "移动" })).toHaveCount(0);
    await expect(page.getByRole("menuitem", { name: "复制" })).toHaveCount(0);
    await expect(page.getByRole("menuitem", { name: "剪切" })).toHaveCount(0);
    await expect(page.getByRole("menuitem", { name: "删除" })).toHaveCount(0);
    await expect(page.getByRole("menuitem", { name: "新建文件" })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "新建目录" })).toBeVisible();
  });

  test("file tree move dialog explains invalid targets before submit", async ({ page }) => {
    await openDemoEditor(page);

    await page.getByRole("button", { name: "01-react-hooks-deep-dive.md 更多操作" }).click();
    await page.getByRole("menuitem", { name: "移动" }).click();

    const moveDialog = page.getByRole("dialog", { name: "选择目标目录" });
    await expect(moveDialog).toBeVisible();
    await expect(moveDialog.getByText("目标目录", { exact: true })).toBeVisible();
    await expect(moveDialog.locator('div[title="blog"]').first()).toBeVisible();
    await expect(
      moveDialog.getByText("当前文件已经在这个目录中，请选择其他目标目录。")
    ).toBeVisible();
    await expect(moveDialog.getByRole("button", { name: "确认移动" })).toBeDisabled();
  });

  test("file tree move dialog adapts to viewport height without using a rigid short max height", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await openDemoEditor(page);

    await page.getByRole("button", { name: "01-react-hooks-deep-dive.md 更多操作" }).click();
    await page.getByRole("menuitem", { name: "移动" }).click();

    const moveDialog = page.getByRole("dialog", { name: "选择目标目录" });
    await expect(moveDialog).toBeVisible();

    const state = await moveDialog.evaluate((dialog) => {
      const rect = dialog.getBoundingClientRect();
      const picker = dialog.querySelector<HTMLElement>(".admin-scrollbar");
      const pickerRect = picker?.getBoundingClientRect();
      const viewportHeight = window.innerHeight;

      return {
        dialogHeight: rect.height,
        dialogBottomGap: viewportHeight - rect.bottom,
        pickerHeight: pickerRect?.height ?? 0,
        viewportHeight,
      };
    });

    expect(state.dialogHeight).toBeLessThanOrEqual(Math.ceil(state.viewportHeight * 0.9) + 2);
    expect(state.dialogHeight).toBeGreaterThan(352);
    expect(state.pickerHeight).toBeGreaterThan(220);
    expect(state.dialogBottomGap).toBeGreaterThanOrEqual(0);
  });
});
