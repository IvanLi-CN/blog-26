import { expect, test } from "@playwright/test";

// 1x1 PNG
const ONE_BY_ONE_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAASsJTYQAAAAASUVORK5CYII=";

test.describe("Files API - inline image upload via WebDAV (guest)", () => {
  test.beforeAll(async ({ request }) => {
    const base = "http://localhost:25091";
    await request.fetch(`${base}/Memos`, { method: "MKCOL" }).catch(() => {});
    await request.fetch(`${base}/Memos/assets`, { method: "MKCOL" }).catch(() => {});
  });

  test("POST /api/files/webdav/Memos/assets/inline-*.png returns 200", async ({
    request,
    baseURL,
  }) => {
    const filename = `inline-${Date.now()}.png`;
    const url = `${baseURL}/api/files/webdav/Memos/assets/${filename}`;

    const buffer = Buffer.from(ONE_BY_ONE_PNG_BASE64, "base64");

    const resp = await request.post(url, {
      multipart: {
        file: {
          name: filename,
          mimeType: "image/png",
          buffer,
        },
      },
    });

    expect(resp.ok()).toBeTruthy();
    const json = await resp.json();
    expect(json.success).toBeTruthy();

    // Read back
    const read = await request.get(`${baseURL}/api/files/webdav/Memos/assets/${filename}`);
    expect(read.ok()).toBeTruthy();
    expect(read.headers()["content-type"]).toContain("image/png");
  });

  // Note: Some WebDAV servers (like dufs used in tests) may implicitly create
  // intermediate collection segments, so posting to "...md/inline.png" can succeed.
  // We only verify the correct path succeeds end-to-end in this suite.
});
