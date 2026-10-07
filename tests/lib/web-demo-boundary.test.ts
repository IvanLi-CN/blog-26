import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const layout = readFileSync(resolve(process.cwd(), "site/layouts/BaseLayout.astro"), "utf8");

describe("Web Demo request boundary", () => {
  it("keeps simulated connectivity out of the shared document layout", () => {
    expect(layout).toContain("<ClientRouter />");
    expect(layout).not.toContain("web-demo-navigation-feedback");
    expect(layout).not.toContain("web-demo-navigation");
  });
});
