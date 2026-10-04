import { readFile, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, resolve, sep } from "node:path";
import { chromium } from "playwright";

const staticRoot = resolve(process.env.STORYBOOK_STATIC_DIR || "storybook-static");
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

const { server, baseUrl } = await createStaticServer();
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CLIPPING_BROWSER_EXECUTABLE,
});
try {
  const scenarios = [
    ...[320, 360, 375, 393, 768].map((width) => ({
      story: "memo-clipping-detail--mobile-discussion",
      width,
      height: 852,
    })),
    ...[1024, 1440].map((width) => ({
      story: "memo-clipping-detail--desktop",
      width,
      height: 1000,
    })),
    ...[
      "desktop-dark",
      "processing",
      "translation-failure",
      "previous-version",
      "guest",
      "admin-preview",
    ].map((state) => ({ story: `memo-clipping-detail--${state}`, width: 1440, height: 1000 })),
    { story: "memo-clipping-detail--mobile-dark", width: 393, height: 852 },
  ];
  for (const scenario of scenarios) {
    const page = await browser.newPage({
      viewport: { width: scenario.width, height: scenario.height },
      reducedMotion: "reduce",
    });
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`${baseUrl}/iframe.html?id=${scenario.story}&viewMode=story`);
    await page.waitForFunction(
      () =>
        (
          globalThis as unknown as {
            __STORYBOOK_PREVIEW__?: { currentRender?: { phase?: string } };
          }
        ).__STORYBOOK_PREVIEW__?.currentRender?.phase === "finished",
      undefined,
      { timeout: 30_000 }
    );
    const result = await page.evaluate(async () => {
      type Render = {
        phase: string;
        channel: { emit: (event: string, data?: unknown) => unknown };
        remount: () => Promise<void>;
      };
      const render = (globalThis as unknown as { __STORYBOOK_PREVIEW__: { currentRender: Render } })
        .__STORYBOOK_PREVIEW__.currentRender;
      const failures: unknown[] = [];
      const original = render.channel.emit.bind(render.channel);
      render.channel.emit = (event, data) => {
        if (event === "playFunctionThrewException") failures.push(data);
        return original(event, data);
      };
      try {
        await render.remount();
      } finally {
        render.channel.emit = original;
      }
      return {
        failures,
        overflow: document.documentElement.scrollWidth > window.innerWidth,
        width: window.innerWidth,
        hasSheet: Boolean(document.querySelector('[role="dialog"]')),
        hasDesktopChat: Boolean(document.querySelector('aside[aria-label="文章对话"]')),
      };
    });
    if (
      errors.length ||
      result.failures.length ||
      result.overflow ||
      result.width !== scenario.width
    )
      throw new Error(`${scenario.story}@${scenario.width}: ${JSON.stringify({ errors, result })}`);
    if (scenario.story.endsWith("mobile-discussion") && (!result.hasSheet || result.hasDesktopChat))
      throw new Error("Expected mobile sheet, no desktop chat");
    if (scenario.story.endsWith("desktop") && !result.hasDesktopChat)
      throw new Error("Expected desktop article/chat columns");
    console.log(`PASS ${scenario.story}@${scenario.width}`);
    await page.close();
  }
} finally {
  await browser.close();
  await new Promise<void>((done) => server.close(() => done()));
}
