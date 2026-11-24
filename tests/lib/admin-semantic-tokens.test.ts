import { describe, expect, it } from "bun:test";
import { readDefinedColorTokens, scanSource } from "../../scripts/check-admin-semantic-tokens";

const DEFINED = new Set([
  "background",
  "foreground",
  "card",
  "card-foreground",
  "primary",
  "primary-foreground",
  "muted",
  "muted-foreground",
  "destructive",
  "destructive-foreground",
  "success",
  "warning",
  "border",
  "ring",
]);

describe("admin semantic color token scan", () => {
  it("reads the color tokens declared in the theme block", () => {
    const tokens = readDefinedColorTokens(
      "@theme inline {\n  --color-destructive: var(--destructive);\n  --radius-sm: 0.5rem;\n}\n"
    );

    expect([...tokens]).toEqual(["destructive"]);
  });

  it("rejects a semantic color utility with no matching token", () => {
    const violations = scanSource(
      `<p className="break-words text-sm text-danger">{error}</p>;`,
      "apps/admin/src/pages/example.tsx",
      DEFINED
    );

    expect(violations.map((violation) => violation.token)).toEqual(["danger"]);
    expect(violations[0]?.message).toContain("text-danger");
  });

  it("rejects token variants and modifiers too", () => {
    const violations = scanSource(
      `<div className="bg-error/10 border-warning/30 ring-info" />;`,
      "apps/admin/src/pages/example.tsx",
      DEFINED
    );

    expect(violations.map((violation) => violation.token).sort()).toEqual(["error", "info"]);
  });

  it("accepts defined semantic tokens and standard palette colors", () => {
    const violations = scanSource(
      `<div className="text-destructive bg-card border-border/60 text-amber-300 text-pretty border-l-[3px]" />;`,
      "apps/admin/src/pages/example.tsx",
      DEFINED
    );

    expect(violations).toEqual([]);
  });

  it("reports the line that carries the violation", () => {
    const violations = scanSource(
      `const a = 1;\nconst b = 2;\nconst c = <p className="text-danger" />;`,
      "apps/admin/src/pages/example.tsx",
      DEFINED
    );

    expect(violations[0]?.line).toBe(3);
  });
});
