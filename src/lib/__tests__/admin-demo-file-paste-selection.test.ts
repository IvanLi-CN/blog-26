import { afterEach, describe, expect, test } from "bun:test";
import type { FileCopyResponse } from "@/lib/admin-api-client";
import { setupAdminDemoApiMocks } from "../../../apps/admin/src/demo/mock-admin-api";

type DemoWindow = {
  location: URL;
  fetch: typeof fetch;
  __adminDemoApiMockInstalled?: boolean;
};

const originalWindow = (globalThis as typeof globalThis & { window?: DemoWindow }).window;

function installDemoWindow() {
  const demoWindow: DemoWindow = {
    location: new URL("http://localhost/admin/posts/editor?demo=true"),
    fetch: globalThis.fetch.bind(globalThis),
    __adminDemoApiMockInstalled: false,
  };

  (globalThis as typeof globalThis & { window?: DemoWindow }).window = demoWindow;
  return demoWindow;
}

afterEach(() => {
  (globalThis as typeof globalThis & { window?: DemoWindow }).window = originalWindow;
});

describe("admin demo file paste selection", () => {
  test("copying multiple files returns the pasted target paths for selection recovery", async () => {
    const demoWindow = installDemoWindow();
    setupAdminDemoApiMocks();

    const response = await demoWindow.fetch("http://localhost/api/admin/files/copy", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        source: "local",
        paths: ["blog/01-react-hooks-deep-dive.md", "blog/02-typescript-advanced-types.md"],
        destinationPath: "blog/archive",
      }),
    });

    expect(response.ok).toBe(true);
    const payload = (await response.json()) as FileCopyResponse;

    expect(payload.copied.map((entry) => entry.nextPath)).toEqual([
      "blog/archive/01-react-hooks-deep-dive.md",
      "blog/archive/02-typescript-advanced-types.md",
    ]);
  });
});
