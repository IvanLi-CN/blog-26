import { readFile, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, resolve, sep } from "node:path";
import { chromium } from "playwright";

type StoryIndexEntry = {
  id: string;
  type: string;
  title?: string;
  importPath?: string;
  tags?: string[];
};

type StorybookChannel = {
  emit: (event: string, data?: unknown) => unknown;
};

type StorybookRender = {
  phase?: string;
  channel: StorybookChannel;
  remount: () => Promise<void>;
};

type StorybookPreview = {
  currentRender?: StorybookRender;
};

type StoryFinished = {
  storyId?: string;
  status?: string;
  reporters?: unknown[];
};

type Viewport = { width: number; height: number };

const defaultViewport: Viewport = { width: 1280, height: 900 };
const storyViewports = new Map<string, Viewport>([
  ["public-native-tag-link--mobile", { width: 393, height: 852 }],
  ["public-native-tag-link--mobile-dark", { width: 393, height: 852 }],
  ["public-playbook-resource-browser--mobile", { width: 390, height: 844 }],
  ["public-playbook-resource-browser--mobile-dark", { width: 390, height: 844 }],
  ["public-playbook-resource-browser--narrow-mobile", { width: 320, height: 700 }],
  ["public-playbook-resource-browser--mobile-height-stability", { width: 390, height: 844 }],
  ["public-playbook-resource-browser--narrow-height-stability", { width: 320, height: 700 }],
  ["public-playbook-resource-browser--mobile-fullscreen", { width: 390, height: 844 }],
  ["public-playbook-resource-browser--narrow-fullscreen", { width: 320, height: 700 }],
  ["public-playbook-page--mobile-fullscreen-resource-policy", { width: 390, height: 844 }],
  ["public-playbook-page--mobile-dark-fullscreen-resource-policy", { width: 390, height: 844 }],
  ["public-playbook-page--tablet-fullscreen-resource-policy", { width: 1024, height: 900 }],
  ["public-playbook-page--tablet-policy-contents", { width: 768, height: 900 }],
  ["public-playbook-page--dark-tablet-policy-contents", { width: 768, height: 900 }],
  ["public-playbook-page--mobile-resource-policy", { width: 390, height: 844 }],
  ["public-playbook-page--narrow-resource-policy", { width: 320, height: 700 }],
  ["public-playbook-page--mobile-dark-resource-policy", { width: 390, height: 844 }],
  ["public-playbook-page--mobile-skill-frontmatter", { width: 390, height: 844 }],
  ["public-playbook-page--mobile-index", { width: 390, height: 844 }],
  ["public-playbook-page--mobile-dark-index", { width: 390, height: 844 }],
  ["public-playbook-page--mobile-topics", { width: 390, height: 844 }],
  ["public-playbook-page--mobile-topic", { width: 390, height: 844 }],
  ["public-playbook-page--mobile-dark-topic", { width: 390, height: 844 }],
  ["public-playbook-page--long-mobile-topic", { width: 390, height: 844 }],
  ["public-playbook-page--long-mobile-dark-topic", { width: 390, height: 844 }],
  ["public-playbook-page--long-tablet-topic", { width: 1024, height: 900 }],
  ["public-playbook-page--mobile-inline-contents", { width: 390, height: 844 }],
  ["public-playbook-page--mobile-contents-hierarchy", { width: 390, height: 844 }],
  ["public-playbook-page--mobile-numbered-contents", { width: 390, height: 844 }],
  ["public-playbook-page--mobile-floating-navigation", { width: 390, height: 844 }],
  ["public-playbook-page--mobile-floating-contents", { width: 390, height: 844 }],
  ["public-playbook-page--mobile-dark-floating-contents", { width: 390, height: 844 }],
  ["public-playbook-page--narrow-mobile-floating-contents", { width: 320, height: 700 }],
  ["public-playbook-page--mobile-long-contents", { width: 390, height: 844 }],
  ["public-playbook-page--mobile-dark-policy", { width: 390, height: 844 }],
  ["public-search-page--mobile-playbook-results", { width: 390, height: 844 }],
  ["public-search-page--mobile-loading", { width: 393, height: 852 }],
  ["public-search-page--narrow-mobile-recommendations", { width: 320, height: 700 }],
  ["public-search-page--mobile-empty", { width: 393, height: 852 }],
  ["public-search-page--mobile-results", { width: 393, height: 852 }],
]);

