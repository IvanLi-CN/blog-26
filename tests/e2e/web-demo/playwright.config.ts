import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  testMatch: "*.spec.ts",
  timeout: 45000,
  workers: 2,
  use: {
    baseURL: process.env.WEB_DEMO_TEST_URL ?? "http://127.0.0.1:38210",
    headless: true,
    viewport:
      process.env.WEB_DEMO_VIEWPORT === "mobile"
        ? { width: 393, height: 852 }
        : process.env.WEB_DEMO_VIEWPORT === "tablet"
          ? { width: 1024, height: 900 }
          : { width: 1440, height: 1000 },
  },
  reporter: [
    ["list"],
    ["json", { outputFile: process.env.WEB_DEMO_TEST_REPORT ?? "test-results/web-demo-csr.json" }],
  ],
});
