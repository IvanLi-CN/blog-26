import { describe, expect, it } from "bun:test";
import {
  DEFAULT_ASSISTANT_QUOTA_POLICY,
  FRONTEND_SESSION_COOKIE_NAME,
  FRONTEND_SESSION_DURATION_MS,
  type FrontendPrincipal,
} from "@/lib/assistant-contracts";

describe("site assistant shared contracts", () => {
  it("keeps the frontend session and quota defaults stable", () => {
    expect(FRONTEND_SESSION_COOKIE_NAME).toBe("frontend_session_id");
    expect(FRONTEND_SESSION_DURATION_MS).toBe(7 * 24 * 60 * 60 * 1000);
    expect(DEFAULT_ASSISTANT_QUOTA_POLICY).toMatchObject({
      tokenHourlyLimit: 10_000_000,
      tokenWeeklyLimit: 100_000_000,
      questionHourlyLimit: 60,
      questionWeeklyLimit: 300,
      maxConversations: 3,
      retentionMs: 7 * 24 * 60 * 60 * 1000,
    });
  });

  it("models an unbound administrator without requiring a GitHub identity", () => {
    const principal = {
      id: "frontend-admin",
      kind: "admin",
      isAdmin: true,
      displayName: "Station Admin",
      email: "admin@example.test",
      avatarUrl: "/site-assets/avatar.jpg",
      profileUrl: null,
      adminUserId: "admin-user",
      readerId: null,
      github: null,
    } satisfies FrontendPrincipal;

    expect(principal.github).toBeNull();
    expect(principal.avatarUrl).toBe("/site-assets/avatar.jpg");
  });
});
