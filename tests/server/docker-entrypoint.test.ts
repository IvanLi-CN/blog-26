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
      WEBDAV_URL: "http://webdav.example.test",
    });

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("LLM_SETTINGS_MASTER_KEY is required in production");
    expect(result.stdout).not.toContain("Environment variables (startup)");
  });

  it("does not require LLM_SETTINGS_MASTER_KEY outside production", () => {
    const result = runEntrypoint({
      NODE_ENV: "development",
      WEBDAV_URL: "http://webdav.example.test",
    });

    expect(result.stdout).toContain("Runtime configuration validated");
    expect(result.stdout).not.toContain("LLM_SETTINGS_MASTER_KEY is required in production");
    expect(result.stdout).not.toContain("Environment variables (startup)");
  });
});
