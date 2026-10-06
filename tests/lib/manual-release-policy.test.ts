import { describe, expect, test } from "bun:test";
import {
  allocateVersion,
  compareVersions,
  type ImpactRecord,
  validateStateUpgrade,
  verifyImpactRecords,
} from "../../src/lib/release/policy";
import { policyFingerprint } from "../../src/lib/release/source";

const base = "a".repeat(40);
const code = "b".repeat(40);
const proof = "c".repeat(40);
function record(): ImpactRecord {
  const assessment = {
    impact: "patch" as const,
    reasoning: "The public and durable contracts are unchanged.",
    assessed_at: "2026-10-07T00:00:00Z",
    evidence: [{ path: "tests/api.test.ts", blob: proof, command: "bun test tests/api.test.ts" }],
  };
  return {
    schema_version: 1,
    kind: "version-impact-record",
    base_sha: base,
    covered_files: { "src/api.ts": code },
    change: {
      description: "Internal fix",
      release_unit_description: "static frontend and full-feature Docker image",
      affected_contracts: ["public-api", "persistent-state"],
    },
    classification: {
      planned: assessment,
      current: { ...assessment, scope_drift: { detected: false, description: "none" } },
      verified: assessment,
    },
    compatibility_evidence: {
      public_api: {
        impact: "patch",
        change: "unchanged",
        supported_consumer_versions: ["2.7.0"],
        evidence: assessment.evidence,
      },
      persistent_state: {
        impact: "patch",
        applicable: true,
        state_description: "SQLite and local content",
        readable_by_prior_versions: ["2.7.0"],
        upgrade_from_versions: ["2.7.0"],
        evidence: assessment.evidence,
      },
    },
  };
}
const changed = { "src/api.ts": code };
const blobs = { ...changed, "tests/api.test.ts": proof };
const verify = (
  records: ImpactRecord[],
  diff: Record<string, string | null> = changed,
  tree = blobs,
  supported = ["2.7.0"]
) => verifyImpactRecords(records, diff, tree, base, supported, "2.7.0");

describe("stable product version policy", () => {
  test("a reservation binds policy implementation while VERSION-only preparation preserves it", () => {
    const source = {
      "src/lib/release/policy.ts": code,
      ".github/workflows/product-release.yml": proof,
      VERSION: base,
    };
    const original = policyFingerprint({}, {}, source);
    expect(policyFingerprint({}, {}, { ...source, VERSION: proof })).toBe(original);
    expect(policyFingerprint({}, {}, { ...source, "src/lib/release/policy.ts": proof })).not.toBe(
      original
    );
    expect(() => policyFingerprint({}, {}, {})).toThrow("incomplete");
  });
  test("automatic increments consume the verified impact and burned versions", () => {
    expect(allocateVersion("2.7.0", [], "patch")).toBe("2.7.1");
    expect(allocateVersion("2.7.0", ["2.8.0"], "minor")).toBe("2.8.1");
    expect(allocateVersion("2.7.0", ["2.7.9"], "major")).toBe("3.0.0");
  });
  test("explicit versions remain exact and cannot move backward or understate impact", () => {
    expect(allocateVersion("2.7.0", [], "minor", "2.9.0")).toBe("2.9.0");
    for (const version of [
      "2.7.0",
      "2.6.9",
      "2.7.1",
      "v2.8.0",
      "02.8.0",
      "2.8.0-rc.1",
      "2.8.0+build",
      " 2.8.0",
    ]) {
      expect(() => allocateVersion("2.7.0", [], "minor", version)).toThrow();
    }
    expect(() => allocateVersion("2.7.0", ["2.9.0"], "minor", "2.9.0")).toThrow();
  });
  test("numeric ordering does not round large SemVer components", () => {
    expect(compareVersions("2.10.0", "2.9.999")).toBe(1);
    expect(compareVersions("9007199254740993.0.0", "9007199254740992.0.0")).toBe(1);
  });
  test("evidence covers changed source blobs and cannot be reused after scope drift", () => {
    expect(verify([record()]).impact).toBe("patch");
    expect(() => verify([])).toThrow("Unclassified");
    expect(() => verify([record()], { "src/new.ts": code })).toThrow("Unclassified");
    expect(() => verify([record()], changed, { ...blobs, "tests/api.test.ts": base })).toThrow(
      "Stale evidence"
    );
    expect(() => verify([record()], changed, { ...blobs, "src/api.ts": base })).toThrow(
      "Scope drift"
    );
    const pending = record();
    pending.classification.verified = null;
    expect(() => verify([pending])).toThrow("Verified");
  });
  test("API and state contracts are independently classified and verified", () => {
    const value = record();
    value.compatibility_evidence.public_api.change = "breaking";
    expect(() => verify([value])).toThrow("Breaking public API");
    value.compatibility_evidence.public_api.change = "compatible";
    value.compatibility_evidence.persistent_state.readable_by_prior_versions = [];
    expect(() => verify([value])).toThrow("Patch state");
    value.compatibility_evidence.persistent_state.impact = "minor";
    if (!value.classification.verified) throw new Error("Missing fixture");
    value.classification.verified.impact = "minor";
    value.classification.current.impact = "minor";
    expect(verify([value]).impact).toBe("minor");
    expect(() => verify([value], changed, blobs, ["2.6.0", "2.7.0"])).toThrow("consumer");
    value.compatibility_evidence.public_api.supported_consumer_versions.push("2.6.0");
    expect(() => verify([value], changed, blobs, ["2.6.0", "2.7.0"])).toThrow(
      "earlier supported Minor state"
    );
  });
  test("state upgrades cannot jump over a Major", () => {
    expect(() => validateStateUpgrade("2.7.0", "3.0.0")).not.toThrow();
    expect(() => validateStateUpgrade("2.7.0", "4.0.0")).toThrow("consecutive");
  });
});
