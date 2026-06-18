import { describe, expect, it } from "bun:test";
import { spawnSync } from "node:child_process";

function runEntrypoint(env: Record<string, string | undefined>) {
  return spawnSync("bash", ["./docker-entrypoint.sh", "bun", "run", "gateway:start"], {
    cwd: process.cwd(),
    env: {
      PATH: process.env.PATH,
      ...env,
    },
    encoding: "utf8",
  });
}

describe("docker-entrypoint runtime config validation", () => {
  it("rejects production gateway startup without LLM_SETTINGS_MASTER_KEY", () => {
    const result = runEntrypoint({
      NODE_ENV: "production",
    });

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("LLM_SETTINGS_MASTER_KEY is required in production");
    expect(result.stdout).not.toContain("Environment variables (startup)");
  });

  it("does not require LLM_SETTINGS_MASTER_KEY outside production", () => {
    const result = runEntrypoint({
      NODE_ENV: "development",
    });

    expect(result.stdout).toContain("Runtime configuration validated");
    expect(result.stdout).not.toContain("LLM_SETTINGS_MASTER_KEY is required in production");
    expect(result.stdout).not.toContain("Environment variables (startup)");
  });

  it("rejects production public-site startup without public media facade runtime config", () => {
    const result = runEntrypoint({
      NODE_ENV: "production",
      LLM_SETTINGS_MASTER_KEY: "test-master-key",
      SERVE_PUBLIC_SITE: "true",
      PUBLIC_API_BASE_URL: "https://ivanli.cc",
    });

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("same-origin public media facade requires");
    expect(result.stdout).toContain("PUBLIC_MEDIA_IMAGOR_BASE_URL");
    expect(result.stdout).toContain("PUBLIC_MEDIA_INTERNAL_SOURCE_BASE_URL");
  });

  it("accepts production public-site startup when public media facade runtime config is complete", () => {
    const result = runEntrypoint({
      NODE_ENV: "production",
      LLM_SETTINGS_MASTER_KEY: "test-master-key",
      SERVE_PUBLIC_SITE: "true",
      PUBLIC_API_BASE_URL: "https://ivanli.cc",
      PUBLIC_MEDIA_IMAGOR_BASE_URL: "http://imagorvideo:8000",
      PUBLIC_MEDIA_INTERNAL_SOURCE_BASE_URL: "http://blog:25090",
    });

    expect(result.stdout).toContain("Public media runtime configuration validated");
    expect(result.stdout).toContain("Runtime configuration validated");
    expect(result.stdout).not.toContain("same-origin public media facade requires");
  });
});
