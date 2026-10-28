import type {
  AssistantConversation,
  AssistantGenerationJob,
  AssistantMessage,
  FrontendAuthState,
} from "@/lib/assistant-contracts";
import { toPublicApiUrl } from "@/lib/public-runtime-url";
import { webDemoFetch } from "@/lib/web-demo-fetch";

export type AssistantSnapshot = {
  conversation: AssistantConversation;
  messages: AssistantMessage[];
  generationJobs: AssistantGenerationJob[];
  activeGenerationJob: AssistantGenerationJob | null;
  eventSequence?: number;
};

export type AssistantQuota = {
  policy: {
    maxConversations: number;
    retentionMs: number;
    tokenHourlyLimit: number;
    tokenWeeklyLimit: number;
    questionHourlyLimit: number;
    questionWeeklyLimit: number;
  };
  tokenHour: number;
  tokenWeek: number;
  questionHour: number;
  questionWeek: number;
  activeConversationCount: number;
  unlimited: boolean;
  tokenHourlyRemaining: number | null;
  tokenWeeklyRemaining: number | null;
  questionHourlyRemaining: number | null;
  questionWeeklyRemaining: number | null;
};

export type AssistantList = {
  conversations: AssistantConversation[];
  quota: AssistantQuota;
};

export class AssistantClientError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string
  ) {
    super(message);
    this.name = "AssistantClientError";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await webDemoFetch(toPublicApiUrl(`/api/public${path}`), {
    credentials: "include",
    ...init,
  });
  const payload: unknown = await response.json().catch(() => ({}));
  if (!response.ok) {
    const record =
      payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
    throw new AssistantClientError(
      typeof record.error === "string" ? record.error : `请求失败（${response.status}）`,
      response.status,
      typeof record.code === "string" ? record.code : undefined
    );
  }
  return payload as T;
}

export function readAssistantAuth() {
  return request<FrontendAuthState>("/frontend-auth/me");
}

export function bootstrapAssistantAuth() {
  return request<FrontendAuthState>("/frontend-auth/bootstrap", { method: "POST" });
}

export function startAssistantAdminAuth() {
  return request<FrontendAuthState>("/frontend-auth/admin-start", { method: "POST" });
}

export function readAssistantList() {
  return request<AssistantList>("/chat");
}

export function readAssistantQuota() {
  return request<AssistantQuota>("/chat/quota");
}

export function readAssistantSnapshot(conversationId: string) {
  const params = new URLSearchParams({ conversation: conversationId });
  return request<AssistantSnapshot>(`/chat?${params.toString()}`);
}

export function readClippingAssistantSnapshot(slug: string) {
  return request<{
    messages: Array<{
      id: string;
      role: "user" | "assistant";
      text: string;
      timestamp: number;
      status?: string;
    }>;
    generating: boolean;
    partial: string;
    conversationId: string | null;
    error: string | null;
    errorCode: string | null;
  }>(`/memos/${encodeURIComponent(slug)}/clipping/chat`);
}

export function submitAssistantMessage(input: {
  conversationId?: string | null;
  requestId: string;
  clientRequestId: string;
  content: string;
  kind?: "general" | "clipping";
  clippingMemoId?: string | null;
}) {
  return request<{
    status: "queued";
    conversationId: string;
    turnId: string;
    requestId: string;
    userMessageId: string;
    assistantMessageId: string;
    createdConversation: boolean;
  }>("/chat", {
    method: "POST",
    headers: { "content-type": "application/json", "idempotency-key": input.requestId },
    body: JSON.stringify(input),
  });
}

export function submitClippingAssistantMessage(input: {
  slug: string;
  requestId: string;
  content: string;
}) {
  return request<{
    status: "queued";
    conversationId: string;
    turnId: string;
    requestId: string;
    userMessageId: string;
    assistantMessageId: string;
    createdConversation: boolean;
  }>(`/memos/${encodeURIComponent(input.slug)}/clipping/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text: input.content, requestId: input.requestId }),
  });
}

export function stopAssistantGeneration(input: { conversationId?: string; turnId?: string }) {
  return request<{ stopped: boolean; generationJob: AssistantGenerationJob | null }>("/chat/stop", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
}

export function stopClippingAssistantGeneration(input: { slug: string; turnId: string }) {
  return request<{
    stopped: boolean;
    generationJob: AssistantGenerationJob | null;
  }>(`/memos/${encodeURIComponent(input.slug)}/clipping/chat/stop`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ turnId: input.turnId }),
  });
}

export function deleteAssistantConversation(conversationId: string) {
  return request<{ deleted: true; conversationId: string }>(
    `/chat/conversations/${encodeURIComponent(conversationId)}`,
    { method: "DELETE" }
  );
}
