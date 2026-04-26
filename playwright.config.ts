import { execSync } from "node:child_process";
import { dirname, resolve as resolvePath } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, devices } from "@playwright/test";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@example.com";
const USER_EMAIL = process.env.USER_EMAIL || "user@test.local";
const EMAIL_HEADER_NAME = process.env.SSO_EMAIL_HEADER_NAME || "Remote-Email";

function isPortBusy(port: number): boolean {
  try {
    const out = execSync(`lsof -tiTCP:${port} -sTCP:LISTEN -n || true`, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    return out.length > 0;
  } catch {
    return false;
  }
}

function pickPort(preferred: number, fallbacks: number[]): number {
  for (const candidate of [preferred, ...fallbacks]) {
    if (!isPortBusy(candidate)) return candidate;
  }
  return preferred;
}

const baseWeb = Number(process.env.WEB_PORT || process.env.PORT || 25090);
const WEB_PORT = pickPort(baseWeb, [baseWeb + 100, baseWeb + 200, baseWeb + 300]);
const INTERNAL_NEXT_PORT = Number(process.env.INTERNAL_NEXT_PORT || WEB_PORT + 2);
const SITE_PORT = Number(process.env.SITE_PORT || WEB_PORT + 3);
const BASE_URL = process.env.BASE_URL || `http://localhost:${WEB_PORT}`;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ABS_TEST_DB = resolvePath(__dirname, "test-data/sqlite.db");
const ABS_LOCAL_CONTENT = resolvePath(__dirname, "test-data/local");

const resetCommand = `DB_PATH=${ABS_TEST_DB} LOCAL_CONTENT_BASE_PATH=${ABS_LOCAL_CONTENT} CONTENT_SOURCES=local bun run test-env:reset-fs-only`;
const buildCommand = `DB_PATH=${ABS_TEST_DB} LOCAL_CONTENT_BASE_PATH=${ABS_LOCAL_CONTENT} CONTENT_SOURCES=local NEXT_PUBLIC_SITE_URL=${BASE_URL} PUBLIC_SITE_URL=${BASE_URL} bun run build`;
const startCommand = `NODE_ENV=production DB_PATH=${ABS_TEST_DB} LOCAL_CONTENT_BASE_PATH=${ABS_LOCAL_CONTENT} CONTENT_SOURCES=local NEXT_PUBLIC_SITE_URL=${BASE_URL} PUBLIC_SITE_URL=${BASE_URL} SERVE_PUBLIC_SITE=true PORT=${WEB_PORT} INTERNAL_NEXT_PORT=${INTERNAL_NEXT_PORT} SITE_PORT=${SITE_PORT} bun run gateway:start`;

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60 * 1000,
  expect: {
    timeout: 10 * 1000,
  },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [
    ["html", { outputFolder: "test-results/html-report", open: "never" }],
    ["json", { outputFile: "test-results/results.json" }],
    ["line"],
  ],
  outputDir: "test-results/artifacts/",
  use: {
    baseURL: BASE_URL,
    headless: process.env.HEADLESS !== "false",
    viewport: { width: 1280, height: 720 },
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    trace: "retain-on-failure",
    ignoreHTTPSErrors: true,
    actionTimeout: 10 * 1000,
    navigationTimeout: 30 * 1000,
  },
  projects: [
    {
      name: "guest-chromium",
      testMatch: [
        "**/guest/astro-front-phase1.spec.ts",
        "**/guest/hover-stability.spec.ts",
        "**/guest/nature-front-coverage.spec.ts",
        "**/guest/admin-access-denied.spec.ts",
        "**/guest/posts-cover-fallback.spec.ts",
      ],
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "admin-chromium",
      testMatch: [
        "**/admin/session-header-auth-admin.spec.ts",
        "**/admin/admin-spa-phase2.spec.ts",
        "**/admin/llm-settings.spec.ts",
      ],
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "user-chromium",
      testMatch: ["**/user/admin-access-denied.spec.ts"],
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: `${resetCommand} && ${buildCommand} && ${startCommand}`,
    url: BASE_URL,
    reuseExistingServer: Boolean(process.env.BASE_URL),
    timeout: 8 * 60 * 1000,
    env: {
      ADMIN_EMAIL,
      USER_EMAIL,
      DB_PATH: ABS_TEST_DB,
      LOCAL_CONTENT_BASE_PATH: ABS_LOCAL_CONTENT,
      CONTENT_SOURCES: "local",
      NEXT_PUBLIC_SITE_URL: BASE_URL,
      PUBLIC_SITE_URL: BASE_URL,
      SERVE_PUBLIC_SITE: "true",
      PORT: String(WEB_PORT),
      INTERNAL_NEXT_PORT: String(INTERNAL_NEXT_PORT),
      SITE_PORT: String(SITE_PORT),
      MEMOS_E2E_FAULTS: "1",
      SSO_EMAIL_HEADER_NAME: EMAIL_HEADER_NAME,
      LLM_SETTINGS_MASTER_KEY: process.env.LLM_SETTINGS_MASTER_KEY || "playwright-master-key",
    },
  },
});

process.env.BASE_URL = BASE_URL;
process.env.WEB_PORT = String(WEB_PORT);
process.env.PORT = String(WEB_PORT);
process.env.INTERNAL_NEXT_PORT = String(INTERNAL_NEXT_PORT);
process.env.SITE_PORT = String(SITE_PORT);
process.env.DB_PATH = ABS_TEST_DB;
process.env.LOCAL_CONTENT_BASE_PATH = ABS_LOCAL_CONTENT;
process.env.CONTENT_SOURCES = "local";
process.env.SSO_EMAIL_HEADER_NAME = EMAIL_HEADER_NAME;
process.env.ADMIN_EMAIL = ADMIN_EMAIL;
process.env.USER_EMAIL = USER_EMAIL;
process.env.MEMOS_E2E_FAULTS = "1";
