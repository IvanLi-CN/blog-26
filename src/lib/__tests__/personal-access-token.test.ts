import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  generatePersonalAccessTokenValue,
  getPersonalAccessTokenPrefix,
  hashPersonalAccessToken,
} from "../personal-access-token";

const ENV_KEYS = [
  "BLOG_PAT_ENV",
  "BLOG_RUNTIME_ENV",
  "PAT_ENVIRONMENT",
  "APP_ENV",
  "PUBLIC_SITE_ENV",
  "BLOG_PAT_PREFIX",
  "NODE_ENV",
];

let previousEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  previousEnv = {};
  for (const key of ENV_KEYS) {
    previousEnv[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    const value = previousEnv[key];
    if (typeof value === "string") {
      process.env[key] = value;
    } else {
      delete process.env[key];
    }
  }
});

describe("getPersonalAccessTokenPrefix", () => {
  test("returns default prefix in development", () => {
    process.env.NODE_ENV = "development";
    expect(getPersonalAccessTokenPrefix()).toBe("blog-pat-");
  });

  test("returns production prefix when NODE_ENV=production", () => {
    process.env.NODE_ENV = "production";
    expect(getPersonalAccessTokenPrefix()).toBe("blog-prod-pat-");
  });

  test("returns test prefix when NODE_ENV=test", () => {
    process.env.NODE_ENV = "test";
    expect(getPersonalAccessTokenPrefix()).toBe("blog-test-pat-");
  });

  test("prefers explicit BLOG_PAT_ENV over NODE_ENV", () => {
    process.env.NODE_ENV = "production";
    process.env.BLOG_PAT_ENV = "staging";
    expect(getPersonalAccessTokenPrefix()).toBe("blog-staging-pat-");
  });

  test("allows full prefix override via BLOG_PAT_PREFIX", () => {
    process.env.BLOG_PAT_PREFIX = "custom-prefix-";
    expect(getPersonalAccessTokenPrefix()).toBe("custom-prefix-");
  });
});

describe("generatePersonalAccessTokenValue", () => {
  test("includes prefix and random suffix", () => {
    process.env.BLOG_PAT_ENV = "ci";
    const prefix = getPersonalAccessTokenPrefix();
    const token = generatePersonalAccessTokenValue();
    expect(token.startsWith(prefix)).toBe(true);
    expect(token.length).toBeGreaterThan(prefix.length);
  });

  test("produces unique values across invocations", () => {
    const prefix = getPersonalAccessTokenPrefix();
    const tokenA = generatePersonalAccessTokenValue(prefix);
    const tokenB = generatePersonalAccessTokenValue(prefix);
    expect(tokenA).not.toEqual(tokenB);
  });
});

describe("hashPersonalAccessToken", () => {
  test("is deterministic for the same token", () => {
    const prefix = getPersonalAccessTokenPrefix();
    const token = generatePersonalAccessTokenValue(prefix, 8);
    const hashA = hashPersonalAccessToken(token);
    const hashB = hashPersonalAccessToken(token);
    expect(hashA).toEqual(hashB);
  });

  test("differs for different tokens", () => {
    const prefix = getPersonalAccessTokenPrefix();
    const tokenA = generatePersonalAccessTokenValue(prefix, 8);
    const tokenB = generatePersonalAccessTokenValue(prefix, 8);
    const hashA = hashPersonalAccessToken(tokenA);
    const hashB = hashPersonalAccessToken(tokenB);
    expect(hashA).not.toEqual(hashB);
  });
});
