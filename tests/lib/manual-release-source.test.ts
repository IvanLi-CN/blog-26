import { describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import contractJson from "../../.github/release-contract.json";
import {
  initialLedger,
  publishedBaseline,
  reserveRelease,
  supportedVersions,
} from "../../src/lib/release/ledger";
import { contractSchema } from "../../src/lib/release/policy";
import { semanticSourceBlobs, sourceAssessment } from "../../src/lib/release/source";

describe("business evidence across VERSION-only releases", () => {
  // These cases spawn dozens of git subprocesses per test and the suite shares one cwd.
  test("authenticated prereleases preserve business blobs and the formal baseline", () => {
    const root = mkdtempSync(join(tmpdir(), "release-source-"));
    const gitEnv = { ...process.env };
    for (const key of ["GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE", "GIT_PREFIX"]) {
      delete gitEnv[key];
    }
    const git = (...args: string[]) =>
      execFileSync("git", ["-c", "core.hooksPath=/dev/null", ...args], {
        cwd: root,
        env: gitEnv,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      }).trim();
    git("init");
    git("config", "user.name", "Release Fixture");
    git("config", "user.email", "fixture@example.test");
    function commit(message: string) {
      git("add", ".");
      git("-c", "commit.gpgsign=false", "commit", "-m", message);
      return git("rev-parse", "HEAD");
    }
    writeFileSync(join(root, "business.txt"), "baseline");
    const base = commit("baseline");
    const contract = contractSchema.parse({
      ...contractJson,
      bootstrap: { version: "2.7.0", sourceSha: base },
    });
    writeFileSync(join(root, "VERSION"), "2.7.0\n");
    writeFileSync(join(root, "business.txt"), "compatible business change");
    const business = commit("bootstrap product version and business change");
    const initial = reserveRelease(initialLedger(contract), {
      sourceSha: business,
      actor: "owner",
      policyDigest: "c".repeat(64),
      evidenceDigest: "d".repeat(64),
      impact: "minor",
      preparationRunId: 1,
      version: "alpha",
    });
    writeFileSync(join(root, "VERSION"), "2.8.0-alpha.1\n");
    const alpha = commit("registered VERSION-only release");
    // Source projection is independently tested; the caller's provenance checker supplies PR/signature validation.
    const ledger = {
      ...initial.ledger,
      entries: [{ ...initial.entry, mergeSha: alpha, stage: "complete" as const }],
    };
    const originalCwd = process.cwd();
    const originalGitEnv = new Map(
      ["GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE", "GIT_PREFIX"].map((key) => [
        key,
        process.env[key],
      ])
    );
    try {
      for (const key of originalGitEnv.keys()) delete process.env[key];
      process.chdir(root);
      const before = semanticSourceBlobs(initialLedger(contract), business);
      expect(() => semanticSourceBlobs(ledger, alpha)).toThrow("provenance");
      let proofs = 0;
      const after = semanticSourceBlobs(ledger, alpha, (entry) => {
        expect(entry.mergeSha).toBe(alpha);
        proofs++;
      });
      expect(after.changed).toEqual(before.changed);
      expect(after.blobs.VERSION).toBe(before.blobs.VERSION);
      expect(proofs).toBe(1);
      expect(publishedBaseline(ledger)).toEqual(contract.bootstrap);
      expect(supportedVersions(ledger)).toEqual(["2.7.0"]);
      const abandoned = {
        ...initial.ledger,
        entries: [
          {
            ...initial.entry,
            stage: "abandoned" as const,
            preparationHead: alpha,
            prNumber: 73,
          },
        ],
      };
      expect(() => semanticSourceBlobs(abandoned, alpha)).toThrow("provenance");
      let abandonedProofs = 0;
      const recovered = semanticSourceBlobs(abandoned, alpha, (entry) => {
        expect(entry.id).toBe(initial.entry.id);
        expect(entry.stage).toBe("abandoned");
        expect(entry.mergeSha).toBe(alpha);
        expect(entry.prNumber).toBe(73);
        abandonedProofs++;
      });
      expect(abandonedProofs).toBe(1);
      expect(recovered).toEqual(before);
      expect(abandoned.entries[0]).not.toHaveProperty("mergeSha");
      expect(() =>
        semanticSourceBlobs(abandoned, alpha, () => {
          throw new Error("Release PR merge provenance rejected");
        })
      ).toThrow("Release PR merge provenance rejected");
      expect(() =>
        semanticSourceBlobs(
          { ...abandoned, entries: [{ ...abandoned.entries[0]!, prNumber: undefined }] },
          alpha,
          () => {}
        )
      ).toThrow("Unregistered VERSION");
      const next = reserveRelease(ledger, {
        sourceSha: alpha,
        actor: "owner",
        policyDigest: "c".repeat(64),
        evidenceDigest: "d".repeat(64),
        impact: "minor",
        preparationRunId: 2,
        version: "alpha",
      });
      expect(next.entry.version).toBe("2.8.0-alpha.2");
      expect(next.entry.id).not.toBe(initial.entry.id);
      expect(next.entry.baselineSha).toBe(base);
      writeFileSync(join(root, "VERSION"), "2.8.0-beta.1\n");
      const forged = commit("unregistered version");
      expect(() =>
        semanticSourceBlobs(ledger, forged, () => {
          /* Prior registered entry is separately proven above. */
        })
      ).toThrow("Unregistered VERSION");
    } finally {
      process.chdir(originalCwd);
      for (const [key, value] of originalGitEnv) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  }, 20_000);

  test("ignores a merge commit that carries the already-published version", () => {
    const root = mkdtempSync(join(tmpdir(), "release-source-merge-"));
    const gitEnv = { ...process.env };
    for (const key of ["GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE", "GIT_PREFIX"]) {
      delete gitEnv[key];
    }
    const git = (...args: string[]) =>
      execFileSync("git", ["-c", "core.hooksPath=/dev/null", ...args], {
        cwd: root,
        env: gitEnv,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      }).trim();
    git("init");
    git("config", "user.name", "Release Fixture");
    git("config", "user.email", "fixture@example.test");
    function commit(message: string) {
      git("add", ".");
      git("-c", "commit.gpgsign=false", "commit", "-m", message);
      return git("rev-parse", "HEAD");
    }
    writeFileSync(join(root, "VERSION"), "2.7.0\n");
    writeFileSync(join(root, "business.txt"), "baseline");
    const base = commit("baseline");
    const contract = contractSchema.parse({
      ...contractJson,
      bootstrap: { version: "2.7.0", sourceSha: base },
    });
    git("checkout", "-b", "feature");
    writeFileSync(join(root, "business.txt"), "feature change");
    commit("business change");
    git("checkout", "-b", "release", base);
    writeFileSync(join(root, "VERSION"), "2.8.0\n");
    const release = commit("registered release preparation");
    git("checkout", "feature");
    git("-c", "merge.autoEdit=no", "merge", "--no-ff", release, "-m", "sync published release");
    const candidate = git("rev-parse", "HEAD");

    const reservation = reserveRelease(initialLedger(contract), {
      sourceSha: release,
      actor: "owner",
      policyDigest: "c".repeat(64),
      evidenceDigest: "d".repeat(64),
      impact: "minor",
      preparationRunId: 1,
      version: "2.8.0",
    });
    const ledger = {
      ...reservation.ledger,
      entries: [{ ...reservation.entry, stage: "complete" as const, mergeSha: release }],
    };
    const originalCwd = process.cwd();
    const originalGitEnv = new Map(
      ["GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE", "GIT_PREFIX"].map((key) => [
        key,
        process.env[key],
      ])
    );
    try {
      for (const key of originalGitEnv.keys()) delete process.env[key];
      process.chdir(root);
      const result = semanticSourceBlobs(ledger, candidate);
      expect(result.changed["business.txt"]).toBeString();
      expect(result.changed.VERSION).toBeUndefined();
    } finally {
      process.chdir(originalCwd);
      for (const [key, value] of originalGitEnv) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  }, 20_000);

  test("ignores a registered release-preparation VERSION commit", () => {
    const root = mkdtempSync(join(tmpdir(), "release-source-preparation-"));
    const gitEnv = { ...process.env };
    for (const key of ["GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE", "GIT_PREFIX"]) {
      delete gitEnv[key];
    }
    const git = (...args: string[]) =>
      execFileSync("git", ["-c", "core.hooksPath=/dev/null", ...args], {
        cwd: root,
        env: gitEnv,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      }).trim();
    git("init");
    git("config", "user.name", "Release Fixture");
    git("config", "user.email", "fixture@example.test");
    function commit(message: string) {
      git("add", ".");
      git("-c", "commit.gpgsign=false", "commit", "-m", message);
      return git("rev-parse", "HEAD");
    }
    writeFileSync(join(root, "VERSION"), "2.7.0\n");
    writeFileSync(join(root, "business.txt"), "baseline");
    const base = commit("baseline");
    const contract = contractSchema.parse({
      ...contractJson,
      bootstrap: { version: "2.7.0", sourceSha: base },
    });
    writeFileSync(join(root, "business.txt"), "registered release source");
    const source = commit("registered release source");
    const reservation = reserveRelease(initialLedger(contract), {
      sourceSha: source,
      actor: "owner",
      policyDigest: "c".repeat(64),
      evidenceDigest: "d".repeat(64),
      impact: "minor",
      preparationRunId: 1,
      version: "2.8.0",
    });
    writeFileSync(join(root, "VERSION"), "2.8.0\n");
    const versionCommit = commit("registered release version marker");
    const originalCwd = process.cwd();
    const originalGitEnv = new Map(
      ["GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE", "GIT_PREFIX"].map((key) => [
        key,
        process.env[key],
      ])
    );
    try {
      for (const key of originalGitEnv.keys()) delete process.env[key];
      process.chdir(root);
      const ledger = {
        ...reservation.ledger,
        entries: [
          {
            ...reservation.entry,
            stage: "pr_open" as const,
            preparationHead: source,
            prNumber: 1,
          },
        ],
      };
      const result = semanticSourceBlobs(ledger, versionCommit);
      expect(result.changed["business.txt"]).toBeString();
      expect(result.changed.VERSION).toBeUndefined();
    } finally {
      process.chdir(originalCwd);
      for (const [key, value] of originalGitEnv) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  }, 20_000);

  test("source assessment derives impact and needs no classification file", () => {
    const root = mkdtempSync(join(tmpdir(), "release-assess-"));
    const gitEnv = { ...process.env };
    for (const key of ["GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE", "GIT_PREFIX"]) {
      delete gitEnv[key];
    }
    const git = (...args: string[]) =>
      execFileSync("git", ["-c", "core.hooksPath=/dev/null", ...args], {
        cwd: root,
        env: gitEnv,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      }).trim();
    git("init");
    git("config", "user.name", "Release Fixture");
    git("config", "user.email", "fixture@example.test");
    const commit = (message: string) => {
      git("add", ".");
      git("-c", "commit.gpgsign=false", "commit", "-m", message);
      return git("rev-parse", "HEAD");
    };
    writeFileSync(join(root, "business.txt"), "baseline");
    const base = commit("baseline");
    const contract = contractSchema.parse({
      ...contractJson,
      bootstrap: { version: "2.7.0", sourceSha: base },
    });
    writeFileSync(join(root, "VERSION"), "2.7.0\n");
    const ledger = initialLedger(contract);
    const originalCwd = process.cwd();
    const originalGitEnv = new Map(
      ["GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE", "GIT_PREFIX"].map((key) => [
        key,
        process.env[key],
      ])
    );
    try {
      for (const key of originalGitEnv.keys()) delete process.env[key];
      process.chdir(root);
      writeFileSync(join(root, "docs.md"), "# Note");
      const docsOnly = commit("docs: describe the runtime config");
      const docsAssessment = sourceAssessment(ledger, docsOnly);
      expect(docsAssessment.impact).toBe("patch");
      expect(docsAssessment.classification.surfaces).toEqual([]);
      expect(sourceAssessment(ledger, docsOnly).evidenceDigest).toBe(docsAssessment.evidenceDigest);

      writeFileSync(join(root, "VERSION"), "2.7.0\n");
      mkdirSync(join(root, "drizzle"), { recursive: true });
      writeFileSync(
        join(root, "drizzle", "0020_drop.sql"),
        "ALTER TABLE posts DROP COLUMN legacy;"
      );
      const destructive = commit("fix: drop the legacy column");
      const destructiveAssessment = sourceAssessment(ledger, destructive);
      expect(destructiveAssessment.impact).toBe("minor");
      expect(destructiveAssessment.classification.surfaces).toEqual([
        { id: "persistent-state", paths: ["drizzle/0020_drop.sql"] },
      ]);

      writeFileSync(join(root, "VERSION"), "2.7.0\n");
      writeFileSync(join(root, "next.md"), "# Next");
      const raised = commit("feat: add surface\n\nRelease-Impact: major");
      const raisedAssessment = sourceAssessment(ledger, raised);
      expect(raisedAssessment.impact).toBe("major");
      expect(raisedAssessment.evidenceDigest).not.toBe(destructiveAssessment.evidenceDigest);
    } finally {
      process.chdir(originalCwd);
      for (const [key, value] of originalGitEnv) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  }, 20_000);
});
