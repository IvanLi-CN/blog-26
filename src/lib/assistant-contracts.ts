export const FRONTEND_SESSION_COOKIE_NAME = "frontend_session_id";
export const FRONTEND_LOGOUT_COOKIE_NAME = "frontend_logout";
export const FRONTEND_SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

export const FRONTEND_PRINCIPAL_KINDS = ["admin", "reader"] as const;
export type FrontendPrincipalKind = (typeof FRONTEND_PRINCIPAL_KINDS)[number];

export type FrontendGithubIdentity = {
  id: string;
  login: string;
  displayName: string | null;
  avatarUrl: string | null;
  profileUrl: string | null;
};

export type FrontendPrincipal = {
  id: string;
  kind: FrontendPrincipalKind;
  isAdmin: boolean;
  displayName: string;
  email: string | null;
  avatarUrl: string;
  profileUrl: string | null;
  adminUserId: string | null;
  readerId: string | null;
  github: FrontendGithubIdentity | null;
};

export type FrontendAuthSession = {
  id: string;
  principalId: string;
  authSource: "admin" | "github";
  expiresAt: number;
  createdAt: number;
};

export type FrontendAuthState = {
  authenticated: boolean;
  principal: FrontendPrincipal | null;
  expiresAt: number | null;
  loggedOut: boolean;
};

export const ASSISTANT_CONVERSATION_KINDS = ["general", "clipping"] as const;
export type AssistantConversationKind = (typeof ASSISTANT_CONVERSATION_KINDS)[number];

export const ASSISTANT_CONVERSATION_STATUSES = ["active", "expired", "deleted"] as const;
export type AssistantConversationStatus = (typeof ASSISTANT_CONVERSATION_STATUSES)[number];

export type AssistantConversation = {
  id: string;
  frontendUserId: string;
  kind: AssistantConversationKind;
  title: string | null;
  clippingMemoId: string | null;
  clippingVersionId: string | null;
  status: AssistantConversationStatus;
  createdAt: number;
  lastUserMessageAt: number | null;
  expiresAt: number | null;
  deletedAt: number | null;
};

export const ASSISTANT_MESSAGE_ROLES = ["user", "assistant", "system", "tool"] as const;
export type AssistantMessageRole = (typeof ASSISTANT_MESSAGE_ROLES)[number];

export const ASSISTANT_MESSAGE_STATUSES = [
  "pending",
  "streaming",
  "completed",
  "failed",
  "cancelled",
] as const;
export type AssistantMessageStatus = (typeof ASSISTANT_MESSAGE_STATUSES)[number];

export type AssistantMessage = {
  id: string;
  conversationId: string;
  sequence: number;
  role: AssistantMessageRole;
  content: string;
  status: AssistantMessageStatus;
  clientRequestId: string | null;
  createdAt: number;
  updatedAt: number;
  completedAt: number | null;
  citations: AssistantCitation[];
};

export type AssistantCitation = {
  id: string;
  messageId: string;
  source: "blog" | "playbook";
  sourceId: string | null;
  sourceType: string | null;
  slug: string | null;
  title: string;
  href: string;
  location: string | null;
  snippet: string | null;
  createdAt: number;
};

export const ASSISTANT_GENERATION_STATUSES = [
  "queued",
  "running",
  "completed",
  "failed",
  "cancelled",
] as const;
export type AssistantGenerationStatus = (typeof ASSISTANT_GENERATION_STATUSES)[number];

export type AssistantGenerationJob = {
  id: string;
  conversationId: string;
  userMessageId: string | null;
  assistantMessageId: string | null;
  requestId: string;
  status: AssistantGenerationStatus;
  attempt: number;
  leaseUntil: number | null;
  cancelRequested: boolean;
  startedAt: number | null;
  finishedAt: number | null;
  errorCode: string | null;
  createdAt: number;
  updatedAt: number;
};

