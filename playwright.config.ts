import { execSync } from "node:child_process";
import { defineConfig, devices } from "@playwright/test";
import {
  E2E_ADMIN_EMAIL,
  E2E_DEFAULT_DB_PATH,
  E2E_DEFAULT_LOCAL_CONTENT_PATH,
  E2E_EMAIL_HEADER_NAME,
  E2E_MCP_TEST_PAT_TOKEN,
  E2E_USER_EMAIL,
} from "./tests/e2e/runtime";
import {
  E2E_FULL_EXCLUDED_TAG_PATTERN,
  E2E_PROJECTS,
  getProjectReportDir,
  getProjectSpecGlob,
  readExplicitE2ETagFilter,
} from "./tests/e2e/taxonomy";

const ADMIN_EMAIL = E2E_ADMIN_EMAIL;
const USER_EMAIL = E2E_USER_EMAIL;
const EMAIL_HEADER_NAME = E2E_EMAIL_HEADER_NAME;

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

function readUrlPort(value: string): number {
  const parsed = new URL(value);
  if (parsed.port) {
    return Number(parsed.port);
  }
  return parsed.protocol === "https:" ? 443 : 80;
}

const baseWeb = Number(process.env.WEB_PORT || process.env.PORT || 25090);
const WEB_PORT = pickPort(baseWeb, [baseWeb + 100, baseWeb + 200, baseWeb + 300]);
const SITE_PORT = Number(process.env.SITE_PORT || WEB_PORT + 3);
const ADMIN_PORT = Number(process.env.ADMIN_PORT || WEB_PORT + 4);
const BASE_URL = process.env.BASE_URL || `http://localhost:${WEB_PORT}`;
const ABS_TEST_DB = process.env.DB_PATH || E2E_DEFAULT_DB_PATH;
const ABS_LOCAL_CONTENT = process.env.LOCAL_CONTENT_BASE_PATH || E2E_DEFAULT_LOCAL_CONTENT_PATH;
const REPORT_ROOT = process.env.PLAYWRIGHT_REPORT_ROOT || "test-results";
const testProject = process.env.PLAYWRIGHT_TEST_PROJECT;
const explicitTagFilter = readExplicitE2ETagFilter();
const skipReset = process.env.PLAYWRIGHT_SKIP_RESET === "1";
const skipBuild = process.env.PLAYWRIGHT_SKIP_BUILD === "1";
const publicMediaImagorBaseUrl = (
  process.env.PUBLIC_MEDIA_IMAGOR_BASE_URL || "http://127.0.0.1:18000"
).trim();
const publicMediaInternalSourceBaseUrl = (
  process.env.PUBLIC_MEDIA_INTERNAL_SOURCE_BASE_URL || `http://host.docker.internal:${WEB_PORT}`
).trim();
const shouldStartPublicMediaSidecar =
  (process.env.PLAYWRIGHT_START_PUBLIC_MEDIA_SIDECAR || "1").trim() !== "0" &&
  Boolean(publicMediaImagorBaseUrl) &&
  Boolean(publicMediaInternalSourceBaseUrl);
const publicMediaImagorPort = readUrlPort(publicMediaImagorBaseUrl);
const jsonResultFile = testProject
  ? `${getProjectReportDir(testProject as (typeof E2E_PROJECTS)[number])}/results.json`
  : `${REPORT_ROOT}/results.json`;
const htmlReportDir = testProject
  ? `${getProjectReportDir(testProject as (typeof E2E_PROJECTS)[number])}/html-report`
  : `${REPORT_ROOT}/html-report`;

const shouldManageServer = process.env.PLAYWRIGHT_DISABLE_WEBSERVER !== "1";
const resetCommand = `DB_PATH=${ABS_TEST_DB} LOCAL_CONTENT_BASE_PATH=${ABS_LOCAL_CONTENT} CONTENT_SOURCES=local bun run test-env:reset-fs-only`;
const buildCommand = `DB_PATH=${ABS_TEST_DB} LOCAL_CONTENT_BASE_PATH=${ABS_LOCAL_CONTENT} CONTENT_SOURCES=local PUBLIC_SITE_URL=${BASE_URL} PUBLIC_API_BASE_URL=${BASE_URL} bun run build`;
const startCommand = `NODE_ENV=production ENABLE_DEV_ENDPOINTS=true DB_PATH=${ABS_TEST_DB} LOCAL_CONTENT_BASE_PATH=${ABS_LOCAL_CONTENT} CONTENT_SOURCES=local PUBLIC_SITE_URL=${BASE_URL} PUBLIC_API_BASE_URL=${BASE_URL} SERVE_PUBLIC_SITE=true PORT=${WEB_PORT} SITE_PORT=${SITE_PORT} ADMIN_PORT=${ADMIN_PORT} bun run gateway:start`;
const webServerCommand = [
  skipReset ? null : resetCommand,
  skipBuild ? null : buildCommand,
  startCommand,
]
  .filter(Boolean)
  .join(" && ");
const publicMediaSidecarCommand = shouldStartPublicMediaSidecar
  ? `bun ./scripts/start-public-media-sidecar.ts`
  : null;
