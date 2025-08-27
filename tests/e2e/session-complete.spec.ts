import { expect, test } from "@playwright/test";

// 测试用户数据 - 使用测试环境的管理员用户
const TEST_USER = {
  email: process.env.ADMIN_EMAIL || "admin-test@test.local",
  name: "Test Admin",
};

test.describe("Session Authentication Complete Tests", () => {
  test("基本登录和认证测试", async ({ page }) => {
    // 1. 访问首页确认服务器运行
    await page.goto("/");
    await expect(page).toHaveTitle(/Ivan's Blog/);

    // 2. 使用开发API登录
    const loginResponse = await page.evaluate(async (email) => {
      try {
        const res = await fetch("/api/dev/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email }),
        });
        return await res.json();
      } catch (error) {
        return { success: false, error: error.message };
      }
    }, TEST_USER.email);

    expect(loginResponse.success).toBe(true);
    expect(loginResponse.user.email).toBe(TEST_USER.email);

    // 3. 验证Session Cookie被设置
    const cookies = await page.context().cookies();
    const sessionCookie = cookies.find((cookie) => cookie.name === "session_id");
    expect(sessionCookie).toBeDefined();
    expect(sessionCookie?.httpOnly).toBe(true);

    // 4. 验证认证状态
    const authResponse = await page.evaluate(async () => {
      try {
        const res = await fetch("/api/trpc/auth.me");
        return await res.json();
      } catch (error) {
        return { error: error.message };
      }
    });

    expect(authResponse.result.data.email).toBe(TEST_USER.email);
    // 在测试环境中，isAdmin可能为false，这是正常的
    expect(typeof authResponse.result.data.isAdmin).toBe("boolean");
  });

  test("登出功能测试", async ({ page }) => {
    // 1. 先登录
    await page.goto("/");
    await page.evaluate(async (email) => {
      const res = await fetch("/api/dev/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      return res.json();
    }, TEST_USER.email);

    // 2. 验证已登录
    const authResponse1 = await page.evaluate(async () => {
      const res = await fetch("/api/trpc/auth.me");
      return res.json();
    });
    expect(authResponse1.result.data.email).toBe(TEST_USER.email);

    // 3. 执行登出
    const logoutResponse = await page.evaluate(async () => {
      const res = await fetch("/api/trpc/auth.logout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      return res.json();
    });

    expect(logoutResponse.result.data.success).toBe(true);

    // 4. 验证已登出
    const authResponse2 = await page.evaluate(async () => {
      const res = await fetch("/api/trpc/auth.me");
      return res.json();
    });
    expect(authResponse2.result.data).toBeNull();
  });

  test("多设备登录基础测试", async ({ browser }) => {
    // 创建两个不同的浏览器上下文（模拟不同设备）
    const context1 = await browser.newContext();
    const context2 = await browser.newContext();

    const page1 = await context1.newPage();
    const page2 = await context2.newPage();

    try {
      // 1. 在第一个设备上登录
      await page1.goto("/");
      const loginResponse1 = await page1.evaluate(async (email) => {
        const res = await fetch("/api/dev/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email }),
        });
        return res.json();
      }, TEST_USER.email);

      expect(loginResponse1.success).toBe(true);

      // 2. 在第二个设备上登录
      await page2.goto("/");
      const loginResponse2 = await page2.evaluate(async (email) => {
        const res = await fetch("/api/dev/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email }),
        });
        return res.json();
      }, TEST_USER.email);

      expect(loginResponse2.success).toBe(true);

      // 3. 验证两个设备都能正常认证
      const auth1 = await page1.evaluate(async () => {
        const res = await fetch("/api/trpc/auth.me");
        return res.json();
      });

      const auth2 = await page2.evaluate(async () => {
        const res = await fetch("/api/trpc/auth.me");
        return res.json();
      });

      expect(auth1.result.data.email).toBe(TEST_USER.email);
      expect(auth2.result.data.email).toBe(TEST_USER.email);
    } finally {
      await context1.close();
      await context2.close();
    }
  });
});
