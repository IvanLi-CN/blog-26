import { describe, expect, test } from "bun:test";
import contractJson from "../../.github/release-contract.json";
import {
  changeLedger,
  initialLedger,
  type LedgerStore,
  reserveRelease,
  updateRelease,
  validateLedger,
} from "../../src/lib/release/ledger";
import { contractSchema } from "../../src/lib/release/policy";

const contract = contractSchema.parse(contractJson);
const request = {
  sourceSha: "b".repeat(40),
  policyDigest: "c".repeat(64),
  evidenceDigest: "d".repeat(64),
  impact: "minor" as const,
  actor: "maintainer",
  preparationRunId: 1,
};

describe("durable product release reservations", () => {
  test("retries reuse the original identity before recalculating the baseline", () => {
    const first = reserveRelease(initialLedger(contract), request);
    const retry = reserveRelease(first.ledger, request);
    expect(first.entry.version).toBe("2.8.0");
    expect(retry.reused).toBe(true);
    expect(retry.entry.id).toBe(first.entry.id);
    expect(() => reserveRelease(first.ledger, { ...request, version: "2.9.0" })).toThrow("Retry");
    expect(() => reserveRelease(first.ledger, { ...request, actor: "another" })).toThrow(
      "operator"
    );
    expect(() => reserveRelease(first.ledger, { ...request, sourceSha: "e".repeat(40) })).toThrow(
      "active"
    );
  });
  test("abandonment burns the version and requires a fresh identity", () => {
    const first = reserveRelease(initialLedger(contract), request);
    const abandoned = updateRelease(first.ledger, first.entry.id, { stage: "abandoned" });
    const next = reserveRelease(abandoned, { ...request, preparationRunId: 2 });
    expect(next.entry.version).toBe("2.8.1");
    expect(next.entry.id).not.toBe(first.entry.id);
    expect(() => updateRelease(abandoned, first.entry.id, { stage: "reserved" })).toThrow(
      "revived"
    );
  });
  test("unproven stages and source replacement cannot be committed", () => {
    const first = reserveRelease(initialLedger(contract), request);
    expect(() => updateRelease(first.ledger, first.entry.id, { stage: "published" })).toThrow(
      "skipped"
    );
    expect(() => updateRelease(first.ledger, first.entry.id, { stage: "pr_open" })).toThrow(
      "provenance"
    );
    expect(() =>
      updateRelease(first.ledger, first.entry.id, { sourceSha: "e".repeat(40) })
    ).toThrow("replace sourceSha");
    const changed = structuredClone(first.ledger);
    if (!changed.entries[0]) throw new Error("Missing fixture");
    changed.entries[0].version = "2.9.0";
    expect(() => validateLedger(changed, contract)).toThrow("identity");
  });
  test("simultaneous compare-and-swap writers cannot reserve two identities", async () => {
    let sha = "root";
    let ledger = initialLedger(contract);
    const store: LedgerStore = {
      async read() {
        return { sha, ledger: structuredClone(ledger) };
      },
      async compareAndSwap(expected, next) {
        if (sha !== expected) throw new Error("CAS conflict");
        sha = "next";
        ledger = next;
        return sha;
      },
    };
    const reserve = (actor: string) =>
      changeLedger(store, (current) => {
        const prepared = reserveRelease(current, { ...request, actor });
        return { ledger: prepared.ledger, result: prepared.entry.id };
      });
    const results = await Promise.allSettled([reserve("one"), reserve("two")]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(ledger.entries).toHaveLength(1);
  });
});
