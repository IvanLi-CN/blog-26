import { withoutDeploymentCredentials } from "./child-env";
import type { ReleaseReader, SourceRelease } from "./release";
import { PLAYBOOK_MAX_BUNDLE_BYTES, PLAYBOOK_REPOSITORY } from "./schema";

const MAX_JSON_RESPONSE_BYTES = 8 * 1024 * 1024;

export async function readBounded(stream: ReadableStream<Uint8Array>, maxBytes: number) {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        size += value.byteLength;
        if (size > maxBytes)
          throw new Error(`GitHub source response exceeds the ${maxBytes}-byte limit`);
        chunks.push(value);
      }
    }
  } finally {
    reader.releaseLock();
  }
  const output = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
}

export function githubReleaseReader(token = process.env.GH_TOKEN): ReleaseReader {
  if (!token) throw new Error("A source-read GitHub token is required");
  async function api(
    path: string,
    binary = false,
    maxBytes = binary ? PLAYBOOK_MAX_BUNDLE_BYTES : MAX_JSON_RESPONSE_BYTES
  ) {
    const result = Bun.spawn(
      [
        "gh",
        "api",
        path,
        "-H",
        `Accept: ${binary ? "application/octet-stream" : "application/vnd.github+json"}`,
        "-H",
        "X-GitHub-Api-Version: 2026-03-10",
      ],
      {
        env: { ...withoutDeploymentCredentials(process.env), GH_TOKEN: token },
        stdout: "pipe",
        stderr: "pipe",
      }
    );
    try {
      const body = new Response(result.stdout).body;
      if (!body) throw new Error(`GitHub source response has no body: ${path}`);
      const [bytes, , status] = await Promise.all([
        readBounded(body, maxBytes),
        new Response(result.stderr).text(),
        result.exited,
      ]);
      if (status !== 0) throw new Error(`GitHub source read failed: ${path}`);
      return bytes;
    } catch (error) {
      try {
        result.kill("SIGTERM");
      } catch {
        // The GitHub CLI may have exited while the bounded reader was unwinding.
      }
      await result.exited;
      throw error;
    }
  }
  const json = async (path: string) => JSON.parse(new TextDecoder().decode(await api(path)));
  const prefix = `repos/${PLAYBOOK_REPOSITORY}`;
  return {
    async list() {
      const releases: SourceRelease[] = [];
      for (let page = 1; page <= 100; page++) {
        const batch: SourceRelease[] = await json(`${prefix}/releases?per_page=100&page=${page}`);
        releases.push(...batch);
        if (batch.length < 100) return releases;
      }
      throw new Error("Release pagination exceeded the configured bound");
    },
    release: (id) => json(`${prefix}/releases/${encodeURIComponent(id)}`),
    commit: async (tag) => (await json(`${prefix}/commits/${encodeURIComponent(tag)}`)).sha,
    asset: (id, maxBytes = PLAYBOOK_MAX_BUNDLE_BYTES) =>
      api(`${prefix}/releases/assets/${id}`, true, maxBytes),
  };
}
