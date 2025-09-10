/**
 * Simple local reverse proxy using Bun.serve
 * Injects an SSO email header to simulate Traefik/SSO forward auth in dev.
 */
import { serve } from "bun";

const target = process.env.TARGET || "http://localhost:3000";
const port = Number(process.env.PORT || 4000);
const headerName = process.env.SSO_EMAIL_HEADER_NAME || "Remote-Email";
const headerValue = process.env.ADMIN_EMAIL || "admin@test.local";

console.log(
  `Starting local proxy on :${port} -> ${target} with header ${headerName}=${headerValue}`
);

const server = serve({
  port,
  idleTimeout: 60,
  async fetch(req) {
    const url = new URL(req.url);
    const upstreamUrl = new URL(url.pathname + url.search, target);

    const headers = new Headers(req.headers);
    headers.set(headerName, headerValue);

    // Avoid host mismatch issues for Next.js by passing original host and X-Forwarded-* headers
    headers.set("x-forwarded-host", headers.get("host") || `localhost:${port}`);
    headers.set("x-forwarded-proto", "http");
    headers.set("host", new URL(target).host);

    const res = await fetch(upstreamUrl, {
      method: req.method,
      headers,
      body: req.body,
      redirect: "manual",
    });

    return res;
  },
});

console.log(`Local proxy listening on http://localhost:${server.port}`);