export const AI_USAGE_STATUSES = [
  "success",
  "failure",
  "cancelled",
  "missing",
  "incomplete",
] as const;
export type AiUsageStatus = (typeof AI_USAGE_STATUSES)[number];

export type AiUsageRecord = {
  id: string;
  frontendUserId: string | null;
  conversationId: string | null;
  generationJobId: string | null;
  feature: string;
  provider: string | null;
  model: string | null;
  status: AiUsageStatus;
  inputTokens: number | null;
  cachedInputTokens: number | null;
  outputTokens: number | null;
  reasoningTokens: number | null;
  totalTokens: number | null;
  estimated: boolean;
  usageComplete: boolean;
  idempotencyKey: string | null;
  occurredAt: number;
  createdAt: number;
  rawUsage: string | null;
};

export type AiDailySummary = {
  id: string;
  day: string;
  timezone: string;
  frontendUserId: string | null;
  feature: string;
  provider: string | null;
  model: string | null;
  callCount: number;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  totalTokens: number;
  estimatedCallCount: number;
  incompleteCallCount: number;
  successCallCount: number;
  failureCallCount: number;
  cancelledCallCount: number;
  updatedAt: number;
};

export type AssistantQuotaPolicy = {
  id: string;
  scope: "global";
  tokenHourlyLimit: number;
  tokenWeeklyLimit: number;
  questionHourlyLimit: number;
  questionWeeklyLimit: number;
  maxConversations: number;
  retentionMs: number;
  timezone: string;
  createdAt: number;
  updatedAt: number;
};

export type AssistantQuotaReset = {
  id: string;
  frontendUserId: string;
  reason: "manual" | "window";
  resetAt: number;
  createdAt: number;
};

export type AssistantMigrationState = {
  id: string;
  status: "pending" | "running" | "blocked" | "complete";
  sourceVersion: string;
  cursor: string | null;
  scanned: number;
  migrated: number;
  quarantined: number;
  errorCount: number;
  updatedAt: number;
  lastError: string | null;
};

export const DEFAULT_ASSISTANT_QUOTA_POLICY = {
  tokenHourlyLimit: 10_000_000,
  tokenWeeklyLimit: 100_000_000,
  questionHourlyLimit: 60,
  questionWeeklyLimit: 300,
  maxConversations: 3,
  retentionMs: 7 * 24 * 60 * 60 * 1000,
  timezone: "UTC",
} as const;

export type CreateAssistantConversationInput = {
  id?: string;
  frontendUserId: string;
  kind?: AssistantConversationKind;
  title?: string | null;
  clippingMemoId?: string | null;
  clippingVersionId?: string | null;
  expiresAt?: number | null;
  now?: number;
};

export type AppendAssistantMessageInput = {
  id?: string;
  conversationId: string;
  frontendUserId: string;
  role: AssistantMessageRole;
  content: string;
  status?: AssistantMessageStatus;
  clientRequestId?: string | null;
  sequence?: number;
  now?: number;
};

export type CreateAssistantGenerationJobInput = {
  id?: string;
  conversationId: string;
  frontendUserId: string;
  userMessageId?: string | null;
  assistantMessageId?: string | null;
  requestId: string;
  now?: number;
};

export type SubmitAssistantTurnInput = {
  frontendUserId: string;
  isAdmin?: boolean;
  conversationId?: string | null;
  requestId: string;
  clientRequestId?: string | null;
  content: string;
  kind?: AssistantConversationKind;
  title?: string | null;
  clippingMemoId?: string | null;
  clippingVersionId?: string | null;
  now?: number;
};

export type AssistantTurnScope = Pick<
  SubmitAssistantTurnInput,
  "kind" | "clippingMemoId" | "clippingVersionId"
>;

export type AssistantTurnSubmission = {
  createdConversation: boolean;
  conversation: AssistantConversation;
  userMessage: AssistantMessage;
  assistantMessage: AssistantMessage;
  generationJob: AssistantGenerationJob;
};

