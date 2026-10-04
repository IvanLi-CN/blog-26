import { describe, expect, test } from "bun:test";

const { createOrVerifyTag } = require("../../.github/scripts/create-release-tag.cjs") as {
  createOrVerifyTag: (options: {
    github: any;
    core: { info: (message: string) => void };
    owner: string;
    repo: string;
    tag: string;
    targetSha: string;
  }) => Promise<void>;
};

const owner = "IvanLi-CN";
const repo = "blog-26";
const tag = "frontend-v2.5.0";
const targetSha = "3108486383a052f4c720883716a962f69e79b9a5";
const annotatedTagSha = "a".repeat(40);

function notFound() {
  return Object.assign(new Error("Not Found"), { status: 404 });
}

function existingTagClient(existingTarget: string) {
  return {
    rest: {
      git: {
        getRef: async () => ({
          data: { object: { type: "tag", sha: annotatedTagSha } },
        }),
        getTag: async () => ({ data: { object: { type: "commit", sha: existingTarget } } }),
        createTag: async () => {
          throw new Error("createTag should not run");
        },
        createRef: async () => {
          throw new Error("createRef should not run");
        },
      },
    },
  };
}

describe("createOrVerifyTag", () => {
  test("creates an annotated tag through the Git Database API", async () => {
    const calls: unknown[] = [];
    const github = {
      rest: {
        git: {
          getRef: async () => {
            throw notFound();
          },
          createTag: async (input: unknown) => {
            calls.push(["createTag", input]);
            return { data: { sha: annotatedTagSha } };
          },
          createRef: async (input: unknown) => {
            calls.push(["createRef", input]);
          },
        },
      },
    };

    await createOrVerifyTag({
      github,
      core: { info: () => undefined },
      owner,
      repo,
      tag,
      targetSha,
    });

    expect(calls).toHaveLength(2);
    expect(calls[0]).toEqual([
      "createTag",
      expect.objectContaining({
        owner,
        repo,
        tag,
        message: tag,
        object: targetSha,
        type: "commit",
      }),
    ]);
    expect(calls[1]).toEqual([
      "createRef",
      { owner, repo, ref: `refs/tags/${tag}`, sha: annotatedTagSha },
    ]);
  });

  test("skips an existing annotated tag only when it points to the requested commit", async () => {
    const github = existingTagClient(targetSha);
    const coreMessages: string[] = [];

    await createOrVerifyTag({
      github,
      core: { info: (message) => coreMessages.push(message) },
      owner,
      repo,
      tag,
      targetSha,
    });

    expect(coreMessages).toContain(
      `Release tag ${tag} already points to ${targetSha}; skipping creation.`
    );
  });

  test("rejects an existing tag that points to another commit", async () => {
    await expect(
      createOrVerifyTag({
        github: existingTagClient("b".repeat(40)),
        core: { info: () => undefined },
        owner,
        repo,
        tag,
        targetSha,
      })
    ).rejects.toThrow(`Release tag ${tag} points to ${"b".repeat(40)}, expected ${targetSha}`);
  });

  test("treats a concurrent creation as success only when its target matches", async () => {
    let refReads = 0;
    const github = {
      rest: {
        git: {
          getRef: async () => {
            refReads += 1;
            if (refReads === 1) throw notFound();
            return { data: { object: { type: "tag", sha: annotatedTagSha } } };
          },
          getTag: async () => ({ data: { object: { type: "commit", sha: targetSha } } }),
          createTag: async () => ({ data: { sha: annotatedTagSha } }),
          createRef: async () => {
            throw Object.assign(new Error("Reference already exists"), { status: 422 });
          },
        },
      },
    };

    await expect(
      createOrVerifyTag({
        github,
        core: { info: () => undefined },
        owner,
        repo,
        tag,
        targetSha,
      })
    ).resolves.toBeUndefined();
  });
});
