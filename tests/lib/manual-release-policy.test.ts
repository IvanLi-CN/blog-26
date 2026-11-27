import { describe, expect, test } from "bun:test";
import {
  classifySourceChanges,
  destructiveMigration,
  raiseImpact,
  requestedImpact,
  sourceEvidenceDigest,
} from "../../src/lib/release/impact";
import {
  allocateVersion,
  compareVersions,
  validateStateUpgrade,
} from "../../src/lib/release/policy";
import { policyFingerprint } from "../../src/lib/release/source";
import { imageVersionTag, parseVersion } from "../../src/lib/release/version";

const base = "a".repeat(40);
const code = "b".repeat(40);
const proof = "c".repeat(40);

const files: Record<string, string> = {
  "drizzle/0038_drop_legacy_column.sql": "ALTER TABLE posts DROP COLUMN legacy;",
  "drizzle/0039_add_column.sql": "ALTER TABLE posts ADD COLUMN draft INTEGER;",
  "drizzle/0040_default_column.sql":
    "ALTER TABLE posts ADD COLUMN role text DEFAULT 'reader' NOT NULL;",
  "src/server/public-api/router.ts": "export const routes = [];",
  "src/lib/schema.ts": "export const schema = {};",
  "src/server/services/llm-settings.ts": "export function hint() {}",
  "docs/solutions/admin/llm-settings-runtime-config.md": "# Config",
  "apps/admin/src/styles.css": ".x { color: red }",
};
const read = (path: string) => files[path];
const diff = (...paths: string[]) => Object.fromEntries(paths.map((path) => [path, code]));
const removed = (...paths: string[]) => Object.fromEntries(paths.map((path) => [path, null]));

