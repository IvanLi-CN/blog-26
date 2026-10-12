import { describe, expect, it } from "bun:test";
import { withForwardedProtocol } from "../forwarded-protocol";

describe("withForwardedProtocol", () => {
  it("exposes HTTPS to the handler and restores the socket afterwards", () => {
    const socket: { encrypted?: boolean } = {};
    const result = withForwardedProtocol(socket, "https", () => socket.encrypted);

    expect(result).toBe(true);
    expect(socket.encrypted).toBeUndefined();
  });

  it("uses the first forwarded value and restores an existing value", () => {
    const socket: { encrypted?: boolean } = { encrypted: false };
    const result = withForwardedProtocol(socket, "https, http", () => socket.encrypted);

    expect(result).toBe(true);
    expect(socket.encrypted).toBe(false);
  });

  it("leaves the socket unchanged for an unknown protocol", () => {
    const socket: { encrypted?: boolean } = { encrypted: false };
    const result = withForwardedProtocol(socket, "ftp", () => socket.encrypted);

    expect(result).toBe(false);
    expect(socket.encrypted).toBe(false);
  });
});
