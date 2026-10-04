import { mkdir, realpath } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { getActiveLocalBasePath } from "@/config/paths";
import { initializeDB } from "@/lib/db";
import type { ClippingService } from "./service";
import { clippingStoragePaths } from "./store";

const key = Symbol.for("blog26.clipping.runtime");
type RuntimeSlot = { service: ClippingService | null; starting?: Promise<ClippingService> };
const shared = globalThis as typeof globalThis & { [key]?: RuntimeSlot };
shared[key] ??= { service: null };
const slot = shared[key];

export function getClippingRuntime() {
  return slot.service;
}

/** Called only by the gateway (development) or console process (production). */
export async function startClippingRuntime() {
  if (process.env.CLIPPING_PROCESSOR_ENABLED === "false") return null;
  if (slot.service) return slot.service;
  if (slot.starting) return slot.starting;
  slot.starting = (async () => {
    await initializeDB();
    const paths = clippingStoragePaths();
    const applicationPath = resolve(process.env.DB_PATH || "./sqlite.db");
    if (
      paths.runtime === applicationPath ||
      (await realpath(paths.runtime).catch((error) => {
        if (error.code !== "ENOENT") throw error;
        return null;
      })) === (await realpath(applicationPath))
    )
      throw new Error("Pi storage must be separate from the application database.");
    await mkdir(dirname(paths.runtime), { recursive: true });
    const base = getActiveLocalBasePath();
    if (base) {
      const root = await realpath(base);
      const actual = await realpath(paths.runtime).catch((error) => {
        if (error.code !== "ENOENT") throw error;
        return realpath(dirname(paths.runtime));
      });
      const part = relative(root, actual);
      if (part === "" || (!part.startsWith("..") && !isAbsolute(part)))
        throw new Error("Pi storage must be outside the public content root.");
    }
    const { ClippingService } = await import("./service");
    const service = await ClippingService.open();
    slot.service = service;
    return service;
  })();
  try {
    return await slot.starting;
  } finally {
    slot.starting = undefined;
  }
}

export async function stopClippingRuntime() {
  const service = slot.service;
  slot.service = null;
  await service?.close();
}

/** Index/file writers can notify an existing owner; they never create one. */
export function notifyClippingChange(memoId: string) {
  const service = slot.service;
  if (service)
    void service
      .reconcile(memoId)
      .catch(() => console.error("[clipping] Saved memo will be reconciled on the next scan."));
}
