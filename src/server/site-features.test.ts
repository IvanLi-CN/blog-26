import { Database } from "bun:sqlite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { db, initializeDB } from "@/lib/db";
import { siteFeatureSettings } from "@/lib/schema";
import { versionIdentity } from "@/lib/version-info";
import { handleAdminApiRequest } from "@/server/admin-api/router";
import { handlePublicApiRequest } from "@/server/public-api/router";
import {
  getPublicSiteFeatureConfig,
  updateSiteFeatureSettings,
} from "@/server/services/site-features";

const testDbPath = path.join(process.cwd(), "tmp/site-features-test.sqlite");
const migrationsPath = path.resolve("drizzle");
const originalDbPath = process.env.DB_PATH;
const originalAdminEmail = process.env.ADMIN_EMAIL;
const originalBuildDefault = process.env.PUBLIC_ASSISTANT_LAUNCHER_DEFAULT;
const originalNodeEnv = process.env.NODE_ENV;

function request(pathname: string, init: RequestInit = {}) {
  return new Request(`http://localhost/api/public${pathname}`, {
    ...init,
    headers: {
      origin: "http://localhost",
      ...(init.headers ?? {}),
    },
  });
}

function adminRequest(pathname: string, init: RequestInit = {}, email?: string) {
  const headers = new Headers(init.headers);
  if (email) headers.set("Remote-Email", email);
  return new Request(`http://localhost${pathname}`, { ...init, headers });
}

async function publicConfig(siteVersion: string | null, init: RequestInit = {}) {
  const query = siteVersion === null ? "" : `?siteVersion=${encodeURIComponent(siteVersion)}`;
  return handlePublicApiRequest(request(`/runtime-config${query}`, init), "/runtime-config");
}