describe("derived release impact", () => {
  test("documentation, tests, styles, and internal modules stay patch", () => {
    const result = classifySourceChanges(
      diff(
        "docs/solutions/admin/llm-settings-runtime-config.md",
        "apps/admin/src/styles.css",
        "src/server/services/llm-settings.ts",
        "tests/lib/manual-release-policy.test.ts"
      ),
      read
    );
    expect(result.impact).toBe("patch");
    expect(result.surfaces).toEqual([]);
  });

  test("a contract surface is reported even when the impact stays patch", () => {
    const result = classifySourceChanges(diff("src/server/public-api/router.ts"), read);
    expect(result.impact).toBe("patch");
    expect(result.surfaces).toEqual([
      { id: "public-api", paths: ["src/server/public-api/router.ts"] },
    ]);
  });

  test("an additive migration stays patch; a destructive one raises to minor", () => {
    expect(classifySourceChanges(diff("drizzle/0039_add_column.sql"), read).impact).toBe("patch");
    // drizzle-kit emits `DEFAULT <v> NOT NULL`, so the NOT NULL branch must exempt it.
    expect(classifySourceChanges(diff("drizzle/0040_default_column.sql"), read).impact).toBe(
      "patch"
    );
    const destructive = classifySourceChanges(diff("drizzle/0038_drop_legacy_column.sql"), read);
    expect(destructive.impact).toBe("minor");
    expect(destructive.surfaces).toEqual([
      { id: "persistent-state", paths: ["drizzle/0038_drop_legacy_column.sql"] },
    ]);
  });

  test("a deleted migration raises to minor because persisted rows lose their writer", () => {
    const result = classifySourceChanges(removed("drizzle/0039_add_column.sql"), read);
    expect(result.impact).toBe("minor");
    expect(result.reasons).toContain(
      "drizzle/0039_add_column.sql: an applied migration was deleted"
    );
  });

  test("a deleted public contract surface raises to minor; a deleted document does not", () => {
    expect(classifySourceChanges(removed("src/server/public-api/router.ts"), read).impact).toBe(
      "minor"
    );
    expect(
      classifySourceChanges(removed("docs/solutions/admin/llm-settings-runtime-config.md"), read)
        .impact
    ).toBe("patch");
  });

  test("several paths collapse into one surface without losing either path", () => {
    const result = classifySourceChanges(
      diff("drizzle/0039_add_column.sql", "src/lib/schema.ts"),
      read
    );
    expect(result.surfaces).toEqual([
      { id: "persistent-state", paths: ["drizzle/0039_add_column.sql", "src/lib/schema.ts"] },
    ]);
  });

  test("destructive DDL is detected from statement shape, not from comments", () => {
    expect(destructiveMigration("ALTER TABLE t DROP COLUMN c;")).toBe(true);
    expect(destructiveMigration("ALTER TABLE t RENAME TO u;")).toBe(true);
    expect(destructiveMigration("DROP TABLE t;")).toBe(true);
    expect(destructiveMigration("ALTER TABLE t ADD COLUMN c TEXT NOT NULL;")).toBe(true);
    // drizzle-kit emits DEFAULT before NOT NULL; both orders carry a default.
    expect(destructiveMigration("ALTER TABLE t ADD COLUMN c text DEFAULT 'x' NOT NULL;")).toBe(
      false
    );
    expect(destructiveMigration("ALTER TABLE t ADD COLUMN c TEXT NOT NULL DEFAULT '';")).toBe(
      false
    );
    expect(
      destructiveMigration("ALTER TABLE t ADD COLUMN a TEXT NOT NULL, ADD COLUMN b TEXT;")
    ).toBe(true);
    expect(destructiveMigration("/* DROP COLUMN todo */\nALTER TABLE t ADD COLUMN c TEXT;")).toBe(
      false
    );
    expect(destructiveMigration("ALTER TABLE t ADD COLUMN c TEXT;")).toBe(false);
    expect(
      destructiveMigration("-- DROP COLUMN is not executed here\nCREATE TABLE t (id TEXT);")
    ).toBe(false);
    expect(destructiveMigration("CREATE INDEX idx ON t (c);")).toBe(false);
  });

  test("a requested impact only ever raises the derived floor", () => {
    expect(requestedImpact(["fix: adjust hint"])).toBe("patch");
    expect(requestedImpact(["feat: add surface\n\nRelease-Impact: minor"])).toBe("minor");
    expect(requestedImpact(["chore: x\n\nRelease-Impact: major"])).toBe("major");
    expect(requestedImpact(["chore: x", "fix: y\n\nRelease-Impact: minor"])).toBe("minor");
    expect(raiseImpact("minor", "patch")).toBe("minor");
    expect(raiseImpact("patch", "major")).toBe("major");
    // A requested patch cannot lower a destructive migration.
    const forced = classifySourceChanges(
      diff("drizzle/0038_drop_legacy_column.sql"),
      read,
      "patch"
    );
    expect(forced.impact).toBe("minor");
  });

  test("the evidence digest is reproducible from the tree and changes with the diff", () => {
    const one = classifySourceChanges(diff("src/server/services/llm-settings.ts"), read);
    const same = classifySourceChanges(diff("src/server/services/llm-settings.ts"), read);
    const other = classifySourceChanges(
      diff("src/server/services/llm-settings.ts", "apps/admin/src/styles.css"),
      read
    );
    // Key order must not leak into the digest: both maps carry the same paths and blobs.
    const forward = {
      "src/server/services/llm-settings.ts": code,
      "apps/admin/src/styles.css": code,
    };
    const reversed = {
      "apps/admin/src/styles.css": code,
      "src/server/services/llm-settings.ts": code,
    };
    expect(sourceEvidenceDigest(base, forward, one)).toBe(
      sourceEvidenceDigest(base, reversed, same)
    );
    expect(sourceEvidenceDigest(base, diff("src/server/services/llm-settings.ts"), one)).not.toBe(
      sourceEvidenceDigest(base, diff("apps/admin/src/styles.css"), other)
    );
    expect(sourceEvidenceDigest(base, diff("apps/admin/src/styles.css"), other)).not.toBe(
      sourceEvidenceDigest("d".repeat(40), diff("apps/admin/src/styles.css"), other)
    );
    // The digest must bind blob values, not just paths: equal paths with different
    // content is exactly what a re-verification has to distinguish.
    expect(sourceEvidenceDigest(base, diff("src/server/services/llm-settings.ts"), one)).not.toBe(
      sourceEvidenceDigest(base, { "src/server/services/llm-settings.ts": proof }, one)
    );
    // It must also bind the derived contract surfaces.
    const surface = classifySourceChanges(diff("src/server/public-api/router.ts"), read);
    // It must bind the derived impact, which a trailer alone can raise.
    expect(sourceEvidenceDigest(base, diff("src/server/public-api/router.ts"), surface)).not.toBe(
      sourceEvidenceDigest(base, diff("src/server/public-api/router.ts"), {
        ...surface,
        impact: "minor",
      })
    );
    expect(sourceEvidenceDigest(base, diff("src/server/public-api/router.ts"), surface)).not.toBe(
      sourceEvidenceDigest(base, diff("src/server/public-api/router.ts"), {
        ...surface,
        surfaces: [],
      })
    );
  });
});

