import { describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import contractJson from "../../.github/release-contract.json";
import { initialLedger, reserveRelease } from "../../src/lib/release/ledger";
import { contractSchema } from "../../src/lib/release/policy";
import { semanticSourceBlobs } from "../../src/lib/release/source";

function withGraph(run: (graph: ReturnType<typeof graphFixture>) => void) {
  const root = mkdtempSync(join(tmpdir(), "nested-release-source-"));
  const cwd = process.cwd();
  const gitKeys = ["GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE", "GIT_PREFIX"];
  const saved = gitKeys.map((key) => [key, process.env[key]] as const);
  try {
    for (const key of gitKeys) delete process.env[key];
    process.chdir(root);
    run(graphFixture(root));
  } finally {
    process.chdir(cwd);
    for (const [key, value] of saved) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    rmSync(root, { recursive: true, force: true });
  }
}

function graphFixture(root: string) {
  const git = (...args: string[]) =>
    execFileSync("git", ["-c", "core.hooksPath=/dev/null", ...args], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  const write = (path: string, content: string) => writeFileSync(join(root, path), content);
  const commit = (message: string) => {
    git("add", ".");
    git("-c", "commit.gpgsign=false", "commit", "-m", message);
    return git("rev-parse", "HEAD");
  };
  git("init");
  git("config", "user.name", "Release Fixture");
  git("config", "user.email", "fixture@example.test");
  write("VERSION", "2.7.0\n");
  const base = commit("baseline");
  const contract = contractSchema.parse({
    ...contractJson,
    bootstrap: { version: "2.7.0", sourceSha: base },
  });
  const reservation = reserveRelease(initialLedger(contract), {
    sourceSha: base,
    actor: "owner",
    policyDigest: "c".repeat(64),
    evidenceDigest: "d".repeat(64),
    impact: "minor",
    preparationRunId: 1,
    version: "alpha",
  });
  const version = reservation.entry.version;
  git("checkout", "-b", "release");
  write("VERSION", `${version}\n`);
  const release = commit("registered release");
  const ledger = {
    ...reservation.ledger,
    entries: [{ ...reservation.entry, stage: "complete" as const, mergeSha: release }],
  };
  git("checkout", "-b", "incoming");
  write("incoming.txt", "incoming business change");
  commit("business after release");
  const mergeIntoTopic = () => {
    const incoming = git("rev-parse", "HEAD");
    git("checkout", "-b", "topic", base);
    write("topic.txt", "topic business change");
    commit("topic change");
    git("merge", "--no-ff", incoming, "-m", "merge nested release carry");
    return git("rev-parse", "HEAD");
  };
  return { git, write, commit, base, version, release, ledger, mergeIntoTopic };
}

describe("authenticated nested release carry", () => {
  test("recognizes a release through business commits and chained topic merges", () => {
    withGraph((g) => {
      const nested = g.mergeIntoTopic();
      g.git("checkout", "-b", "outer", g.base);
      g.write("outer.txt", "outer business change");
      g.commit("outer change");
      g.git("merge", "--no-ff", nested, "-m", "merge topic into parent");
      const head = g.git("rev-parse", "HEAD");
      expect(() => semanticSourceBlobs(g.ledger, head)).toThrow("provenance");
      const proofs: Array<string | undefined> = [];
      const result = semanticSourceBlobs(g.ledger, head, (entry) => {
        proofs.push(entry.mergeSha);
        expect(entry.id).toBe(g.ledger.entries[0].id);
      });
      expect(proofs).toEqual([g.release]);
      expect(result.changed.VERSION).toBeUndefined();
      for (const file of ["incoming.txt", "topic.txt", "outer.txt"]) {
        expect(result.changed[file]).toBeString();
      }
      expect(() =>
        semanticSourceBlobs(g.ledger, head, () => {
          throw new Error("Release provenance rejected");
        })
      ).toThrow("Release provenance rejected");
    });
  });

  test("authenticates the exact original PR merge for a carried abandoned preparation", () => {
    withGraph((g) => {
      const head = g.mergeIntoTopic();
      const ledger = {
        ...g.ledger,
        entries: [
          {
            ...g.ledger.entries[0],
            stage: "abandoned" as const,
            mergeSha: undefined,
            preparationHead: g.release,
            prNumber: 73,
          },
        ],
      };
      expect(() => semanticSourceBlobs(ledger, head)).toThrow("provenance");
      const proofs: Array<string | undefined> = [];
      expect(
        semanticSourceBlobs(ledger, head, (entry) => {
          expect(entry.prNumber).toBe(73);
          expect(entry.stage).toBe("abandoned");
          proofs.push(entry.mergeSha);
        }).changed.VERSION
      ).toBeUndefined();
      expect(proofs).toEqual([g.release]);
      expect(ledger.entries[0].mergeSha).toBeUndefined();
      expect(() =>
        semanticSourceBlobs(ledger, head, () => {
          throw new Error("Wrong original PR merge");
        })
      ).toThrow("Wrong original PR merge");
      expect(() =>
        semanticSourceBlobs(
          { ...ledger, entries: [{ ...ledger.entries[0], prNumber: undefined }] },
          head,
          () => {
            throw new Error("Unexpected provenance request");
          }
        )
      ).toThrow("Unregistered VERSION");
    });
  });

  test("rejects an unregistered VERSION even when equal to a registered version elsewhere", () => {
    withGraph((g) => {
      g.git("checkout", "-b", "forged", g.base);
      g.write("VERSION", `${g.version}\n`);
      g.commit("copy an unrelated version value");
      const head = g.mergeIntoTopic();
      let proofs = 0;
      expect(() => semanticSourceBlobs(g.ledger, head, () => proofs++)).toThrow(
        "Unregistered VERSION"
      );
      expect(proofs).toBe(0);
    });
  });

  test("rejects a changed-then-restored version in the incoming lineage", () => {
    withGraph((g) => {
      g.write("VERSION", "9.0.0\n");
      g.commit("unregistered version change");
      g.write("VERSION", `${g.version}\n`);
      g.commit("restore registered version value");
      const head = g.mergeIntoTopic();
      let proofs = 0;
      expect(() => semanticSourceBlobs(g.ledger, head, () => proofs++)).toThrow(
        "Unregistered VERSION"
      );
      expect(proofs).toBe(0);
    });
  });

  test("rejects a merge that changes the carried VERSION file mode", () => {
    withGraph((g) => {
      const incoming = g.git("rev-parse", "HEAD");
      g.git("checkout", "-b", "topic", g.base);
      g.write("topic.txt", "topic business change");
      g.commit("topic change");
      g.git("merge", "--no-ff", "--no-commit", incoming);
      g.git("update-index", "--chmod=+x", "VERSION");
      g.git("-c", "commit.gpgsign=false", "commit", "-m", "merge with forged version mode");
      const head = g.git("rev-parse", "HEAD");
      let proofs = 0;
      expect(() => semanticSourceBlobs(g.ledger, head, () => proofs++)).toThrow(
        "Unregistered VERSION"
      );
      expect(proofs).toBe(0);
    });
  });

  test("rejects a ledger anchor whose version value does not match its VERSION blob", () => {
    withGraph((g) => {
      const head = g.mergeIntoTopic();
      const ledger = {
        ...g.ledger,
        entries: [{ ...g.ledger.entries[0], version: "2.8.0-alpha.2" }],
      };
      let proofs = 0;
      expect(() => semanticSourceBlobs(ledger, head, () => proofs++)).toThrow(
        "Unregistered VERSION"
      );
      expect(proofs).toBe(0);
    });
  });
});
