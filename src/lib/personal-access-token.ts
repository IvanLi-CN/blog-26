import { createHash, randomBytes } from "node:crypto";

const DEFAULT_PREFIX = "blog-pat-";

function normalizeEnvTag(raw: string): string {
  const trimmed = raw.trim().toLowerCase();
  if (trimmed === "prod" || trimmed === "production") {
    return "prod";
  }
  if (trimmed === "test" || trimmed === "testing") {
    return "test";
  }
  return trimmed
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-|-$/g, "");
}

function resolveEnvironmentTag(): string | undefined {
  const candidates = [
    process.env.BLOG_PAT_ENV,
    process.env.BLOG_RUNTIME_ENV,
    process.env.PAT_ENVIRONMENT,
    process.env.APP_ENV,
    process.env.PUBLIC_SITE_ENV,
  ];

  for (const candidate of candidates) {
    if (candidate && candidate.trim().length > 0) {
      return normalizeEnvTag(candidate);
    }
  }

  const nodeEnv = process.env.NODE_ENV?.toLowerCase();
  if (nodeEnv === "production") {
    return "prod";
  }
  if (nodeEnv === "test") {
    return "test";
  }

  return undefined;
}

export function getPersonalAccessTokenPrefix(): string {
  const explicitPrefix = process.env.BLOG_PAT_PREFIX?.trim();
  if (explicitPrefix) {
    return explicitPrefix;
  }

  const envTag = resolveEnvironmentTag();
  if (!envTag) {
    return DEFAULT_PREFIX;
  }

  if (envTag === "prod") {
    return "blog-prod-pat-";
  }
  if (envTag === "test") {
    return "blog-test-pat-";
  }

  return `blog-${envTag}-pat-`;
}

export function generatePersonalAccessTokenValue(
  prefix: string = getPersonalAccessTokenPrefix(),
  entropyBytes = 24
): string {
  const randomPart = randomBytes(entropyBytes).toString("base64url");
  return `${prefix}${randomPart}`;
}

export function hashPersonalAccessToken(token: string): string {
  return createHash("sha256").update(token).digest("base64");
}

export function isTokenForCurrentEnvironment(
  token: string,
  expectedPrefix: string = getPersonalAccessTokenPrefix()
): boolean {
  return token.startsWith(expectedPrefix);
}

export function getCurrentEnvironmentTag(): string | undefined {
  return resolveEnvironmentTag();
}
