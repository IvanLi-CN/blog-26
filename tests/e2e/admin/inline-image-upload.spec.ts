import { expect } from "@playwright/test";
import { E2E_ADMIN_EMAIL } from "../runtime";
import { adminTest as test } from "./fixtures";
import {
  openAdminMemoDetail,
  waitForAdminPreviewMemoBody,
  waitForQuickMemoEditor,
} from "./memos/helpers";

// Small 1x1 PNG (transparent)
const ONE_BY_ONE_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAASsJTYQAAAAASUVORK5CYII=";

const ADMIN_EMAIL = E2E_ADMIN_EMAIL;

test.describe("Inline image upload (Milkdown/Memos)", () => {
  test("uploads base64 inline image and avoids '.md/' in path", async ({ page, baseURL }) => {
    const TOKEN = `__INLINE_${Date.now()}__`;
    await page.request.post("/api/dev/login", {
      data: { email: ADMIN_EMAIL },
    });

    // Navigate to memos page as admin (header is injected by project config)
    await page.goto(`${baseURL}/memos`, { waitUntil: "domcontentloaded", timeout: 60_000 });

    // Quick memo editor should be visible for admin.
    // Use accessible role+name to avoid strict mode violation from duplicated test ids.
    const { container: editorRegion } = await waitForQuickMemoEditor(page);

    // Focus Milkdown's ProseMirror editable (scoped to the quick editor region)
    const editor = editorRegion.locator(".ProseMirror").first();
    await editor.click();
    await expect(editor).toBeEditable();
    const markdown = `Here is an inline image (${TOKEN}): ![Alt](data:image/png;base64,${ONE_BY_ONE_PNG_BASE64})`;
    await editor.evaluate((node, text) => {
      const target = node as HTMLElement;
      target.focus();

      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(target);
      range.collapse(false);
      selection?.removeAllRanges();
      selection?.addRange(range);

      document.execCommand("insertText", false, text);
    }, markdown);
    await expect(editor).toContainText(TOKEN, { timeout: 15_000 });
    await expect(editor).toContainText("ASUVORK5CYII=", { timeout: 15_000 });
    // Give the editor a brief moment to emit markdownUpdated and propagate onChange
    await page.waitForTimeout(300);
    // Wait until publish button is enabled, then submit quick memo
    const memoCards = page.locator('[data-testid="admin-live-memo-card"][data-id]');
    const initialCardIds = await memoCards.evaluateAll((cards) =>
      cards
        .map((card) => card.getAttribute("data-id"))
        .filter((value): value is string => Boolean(value))
    );
    const publishButton = page.getByRole("button", { name: /发布 Memo/ });
    await expect(publishButton).toBeEnabled();
    await publishButton.click();

    await expect(page.getByText("Memo 已创建：")).toBeVisible({ timeout: 30_000 });

    let createdCardId = "";
    await expect
      .poll(
        async () => {
          const ids = await memoCards.evaluateAll((cards) =>
            cards
              .map((card) => card.getAttribute("data-id"))
              .filter((value): value is string => Boolean(value))
          );
          createdCardId = ids.find((id) => !initialCardIds.includes(id)) ?? "";
          return createdCardId;
        },
        {
          timeout: 60_000,
          message: "等待新发布的 memo 出现在列表中",
        }
      )
      .not.toBe("");

    const createdCard = page.locator(
      `[data-testid="admin-live-memo-card"][data-id="${createdCardId}"]`
    );
    await expect(createdCard).toBeVisible({ timeout: 30_000 });

    const createdSlug = await createdCard.getAttribute("data-slug");
    expect(createdSlug).toBeTruthy();
    if (!createdSlug) {
      throw new Error("Expected created memo card to expose a canonical slug");
    }

    await openAdminMemoDetail(page, createdSlug);

    const previewBody = await waitForAdminPreviewMemoBody(page, 30_000);
    await expect(previewBody.getByRole("button", { name: "Alt" })).toBeVisible({
      timeout: 30_000,
    });

    let detail:
      | {
          image?: string | null;
          attachments?: Array<{ path?: string }>;
          media?: { content?: Array<{ variants?: Record<string, string> }> };
        }
      | undefined;
    await expect
      .poll(
        async () => {
          const response = await page.request
            .get(`/api/public/memos/${encodeURIComponent(createdSlug)}`)
            .catch(() => null);
          if (!response?.ok()) {
            return 0;
          }

          detail = (await response.json().catch(() => null)) as typeof detail;
          const renderedImageSrcs = [
            detail?.image,
            ...(detail?.attachments?.map((attachment) => attachment.path) ?? []),
            ...(detail?.media?.content?.flatMap((item) => Object.values(item.variants ?? {})) ??
              []),
          ].filter((src): src is string => Boolean(src));
          return renderedImageSrcs.length;
        },
        {
          timeout: 60_000,
          intervals: [500, 1_000, 2_000, 3_000],
          message: "等待内联图片资源在公开 memo 详情中可见",
        }
      )
      .toBeGreaterThan(0);

    const renderedImageSrcs = [
      detail.image,
      ...(detail.attachments?.map((attachment) => attachment.path) ?? []),
      ...(detail.media?.content?.flatMap((item) => Object.values(item.variants ?? {})) ?? []),
    ].filter((src): src is string => Boolean(src));
    expect(renderedImageSrcs.length).toBeGreaterThan(0);

    // Ensure runtime image URLs don't contain ".md/" in path (regression guard).
    for (const src of renderedImageSrcs) {
      expect(src).not.toMatch(/\.md\//);
      expect(src).toMatch(/^(\.\/|\/api\/public\/assets\/memo\/)/);
    }
  });
});
