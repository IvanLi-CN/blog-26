// Exercise the frozen artifact upload, but prohibit deployment/project creation.
const originalFetch = globalThis.fetch;
globalThis.fetch = async (input, options) => {
  const url = new URL(typeof input === "string" ? input : input.url);
  const allowed = ["pages-api.cloud.tencent.com", "pages-api.edgeone.ai"].includes(url.hostname);
  let action;
  try {
    action = JSON.parse(options?.body || "{}").Action;
  } catch {
    // Unknown requests remain blocked.
  }
  if (!allowed || !["DescribePagesProjects", "DescribePagesCosTempToken"].includes(action)) {
    throw new Error("DIAGNOSTIC_STOP_BEFORE_DEPLOYMENT");
  }
  return originalFetch(input, options);
};
