import { execFileSync } from "node:child_process";
import { z } from "zod";
import { initialLedger, type LedgerStore, type ReleaseLedger, validateLedger } from "./ledger";
import { canonicalJson, digest, type ReleaseContract, shaSchema } from "./policy";

const refSchema = z.object({
  object: z.object({ sha: shaSchema, type: z.enum(["commit", "tag"]) }),
});
const gitCommitSchema = z.object({
  sha: shaSchema,
  tree: z.object({ sha: shaSchema }),
  parents: z.array(z.object({ sha: shaSchema })),
  message: z.string(),
  verification: z.object({ verified: z.boolean(), reason: z.string() }),
});
const repositoryCommitSchema = z.object({
  sha: shaSchema,
  author: z.object({ login: z.string() }).nullable(),
  committer: z.object({ login: z.string() }).nullable(),
  parents: z.array(z.object({ sha: shaSchema })),
  commit: z.object({
    message: z.string(),
    tree: z.object({ sha: shaSchema }),
    verification: z.object({ verified: z.boolean(), reason: z.string() }),
  }),
});
export const pullSchema = z.object({
  number: z.number().int().positive(),
  node_id: z.string(),
  state: z.enum(["open", "closed"]),
  merged: z.boolean(),
  merge_commit_sha: shaSchema.nullable(),
  user: z.object({ login: z.string() }),
  head: z.object({
    sha: shaSchema,
    ref: z.string(),
    repo: z.object({ full_name: z.string() }).nullable(),
  }),
  base: z.object({ ref: z.string(), repo: z.object({ full_name: z.string() }) }),
  auto_merge: z.unknown().nullable(),
});
export type ReleasePull = z.infer<typeof pullSchema>;

export class GitHubError extends Error {
  constructor(public readonly status: number) {
    super(`GitHub request failed (HTTP ${status || "unknown"})`);
  }
}

export interface GitHubTransport {
  request(endpoint: string, method?: string, payload?: unknown, paginate?: boolean): unknown;
  command(args: string[]): string;
}

export function ghTransport(token = process.env.GH_TOKEN): GitHubTransport {
  const env = { ...process.env, ...(token ? { GH_TOKEN: token } : {}), GH_PROMPT_DISABLED: "1" };
  function command(args: string[], input?: string): string {
    try {
      return execFileSync("gh", args, {
        input,
        encoding: "utf8",
        env,
        maxBuffer: 32 * 1024 * 1024,
        timeout: 120_000,
      });
    } catch (error) {
      const stderr =
        error && typeof error === "object" && "stderr" in error ? String(error.stderr) : "";
      throw new GitHubError(Number(stderr.match(/HTTP (\d{3})/)?.[1] || 0));
    }
  }
  return {
    command,
    request(endpoint, method = "GET", payload, paginate = false) {
      // The PR provenance contract requires merge_commit_sha, removed in the 2026 API.
      const args = ["api", endpoint, "--method", method, "-H", "X-GitHub-Api-Version: 2022-11-28"];
      if (paginate) args.push("--paginate", "--slurp");
      if (payload !== undefined) args.push("--input", "-");
      const output = command(args, payload === undefined ? undefined : JSON.stringify(payload));
      return output.trim() ? JSON.parse(output) : null;
    },
  };
}

export class GitHubRelease {
  readonly root: string;
  private readonly verified = new Set<string>();

  constructor(
    readonly contract: ReleaseContract,
    readonly botSlug: string,
    readonly transport: GitHubTransport = ghTransport()
  ) {
    this.root = `repos/${contract.repository}`;
    if (botSlug !== "github-actions")
      throw new Error("Release identity must use github-actions[bot]");
  }

  api(endpoint: string, method = "GET", payload?: unknown): unknown {
    return this.transport.request(endpoint, method, payload);
  }