const staticRoot = resolve(process.env.STORYBOOK_STATIC_DIR || "storybook-static");
const storyFiles = new Set([
  "./src/components/common/NativeTagLink.stories.tsx",
  "./src/components/playbook/PlaybookPage.stories.tsx",
  "./src/components/playbook/PlaybookResourceBrowser.stories.tsx",
  "./src/components/search/PublicSearchPage.stories.tsx",
]);
const expectedStoryIds = new Set([
  "public-native-tag-link--default",
  "public-native-tag-link--dark",
  "public-native-tag-link--mobile",
  "public-native-tag-link--mobile-dark",
  "public-playbook-resource-browser--default",
  "public-playbook-resource-browser--markdown-source",
  "public-playbook-resource-browser--narrow-mobile",
  "public-playbook-resource-browser--height-stability",
  "public-playbook-resource-browser--mobile-height-stability",
  "public-playbook-resource-browser--narrow-height-stability",
  "public-playbook-resource-browser--fullscreen",
  "public-playbook-resource-browser--mobile-fullscreen",
  "public-playbook-resource-browser--narrow-fullscreen",
  "public-playbook-page--fullscreen-resource-policy",
  "public-playbook-page--tablet-policy-contents",
  "public-playbook-page--index",
  "public-playbook-page--policy",
  "public-playbook-page--skill-frontmatter",
  "public-playbook-page--narrow-resource-policy",
  "public-playbook-page--topic",
  "public-playbook-page--unavailable",
  "public-playbook-page--mobile-floating-navigation",
  "public-playbook-page--mobile-contents-hierarchy",
  "public-playbook-page--mobile-numbered-contents",
  "public-playbook-page--narrow-mobile-floating-contents",
  "public-search-page--advanced-query",
  "public-search-page--dark-loading",
  "public-search-page--empty",
  "public-search-page--error-state",
  "public-search-page--filtered-empty",
  "public-search-page--initial",
  "public-search-page--invalid-query-literal-retry",
  "public-search-page--loading",
  "public-search-page--mobile-empty",
  "public-search-page--mobile-loading",
  "public-search-page--mobile-results",
  "public-search-page--narrow-mobile-recommendations",
  "public-search-page--playbook-results",
  "public-search-page--playbook-stale-edition",
  "public-search-page--results",
  "public-search-page--simple-and-query",
  "public-search-page--untitled-memo-result",
]);

function contentType(pathname: string): string {
  switch (extname(pathname)) {
    case ".css":
      return "text/css; charset=utf-8";
    case ".html":
      return "text/html; charset=utf-8";
    case ".js":
      return "text/javascript; charset=utf-8";
    case ".json":
      return "application/json; charset=utf-8";
    case ".svg":
      return "image/svg+xml";
    case ".woff":
      return "font/woff";
    case ".woff2":
      return "font/woff2";
    default:
      return "application/octet-stream";
  }
}

async function serveStaticFile(requestPath: string) {
  const decodedPath = decodeURIComponent(requestPath.split("?")[0] || "/");
  const relativePath = decodedPath === "/" ? "index.html" : decodedPath.replace(/^\/+/, "");
  const filePath = resolve(staticRoot, relativePath);
  if (filePath !== staticRoot && !filePath.startsWith(`${staticRoot}${sep}`)) {
    return { status: 400, body: "Invalid path", type: "text/plain; charset=utf-8" };
  }
  try {
    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) {
      return { status: 404, body: "Not found", type: "text/plain; charset=utf-8" };
    }
    return { status: 200, body: await readFile(filePath), type: contentType(filePath) };
  } catch {
    return { status: 404, body: "Not found", type: "text/plain; charset=utf-8" };
  }
}

