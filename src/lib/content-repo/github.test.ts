import { describe, expect, test } from "bun:test";
import type { ContentRepoConfig } from "./config";
import { ContentRepoError, createContentRepoTransport } from "./github";

const commitSha = "a".repeat(40);
const treeSha = "b".repeat(40);
const nextSha = "c".repeat(40);

const config: ContentRepoConfig = {
  repository: "IvanLi-CN/blog-contents",
  ref: "main",
  token: "secret",
};

type Call = { url: string; method: string; body: string | null };

function transportWith(responses: Array<{ status?: number; body: unknown }>) {
  const calls: Call[] = [];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({
      url,
      method: init?.method ?? "GET",
      body: typeof init?.body === "string" ? init.body : null,
    });
    const next = responses.shift();
    if (!next) throw new Error(`Unexpected request: ${url}`);
    return new Response(JSON.stringify(next.body), {
      status: next.status ?? 200,
      headers: { "content-type": "application/json" },
    });
  }) as unknown as typeof fetch;
  return { calls, transport: createContentRepoTransport(config, fetchImpl) };
}

function bodyAt(calls: Call[], index: number): Record<string, unknown> {
  const body = calls[index]?.body;
  if (!body) throw new Error(`Missing request body at index ${index}`);
  return JSON.parse(body) as Record<string, unknown>;
}

describe("content repository transport", () => {
  test("resolves the configured ref to a commit and tree", async () => {
    const { calls, transport } = transportWith([
      { body: { sha: commitSha, tree: { sha: treeSha } } },
    ]);
    expect(await transport.resolveHead()).toEqual({ commit: commitSha, tree: treeSha });
    expect(calls[0]?.url).toContain("/repos/IvanLi-CN/blog-contents/commits/main");
  });

  test("lists blobs only and rejects truncated trees", async () => {
    const { transport } = transportWith([
      {
        body: {
          tree: [
            { path: "blog/a.md", type: "blob", sha: commitSha },
            { path: "blog", type: "tree", sha: treeSha },
          ],
        },
      },
    ]);
    const blobs = await transport.listTree(treeSha);
    expect([...blobs]).toEqual([["blog/a.md", commitSha]]);

    const truncated = transportWith([{ body: { tree: [], truncated: true } }]).transport;
    await expect(truncated.listTree(treeSha)).rejects.toMatchObject({ kind: "invalid" });
  });

  test("creates blobs, trees, commits and updates the branch ref", async () => {
    const { calls, transport } = transportWith([
      { body: { sha: nextSha } },
      { body: { sha: nextSha } },
      { body: { sha: nextSha } },
      { body: { object: { sha: nextSha } } },
    ]);
    const blob = await transport.createBlob(new TextEncoder().encode("hello"));
    const tree = await transport.createTree(treeSha, [{ path: "blog/a.md", sha: blob }]);
    const commit = await transport.createCommit({
      message: "content: push 1 post(s) and 0 memo(s) from console",
      tree,
      parents: [commitSha],
    });
    expect(await transport.updateRef(commit)).toBe(nextSha);

    expect(bodyAt(calls, 0)).toEqual({
      content: Buffer.from("hello").toString("base64"),
      encoding: "base64",
    });
    expect(bodyAt(calls, 1)).toMatchObject({ base_tree: treeSha });
    expect(bodyAt(calls, 2)).toMatchObject({ parents: [commitSha] });
    expect(bodyAt(calls, 3)).toEqual({ sha: nextSha, force: false });
    expect(calls[3]?.method).toBe("PATCH");
  });

  test("classifies transport failures", async () => {
    const unauthorized = transportWith([
      { status: 401, body: { message: "Bad credentials" } },
    ]).transport;
    await expect(unauthorized.resolveHead()).rejects.toMatchObject({ kind: "failed" });

    const conflict = transportWith([{ status: 422, body: {} }]).transport;
    await expect(conflict.resolveHead()).rejects.toMatchObject({ kind: "conflict" });

    const missing = transportWith([{ status: 404, body: {} }]).transport;
    await expect(missing.resolveHead()).rejects.toMatchObject({ kind: "invalid" });
  });

  test("refuses to update a ref that is not a branch", async () => {
    const pinned = createContentRepoTransport(
      { ...config, ref: commitSha },
      (async () => new Response("{}")) as unknown as typeof fetch
    );
    await expect(pinned.updateRef(commitSha)).rejects.toBeInstanceOf(ContentRepoError);
  });
});
