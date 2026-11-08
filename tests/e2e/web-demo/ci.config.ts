import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

export const consoleFiles = [
  "console-memo-boundary.spec.ts",
  "console-comments.spec.ts",
  "content-sync.spec.ts",
  "project-status.spec.ts",
  "system-share.spec.ts",
  "ai-usage.spec.ts",
  "dashboard.spec.ts",
];
export const publicFiles = [
  "public-csr.spec.ts",
  "public-comments.spec.ts",
  "project-runtime-motion.spec.ts",
  "search-modes.spec.ts",
  "github-admin-binding.spec.ts",
  "public-cover-media.spec.ts",
  "assistant.spec.ts",
];
const mobile = process.env.WEB_DEMO_VIEWPORT === "mobile";
const match = (files: string[]) => files.map((name) => `**/${name}`);

export default defineConfig({
  ...base,
  workers: 2,
  // Share one worker budget across the suites; each test still gets a fresh context.
  projects: [
    ...(!mobile
      ? [
          {
            name: "assistant-markdown",
            testMatch: match(["assistant-markdown.spec.ts"]),
            fullyParallel: false,
            retries: 0,
            use: { baseURL: process.env.WEB_DEMO_TEST_URL ?? "http://127.0.0.1:38211" },
          },
        ]
      : []),
    {
      name: "console",
      testMatch: match(consoleFiles),
      fullyParallel: true,
      retries: 2,
      use: { baseURL: process.env.WEB_DEMO_CONSOLE_TEST_URL ?? "http://127.0.0.1:38210" },
      ...(mobile ? { grepInvert: /@own-viewport/ } : {}),
    },
    {
      name: "public",
      testMatch: match(
        mobile
          ? publicFiles.filter((file) => file !== "project-runtime-motion.spec.ts")
          : publicFiles
      ),
      fullyParallel: true,
      retries: 0,
      use: { baseURL: process.env.WEB_DEMO_TEST_URL ?? "http://127.0.0.1:38211" },
      ...(mobile ? { grepInvert: /@own-viewport/ } : {}),
    },
  ],
});
