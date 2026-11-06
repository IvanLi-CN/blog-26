import type { AiUsageContext } from "@/lib/ai-usage";
import type { AssistantJobExecution } from "@/lib/assistant-contracts";
import type { ContentSearchExecutionContext } from "@/server/services/content-search";
import type { AssistantCitationInput } from "./runtime";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function citationForResult(result: unknown): AssistantCitationInput | null {
  if (!isRecord(result)) return null;
  const source = result.source === "playbook" ? "playbook" : "blog";
  const slug = text(result.slug);
  const title = text(result.title) ?? slug;
  if (!title || !slug) return null;
  const href =
    text(result.href) ??
    (source === "playbook"
      ? `/playbook/${encodeURIComponent(slug)}`
      : result.type === "memo"
        ? `/memos/${encodeURIComponent(slug)}`
        : `/posts/${encodeURIComponent(slug)}`);
  const sections = Array.isArray(result.sections) ? result.sections : [];
  const firstSection = sections.find(isRecord);
  return {
    source,
    sourceId: text(result.id),
    sourceType: text(result.type),
    slug,
    title,
    href,
    location: text(firstSection?.href) ?? (source === "playbook" ? href : "content"),
    snippet: text(result.snippet),
  };
}

export function buildAssistantRetrievalContext(
  execution: AssistantJobExecution,
  isAdmin: boolean
): Pick<ContentSearchExecutionContext, "publishedOnly"> & { metering: AiUsageContext } {
  return {
    publishedOnly: !isAdmin,
    metering: {
      feature: "assistant-retrieval",
      frontendUserId: execution.conversation.frontendUserId,
      conversationId: execution.conversation.id,
      generationJobId: execution.job.id,
      logicalRequestId: `${execution.job.requestId}:retrieval`,
      logicalQuestionId: execution.job.requestId,
      chargePersonalQuota: true,
      chargeQuestion: true,
      isAdmin,
    },
  };
}
