import { describe, expect, test } from "bun:test";
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";

const repositoryRoot = process.cwd();
const fetchScript = path.resolve(repositoryRoot, "scripts/fetch-public-content-bundle.sh");

function startServer(server: Server) {
  return new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
}

function stopServer(server: Server) {
  return new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve()))
  );
}

function runFetcher(environment: NodeJS.ProcessEnv) {
  return new Promise<{ code: number | null; output: string }>((resolve, reject) => {
    const child = spawn("bash", [fetchScript], { cwd: repositoryRoot, env: environment });
    let output = "";
    child.stdout.on("data", (chunk: Buffer) => (output += chunk.toString()));
    child.stderr.on("data", (chunk: Buffer) => (output += chunk.toString()));
    child.once("error", reject);
    child.once("close", (code) => resolve({ code, output }));
  });
}

async function fetchSnapshot(
  bundlePath: string,
  liveSnapshotPath: string,
  transientBundleFailures = 0
) {
  const requests: Array<{ path: string; httpVersion: string }> = [];
  const bundleSnapshot = {
    generatedAt: "2026-10-01T00:00:00.000Z",
    posts: [],
    memos: [],
    tags: { summaries: [] },
  };
  const liveSnapshot = {
    ...bundleSnapshot,
    generatedAt: "2026-10-03T00:00:00.000Z",
  };
  let remainingFailures = transientBundleFailures;
  const server = createServer((request, response) => {
    requests.push({ path: request.url ?? "/", httpVersion: request.httpVersion });
    if (request.url?.startsWith(bundlePath) && remainingFailures > 0) {
      remainingFailures -= 1;
      response.writeHead(525, { "content-type": "text/plain" });
      response.end("origin TLS handshake failure");
      return;
    }
    const body = request.url?.startsWith(bundlePath) ? bundleSnapshot : liveSnapshot;
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify(body));
  });
  await startServer(server);

  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Test server did not bind a port");
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const workDir = mkdtempSync(path.join(tmpdir(), "public-snapshot-test-"));
  const outputPath = path.join(workDir, "site", "generated", "public-snapshot.json");

  try {
    const result = await runFetcher({
      ...process.env,
      PUBLIC_CONTENT_BUNDLE_URL: `${baseUrl}${bundlePath}`,
      PUBLIC_CONTENT_SNAPSHOT_URL: `${baseUrl}${liveSnapshotPath}`,
      PUBLIC_SNAPSHOT_PATH: outputPath,
      PUBLIC_CONTENT_WORK_DIR: path.join(workDir, "work"),
    });

    return {
      ...result,
      requests,
      snapshot: JSON.parse(readFileSync(outputPath, "utf8")) as typeof liveSnapshot,
    };
  } finally {
    await stopServer(server);
    rmSync(workDir, { recursive: true, force: true });
  }
}

describe("fetch-public-content-bundle.sh", () => {
  test("does not request the same snapshot endpoint twice when bundle tokens differ", async () => {
    const result = await fetchSnapshot(
      "/api/public/snapshot?token=bundle-secret",
      "/api/public/snapshot"
    );

    expect(result.code).toBe(0);
    expect(result.requests).toHaveLength(1);
    expect(result.requests[0]?.httpVersion).toBe("1.1");
    expect(result.snapshot.generatedAt).toBe("2026-10-01T00:00:00.000Z");
  });

  test("refreshes when non-token query parameters select different content", async () => {
    const result = await fetchSnapshot(
      "/api/public/snapshot?token=bundle-secret&locale=en",
      "/api/public/snapshot?token=live-secret&locale=zh"
    );

    expect(result.code).toBe(0);
    expect(result.requests).toHaveLength(2);
    expect(result.snapshot.generatedAt).toBe("2026-10-03T00:00:00.000Z");
  });

  test("refreshes the snapshot when the bundle and live snapshot use different paths", async () => {
    const result = await fetchSnapshot("/bundle.json", "/api/public/snapshot?live-token=secret");

    expect(result.code).toBe(0);
    expect(result.requests).toHaveLength(2);
    expect(result.requests.every((request) => request.httpVersion === "1.1")).toBe(true);
    expect(result.snapshot.generatedAt).toBe("2026-10-03T00:00:00.000Z");
    expect(result.output).not.toContain("live-token=secret");
  });

  test("retries an EdgeOne 525 response and accepts the recovered snapshot", async () => {
    const result = await fetchSnapshot(
      "/api/public/snapshot?bundle-token=test",
      "/api/public/snapshot",
      1
    );

    expect(result.code).toBe(0);
    expect(result.requests).toHaveLength(2);
    expect(result.requests.every((request) => request.httpVersion === "1.1")).toBe(true);
    expect(result.snapshot.generatedAt).toBe("2026-10-01T00:00:00.000Z");
  }, 15_000);
});
