const DB_NAME = "ivan-console-system-share";
const DB_VERSION = 2;
const STORE_NAME = "pending";
const MAX_FILES = 10;
const MAX_FILE_BYTES = 20 * 1024 * 1024;
const MAX_TOTAL_BYTES = 50 * 1024 * 1024;
const TTL_MS = 15 * 60 * 1000;

function openStore() {
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

function putPending(value) {
  return openStore().then(
    (db) =>
      new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, "readwrite");
        transaction.objectStore(STORE_NAME).put(value, "current");
        transaction.oncomplete = () => {
          db.close();
          resolve();
        };
        transaction.onerror = () => {
          db.close();
          reject(transaction.error || new Error("Could not store pending share"));
        };
      })
  );
}

function readString(form, name) {
  const value = form.get(name);
  return typeof value === "string" ? value : "";
}

function readFiles(form) {
  return form.getAll("files").filter((value) => value instanceof File);
}

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "POST" || !/^\/share-target\/?$/u.test(url.pathname)) return;

  event.respondWith(
    (async () => {
      try {
        const form = await event.request.formData();
        const files = readFiles(form);
        if (files.length > MAX_FILES || files.some((file) => file.size > MAX_FILE_BYTES)) {
          throw new Error("分享文件超出大小或数量限制。");
        }
        const total = files.reduce((sum, file) => sum + file.size, 0);
        if (total > MAX_TOTAL_BYTES) throw new Error("分享文件总大小超出限制。");
        const now = Date.now();
        const snapshot = {
          title: readString(form, "title"),
          text: readString(form, "text"),
          url: readString(form, "url"),
          tags: [],
          isPublic: false,
          files: files.map((file) => ({
            name: file.name,
            type: file.type,
            size: file.size,
            lastModified: file.lastModified,
            blob: file,
          })),
        };
        await putPending({
          version: 2,
          submissionId: crypto.randomUUID(),
          createdAt: now,
          expiresAt: now + TTL_MS,
          ...snapshot,
          original: snapshot,
        });
        return Response.redirect(new URL("/share", self.location.origin), 303);
      } catch {
        return Response.redirect(new URL("/share?error=storage", self.location.origin), 303);
      }
    })()
  );
});
