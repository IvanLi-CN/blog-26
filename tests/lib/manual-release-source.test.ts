import { describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
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
import { semanticSourceBlobs } from "../../src/lib/release/source";

describe("business evidence across VERSION-only releases", () => {
  test("authenticated prereleases preserve business blobs and the formal baseline", () => {
    const root = mkdtempSync(join(tmpdir(), "release-source-"));
    const git = (...args: string[]) =>
      execFileSync("git", ["-c", "core.hooksPath=/dev/null", ...args], {
        cwd: root,
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
    try {
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
    }
  });
});
