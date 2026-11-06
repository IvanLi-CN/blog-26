import type { ConversationMessage } from "../../src/components/common/conversation/types";

/** Derive presentation from the latest full snapshot without repairing or retaining old text. */
export function getAssistantRenderState(
  message: Pick<ConversationMessage, "role" | "content" | "status">
) {
  return {
    content: message.content,
    mode: message.role === "user" ? ("literal" as const) : ("markdown" as const),
    isGenerating: message.status === "pending" || message.status === "streaming",
  };
}
