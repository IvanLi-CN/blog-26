import { existsSync, readFileSync } from "node:fs";

export type WorktreePortService = "web" | "site" | "admin";

const DEFAULT_WEB_PORT = 25090;
const PORT_OFFSETS: Record<WorktreePortService, number> = {
  web: 0,
  site: 3,
  admin: 4,
};

export function loadWorktreeEnvFileIfPresent(envPath = ".env.local") {
  if (!existsSync(envPath)) {
    return;
  }

  const content = readFileSync(envPath, "utf8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const equalsIndex = line.indexOf("=");
    if (equalsIndex <= 0) {
      continue;
    }

    const key = line.slice(0, equalsIndex).trim();
    const value = line.slice(equalsIndex + 1).trim();
    if (!key || process.env[key] !== undefined || value.length === 0) {
      continue;
    }

    process.env[key] = value.replace(/^"|"$/g, "").replace(/^'|'$/g, "");
  }
}

function parseOptionalPortValue(raw: string | undefined, envName: string): number | null {
  const value = raw?.trim();
  if (!value) {
    return null;
  }

  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Environment variable ${envName} must be a valid TCP port, got: ${value}`);
  }

  return port;
}

export function resolveWorktreePort(service: WorktreePortService): number {
  const webPort = parseOptionalPortValue(process.env.PORT, "PORT") ?? DEFAULT_WEB_PORT;
  if (service === "web") {
    return webPort;
  }

  const explicitKey = service === "site" ? "SITE_PORT" : "ADMIN_PORT";
  return (
    parseOptionalPortValue(process.env[explicitKey], explicitKey) ?? webPort + PORT_OFFSETS[service]
  );
}