  pages(endpoint: string, key?: string): unknown[] {
    const pages = z
      .array(z.unknown())
      .parse(this.transport.request(endpoint, "GET", undefined, true));
    return pages.flatMap((page) => {
      if (key)
        return z.array(z.unknown()).parse(z.record(z.string(), z.unknown()).parse(page)[key]);
      return z.array(z.unknown()).parse(page);
    });
  }

  optional(endpoint: string): unknown | undefined {
    try {
      return this.api(endpoint);
    } catch (error) {
      if (error instanceof GitHubError && error.status === 404) return undefined;
      throw error;
    }
  }

  reference(name: string): string | undefined {
    const raw = this.optional(`${this.root}/git/ref/${name}`);
    if (!raw) return undefined;
    const ref = refSchema.parse(raw);
    if (ref.object.type !== "commit") throw new Error("Expected a commit branch reference");
    return ref.object.sha;
  }

  commit(sha: string) {
    return gitCommitSchema.parse(this.api(`${this.root}/git/commits/${shaSchema.parse(sha)}`));
  }

  verifyBotCommit(sha: string, listing?: unknown): void {
    if (this.verified.has(sha)) return;
    const commit = repositoryCommitSchema.parse(listing ?? this.api(`${this.root}/commits/${sha}`));
    const login = `${this.botSlug}[bot]`;
    if (
      commit.sha !== sha ||
      commit.author?.login !== login ||
      ![login, "web-flow"].includes(commit.committer?.login || "") ||
      !commit.commit.verification.verified ||
      commit.commit.verification.reason !== "valid"
    ) {
      throw new Error("Release commit must be Verified and authored by github-actions[bot]");
    }
    if (!commit.commit.message.includes(`Signed-off-by: ${login} <`))
      throw new Error("Release commit is missing its automation signoff");
    this.verified.add(sha);
  }

  createCommitOnBranch(
    branch: string,
    expectedHead: string,
    files: { path: string; content: string }[],
    message: string
  ): string {
    const user = z
      .object({ id: z.number().int().positive() })
      .parse(this.api(`users/${this.botSlug}[bot]`));
    const bot = `${this.botSlug}[bot]`;
    const [headline, ...body] = message.split("\n");
    const response = z
      .object({
        errors: z.array(z.unknown()).optional(),
        data: z
          .object({ createCommitOnBranch: z.object({ commit: z.object({ oid: shaSchema }) }) })
          .nullish(),
      })
      .parse(
        this.api("graphql", "POST", {
          query:
            "mutation($input:CreateCommitOnBranchInput!){createCommitOnBranch(input:$input){commit{oid}}}",
          variables: {
            input: {
              branch: { repositoryNameWithOwner: this.contract.repository, branchName: branch },
              expectedHeadOid: shaSchema.parse(expectedHead),
              message: {
                headline,
                body: `${body.join("\n").trim()}\n\nSigned-off-by: ${bot} <${user.id}+${bot}@users.noreply.github.com>`,
              },
              fileChanges: {
                additions: files.map(({ path, content }) => ({
                  path,
                  contents: Buffer.from(content).toString("base64"),
                })),
              },
            },
          },
        })
      );
    if (response.errors?.length || !response.data)
      throw new Error("Signed branch CAS failed; retain the original release identity");
    const sha = response.data.createCommitOnBranch.commit.oid;
    const created = this.commit(sha);
    if (created.parents.length !== 1 || created.parents[0]?.sha !== expectedHead)
      throw new Error("Signed preparation parent does not match the expected head");
    this.verifyBotCommit(sha);
    return sha;
  }

  createBranch(branch: string, sha: string): void {
    this.api(`${this.root}/git/refs`, "POST", { ref: `refs/heads/${branch}`, sha });
  }

