import { describe, expect, it } from "bun:test";

import { resolveDevWebdavConfig } from "@/lib/dev-webdav-config";

describe("resolveDevWebdavConfig", () => {
  it("uses defaults when no env is set", () => {
    const cfg = resolveDevWebdavConfig({} as NodeJS.ProcessEnv);
    expect(cfg.port).toBe(25091);
    expect(cfg.host).toBe("localhost");
    expect(cfg.strict).toBe(false);
    expect(cfg.source).toBe("default");
    expect(cfg.rootPath.endsWith("/dev-data/webdav")).toBe(true);
  });

  it("uses WEBDAV_PORT in strict mode", () => {
    const cfg = resolveDevWebdavConfig({ WEBDAV_PORT: "25601" } as NodeJS.ProcessEnv);
    expect(cfg.port).toBe(25601);
    expect(cfg.strict).toBe(true);
    expect(cfg.source).toBe("WEBDAV_PORT");
  });

  it("uses DAV_PORT in strict mode", () => {
    const cfg = resolveDevWebdavConfig({ DAV_PORT: "25601" } as NodeJS.ProcessEnv);
    expect(cfg.port).toBe(25601);
    expect(cfg.strict).toBe(true);
    expect(cfg.source).toBe("DAV_PORT");
  });

  it("uses WEBDAV_URL in strict mode", () => {
    const cfg = resolveDevWebdavConfig({
      WEBDAV_URL: "http://localhost:25601",
    } as NodeJS.ProcessEnv);
    expect(cfg.port).toBe(25601);
    expect(cfg.host).toBe("localhost");
    expect(cfg.strict).toBe(true);
    expect(cfg.source).toBe("WEBDAV_URL");
  });

  it("throws when WEBDAV_URL has no port", () => {
    expect(() =>
      resolveDevWebdavConfig({ WEBDAV_URL: "http://localhost" } as NodeJS.ProcessEnv)
    ).toThrow();
  });

  it("throws when WEBDAV_URL host is not local", () => {
    expect(() =>
      resolveDevWebdavConfig({ WEBDAV_URL: "http://example.com:25601" } as NodeJS.ProcessEnv)
    ).toThrow();
  });

  it("throws when DAV_PORT does not match WEBDAV_URL port", () => {
    expect(() =>
      resolveDevWebdavConfig({
        DAV_PORT: "25602",
        WEBDAV_URL: "http://localhost:25601",
      } as NodeJS.ProcessEnv)
    ).toThrow();
  });
});
