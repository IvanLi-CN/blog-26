import { describe, expect, it } from "bun:test";
import { buildSingleProjectEnv } from "../../scripts/run-e2e";

describe("run-e2e single-project env", () => {
  it("lets Playwright derive the internal source URL from the selected web port by default", () => {
    const env = buildSingleProjectEnv("guest", {
      PATH: process.env.PATH,
      WEB_PORT: "26110",
    });

    expect(env.PLAYWRIGHT_TEST_PROJECT).toBe("guest");
    expect(env.WEB_PORT).toBe("26110");
    expect(env.PUBLIC_MEDIA_IMAGOR_BASE_URL).toBeUndefined();
    expect(env.PUBLIC_MEDIA_INTERNAL_SOURCE_BASE_URL).toBeUndefined();
  });

  it("preserves explicit public media overrides when the caller provides them", () => {
    const env = buildSingleProjectEnv("admin", {
      PATH: process.env.PATH,
      PUBLIC_MEDIA_IMAGOR_BASE_URL: " http://127.0.0.1:18123 ",
      PUBLIC_MEDIA_INTERNAL_SOURCE_BASE_URL: " http://host.docker.internal:26110 ",
    });

    expect(env.PLAYWRIGHT_TEST_PROJECT).toBe("admin");
    expect(env.PUBLIC_MEDIA_IMAGOR_BASE_URL).toBe("http://127.0.0.1:18123");
    expect(env.PUBLIC_MEDIA_INTERNAL_SOURCE_BASE_URL).toBe("http://host.docker.internal:26110");
  });
});
