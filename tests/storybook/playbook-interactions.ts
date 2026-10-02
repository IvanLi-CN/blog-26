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
  ["public-playbook-page--mobile-topic", { width: 390, height: 844 }],
  ["public-playbook-page--mobile-dark-policy", { width: 390, height: 844 }],
  ["public-search-page--mobile-playbook-results", { width: 390, height: 844 }],
  ["public-search-page--mobile-loading", { width: 393, height: 852 }],
  ["public-search-page--narrow-mobile-recommendations", { width: 320, height: 700 }],
  ["public-search-page--mobile-empty", { width: 393, height: 852 }],
  ["public-search-page--mobile-results", { width: 393, height: 852 }],
]);

const staticRoot = resolve(process.env.STORYBOOK_STATIC_DIR || "storybook-static");
const storyFiles = new Set([
  "./src/components/playbook/PlaybookPage.stories.tsx",
  "./src/components/search/PublicSearchPage.stories.tsx",
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
      const channel = render.channel;
      const originalEmit = channel.emit.bind(channel);
      channel.emit = (event, data) => {
        if (event === "storyFinished") events.push(data as StoryFinished);
        return originalEmit(event, data);
      };
      await render.remount();
      return {
        phase: render.phase,
        finished: events.find((event) => event.storyId === expectedStoryId),
      };
    }, storyId);

    if (pageErrors.length > 0) {
      throw new Error(`${storyId} emitted page errors: ${pageErrors.join("; ")}`);
    }
    if (result.phase !== "finished" || result.finished?.status !== "success") {
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

  const { server, baseUrl } = await createStaticServer();
  try {
    for (const storyId of storyIds) await runStory(baseUrl, storyId);
    process.stdout.write(`Verified ${storyIds.length} Storybook play functions\n`);
  } finally {
    await new Promise<void>((resolvePromise) => server.close(() => resolvePromise()));
  }
}

await main();
