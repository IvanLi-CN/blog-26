import { SYSTEM_SHARE_TTL_MS, type SystemShareFile } from "@/lib/system-share";

const DB_NAME = "ivan-console-system-share";
const DB_VERSION = 1;
const STORE_NAME = "pending";
const CURRENT_KEY = "current";

export type PendingSystemShare = {
  version: 1;
  submissionId: string;
  createdAt: number;
  expiresAt: number;
  title: string;
  text: string;
  url: string;
  files: Array<SystemShareFile & { blob: Blob }>;
};

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("IndexedDB unavailable"));
  });
}

export async function readPendingSystemShare(now = Date.now()): Promise<PendingSystemShare | null> {
  if (typeof indexedDB === "undefined") throw new Error("当前浏览器不支持本地待处理分享。");
  const db = await openDatabase();
  try {
    const value = await new Promise<PendingSystemShare | undefined>((resolve, reject) => {
      const request = db
        .transaction(STORE_NAME, "readonly")
        .objectStore(STORE_NAME)
        .get(CURRENT_KEY);
      request.onsuccess = () => resolve(request.result as PendingSystemShare | undefined);
      request.onerror = () => reject(request.error || new Error("Could not read pending share"));
    });
    if (!value) return null;
    if (value.expiresAt <= now || value.createdAt + SYSTEM_SHARE_TTL_MS <= now) {
      await clearPendingSystemShare();
      throw new Error("待处理分享已过期，请重新发起系统分享。");
    }
    return value;
  } finally {
    db.close();
  }
}

export async function clearPendingSystemShare() {
  if (typeof indexedDB === "undefined") return;
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const request = db
      .transaction(STORE_NAME, "readwrite")
      .objectStore(STORE_NAME)
      .delete(CURRENT_KEY);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error || new Error("Could not clear pending share"));
  });
  db.close();
}
