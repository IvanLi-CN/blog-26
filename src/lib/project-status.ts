import type { ProjectDomain, ProjectPublicEntryKind } from "./project-catalog";

export type ProjectStatusRunStatus = "running" | "completed" | "partial" | "interrupted" | "error";
export type ProjectStatusResultStatus = "available" | "unavailable" | "unknown";
export type ProjectStatusFreshness = "fresh" | "stale" | "unknown";

export interface ProjectStatusResultDto {
  id: string;
  runId: string;
  entryKey: string;
  projectSlug: string;
  projectTitle: string;
  domain: ProjectDomain;
  entryKind: ProjectPublicEntryKind;
  entryLabel: string;
  href: string;
  status: ProjectStatusResultStatus;
  freshness: ProjectStatusFreshness;
  attempted: boolean;
  httpStatus: number | null;
  finalUrl: string | null;
  redirected: boolean;
  latencyMs: number | null;
  attemptCount: number;
  errorKind: string | null;
  errorMessage: string | null;
  checkedAt: number | null;
}

export interface ProjectStatusRunDto {
  id: string;
  status: ProjectStatusRunStatus;
  triggeredBy: "scheduler" | "manual";
  targetCount: number;
  attemptedCount: number;
  availableCount: number;
  unavailableCount: number;
  startedAt: number;
  finishedAt: number | null;
  durationMs: number | null;
  errorMessage: string | null;
}

export interface ProjectStatusSummaryDto {
  total: number;
  available: number;
  unavailable: number;
  unknown: number;
  stale: number;
}

export interface ProjectStatusOverviewResponse {
  catalog: Array<{
    entryKey: string;
    projectSlug: string;
    projectTitle: string;
    domain: ProjectDomain;
    entryKind: ProjectPublicEntryKind;
    entryLabel: string;
    href: string;
  }>;
  latestRun: ProjectStatusRunDto | null;
  activeRun: ProjectStatusRunDto | null;
  summary: ProjectStatusSummaryDto;
  results: ProjectStatusResultDto[];
}

export interface ProjectStatusHistoryResponse {
  runs: ProjectStatusRunDto[];
}

export interface ProjectStatusTriggerResponse {
  success: true;
  queued: true;
  runKey: "project-entry-status";
}

export const PROJECT_STATUS_JOB_KEY = "project-entry-status" as const;
export const PROJECT_STATUS_STALE_AFTER_MS = 12 * 60 * 60 * 1000;
export const PROJECT_STATUS_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
export const PROJECT_STATUS_TARGET_TIMEOUT_MS = 10 * 1000;
export const PROJECT_STATUS_RETRY_DELAY_MS = 30 * 1000;
export const PROJECT_STATUS_BATCH_TIMEOUT_MS = 5 * 60 * 1000;
export const PROJECT_STATUS_MAX_CONCURRENCY = 8;