const publicMediaSidecarEnv =
  shouldStartPublicMediaSidecar && publicMediaSidecarCommand
    ? {
        PUBLIC_MEDIA_IMAGOR_BASE_URL: publicMediaImagorBaseUrl,
        PUBLIC_MEDIA_INTERNAL_SOURCE_BASE_URL: publicMediaInternalSourceBaseUrl,
        PLAYWRIGHT_TEST_PROJECT: testProject || "default",
        PLAYWRIGHT_PUBLIC_MEDIA_CONTAINER_NAME:
          process.env.PLAYWRIGHT_PUBLIC_MEDIA_CONTAINER_NAME || "",
      }
    : null;

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
  grep: explicitTagFilter ? new RegExp(explicitTagFilter.replace("@", "\\@")) : undefined,
  grepInvert: explicitTagFilter ? undefined : E2E_FULL_EXCLUDED_TAG_PATTERN,
  reporter: [
    ["html", { outputFolder: htmlReportDir, open: "never" }],
    ["json", { outputFile: jsonResultFile }],
    ["line"],
  ],
  outputDir: testProject
    ? `${getProjectReportDir(testProject as (typeof E2E_PROJECTS)[number])}/artifacts`
    : "test-results/artifacts/",
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
  projects: E2E_PROJECTS.map((project) => ({
    name: project,
    testMatch: getProjectSpecGlob(project),
    use: { ...devices["Desktop Chrome"] },
  })),
  webServer: shouldManageServer
    ? [
        ...(publicMediaSidecarCommand
          ? [
              {
                command: publicMediaSidecarCommand,
                port: publicMediaImagorPort,
                name: "Public media sidecar",
                reuseExistingServer: process.env.PLAYWRIGHT_REUSE_EXTERNAL_SERVER === "1",
                timeout: 2 * 60 * 1000,
                gracefulShutdown: {
                  signal: "SIGTERM" as const,
                  timeout: 5_000,
                },
                env: publicMediaSidecarEnv || undefined,
              },
            ]
          : []),
        {
          command: webServerCommand,
          url: BASE_URL,
          reuseExistingServer: process.env.PLAYWRIGHT_REUSE_EXTERNAL_SERVER === "1",
          timeout: 8 * 60 * 1000,
          env: {
            ADMIN_EMAIL,
            USER_EMAIL,
            BLOG_PAT_ENV: "test",
            DB_PATH: ABS_TEST_DB,
            LOCAL_CONTENT_BASE_PATH: ABS_LOCAL_CONTENT,
            CONTENT_SOURCES: "local",
            ENABLE_DEV_ENDPOINTS: "true",
            ALLOW_ADMIN_SESSION_IN_PRODUCTION: "true",
            PUBLIC_SITE_URL: BASE_URL,
            PUBLIC_API_BASE_URL: BASE_URL,
            SERVE_PUBLIC_SITE: "true",
            PORT: String(WEB_PORT),
            SITE_PORT: String(SITE_PORT),
            ADMIN_PORT: String(ADMIN_PORT),
            MEMOS_E2E_FAULTS: "1",
            MCP_TEST_PAT_TOKEN: E2E_MCP_TEST_PAT_TOKEN,
            SSO_EMAIL_HEADER_NAME: EMAIL_HEADER_NAME,
            LLM_SETTINGS_MASTER_KEY: process.env.LLM_SETTINGS_MASTER_KEY || "playwright-master-key",
            LLM_MODEL_CATALOG_SKIP_REFRESH: "1",
            ...(publicMediaImagorBaseUrl
              ? { PUBLIC_MEDIA_IMAGOR_BASE_URL: publicMediaImagorBaseUrl }
              : {}),
            ...(publicMediaInternalSourceBaseUrl
              ? { PUBLIC_MEDIA_INTERNAL_SOURCE_BASE_URL: publicMediaInternalSourceBaseUrl }
              : {}),
          },
        },
      ]
    : undefined,
});

process.env.BASE_URL = BASE_URL;
process.env.WEB_PORT = String(WEB_PORT);
process.env.PORT = String(WEB_PORT);
process.env.SITE_PORT = String(SITE_PORT);
process.env.ADMIN_PORT = String(ADMIN_PORT);
process.env.DB_PATH = ABS_TEST_DB;
process.env.LOCAL_CONTENT_BASE_PATH = ABS_LOCAL_CONTENT;
process.env.CONTENT_SOURCES = "local";
process.env.ENABLE_DEV_ENDPOINTS = "true";
process.env.ALLOW_ADMIN_SESSION_IN_PRODUCTION = "true";
process.env.PUBLIC_API_BASE_URL = BASE_URL;
process.env.BLOG_PAT_ENV = process.env.BLOG_PAT_ENV || "test";
process.env.SSO_EMAIL_HEADER_NAME = EMAIL_HEADER_NAME;
process.env.ADMIN_EMAIL = ADMIN_EMAIL;
process.env.USER_EMAIL = USER_EMAIL;
process.env.MEMOS_E2E_FAULTS = "1";
process.env.MCP_TEST_PAT_TOKEN = process.env.MCP_TEST_PAT_TOKEN || E2E_MCP_TEST_PAT_TOKEN;
process.env.LLM_MODEL_CATALOG_SKIP_REFRESH = process.env.LLM_MODEL_CATALOG_SKIP_REFRESH || "1";
