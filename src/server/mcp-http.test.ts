import { describe, expect, it } from "bun:test";
import { resolveMcpSessionPersistenceKey } from "./mcp-http";

describe("resolveMcpSessionPersistenceKey", () => {
  it("uses the server-issued transport session id for new transports", () => {
    expect(
      resolveMcpSessionPersistenceKey({
        requestedSessionId: "client-supplied",
        responseSessionId: undefined,
        transportSessionId: "server-issued",
        hasExistingSession: false,
      })
    ).toBe("server-issued");
  });

  it("keeps the requested session id only when reusing an existing transport", () => {
    expect(
      resolveMcpSessionPersistenceKey({
        requestedSessionId: "known-session",
        responseSessionId: undefined,
        transportSessionId: "server-issued",
        hasExistingSession: true,
      })
    ).toBe("known-session");
  });

  it("prefers the response session id when the transport returns one", () => {
    expect(
      resolveMcpSessionPersistenceKey({
        requestedSessionId: "known-session",
        responseSessionId: "response-session",
        transportSessionId: "server-issued",
        hasExistingSession: true,
      })
    ).toBe("response-session");
  });
});