describe("site feature runtime configuration", () => {
  beforeAll(async () => {
    process.env.DB_PATH = testDbPath;
    process.env.ADMIN_EMAIL = "site-features-admin@test.local";
    process.env.NODE_ENV = "test";
    process.env.PUBLIC_ASSISTANT_LAUNCHER_DEFAULT = "true";
    fs.mkdirSync(path.dirname(testDbPath), { recursive: true });
    if (fs.existsSync(testDbPath)) fs.rmSync(testDbPath);
    const sqlite = new Database(testDbPath);
    migrate(drizzle(sqlite), { migrationsFolder: migrationsPath });
    sqlite.close();
    await initializeDB(true);
  });

  beforeEach(async () => {
    await db?.delete(siteFeatureSettings);
  });

  afterAll(async () => {
    db?.$client.close();
    if (originalDbPath === undefined) delete process.env.DB_PATH;
    else process.env.DB_PATH = originalDbPath;
    if (originalAdminEmail === undefined) delete process.env.ADMIN_EMAIL;
    else process.env.ADMIN_EMAIL = originalAdminEmail;
    if (originalBuildDefault === undefined) delete process.env.PUBLIC_ASSISTANT_LAUNCHER_DEFAULT;
    else process.env.PUBLIC_ASSISTANT_LAUNCHER_DEFAULT = originalBuildDefault;
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;
    if (fs.existsSync(testDbPath)) fs.rmSync(testDbPath);
  });

  it("returns only nested differences for the matching site version and supports ETag", async () => {
    const response = await publicConfig(versionIdentity);

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe(
      "public, max-age=30, stale-while-revalidate=30"
    );
    expect(await response.json()).toEqual({
      schemaVersion: 1,
      mode: "diff",
      features: { assistant: { launcher: {} } },
    });

    const etag = response.headers.get("etag");
    expect(etag).toMatch(/^"[a-f0-9]{64}"$/u);
    if (!etag) throw new Error("runtime config ETag is missing");
    const notModified = await publicConfig(versionIdentity, { headers: { "if-none-match": etag } });
    expect(notModified.status).toBe(304);
    expect(await notModified.text()).toBe("");
  });

  it("returns full effective features for a different version and keeps service enforcement server-side", async () => {
    await updateSiteFeatureSettings({
      expectedRevision: 0,
      assistant: { serviceEnabled: false, launcherEnabled: true },
    });

    const full = await publicConfig("other-product:other-source");
    expect(full.status).toBe(200);
    expect(await full.json()).toEqual({
      schemaVersion: 1,
      mode: "full",
      features: { assistant: { launcher: { enabled: false } } },
    });

    const disabled = await handlePublicApiRequest(request("/chat"), "/chat");
    expect(disabled.status).toBe(404);
    expect(await disabled.json()).toMatchObject({ code: "FEATURE_DISABLED" });

    await updateSiteFeatureSettings({
      expectedRevision: 1,
      assistant: { serviceEnabled: true, launcherEnabled: false },
    });
    const directChat = await handlePublicApiRequest(request("/chat"), "/chat");
    expect(directChat.status).toBe(401);
    expect(await directChat.json()).toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("merges a matching-version override over the build default", async () => {
    await updateSiteFeatureSettings({
      expectedRevision: 0,
      assistant: { serviceEnabled: true, launcherEnabled: false },
    });

    const config = await getPublicSiteFeatureConfig(versionIdentity);
    expect(JSON.parse(config.body)).toEqual({
      schemaVersion: 1,
      mode: "diff",
      features: { assistant: { launcher: { enabled: false } } },
    });
  });

  it("fails closed for damaged settings while preserving admin repair", async () => {
    await db.insert(siteFeatureSettings).values({
      id: "global",
      config: "not-json",
      revision: 0,
      updatedAt: Date.now(),
    });

    const publicResponse = await publicConfig(versionIdentity);
    expect(publicResponse.status).toBe(200);
    expect(await publicResponse.json()).toEqual({
      schemaVersion: 1,
      mode: "diff",
      features: { assistant: { launcher: { enabled: false } } },
    });

    const adminResponse = await handleAdminApiRequest(
      adminRequest("/api/admin/site-features", {}, "site-features-admin@test.local"),
      "/site-features"
    );
    expect(adminResponse.status).toBe(200);
    expect(await adminResponse.json()).toMatchObject({
      revision: 0,
      settings: { assistant: { serviceEnabled: false, launcherEnabled: false } },
    });

    const missingRevision = await handleAdminApiRequest(
      adminRequest(
        "/api/admin/site-features",
        {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            assistant: { serviceEnabled: true, launcherEnabled: true },
          }),
        },
        "site-features-admin@test.local"
      ),
      "/site-features"
    );
    expect(missingRevision.status).toBe(400);

    const repaired = await updateSiteFeatureSettings({
      expectedRevision: 0,
      assistant: { serviceEnabled: true, launcherEnabled: true },
    });
    expect(repaired).toMatchObject({
      revision: 1,
      resolved: { assistant: { serviceEnabled: true, publicLauncherEnabled: true } },
    });
  });

  it("protects the admin control surface and uses optimistic revisions", async () => {
    const anonymous = await handleAdminApiRequest(
      adminRequest("/api/admin/site-features"),
      "/site-features"
    );
    expect(anonymous.status).toBe(401);

    const member = await handleAdminApiRequest(
      adminRequest("/api/admin/site-features", {}, "site-features-member@test.local"),
      "/site-features"
    );
    expect(member.status).toBe(403);

    const initial = await handleAdminApiRequest(
      adminRequest("/api/admin/site-features", {}, "site-features-admin@test.local"),
      "/site-features"
    );
    expect(initial.status).toBe(200);
    expect(await initial.json()).toMatchObject({ revision: 0 });

    const saved = await handleAdminApiRequest(
      adminRequest(
        "/api/admin/site-features",
        {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            expectedRevision: 0,
            assistant: { serviceEnabled: false, launcherEnabled: true },
          }),
        },
        "site-features-admin@test.local"
      ),
      "/site-features"
    );
    expect(saved.status).toBe(200);
    expect(await saved.json()).toMatchObject({
      revision: 1,
      resolved: { assistant: { publicLauncherEnabled: false } },
    });

    const stale = await handleAdminApiRequest(
      adminRequest(
        "/api/admin/site-features",
        {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            expectedRevision: 0,
            assistant: { serviceEnabled: true, launcherEnabled: true },
          }),
        },
        "site-features-admin@test.local"
      ),
      "/site-features"
    );
    expect(stale.status).toBe(409);
    expect(await stale.json()).toMatchObject({ error: { code: "SITE_FEATURE_SETTINGS_CONFLICT" } });
  });
});
