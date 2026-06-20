import { describe, expect, it } from "bun:test";
import { stripMatchingLeadingTitleHeading } from "@/lib/markdown-utils";

describe("stripMatchingLeadingTitleHeading", () => {
  it("removes a matching leading atx h1 from memo detail content", () => {
    expect(
      stripMatchingLeadingTitleHeading(
        "# Local Memo\n\nA memo fixture stored in the local content tree.",
        "Local Memo"
      )
    ).toBe("A memo fixture stored in the local content tree.");
  });

  it("removes a matching leading setext h1 from memo detail content", () => {
    expect(
      stripMatchingLeadingTitleHeading("Local Memo\n=====\n\nBody paragraph", "Local Memo")
    ).toBe("Body paragraph");
  });

  it("keeps the body unchanged when the leading heading differs from the shell title", () => {
    const content = "# Another Title\n\nBody paragraph";
    expect(stripMatchingLeadingTitleHeading(content, "Local Memo")).toBe(content);
  });

  it("does not strip deeper heading levels", () => {
    const content = "## Local Memo\n\nBody paragraph";
    expect(stripMatchingLeadingTitleHeading(content, "Local Memo")).toBe(content);
  });
});
