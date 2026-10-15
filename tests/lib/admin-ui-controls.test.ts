import { describe, expect, it } from "bun:test";
import { scanSource } from "../../scripts/check-admin-ui-controls";

describe("admin UI control boundary", () => {
  it("rejects native controls and hand-written interaction roles", () => {
    const violations = scanSource(
      `export function View() { return <div><button>Save</button><div role="dialog" /></div>; }`,
      "apps/admin/src/pages/example.tsx"
    );

    expect(violations.map((violation) => violation.message)).toEqual([
      "<button> must come from the local admin UI library",
      'role="dialog" must be provided by the local admin UI library',
    ]);
  });

  it("rejects direct primitive imports outside the shared implementation", () => {
    const violations = scanSource(
      `import * as DialogPrimitive from "@radix-ui/react-dialog"; export { DialogPrimitive };`,
      "apps/admin/src/components/model-picker.tsx"
    );

    expect(violations).toHaveLength(1);
    expect(violations[0]?.message).toContain("@radix-ui/react-dialog");
  });

  it("allows option data, strings, shared implementation code, and tests", () => {
    expect(
      scanSource(
        `const markup = "<button>demo</button>"; export function View() { return <Select><option value="a">A</option></Select>; }`,
        "apps/admin/src/pages/example.tsx"
      )
    ).toHaveLength(0);
    expect(scanSource(`<button>Save</button>`, "apps/admin/src/components/ui.tsx")).toHaveLength(0);
    expect(
      scanSource(`<button>Save</button>`, "apps/admin/src/pages/example.test.tsx")
    ).toHaveLength(0);
  });
});