describe("product SemVer policy", () => {
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
      "2.8.0-alpha.01",
      "auto",
      " 2.8.0",
      "2.8.0\n",
    ] as const) {
      expect(() => allocateVersion("2.7.0", [], "minor", version)).toThrow();
    }
    expect(() => allocateVersion("2.7.0", ["2.9.0"], "minor", "2.9.0")).toThrow();
  });
  test("shortcuts advance one target through prerelease stages and stable", () => {
    const occupied: string[] = [];
    for (const [input, expected] of [
      ["alpha", "2.8.0-alpha.1"],
      ["alpha", "2.8.0-alpha.2"],
      ["beta", "2.8.0-beta.1"],
      ["rc", "2.8.0-rc.1"],
      ["stable", "2.8.0"],
      ["alpha", "2.8.1-alpha.1"],
    ]) {
      expect(allocateVersion("2.7.0", occupied, "minor", input)).toBe(expected);
      occupied.push(expected);
    }
    expect(allocateVersion("2.7.0", ["2.8.0-alpha.1"], "minor", "")).toBe("2.8.0");
    expect(allocateVersion("2.7.0", [], "minor", "rc")).toBe("2.8.0-rc.1");
    expect(() => allocateVersion("2.7.0", ["2.8.0-beta.1"], "minor", "alpha")).toThrow("backwards");
    expect(allocateVersion("2.7.0", ["2.8.0-beta.1"], "minor", "2.9.0-alpha.1")).toBe(
      "2.9.0-alpha.1"
    );
  });
  test("exact versions retain metadata but cannot reserve metadata-only identities", () => {
    expect(allocateVersion("2.7.0", [], "minor", "2.8.0-RC.1+Build.001")).toBe(
      "2.8.0-RC.1+Build.001"
    );
    expect(imageVersionTag("2.8.0-RC.1+Build.001")).toBe("v2.8.0-RC.1_Build.001");
    expect(compareVersions("2.8.0+one", "2.8.0+two")).toBe(0);
    expect(() => allocateVersion("2.7.0", ["2.8.0+one"], "minor", "2.8.0+two")).toThrow("floor");
    expect(() => allocateVersion("2.7.0", [], "minor", `2.8.0+${"x".repeat(128)}`)).toThrow();
    expect(() => allocateVersion("2.7.0", [], "minor", "2.8.0-alpha.lock")).toThrow("Git tag");
    expect(() => allocateVersion("2.7.0", [], "minor", "2.8.0+build.lock")).toThrow("Git tag");
    expect(() => parseVersion("2.8.0-alpha.00")).toThrow();
    expect(compareVersions("2.8.0-alpha.9007199254740993", "2.8.0-alpha.9007199254740992")).toBe(1);
    const ordered = [
      "2.8.0-alpha",
      "2.8.0-alpha.1",
      "2.8.0-alpha.beta",
      "2.8.0-beta",
      "2.8.0-beta.2",
      "2.8.0-beta.11",
      "2.8.0-rc.1",
      "2.8.0",
    ];
    for (let i = 1; i < ordered.length; i++) {
      const previous = ordered[i - 1];
      const current = ordered[i];
      if (!previous || !current) throw new Error("Missing ordered fixture");
      expect(compareVersions(previous, current)).toBe(-1);
    }
  });
  test("numeric ordering does not round large SemVer components", () => {
    expect(compareVersions("2.10.0", "2.9.999")).toBe(1);
    expect(compareVersions("9007199254740993.0.0", "9007199254740992.0.0")).toBe(1);
  });
  test("state upgrades cannot jump over a Major", () => {
    expect(() => validateStateUpgrade("2.7.0", "3.0.0")).not.toThrow();
    expect(() => validateStateUpgrade("2.7.0", "4.0.0")).toThrow("consecutive");
  });
});
