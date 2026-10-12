type SocketWithEncryption = {
  encrypted?: boolean;
};

function firstHeaderValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value?.split(",", 1)[0]?.trim();
}

export function withForwardedProtocol<T>(
  socket: SocketWithEncryption,
  forwardedProtocol: string | string[] | undefined,
  callback: () => T
): T {
  const protocol = firstHeaderValue(forwardedProtocol)?.toLowerCase();
  if (protocol !== "http" && protocol !== "https") return callback();

  const descriptor = Object.getOwnPropertyDescriptor(socket, "encrypted");
  try {
    Object.defineProperty(socket, "encrypted", {
      configurable: true,
      enumerable: descriptor?.enumerable ?? false,
      value: protocol === "https",
      writable: true,
    });
  } catch {
    return callback();
  }

  try {
    return callback();
  } finally {
    if (descriptor) {
      Object.defineProperty(socket, "encrypted", descriptor);
    } else {
      delete socket.encrypted;
    }
  }
}
