import { expect, type Locator, type Page } from "@playwright/test";

async function waitForAdminMemoPreviewResponse(page: Page, slug: string, timeout = 60_000) {
  const previewPath = `/api/admin/preview/memos/${encodeURIComponent(slug)}`;

  await expect
    .poll(
      async () => {
        const response = await page.request.get(previewPath).catch(() => null);
        if (!response?.ok()) {
          return `status:${response?.status() ?? "network"}`;
        }

        const payload = (await response.json().catch(() => null)) as { slug?: string } | null;
        return payload?.slug === slug ? "ready" : "invalid-payload";
      },
      {
        timeout,
        intervals: [500, 1_000, 2_000, 3_000],
        message: `等待管理员 Memo 预览接口就绪: ${slug}`,
      }
    )
    .toBe("ready");
}

export async function openAdminMemoPreview(page: Page, slug: string) {
  await waitForAdminMemoPreviewResponse(page, slug);
  await page.goto(`/admin/preview/memos/${encodeURIComponent(slug)}`, {
    waitUntil: "domcontentloaded",
    timeout: 60_000,
  });
  await page.waitForURL(/\/admin\/preview\/memos\/.+/, { timeout: 60_000 }).catch(() => {
    // `goto()` may already have completed before the explicit URL wait starts.
  });
  await expect(page.getByRole("heading", { name: "Memo 预览" })).toBeVisible({ timeout: 60_000 });
}

export async function openAdminMemoDetail(page: Page, slug: string) {
  await openAdminMemoPreview(page, slug);
}

export async function waitForAdminPreviewMemoBody(page: Page, timeout = 60_000) {
  const previewBody = page.getByTestId("admin-preview-memo-body");
  const previewError = page.getByText("预览加载失败");
  const refreshButton = page.getByRole("button", { name: "刷新" });

  await expect
    .poll(
      async () => {
        if (await previewBody.isVisible().catch(() => false)) {
          return "body";
        }

        if (await previewError.isVisible().catch(() => false)) {
          await refreshButton.click().catch(() => {
            // Ignore transient click failures while the preview shell is still hydrating.
          });
          return "retrying";
        }

        return "pending";
      },
      {
        timeout,
        intervals: [500, 1_000, 2_000, 3_000],
        message: "等待 Memo 预览正文渲染完成",
      }
    )
    .toBe("body");

  return previewBody;
}

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
    .locator('[data-testid="admin-live-memo-card"], [data-testid="memo-card"][data-id]')
    .filter({ hasText: text })
    .first();
  await expect(memoCard).toBeVisible({ timeout });
  return memoCard;
}

export async function waitForAdminLiveMemoCard(page: Page, text: string, timeout = 60_000) {
  const memoCard = page
    .locator('[data-testid="admin-live-memo-card"]')
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
  const dialog = page.locator('[data-testid="quick-memo-edit-modal"]');

  await expect(trigger).toBeVisible({ timeout: 60_000 });

  await expect
    .poll(
      async () => {
        await trigger.click({ force: true }).catch(() => {
          // Ignore transient click failures while the list is hydrating.
        });
        const count = await dialog.count();
        if (count === 0) return false;
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
  const detailLink = card.getByRole("link", { name: "预览" }).first();
  await expect(detailLink).toBeVisible({ timeout: 60_000 });
  await detailLink.scrollIntoViewIfNeeded();

  const href = await detailLink.getAttribute("href");
  const slug = href?.split("/").filter(Boolean).at(-1);
  if (!slug) {
    throw new Error("Expected memo card detail link to include a slug");
  }
  await openAdminMemoDetail(page, slug);
}
