import type { ReleaseReader, SourceRelease } from "./release";
import { PLAYBOOK_REPOSITORY } from "./schema";

export function githubReleaseReader(token = process.env.GH_TOKEN): ReleaseReader {
  if (!token) throw new Error("A source-read GitHub App token is required");
  async function api(path: string, binary = false) {
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
      { env: { ...process.env, GH_TOKEN: token }, stdout: "pipe", stderr: "pipe" }
    );
    const [bytes, , status] = await Promise.all([
      new Response(result.stdout).arrayBuffer(),
      new Response(result.stderr).text(),
      result.exited,
    ]);
    if (status !== 0) throw new Error(`GitHub source read failed: ${path}`);
    return new Uint8Array(bytes);
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
    asset: (id) => api(`${prefix}/releases/assets/${id}`, true),
  };
}
