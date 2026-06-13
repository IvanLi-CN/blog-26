import { afterEach, describe, expect, test } from "bun:test";
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

describe("admin demo file tree", () => {
  test("blog directory exposes at least twelve immediate files for selection QA", async () => {
    const demoWindow = installDemoWindow();
    setupAdminDemoApiMocks();

    const response = await demoWindow.fetch(
      "http://localhost/api/admin/files/tree?source=local&path=/blog/"
    );
    expect(response.ok).toBe(true);

    const payload = (await response.json()) as { items: Array<{ name: string; type: string }> };
    const fileNames = payload.items
      .filter((item) => item.type === "file")
      .map((item) => item.name)
      .sort((left, right) => left.localeCompare(right));

    expect(fileNames.length).toBeGreaterThanOrEqual(12);
    expect(fileNames).toContain("01-react-hooks-deep-dive.md");
    expect(fileNames).toContain("12-content-taxonomy-migration-plan.md");
  });
});
