import { afterEach, describe, expect, it } from "bun:test";
import { handleTestApiRequest } from "./router";

const originalNodeEnv = process.env.NODE_ENV;
const originalEnableDevEndpoints = process.env.ENABLE_DEV_ENDPOINTS;

afterEach(() => {
  process.env.NODE_ENV = originalNodeEnv;
  if (originalEnableDevEndpoints === undefined) {
    delete process.env.ENABLE_DEV_ENDPOINTS;
  } else {
    process.env.ENABLE_DEV_ENDPOINTS = originalEnableDevEndpoints;
  }
});

describe("test API router", () => {
  it("rejects test routes in production unless explicitly enabled", async () => {
    process.env.NODE_ENV = "production";
    delete process.env.ENABLE_DEV_ENDPOINTS;

    const response = await handleTestApiRequest(
      new Request("http://local/api/test/headers"),
      "/headers"
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "Not Found" });
  });

  it("allows test routes when production compatibility endpoints are explicitly enabled", async () => {
    process.env.NODE_ENV = "production";
    process.env.ENABLE_DEV_ENDPOINTS = "true";

    const response = await handleTestApiRequest(
      new Request("http://local/api/test/headers"),
      "/headers"
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      headerName: "Remote-Email",
      forwardedEmail: null,
    });
  });
});