async function createStaticServer() {
  const server = createServer(async (request, response) => {
    try {
      const result = await serveStaticFile(request.url || "/");
      response.writeHead(result.status, {
        "cache-control": "no-store",
        "content-type": result.type,
      });
      response.end(result.body);
    } catch {
      response.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
      response.end("Internal server error");
    }
  });
  await new Promise<void>((resolvePromise, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolvePromise());
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    await new Promise<void>((resolvePromise) => server.close(() => resolvePromise()));
    throw new Error("Static Storybook server did not expose a TCP port");
  }
  return { server, baseUrl: `http://127.0.0.1:${address.port}` };
}

async function runStory(baseUrl: string, storyId: string) {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: storyViewports.get(storyId) || defaultViewport,
  });
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  try {
    await page.goto(`${baseUrl}/iframe.html?id=${encodeURIComponent(storyId)}&viewMode=story`, {
      waitUntil: "domcontentloaded",
    });
    await page.waitForFunction(
      () =>
        (globalThis as unknown as { __STORYBOOK_PREVIEW__?: StorybookPreview })
          .__STORYBOOK_PREVIEW__?.currentRender?.phase === "finished",
      undefined,
      { timeout: 30_000 }
    );
    const result = await page.evaluate(async (expectedStoryId) => {
      const preview = (globalThis as unknown as { __STORYBOOK_PREVIEW__?: StorybookPreview })
        .__STORYBOOK_PREVIEW__;
      const render = preview?.currentRender;
      if (!render) throw new Error("Storybook preview did not expose the current render");

      const events: StoryFinished[] = [];
      const playErrors: unknown[] = [];
      const channel = render.channel;
      const originalEmit = channel.emit.bind(channel);
      channel.emit = (event, data) => {
        if (event === "storyFinished") events.push(data as StoryFinished);
        if (event === "playFunctionThrewException") playErrors.push(data);
        return originalEmit(event, data);
      };
      try {
        await render.remount();
      } finally {
        channel.emit = originalEmit;
      }
      return {
        phase: render.phase,
        finished: events.find((event) => event.storyId === expectedStoryId),
        playErrors,
      };
    }, storyId);

    if (pageErrors.length > 0) {
      throw new Error(`${storyId} emitted page errors: ${pageErrors.join("; ")}`);
    }
    if (
      result.phase !== "finished" ||
      result.finished?.status !== "success" ||
      result.playErrors.length > 0
    ) {
      throw new Error(`${storyId} did not finish successfully: ${JSON.stringify(result)}`);
    }
    process.stdout.write(`PASS ${storyId}\n`);
  } finally {
    await page.close();
    await browser.close();
  }
}

async function main() {
  const storyIndex = JSON.parse(await readFile(resolve(staticRoot, "index.json"), "utf8")) as {
    entries?: Record<string, StoryIndexEntry>;
  };
  const storyIds = Object.values(storyIndex.entries || {})
    .filter(
      (entry) =>
        entry.type === "story" &&
        entry.importPath &&
        storyFiles.has(entry.importPath) &&
        entry.tags?.includes("play-fn")
    )
    .map((entry) => entry.id)
    .sort();
  if (storyIds.length === 0) {
    throw new Error("No Playbook or public search play stories were found in Storybook index");
  }
  const missingStoryIds = [...expectedStoryIds].filter((storyId) => !storyIds.includes(storyId));
  if (missingStoryIds.length > 0) {
    throw new Error(`Missing required Playbook/search stories: ${missingStoryIds.join(", ")}`);
  }

  const { server, baseUrl } = await createStaticServer();
  try {
    for (const storyId of storyIds) await runStory(baseUrl, storyId);
    process.stdout.write(`Verified ${storyIds.length} Storybook play functions\n`);
  } finally {
    await new Promise<void>((resolvePromise) => server.close(() => resolvePromise()));
  }
}

await main();
