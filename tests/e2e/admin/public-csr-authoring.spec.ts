import { E2E_ADMIN_EMAIL } from "../runtime";
import { expect, adminTest as test } from "./fixtures";

for (const method of ["DELETE", "PATCH"]) {
  test(`CSR navigation cancels pending Memo ${method} without replacing the new route`, async ({
    page,
  }) => {
    await page.request.post("/api/dev/login", { data: { email: E2E_ADMIN_EMAIL } });
    const memo = {
      id: "csr-pending-author-fixture",
      slug: "local-memo",
      title: "Pending author fixture",
      content: "Controlled author response; no real write.",
      isPublic: true,
      tags: [],
    };
    let releaseResponse = () => {
      /* Assigned synchronously below. */
    };
    const responseGate = new Promise<void>((resolve) => {
      releaseResponse = resolve;
    });
    await page.route("**/api/public/memos/local-memo", async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({ json: memo });
      } else {
        expect(route.request().method()).toBe(method);
        await responseGate;
        await route.fulfill({ json: method === "DELETE" ? { success: true } : memo }).catch(() => {
          /* Cancellation can close the intercepted request before release. */
        });
      }
    });
    try {
      await page.goto("/memos/local-memo/");
      await expect(page.getByTestId("admin-live-memo-delete")).toBeEnabled();
      await page.getByRole("link", { name: "项目", exact: true }).click();
      await expect(page.locator("main.nature-main h1")).toHaveText("项目");
      await page.goBack();
      await expect(page.getByTestId("admin-live-memo-delete")).toBeEnabled();
      const write = page.waitForRequest(
        (request) =>
          new URL(request.url()).pathname === "/api/public/memos/local-memo" &&
          request.method() === method
      );
      if (method === "DELETE") {
        page.once("dialog", (dialog) => dialog.accept());
        await page.getByTestId("admin-live-memo-delete").click();
      } else {
        await page.getByRole("button", { name: "编辑 Memo", exact: true }).click();
        await expect(page.locator('[role="dialog"] .ProseMirror')).toBeVisible();
        await page.getByRole("button", { name: "保存更改", exact: true }).click();
      }
      const request = await write;
      const cancelled = page.waitForEvent("requestfailed", {
        predicate: (candidate) => candidate === request,
        timeout: 10000,
      });
      await page.goForward();
      await cancelled;
      releaseResponse();
      await expect(page).toHaveURL(/\/projects\/$/);
      await expect(page.locator("main.nature-main h1")).toHaveText("项目");
    } finally {
      releaseResponse();
    }
  });
}

test("shared CSR preserves console authoring and excludes private data on the public host", async ({
  page,
}) => {
  await page.request.post("/api/dev/login", { data: { email: E2E_ADMIN_EMAIL } });
  const marker = `csr-private-${Date.now()}`;
  const created = await page.request.post("/api/public/memos", {
    data: { content: `# ${marker}\n\nPrivate CSR fixture.`, isPublic: false, tags: [] },
  });
  expect(created.ok()).toBeTruthy();
  const { slug } = (await created.json()) as { slug: string };
  try {
    await page.goto("/posts/");
    await page.waitForFunction(
      () =>
        !document.querySelector('astro-island[component-url*="PublicRouter"]')?.hasAttribute("ssr")
    );
    const documents: string[] = [];
    page.on("request", (request) => {
      if (request.resourceType() === "document") documents.push(request.url());
    });
    const read = page.waitForResponse(
      (response) => new URL(response.url()).pathname === "/api/public/page"
    );
    await page.getByRole("link", { name: "闪念", exact: true }).click();
    const response = await read;
    expect(response.headers()["cache-control"]).toContain("no-store");
    expect(response.headers()["cache-control"]).toContain("private");
    const payload = await response.json();
    expect(payload.kind).toBe("memos");
    expect(payload.data.initialIsAdmin).toBe(true);
    expect(JSON.stringify(payload.data.initialAuthorMemos)).toContain(marker);
    await expect(page.getByTestId("admin-live-memo-list-items")).toBeVisible();
    expect(documents).toEqual([]);

    const publicRead = await page.request.get("/api/public/page?path=%2Fmemos%2F", {
      headers: { host: "ivanli.cc", "remote-email": E2E_ADMIN_EMAIL },
    });
    expect(publicRead.ok()).toBeTruthy();
    const publicPayload = await publicRead.json();
    expect(publicPayload.data.initialIsAdmin).toBe(false);
    expect(publicPayload.data.initialAuthorMemos).toEqual([]);
    expect(JSON.stringify(publicPayload)).not.toContain(marker);
  } finally {
    const deleted = await page.request.delete(`/api/public/memos/${encodeURIComponent(slug)}`, {
      headers: { "remote-email": E2E_ADMIN_EMAIL, origin: new URL(page.url()).origin },
      data: {},
    });
    expect(deleted.ok(), await deleted.text()).toBeTruthy();
  }
});
