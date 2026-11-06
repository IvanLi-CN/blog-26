import { expect, test } from "@playwright/test";

// Validation, identity persistence and response attributes live in dev-api/auth.test.ts.
// Keep the real HTTP boundary and browser cookie jar here for both auth routes.
for (const route of ["login", "register"] as const) {
  test(`${route} stores its authentication cookie in the browser context`, async ({ page }) => {
    await page.context().clearCookies();
    const response = await page.request.post(`/api/dev/${route}`, {
      data: { email: `browser-${route}-${Date.now()}@example.com`, nickname: "BrowserUser" },
    });
    expect(response.status()).toBe(200);
    expect(await response.json()).toMatchObject({ success: true });
    const cookie = (await page.context().cookies()).find((item) => item.name === "session_id");
    expect(cookie).toMatchObject({ httpOnly: true, path: "/", sameSite: "Lax" });
  });
}
