import { expect, type Locator, type Page } from "@playwright/test";

export async function waitForQuickMemoEditor(page: Page) {
  const container = page.locator('[data-testid="quick-memo-editor"]').first();

  await expect
    .poll(
      async () => {
        const count = await container.count();
        if (count === 0) return false;
        return container.isVisible().catch(() => false);
      },
      {
        timeout: 90_000,
        message: "等待快速发布区域完成客户端装载",
      }
    )
    .toBe(true);

  const editor = container.locator(".ProseMirror");
  await expect(editor).toBeVisible({ timeout: 30_000 });

  return { container, editor };
}

export async function triggerDevSync(page: Page) {
  await expect
    .poll(
      async () => {
        const response = await page.request.post("/api/dev/sync").catch(() => null);
        return response?.ok() ?? false;
      },
      {
        timeout: 60_000,
        intervals: [500, 1_000, 2_000, 3_000],
        message: "等待开发环境内容同步接口恢复可用",
      }
    )
    .toBe(true);
}

export async function waitForTrpcSuccess(page: Page, procedureName: string, timeout = 60_000) {
  return page.waitForResponse(
    (response) =>
      response.url().includes(`/api/trpc/${procedureName}`) && response.status() === 200,
    { timeout }
  );
}

export async function waitForMemoCardByText(page: Page, text: string, timeout = 60_000) {
  const memoCard = page
    .locator('[data-testid="memo-card"][data-id]')
    .filter({ hasText: text })
    .first();
  await expect(memoCard).toBeVisible({ timeout });
  return memoCard;
}

export async function openMemoDeleteDialog(page: Page, trigger: Locator) {
  const modal = page.locator('[data-testid="memo-delete-dialog-panel"]');

  await expect(trigger).toBeVisible({ timeout: 60_000 });

  await expect
    .poll(
      async () => {
        await trigger.click({ force: true }).catch(() => {
          // Ignore transient pre-hydration click failures and keep polling.
        });
        return modal.isVisible().catch(() => false);
      },
      {
        timeout: 60_000,
        intervals: [500, 1_000, 1_500, 2_000],
        message: "等待删除确认框在客户端热更新后可交互",
      }
    )
    .toBe(true);

  return modal;
}

export async function openMemoEditDialog(page: Page, trigger: Locator) {
  const dialog = page.getByRole("dialog");

  await expect(trigger).toBeVisible({ timeout: 60_000 });

  await expect
    .poll(
      async () => {
        await trigger.click({ force: true }).catch(() => {
          // Ignore transient click failures while the list is hydrating.
        });
        return dialog.isVisible().catch(() => false);
      },
      {
        timeout: 60_000,
        intervals: [500, 1_000, 1_500, 2_000],
        message: "等待 Memo 编辑对话框在客户端装载后可见",
      }
    )
    .toBe(true);

  return dialog;
}

export async function openMemoDetailFromCard(page: Page, card: Locator) {
  const detailLink = card.locator('a[href^="/memos/"]').first();
  await expect(detailLink).toBeVisible({ timeout: 60_000 });
  await detailLink.scrollIntoViewIfNeeded();

  const href = await detailLink.getAttribute("href");
  if (href) {
    await page.goto(href, {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });
  } else {
    await Promise.all([page.waitForURL(/\/memos\/.+/, { timeout: 60_000 }), detailLink.click()]);
    await page.waitForLoadState("domcontentloaded", { timeout: 60_000 }).catch(() => {
      // The route may already be hydrated and settled before Playwright starts waiting.
    });
  }

  await page.waitForURL(/\/memos\/.+/, { timeout: 60_000 }).catch(() => {
    // `goto()` may already have completed before the explicit URL wait starts.
  });
  await page.waitForSelector(".memo-detail-page", { timeout: 60_000 });
}
