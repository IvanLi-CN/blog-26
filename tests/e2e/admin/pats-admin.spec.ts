import { execSync } from "node:child_process";
import { expect, test } from "@playwright/test";

const MIGRATE_COMMAND = "DB_PATH=./test-data/sqlite.db bun run migrate";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "admin@example.com";
const BASE_URL = process.env.BASE_URL ?? "http://localhost:25090";

let sessionCookie: { name: string; value: string } | null = null;

function assertTokenPrefix(value: string) {
  expect(value.startsWith("blog-")).toBeTruthy();
  expect(value.includes("-pat-")).toBeTruthy();
}

test.describe("Admin PAT management", () => {
  test.beforeAll(() => {
    execSync(MIGRATE_COMMAND, { stdio: "ignore" });
    const sessionOutput = execSync(
      `ADMIN_EMAIL=${ADMIN_EMAIL} DB_PATH=./test-data/sqlite.db bun scripts/dev-create-admin-session.ts`,
      { encoding: "utf-8" }
    );
    const jsonStart = sessionOutput.indexOf("{");
    const jsonEnd = sessionOutput.lastIndexOf("}");
    if (jsonStart === -1 || jsonEnd === -1 || jsonEnd <= jsonStart) {
      throw new Error(`Failed to parse admin session output: ${sessionOutput}`);
    }
    const parsed = JSON.parse(sessionOutput.slice(jsonStart, jsonEnd + 1));
    sessionCookie = {
      name: parsed.cookieName,
      value: parsed.sessionId,
    };
  });

  test.beforeEach(async ({ context, page }) => {
    await context.clearCookies();
    if (sessionCookie) {
      await context.addCookies([
        {
          name: sessionCookie.name,
          value: sessionCookie.value,
          domain: new URL(BASE_URL).hostname,
          path: "/",
          httpOnly: true,
          sameSite: "Lax",
          secure: false,
        },
      ]);
    }

    // 备用：通过 dev 登录接口再次确保会话（容错）
    await page.request.post("/api/dev/login", { data: { email: ADMIN_EMAIL } });
  });

  test.afterEach(async ({ context }) => {
    await context.clearCookies();
  });

  test("creates and revokes a personal access token", async ({ page }) => {
    page.on("console", (msg) => {
      // surface server error logs during debugging
      if (msg.type() === "error" || msg.type() === "warning") {
        console.log("browser-console", msg.type(), msg.text());
      }
    });
    await page.goto("/admin/pats");
    await expect(page).toHaveURL(/\/admin\/pats/);
    await page.waitForLoadState("networkidle");

    await expect(page.getByRole("heading", { name: "个人访问令牌" })).toBeVisible();

    const tableRows = page.locator("table tbody tr");
    const initialCount = (await tableRows.count()) || 0;

    const createTokenButton = page.getByRole("button", { name: "新建访问令牌" }).first();
    await createTokenButton.click();
    await expect(page.getByRole("heading", { name: "创建新的访问令牌" })).toBeVisible();

    const label = `E2E 自动化 ${Date.now()}`;
    await page.getByLabel("标签（可选）").fill(label);
    await page.getByRole("button", { name: "生成访问令牌" }).click();
    await page.waitForResponse((response) =>
      response.url().includes("admin.personalAccessTokens.create")
    );

    const issuedModal = page.getByRole("heading", { name: "访问令牌已生成" });
    await expect(issuedModal).toBeVisible();

    const tokenInput = page.locator('input[readonly][value^="blog-"]');
    const tokenValue = await tokenInput.inputValue();
    assertTokenPrefix(tokenValue);

    const bearerResponse = await fetch(`${BASE_URL}/api/test/auth`, {
      headers: {
        Authorization: `Bearer ${tokenValue}`,
      },
    });

    expect.soft(bearerResponse.status, "PAT bearer auth should succeed").toBe(200);
    const bearerPayload: { user?: { email: string }; isAdmin: boolean } =
      await bearerResponse.json();
    expect
      .soft(bearerPayload.user?.email, "PAT bearer auth should resolve the correct user")
      .toBe(ADMIN_EMAIL);
    expect.soft(bearerPayload.isAdmin, "PAT bearer auth should grant admin access").toBe(true);

    await page.getByRole("button", { name: "我已妥善保存" }).click();
    await expect(issuedModal).toBeHidden();

    const createdRow = page.locator("table tbody tr", { hasText: label });
    await expect(createdRow).toBeVisible();
    await expect(tableRows).toHaveCount(initialCount + 1);

    await createdRow.getByRole("button", { name: "删除" }).click();

    const deleteModal = page.locator(".modal-box", {
      has: page.getByRole("heading", { name: "确认删除访问令牌" }),
    });
    await expect(deleteModal).toBeVisible();
    await expect(deleteModal.getByText(label)).toBeVisible();
    await expect(deleteModal.getByText(/从未使用|Never used/)).toBeVisible();

    await deleteModal.getByRole("button", { name: "确认删除" }).click();

    await expect(page.getByText("访问令牌已删除。")).toBeVisible();
    await expect(page.locator("table tbody tr", { hasText: label })).toHaveCount(0);
    await expect(tableRows).toHaveCount(initialCount);
  });

  test("closes the create modal with Escape", async ({ page }) => {
    await page.goto("/admin/pats");
    await expect(page).toHaveURL(/\/admin\/pats/);
    await page.waitForLoadState("networkidle");

    const reopenButton = page.getByRole("button", { name: "新建访问令牌" }).first();
    await reopenButton.click();
    await expect(page.getByRole("heading", { name: "创建新的访问令牌" })).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(page.getByRole("heading", { name: "创建新的访问令牌" })).toBeHidden();
  });
});
