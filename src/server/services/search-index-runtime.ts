import { contentSearchIndex } from "./content-search-index";

let timer: ReturnType<typeof setInterval> | undefined;
let pending = false;
export async function startSearchIndexRuntime() {
  try {
    await (await contentSearchIndex()).prepare();
  } catch {
    console.error("[search-index] prepare failed; search is unavailable until repaired");
    return;
  }
  timer = setInterval(() => {
    if (pending) return;
    pending = true;
    void contentSearchIndex()
      .then((index) => index.synchronize())
      .catch(() => console.error("[search-index] synchronization unavailable"))
      .finally(() => {
        pending = false;
      });
  }, 1000);
  timer.unref();
}
export function stopSearchIndexRuntime() {
  if (timer) clearInterval(timer);
  timer = undefined;
}
