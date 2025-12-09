import type { BrowserContext } from "@playwright/test";

export type SsoRole = "guest" | "user" | "admin";

export interface SsoHeaderRoutingOptions {
  baseOrigin: string;
  role: SsoRole;
  emailHeaderName: string;
  adminEmail: string;
  userEmail: string;
}

const SSO_ROUTING_ATTACHED = Symbol("sso-header-routing-attached");

export async function attachSsoHeaderRouting(
  context: BrowserContext,
  options: SsoHeaderRoutingOptions
): Promise<void> {
  if ((context as any)[SSO_ROUTING_ATTACHED]) return;
  (context as any)[SSO_ROUTING_ATTACHED] = true;

  const headerKeyLower = options.emailHeaderName.toLowerCase();

  await context.route("**/*", async (route, request) => {
    const url = new URL(request.url());
    const originalHeaders = request.headers();
    const headers: Record<string, string> = {};

    for (const [key, value] of Object.entries(originalHeaders)) {
      if (key.toLowerCase() === headerKeyLower) {
        // Normalize to the configured header name to avoid duplicates
        headers[options.emailHeaderName] = value;
      } else {
        headers[key] = value;
      }
    }

    if (url.origin === options.baseOrigin) {
      if (options.role === "admin") {
        headers[options.emailHeaderName] = options.adminEmail;
      } else if (options.role === "user") {
        headers[options.emailHeaderName] = options.userEmail;
      } else {
        delete headers[options.emailHeaderName];
      }
    } else {
      for (const key of Object.keys(headers)) {
        if (key.toLowerCase() === headerKeyLower) {
          delete headers[key];
        }
      }
    }

    await route.continue({ headers });
  });
}
