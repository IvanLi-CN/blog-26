export const DEFAULT_ADMIN_EMAIL = "admin@example.com";

export function getAdminEmail(): string {
  const envValue = process.env.ADMIN_EMAIL?.trim();
  return envValue && envValue.length > 0 ? envValue : DEFAULT_ADMIN_EMAIL;
}

export function getSsoEmailHeaderName(): string {
  return process.env.SSO_EMAIL_HEADER_NAME?.trim() || "Remote-Email";
}

// Test-time admin bypass is not allowed. Use SSO header emulation only.