  dispatchEvaluation(workflow: "ci.yml" | "e2e.yml", branch: string, expectedHead: string): void {
    if (this.reference(`heads/${branch}`) !== expectedHead)
      throw new Error("Evaluation source moved before dispatch");
    const runs = this.pages(
      `${this.root}/actions/workflows/${workflow}/runs?branch=${encodeURIComponent(branch)}&head_sha=${shaSchema.parse(expectedHead)}&per_page=100`,
      "workflow_runs"
    );
    if (
      runs.some((raw) => {
        const run = z
          .object({ event: z.string(), head_sha: shaSchema, head_branch: z.string().nullable() })
          .parse(raw);
        return (
          ["push", "workflow_dispatch"].includes(run.event) &&
          run.head_sha === expectedHead &&
          run.head_branch === branch
        );
      })
    )
      return;
    if (this.reference(`heads/${branch}`) !== expectedHead)
      throw new Error("Evaluation source moved before dispatch");
    this.api(`${this.root}/actions/workflows/${workflow}/dispatches`, "POST", { ref: branch });
  }

  file(path: string, sha: string): string {
    const file = z
      .object({ encoding: z.literal("base64"), content: z.string(), type: z.literal("file") })
      .parse(this.api(`${this.root}/contents/${path}?ref=${shaSchema.parse(sha)}`));
    return Buffer.from(file.content.replaceAll("\n", ""), "base64").toString("utf8");
  }

  pull(number: number): ReleasePull {
    return pullSchema.parse(this.api(`${this.root}/pulls/${number}`));
  }

  changedFiles(base: string, head: string): string[] {
    const comparison = z
      .object({
        files: z
          .array(z.object({ filename: z.string(), previous_filename: z.string().optional() }))
          .optional(),
        total_commits: z.number(),
      })
      .parse(this.api(`${this.root}/compare/${shaSchema.parse(base)}...${shaSchema.parse(head)}`));
    if (!comparison.files || comparison.files.length >= 300 || comparison.total_commits > 250)
      throw new Error("Source comparison is truncated; cannot establish provenance");
    return comparison.files.flatMap((file) =>
      file.previous_filename ? [file.filename, file.previous_filename] : [file.filename]
    );
  }

  canonicalTags(): { version: string; sha: string }[] {
    return this.pages(`${this.root}/git/matching-refs/tags/v?per_page=100`).flatMap((raw) => {
      const item = z
        .object({ ref: z.string(), object: z.object({ sha: shaSchema, type: z.string() }) })
        .parse(raw);
      const version = item.ref.replace(/^refs\/tags\/v/, "");
      if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version)) return [];
      let target = item.object;
      for (let depth = 0; target.type === "tag" && depth < 8; depth++) {
        target = z
          .object({ object: z.object({ sha: shaSchema, type: z.string() }) })
          .parse(this.api(`${this.root}/git/tags/${target.sha}`)).object;
      }
      if (target.type !== "commit") throw new Error("Canonical tag does not resolve to a commit");
      return [{ version, sha: target.sha }];
    });
  }
}

export class GitHubLedgerStore implements LedgerStore {
  constructor(readonly github: GitHubRelease) {}

  async initialize(): Promise<void> {
    const { contract } = this.github;
    let head = this.github.reference(`heads/${contract.ledgerBranch}`);
    if (!head) {
      this.github.createBranch(contract.ledgerBranch, contract.bootstrap.sourceSha);
      head = contract.bootstrap.sourceSha;
    }
    if (head === contract.bootstrap.sourceSha) {
      const ledger = initialLedger(contract);
      this.github.createCommitOnBranch(
        contract.ledgerBranch,
        head,
        [{ path: "ledger.json", content: `${canonicalJson(ledger)}\n` }],
        `chore(release): initialize product ledger\n\nBootstrap-Source: ${contract.bootstrap.sourceSha}\nLedger-Digest: ${digest(ledger)}`
      );
    }
    await this.read();
  }

