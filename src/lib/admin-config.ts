/**
 * Centralized admin-related configuration helpers.
 * Reads from environment variables and applies sane defaults.
 */

export function getAdminEmail(): string | null {
  const val = process.env.ADMIN_EMAIL?.trim();
  if (!val) return null;
  return val.includes("@") ? val : val;
}

export function getSsoEmailHeaderName(): string {
  const val = process.env.SSO_EMAIL_HEADER_NAME?.trim();
  return val && val.length > 0 ? val : "Remote-Email";
}