export type AssistantJobExecution = {
  conversation: AssistantConversation;
  job: AssistantGenerationJob;
  userMessage: AssistantMessage;
  assistantMessage: AssistantMessage;
  messages: AssistantMessage[];
};

export type UpdateAssistantGenerationJobInput = Partial<
  Pick<
    AssistantGenerationJob,
    | "status"
    | "attempt"
    | "leaseUntil"
    | "cancelRequested"
    | "startedAt"
    | "finishedAt"
    | "errorCode"
    | "updatedAt"
  >
>;

export type AssistantMessageStorage = {
  createConversation(input: CreateAssistantConversationInput): Promise<AssistantConversation>;
  getConversation(
    conversationId: string,
    frontendUserId: string
  ): Promise<AssistantConversation | null>;
  listConversations(frontendUserId: string): Promise<AssistantConversation[]>;
  listClippingConversations(clippingMemoId: string): Promise<AssistantConversation[]>;
  updateConversationClippingVersion(
    conversationId: string,
    frontendUserId: string,
    clippingVersionId: string,
    now?: number,
    expectedClippingVersionId?: string | null
  ): Promise<AssistantConversation | null>;
  appendMessage(input: AppendAssistantMessageInput): Promise<AssistantMessage>;
  listMessages(conversationId: string, frontendUserId: string): Promise<AssistantMessage[]>;
  createGenerationJob(input: CreateAssistantGenerationJobInput): Promise<AssistantGenerationJob>;
  getGenerationJob(
    generationJobId: string,
    frontendUserId: string
  ): Promise<AssistantGenerationJob | null>;
  updateGenerationJob(
    generationJobId: string,
    frontendUserId: string,
    input: UpdateAssistantGenerationJobInput
  ): Promise<AssistantGenerationJob | null>;
  findIdempotentTurn(
    frontendUserId: string,
    requestId: string,
    clientRequestId?: string | null,
    conversationId?: string | null,
    now?: number,
    scope?: AssistantTurnScope
  ): Promise<AssistantTurnSubmission | null>;
  submitTurn(input: SubmitAssistantTurnInput): Promise<AssistantTurnSubmission>;
  getConversationState(
    conversationId: string,
    frontendUserId: string
  ): Promise<AssistantConversation | null>;
  getConversationMessages(
    conversationId: string,
    frontendUserId: string
  ): Promise<AssistantMessage[] | null>;
  listGenerationJobs(
    conversationId: string,
    frontendUserId: string
  ): Promise<AssistantGenerationJob[] | null>;
  getJobExecution(generationJobId: string): Promise<AssistantJobExecution | null>;
  getFrontendUserIsAdmin(frontendUserId: string): Promise<boolean>;
  recoverRunningGenerations(now?: number): Promise<number>;
  recoverExpiredGenerations(now?: number): Promise<number>;
  claimNextGenerationJob(now: number, leaseMs: number): Promise<AssistantJobExecution | null>;
  renewGenerationLease(
    generationJobId: string,
    attempt: number,
    now: number,
    leaseMs: number
  ): Promise<boolean>;
  appendGenerationDelta(
    generationJobId: string,
    attempt: number,
    content: string,
    now: number
  ): Promise<boolean>;
  finishGeneration(
    generationJobId: string,
    attempt: number,
    input: {
      status: "completed" | "failed" | "cancelled";
      content?: string;
      errorCode?: string | null;
      citations?: Array<Omit<AssistantCitation, "id" | "messageId" | "createdAt">>;
      now?: number;
    }
  ): Promise<AssistantGenerationJob | null>;
  stopGeneration(
    generationJobId: string,
    frontendUserId: string,
    now?: number
  ): Promise<AssistantGenerationJob | null>;
  deleteConversation(
    conversationId: string,
    frontendUserId: string,
    now?: number
  ): Promise<boolean>;
  expireConversation(
    conversationId: string,
    frontendUserId: string,
    now?: number
  ): Promise<boolean>;
  expireConversations(now?: number): Promise<number>;
};
