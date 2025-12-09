import { test as base, expect } from "@playwright/test";
import { attachSsoHeaderRouting } from "../utils/sso-header-routing";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:25090";
const EMAIL_HEADER_NAME = process.env.SSO_EMAIL_HEADER_NAME ?? "Remote-Email";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "admin@example.com";
const USER_EMAIL = process.env.USER_EMAIL ?? "user@test.local";

export const adminTest = base.extend({
  context: async ({ context }, use) => {
    await attachSsoHeaderRouting(context, {
      baseOrigin: BASE_URL,
      role: "admin",
      emailHeaderName: EMAIL_HEADER_NAME,
      adminEmail: ADMIN_EMAIL,
      userEmail: USER_EMAIL,
    });
    await use(context);
  },
});

export { expect };
