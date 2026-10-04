/** Child process for a real SIGKILL boundary; not a production entrypoint. */
import { appendFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { ClippingService } from "./service";
import { ClippingStore } from "./store";

const root = process.argv[2];
const endpoint = process.argv[3];
if (!root || !endpoint) throw new Error("Missing interruption fixture arguments");
process.env.LOCAL_CONTENT_BASE_PATH = join(root, "authored");
const service = await ClippingService.open({
  store: new ClippingStore(join(root, "materials")),
  runtimePath: join(root, "pi.sqlite"),
  resolveModel: async () => ({ model: "fixture", baseUrl: endpoint, apiKey: "fixture-only" }),
  memoIds: async () => ["Memos/article.md"],
  index: async () => {
    /* Canonical artifacts are the subject of this fixture. */
  },
  capture: async (url) => {
    await appendFile(join(root, "captures.txt"), `${url}\n`);
    return {
      markdown: await readFile(join(root, "source.md"), "utf8"),
      title: "Recovery fixture",
      url,
      warning: null,
    };
  },
  scanIntervalMs: 60_000,
});
try {
  await service.idle();
  console.log("completed");
} finally {
  await service.close();
}
