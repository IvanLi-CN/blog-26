import { describe, expect, test } from "bun:test";
import type { ConversationMessageStatus } from "../../src/components/common/conversation/types";
import { getAssistantRenderState } from "./assistant-render-state";

describe("latest snapshot presentation", () => {
  test("keeps literal whitespace, escaping and incomplete syntax untouched", () => {
    const content = "  \\*literal\\*\n[link](https://example.invalid\n$$\n\\frac{a\n```\n";
    for (const role of ["user", "assistant"] as const) {
      expect(getAssistantRenderState({ role, content, status: "streaming" })).toEqual({
        content,
        mode: role === "user" ? "literal" : "markdown",
        isGenerating: true,
      });
    }
  });

  test("only pending and streaming report generation, including empty snapshots", () => {
    const statuses: ConversationMessageStatus[] = [
      "pending",
      "streaming",
      "completed",
      "failed",
      "cancelled",
    ];
    for (const status of statuses) {
      expect(getAssistantRenderState({ role: "assistant", content: "", status })).toEqual({
        content: "",
        mode: "markdown",
        isGenerating: status === "pending" || status === "streaming",
      });
    }
  });
});