  async read(
    options: { allowLegacyHead?: boolean; allowLegacyAncestor?: boolean } = {}
  ): Promise<{ sha: string; ledger: ReleaseLedger; legacySha?: string }> {
    const { contract } = this.github;
    const sha = this.github.reference(`heads/${contract.ledgerBranch}`);
    if (!sha)
      throw new Error(
        "Release ledger has not been initialized; run the token probe or preparation"
      );
    let expected = sha;
    let rootFound = false;
    const recoverySha = this.github
      .commit(sha)
      .message.match(/(?:^|\n)Ledger-Recovery: ([a-f0-9]{40})(?:\n|$)/)?.[1];
    let legacySha: string | undefined;
    const commits = this.github.pages(`${this.github.root}/commits?sha=${sha}&per_page=100`);
    for (const raw of commits) {
      const commit = repositoryCommitSchema.parse(raw);
      if (commit.sha !== expected || commit.parents.length > 1)
        throw new Error("Ledger history is not a single-parent chain");
      const legacyRequested =
        (options.allowLegacyHead && commit.sha === sha) ||
        (options.allowLegacyAncestor && commit.sha !== sha && !legacySha) ||
        recoverySha === commit.sha;
      const owner = contract.repository.split("/")[0];
      if (legacyRequested && commit.author?.login === owner) {
        const bot = `${this.github.botSlug}[bot]`;
        if (
          commit.author?.login !== owner ||
          commit.committer?.login !== "web-flow" ||
          !commit.commit.verification.verified ||
          commit.commit.verification.reason !== "valid" ||
          !commit.commit.message.includes(`Signed-off-by: ${bot} <`)
        )
          throw new Error("Legacy ledger head is not a valid GitHub-signed recovery candidate");
        legacySha = commit.sha;
      } else this.github.verifyBotCommit(commit.sha, raw);
      if (!/Ledger-Digest: [a-f0-9]{64}/.test(commit.commit.message))
        throw new Error("Ledger commit lacks its state digest");
      const parent = commit.parents[0];
      if (commit.commit.message.includes(`Bootstrap-Source: ${contract.bootstrap.sourceSha}`)) {
        if (parent?.sha !== contract.bootstrap.sourceSha)
          throw new Error("Ledger root parent differs from bootstrap");
        const root = validateLedger(
          JSON.parse(this.github.file("ledger.json", commit.sha)),
          contract
        );
        if (
          root.entries.length ||
          !commit.commit.message.includes(`Ledger-Digest: ${digest(root)}`)
        )
          throw new Error("Ledger initialization must contain only the approved bootstrap");
        rootFound = true;
        break;
      }
      if (!parent) throw new Error("Ledger root does not bind the approved baseline");
      expected = parent.sha;
    }
    if (!rootFound) throw new Error("Incomplete ledger ancestry");
    if (recoverySha !== undefined && legacySha !== recoverySha)
      throw new Error("Ledger recovery marker does not bind its legacy commit");
    const ledger = validateLedger(JSON.parse(this.github.file("ledger.json", sha)), contract);
    if (!this.github.commit(sha).message.includes(`Ledger-Digest: ${digest(ledger)}`))
      throw new Error("Ledger state digest does not match the signed head");
    return { sha, ledger, legacySha };
  }

  async compareAndSwap(
    expectedSha: string,
    ledger: ReleaseLedger,
    recoverySha?: string
  ): Promise<string> {
    validateLedger(ledger, this.github.contract);
    if (this.github.reference(`heads/${this.github.contract.ledgerBranch}`) !== expectedSha)
      throw new Error("Ledger CAS conflict; reread the original identity before retrying");
    const sha = this.github.createCommitOnBranch(
      this.github.contract.ledgerBranch,
      expectedSha,
      [{ path: "ledger.json", content: `${canonicalJson(ledger)}\n` }],
      `chore(release): record product delivery state\n\nLedger-Digest: ${digest(ledger)}${
        recoverySha ? `\nLedger-Recovery: ${shaSchema.parse(recoverySha)}` : ""
      }`
    );
    if (this.github.reference(`heads/${this.github.contract.ledgerBranch}`) !== sha)
      throw new Error("Ledger update was not confirmed");
    return sha;
  }
}
