import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..", "..");

export const E2E_DEFAULT_DB_PATH = path.resolve(REPO_ROOT, "test-data/sqlite.db");
export const E2E_DEFAULT_LOCAL_CONTENT_PATH = path.resolve(REPO_ROOT, "test-data/local");
export const E2E_DEFAULT_WEB_PORT = 25090;
export const E2E_DEFAULT_BASE_URL = `http://localhost:${E2E_DEFAULT_WEB_PORT}`;
export const E2E_DEFAULT_SITE_PORT = E2E_DEFAULT_WEB_PORT + 3;
export const E2E_DEFAULT_ADMIN_PORT = E2E_DEFAULT_WEB_PORT + 4;

export const E2E_ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@example.com";
export const E2E_USER_EMAIL = process.env.USER_EMAIL || "user@test.local";
export const E2E_EMAIL_HEADER_NAME = process.env.SSO_EMAIL_HEADER_NAME || "Remote-Email";
export const E2E_MCP_PROTOCOL_VERSION = "2025-03-26";
export const E2E_MCP_TEST_PAT_TOKEN =
  process.env.MCP_TEST_PAT_TOKEN || "blog-test-pat-mcp-admin-seed-token-e2e";

export function readE2EDbPath() {
  return path.resolve(process.cwd(), process.env.DB_PATH || E2E_DEFAULT_DB_PATH);
}

export function readE2ELocalContentPath() {
  return path.resolve(
    process.cwd(),
    process.env.LOCAL_CONTENT_BASE_PATH || E2E_DEFAULT_LOCAL_CONTENT_PATH
  );
}

export function readE2EBaseUrl() {
  return process.env.BASE_URL || E2E_DEFAULT_BASE_URL;
}

export function readE2EWebPort() {
  return Number(process.env.WEB_PORT || process.env.PORT || E2E_DEFAULT_WEB_PORT);
}

export function readE2ESitePort() {
  return Number(process.env.SITE_PORT || readE2EWebPort() + 3);
}

export function readE2EAdminPort() {
  return Number(process.env.ADMIN_PORT || readE2EWebPort() + 4);
}
