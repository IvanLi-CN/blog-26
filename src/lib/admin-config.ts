export const DEFAULT_ADMIN_EMAIL = "admin@example.com";

function getBooleanEnv(name: string): boolean {
  const value = process.env[name]?.trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes" || value === "on";
}

export function getAdminEmail(): string {
  const envValue = process.env.ADMIN_EMAIL?.trim();
  return envValue && envValue.length > 0 ? envValue : DEFAULT_ADMIN_EMAIL;
}

export function getSsoEmailHeaderName(): string {
  return process.env.SSO_EMAIL_HEADER_NAME?.trim() || "Remote-Email";
}

export function allowAdminSessionInProduction(): boolean {
  return getBooleanEnv("ALLOW_ADMIN_SESSION_IN_PRODUCTION");
}

// Test-time admin bypass is not allowed. Use SSO header emulation only.
