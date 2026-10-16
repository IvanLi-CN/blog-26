import { SYSTEM_SHARE_TTL_MS, type SystemShareFile } from "@/lib/system-share";

const DB_NAME = "ivan-console-system-share";
const DB_VERSION = 2;
const STORE_NAME = "pending";
const CURRENT_KEY = "current";

type PendingSystemShareFields = {
  title: string;
  text: string;
  url: string;
  tags: string[];
  isPublic: boolean;
  files: Array<SystemShareFile & { blob: Blob }>;
};

export type PendingSystemShareSnapshot = PendingSystemShareFields;

export type PendingSystemShare = PendingSystemShareFields & {
  version: 1 | 2;
  submissionId: string;
  createdAt: number;
  expiresAt: number;
  original?: PendingSystemShareSnapshot;
};

export type PendingSystemSharePatch = Partial<
  Pick<PendingSystemShare, "title" | "text" | "url" | "tags" | "isPublic" | "files">
>;

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("IndexedDB unavailable"));
  });
}

function normalizeSnapshot(value: Partial<PendingSystemShareSnapshot>): PendingSystemShareSnapshot {
  return {
    title: typeof value.title === "string" ? value.title : "",
    text: typeof value.text === "string" ? value.text : "",
    url: typeof value.url === "string" ? value.url : "",
    tags: Array.isArray(value.tags)
      ? value.tags.filter((tag): tag is string => typeof tag === "string")
      : [],
    isPublic: value.isPublic === true,
    files: Array.isArray(value.files) ? value.files : [],
  };
}

function normalizePending(value: Partial<PendingSystemShare>): PendingSystemShare {
  const pending = {
    version: value.version === 2 ? 2 : 1,
    submissionId: String(value.submissionId || ""),
    createdAt: Number(value.createdAt || Date.now()),
    expiresAt: Number(value.expiresAt || Date.now() + SYSTEM_SHARE_TTL_MS),
    ...normalizeSnapshot(value),
  } satisfies Omit<PendingSystemShare, "original">;

  return value.original ? { ...pending, original: normalizeSnapshot(value.original) } : pending;
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
    const pending = normalizePending(value);
    if (pending.expiresAt <= now || pending.createdAt + SYSTEM_SHARE_TTL_MS <= now) {
      await clearPendingSystemShare(pending.submissionId);
      throw new Error("待处理分享已过期，请重新发起系统分享。");
    }
    return pending;
  } finally {
    db.close();
  }
}

export async function replacePendingSystemShare(value: PendingSystemShare) {
  if (typeof indexedDB === "undefined") throw new Error("当前浏览器不支持本地待处理分享。");
  const db = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readwrite");
      const normalized = normalizePending(value);
      transaction
        .objectStore(STORE_NAME)
        .put(
          normalized.original ? normalized : { ...normalized, original: normalizeSnapshot(value) },
          CURRENT_KEY
        );
      transaction.oncomplete = () => resolve();
      transaction.onerror = () =>
        reject(transaction.error || new Error("Could not store pending share"));
      transaction.onabort = () =>
        reject(transaction.error || new Error("Could not store pending share"));
    });
  } finally {
    db.close();
  }
}

export async function ensurePendingSystemShareOriginal(
  value: PendingSystemShare
): Promise<PendingSystemShare | null> {
  if (typeof indexedDB === "undefined") throw new Error("当前浏览器不支持本地待处理分享。");
  const db = await openDatabase();
  try {
    return await new Promise<PendingSystemShare | null>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(CURRENT_KEY);
      let result: PendingSystemShare | null = null;
      request.onsuccess = () => {
        const current = request.result as PendingSystemShare | undefined;
        if (!current || current.submissionId !== value.submissionId) {
          result = current ? normalizePending(current) : null;
          return;
        }
        const normalized = normalizePending(current);
        if (!normalized.original) {
          const migrated = {
            ...normalized,
            original: normalizeSnapshot(value.original ?? value),
          } satisfies PendingSystemShare;
          store.put(migrated, CURRENT_KEY);
          result = migrated;
        } else {
          result = normalized;
        }
      };
      request.onerror = () => reject(request.error || new Error("Could not read pending share"));
      transaction.oncomplete = () => resolve(result);
      transaction.onerror = () =>
        reject(transaction.error || new Error("Could not migrate pending share"));
      transaction.onabort = () =>
        reject(transaction.error || new Error("Could not migrate pending share"));
    });
  } finally {
    db.close();
  }
}

export async function updatePendingSystemShare(
  submissionId: string,
  patch: PendingSystemSharePatch
) {
  if (typeof indexedDB === "undefined") return false;
  const db = await openDatabase();
  try {
    return await new Promise<boolean>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(CURRENT_KEY);
      let changed = false;
      let settled = false;
      const settle = (value: boolean) => {
        if (settled) return;
        settled = true;
        resolve(value);
      };
      const fail = (error: unknown) => {
        if (settled) return;
        settled = true;
        reject(error instanceof Error ? error : new Error("Could not update pending share"));
      };
      request.onsuccess = () => {
        const current = request.result as PendingSystemShare | undefined;
        if (!current || current.submissionId !== submissionId) {
          settle(false);
          return;
        }
        store.put(normalizePending({ ...current, ...patch, version: 2 }), CURRENT_KEY);
        changed = true;
      };
      request.onerror = () => fail(request.error || new Error("Could not update pending share"));
      transaction.oncomplete = () => settle(changed);
      transaction.onerror = () =>
        fail(transaction.error || new Error("Could not update pending share"));
      transaction.onabort = () =>
        fail(transaction.error || new Error("Could not update pending share"));
    });
  } finally {
    db.close();
  }
}

export async function clearPendingSystemShare(submissionId?: string) {
  if (typeof indexedDB === "undefined") return false;
  const db = await openDatabase();
  try {
    return await new Promise<boolean>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(CURRENT_KEY);
      let changed = false;
      let settled = false;
      const settle = (value: boolean) => {
        if (settled) return;
        settled = true;
        resolve(value);
      };
      const fail = (error: unknown) => {
        if (settled) return;
        settled = true;
        reject(error instanceof Error ? error : new Error("Could not clear pending share"));
      };
      request.onsuccess = () => {
        const current = request.result as PendingSystemShare | undefined;
        if (submissionId && current?.submissionId !== submissionId) {
          settle(false);
          return;
        }
        if (!current) {
          settle(false);
          return;
        }
        store.delete(CURRENT_KEY);
        changed = true;
      };
      request.onerror = () => fail(request.error || new Error("Could not clear pending share"));
      transaction.oncomplete = () => settle(changed);
      transaction.onerror = () =>
        fail(transaction.error || new Error("Could not clear pending share"));
      transaction.onabort = () =>
        fail(transaction.error || new Error("Could not clear pending share"));
    });
  } finally {
    db.close();
  }
}
