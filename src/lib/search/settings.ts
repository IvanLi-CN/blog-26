import { z } from "zod";

export const searchModeSchema = z.enum(["rag", "rewrite", "keyword"]);
export type SearchMode = z.infer<typeof searchModeSchema>;
export const aiSearchModeSchema = z.enum(["rag", "rewrite"]);
export type AiSearchMode = z.infer<typeof aiSearchModeSchema>;
const base = {
  enabled: z.boolean(),
  model: z.string().trim().min(1).max(200).nullable(),
  timeoutMs: z.number().int().min(100).max(30000),
  maxInputTokens: z.number().int().min(256).max(32768),
  maxOutputTokens: z.number().int().min(128).max(4096),
};
export const searchPolicySchema = z
  .object({
    rag: z
      .object({
        ...base,
        candidateLimit: z.number().int().min(1).max(50),
        contentCodePoints: z.number().int().min(128).max(4096),
      })
      .strict(),
    rewrite: z.object({ ...base, maxQueries: z.number().int().min(1).max(3) }).strict(),
  })
  .strict();
export type SearchPolicy = z.infer<typeof searchPolicySchema>;
export const DEFAULT_SEARCH_POLICY: SearchPolicy = {
  rag: {
    enabled: true,
    model: null,
    timeoutMs: 10000,
    maxInputTokens: 16384,
    maxOutputTokens: 2048,
    candidateLimit: 20,
    contentCodePoints: 2048,
  },
  rewrite: {
    enabled: true,
    model: null,
    timeoutMs: 5000,
    maxInputTokens: 4096,
    maxOutputTokens: 1024,
    maxQueries: 3,
  },
};
export type SearchReason =
  | "disabled"
  | "unconfigured"
  | "unvalidated"
  | "unavailable"
  | "timeout"
  | "invalid-output"
  | "budget-exceeded"
  | "empty-query"
  | "explicit-query";
export type SearchQuality = { fingerprint: string; validatedAt: number; passed: boolean };
export type SearchSettings = {
  policy: SearchPolicy;
  quality: Partial<Record<AiSearchMode, SearchQuality>>;
};
export type SearchValidationRun = {
  id: string;
  mode: AiSearchMode;
  fingerprint: string;
  status: "running" | "passed" | "failed" | "stale";
  completed: number;
  total: number;
  reason?: SearchReason;
  startedAt: number;
  finishedAt?: number;
};
export type AdminSearchSettings = SearchSettings & {
  status: Record<AiSearchMode, { available: boolean; reason?: SearchReason }>;
};
