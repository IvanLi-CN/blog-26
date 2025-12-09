import { expect } from "@playwright/test";
import { userTest as test } from "./fixtures";

// 使用 Playwright project 级 header 注入（user 项目）进行用户态校验，header 由 sso-header-routing 仅作用于
// BASE_URL，第三方域名会剥离（E2E 专用，非手工登录方式）

test.describe("Session & Header Auth (user)", () => {
  test("header 注入后 auth.me 应返回对应用户", async ({ page }) => {
    await page.goto("/");
    const authRes = await page.request.get("/api/trpc/auth.me");
    expect(authRes.ok()).toBeTruthy();
    const data = await authRes.json();
    const email = data.result?.data?.email as string;
    expect(typeof email).toBe("string");
    // isAdmin 应为 false（普通用户）
    expect(data.result?.data?.isAdmin).toBe(false);
  });

  test("登出仅清除 Cookie，不影响基于头的识别", async ({ page }) => {
    // 调用登出接口
    const logoutRes = await page.request.post("/api/trpc/auth.logout", {
      data: {},
    } as any);
    expect(logoutRes.ok()).toBeTruthy();

    // Cookie 可能被清除，但 Header 仍然存在，仍可识别为已认证用户
    const authRes2 = await page.request.get("/api/trpc/auth.me");
    const data2 = await authRes2.json();
    expect(data2.result?.data?.email).toBeTruthy();
    expect(data2.result?.data?.isAdmin).toBe(false);
  });
});
