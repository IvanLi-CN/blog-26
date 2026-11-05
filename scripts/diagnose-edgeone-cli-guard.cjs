// Stop the actual CLI at the first non-project-query fetch, before any COS upload.
const originalFetch = globalThis.fetch;
globalThis.fetch = async (input, options) => {
  const url = new URL(typeof input === "string" ? input : input.url);
  const allowed = ["pages-api.cloud.tencent.com", "pages-api.edgeone.ai"].includes(url.hostname);
  let action;
  try {
    action = JSON.parse(options?.body || "{}").Action;
  } catch {}
  if (!allowed || action !== "DescribePagesProjects") {
    throw new Error("DIAGNOSTIC_STOP_BEFORE_UPLOAD");
  }
  return originalFetch(input, options);
};
