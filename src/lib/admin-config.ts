export const DEFAULT_ADMIN_EMAIL = "admin@example.com";
export const E2E_BYPASS_HEADER = "x-e2e-bypass-admin";

export function getAdminEmail(): string {
  const envValue = process.env.ADMIN_EMAIL?.trim();
  return envValue && envValue.length > 0 ? envValue : DEFAULT_ADMIN_EMAIL;
}

export function getSsoEmailHeaderName(): string {
  return process.env.SSO_EMAIL_HEADER_NAME?.trim() || "Remote-Email";
}

export function isAdminBypassEnabled(): boolean {
  return process.env.E2E_BYPASS_ADMIN === "1";
}

export function isBypassHeaderPresent(headers?: Headers): boolean {
  if (!headers) {
    return false;
  }
  return headers.get(E2E_BYPASS_HEADER) === "1";
}
