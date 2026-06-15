import { test as base, expect } from "@playwright/test";
import { E2E_ADMIN_EMAIL, E2E_EMAIL_HEADER_NAME, E2E_USER_EMAIL, readE2EBaseUrl } from "../runtime";
import { attachSsoHeaderRouting } from "../utils/sso-header-routing";

const BASE_URL = readE2EBaseUrl();
const EMAIL_HEADER_NAME = E2E_EMAIL_HEADER_NAME;
const ADMIN_EMAIL = E2E_ADMIN_EMAIL;
const USER_EMAIL = E2E_USER_EMAIL;

export const userTest = base.extend({
  context: async ({ context }, use) => {
    await attachSsoHeaderRouting(context, {
      baseOrigin: BASE_URL,
      role: "user",
      emailHeaderName: EMAIL_HEADER_NAME,
      adminEmail: ADMIN_EMAIL,
      userEmail: USER_EMAIL,
    });
    await use(context);
  },
});

export { expect };
