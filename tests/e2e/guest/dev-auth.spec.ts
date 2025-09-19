/**
 * 特权认证系统端到端测试（开发/测试环境）
 *
 * 这些接口本身不依赖用户身份分组，因此归入 guest 组。
 */

import { expect, test } from "@playwright/test";

const TEST_EMAIL = "dev-test@example.com";
const TEST_NICKNAME = "DevTestUser";
const INVALID_EMAIL = "invalid-email";

test.describe("特权认证系统", () => {
  test.beforeEach(async ({ page }) => {
    await page.context().clearCookies();
  });

  test.describe("环境检查", () => {
    test("开发环境下接口应该可访问", async ({ page }) => {
      const loginResponse = await page.request.post("/api/dev/login", {
        data: { email: TEST_EMAIL },
      });
      expect(loginResponse.status()).not.toBe(404);
      const registerResponse = await page.request.post("/api/dev/register", {
        data: { nickname: TEST_NICKNAME, email: `new-${TEST_EMAIL}` },
      });
      expect(registerResponse.status()).not.toBe(404);
    });

    test("GET 请求应该返回 405 Method Not Allowed", async ({ page }) => {
      const loginResponse = await page.request.get("/api/dev/login");
      expect(loginResponse.status()).toBe(405);
      const registerResponse = await page.request.get("/api/dev/register");
      expect(registerResponse.status()).toBe(405);
    });
  });

  test.describe("特权登录接口", () => {
    test("有效邮箱登录应该成功", async ({ page }) => {
      const response = await page.request.post("/api/dev/login", { data: { email: TEST_EMAIL } });
      expect(response.status()).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.user).toBeDefined();
      expect(data.user.email).toBe(TEST_EMAIL);
    });

    test("登录后应该设置认证 Cookie", async ({ page }) => {
      await page.request.post("/api/dev/login", { data: { email: TEST_EMAIL } });
      await page.goto("/");
      const cookies = await page.context().cookies();
      const sessionCookie = cookies.find((c) => c.name === "session_id");
      expect(sessionCookie).toBeDefined();
      expect(sessionCookie?.httpOnly).toBe(true);
      expect(sessionCookie?.path).toBe("/");
      expect(sessionCookie?.sameSite).toBe("Lax");
    });

    test("无效邮箱格式应该返回错误", async ({ page }) => {
      const response = await page.request.post("/api/dev/login", {
        data: { email: INVALID_EMAIL },
      });
      expect(response.status()).toBe(400);
      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.error).toContain("有效的邮箱地址");
    });

    test("缺少邮箱参数应该返回错误", async ({ page }) => {
      const response = await page.request.post("/api/dev/login", { data: {} });
      expect(response.status()).toBe(400);
      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.error).toContain("邮箱地址");
    });
  });

  test.describe("特权注册接口", () => {
    test("有效参数注册应该成功", async ({ page }) => {
      const uniqueEmail = `register-${Date.now()}@example.com`;
      const response = await page.request.post("/api/dev/register", {
        data: { nickname: TEST_NICKNAME, email: uniqueEmail },
      });
      expect(response.status()).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.user.email).toBe(uniqueEmail);
      expect(data.user.nickname).toBe(TEST_NICKNAME);
    });

    test("注册后应该设置认证 Cookie", async ({ page }) => {
      const uniqueEmail = `register-cookie-${Date.now()}@example.com`;
      await page.request.post("/api/dev/register", {
        data: { nickname: TEST_NICKNAME, email: uniqueEmail },
      });
      await page.goto("/");
      const cookies = await page.context().cookies();
      const sessionCookie = cookies.find((c) => c.name === "session_id");
      expect(sessionCookie).toBeDefined();
      expect(sessionCookie?.httpOnly).toBe(true);
    });

    test("重复邮箱注册应该返回错误", async ({ page }) => {
      const duplicateEmail = `duplicate-${Date.now()}@example.com`;
      await page.request.post("/api/dev/register", {
        data: { nickname: TEST_NICKNAME, email: duplicateEmail },
      });
      const response = await page.request.post("/api/dev/register", {
        data: { nickname: "AnotherUser", email: duplicateEmail },
      });
      expect(response.status()).toBe(409);
      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.error).toContain("已被注册");
    });

    test("无效邮箱格式应该返回错误", async ({ page }) => {
      const response = await page.request.post("/api/dev/register", {
        data: { nickname: TEST_NICKNAME, email: INVALID_EMAIL },
      });
      expect(response.status()).toBe(400);
      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.error).toContain("有效的邮箱地址");
    });

    test("空昵称应该返回错误", async ({ page }) => {
      const response = await page.request.post("/api/dev/register", {
        data: { nickname: "", email: `empty-nickname-${Date.now()}@example.com` },
      });
      expect(response.status()).toBe(400);
      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.error).toContain("请提供昵称");
    });

    test("缺少必需参数应该返回错误", async ({ page }) => {
      const response1 = await page.request.post("/api/dev/register", {
        data: { email: `missing-nickname-${Date.now()}@example.com` },
      });
      expect(response1.status()).toBe(400);
      const response2 = await page.request.post("/api/dev/register", {
        data: { nickname: TEST_NICKNAME },
      });
      expect(response2.status()).toBe(400);
    });
  });

  test.describe("集成测试", () => {
    test("注册后可以立即使用登录接口", async ({ page }) => {
      const testEmail = `integration-${Date.now()}@example.com`;
      const registerResponse = await page.request.post("/api/dev/register", {
        data: { nickname: TEST_NICKNAME, email: testEmail },
      });
      expect(registerResponse.status()).toBe(200);
      await page.context().clearCookies();
      const loginResponse = await page.request.post("/api/dev/login", {
        data: { email: testEmail },
      });
      expect(loginResponse.status()).toBe(200);
      const loginData = await loginResponse.json();
      expect(loginData.success).toBe(true);
      expect(loginData.user.email).toBe(testEmail);
      expect(loginData.user.nickname).toBe(TEST_NICKNAME);
    });
  });
});
