import { join } from "node:path";

type DevWebdavConfig = {
  host: string;
  port: number;
  rootPath: string;
  strict: boolean;
  source: "WEBDAV_URL" | "WEBDAV_PORT" | "default";
};

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

function parsePort(value: string, label: string): number {
  const port = Number(value);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error(`${label} must be an integer between 1 and 65535`);
  }
  return port;
}

function isLocalHost(hostname: string): boolean {
  // URL.hostname for IPv6 will not include brackets, so "::1" works as-is.
  return LOCAL_HOSTS.has(hostname);
}

export function resolveDevWebdavConfig(env: NodeJS.ProcessEnv): DevWebdavConfig {
  const rootPath = join(process.cwd(), "dev-data", "webdav");

  const portFromEnv =
    typeof env.WEBDAV_PORT === "string"
      ? parsePort(env.WEBDAV_PORT, "WEBDAV_PORT")
      : typeof env.DAV_PORT === "string"
        ? parsePort(env.DAV_PORT, "DAV_PORT")
        : null;

  const urlRaw = typeof env.WEBDAV_URL === "string" ? env.WEBDAV_URL.trim() : "";
  const hasUrl = urlRaw.length > 0;

  if (hasUrl) {
    let url: URL;
    try {
      url = new URL(urlRaw);
    } catch {
      throw new Error("WEBDAV_URL must be a valid URL, e.g. http://localhost:25091");
    }

    if (!isLocalHost(url.hostname)) {
      throw new Error(
        `WEBDAV_URL must use a local hostname (localhost/127.0.0.1/::1), got: ${url.hostname}`
      );
    }

    if (!url.port) {
      throw new Error("WEBDAV_URL must include an explicit port, e.g. http://localhost:25091");
    }

    const portFromUrl = parsePort(url.port, "WEBDAV_URL port");

    if (portFromEnv !== null && portFromEnv !== portFromUrl) {
      throw new Error(
        `WEBDAV_PORT (${portFromEnv}) does not match WEBDAV_URL port (${portFromUrl})`
      );
    }

    return {
      host: url.hostname,
      port: portFromUrl,
      rootPath,
      strict: true,
      source: "WEBDAV_URL",
    };
  }

  if (portFromEnv !== null) {
    return {
      host: "localhost",
      port: portFromEnv,
      rootPath,
      strict: true,
      source: "WEBDAV_PORT",
    };
  }

  return {
    host: "localhost",
    port: 25091,
    rootPath,
    strict: false,
    source: "default",
  };
}
