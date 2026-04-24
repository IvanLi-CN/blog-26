#!/usr/bin/env bun

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

type ModelCapability =
  | "chat"
  | "embeddings"
  | "rerank"
  | "vision"
  | "audio"
  | "tools"
  | "structured-output";

type CatalogEntry = {
  id: string;
  name: string;
  description: string | null;
  contextLength: number | null;
  capabilities: ModelCapability[];
  availableOnProvider: null;
  source: "openrouter";
};

type OpenRouterModel = Record<string, unknown>;

const OUTPUT_PATH = path.join(process.cwd(), "src/generated/llm-model-catalog.json");
const FALLBACK_PATH = path.join(process.cwd(), "src/server/llm/model-catalog-fallback.json");
const OPENROUTER_MODELS_URL = "https://openrouter.ai/api/v1/models";
const DEFAULT_REFRESH_TIMEOUT_MS = 10_000;
const CAPABILITY_ORDER: ModelCapability[] = [
  "chat",
  "embeddings",
  "rerank",
  "vision",
  "audio",
  "tools",
  "structured-output",
];

function sortCapabilities(values: ModelCapability[]) {
  return [...new Set(values)].sort(
    (left, right) => CAPABILITY_ORDER.indexOf(left) - CAPABILITY_ORDER.indexOf(right)
  );
}

function safeContextLength(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return null;
  return Math.floor(value);
}

function inferCapabilities(raw: OpenRouterModel): ModelCapability[] {
  const capabilities = new Set<ModelCapability>();
  const id = String(raw.id ?? "").toLowerCase();
  const name = String(raw.name ?? "").toLowerCase();
  const description = String(raw.description ?? "").toLowerCase();
  const architecture =
    typeof raw.architecture === "object" && raw.architecture !== null
      ? (raw.architecture as Record<string, unknown>)
      : {};
  const modality = String(architecture.modality ?? "").toLowerCase();
  const inputModalities = Array.isArray(architecture.input_modalities)
    ? architecture.input_modalities.map((value) => String(value).toLowerCase())
    : [];
  const outputModalities = Array.isArray(architecture.output_modalities)
    ? architecture.output_modalities.map((value) => String(value).toLowerCase())
    : [];
  const supportedParameters = Array.isArray(raw.supported_parameters)
    ? raw.supported_parameters.map((value) => String(value).toLowerCase())
    : [];
  const searchableText = `${id} ${name} ${description} ${modality}`;

  if (
    searchableText.includes("embedding") ||
    modality.includes("->embedding") ||
    outputModalities.includes("embedding")
  ) {
    capabilities.add("embeddings");
  }

  if (searchableText.includes("rerank") || searchableText.includes("re-rank")) {
    capabilities.add("rerank");
  }

  if (
    modality.includes("->text") ||
    outputModalities.includes("text") ||
    inputModalities.includes("text")
  ) {
    capabilities.add("chat");
  }

  if (
    inputModalities.some((value) => value === "image" || value === "video") ||
    outputModalities.some((value) => value === "image" || value === "video")
  ) {
    capabilities.add("vision");
  }

  if (
    inputModalities.includes("audio") ||
    outputModalities.includes("audio") ||
    searchableText.includes("audio")
  ) {
    capabilities.add("audio");
  }

  if (supportedParameters.includes("tools") || supportedParameters.includes("tool_choice")) {
    capabilities.add("tools");
  }

  if (
    supportedParameters.includes("response_format") ||
    supportedParameters.includes("structured_outputs") ||
    searchableText.includes("structured output")
  ) {
    capabilities.add("structured-output");
  }

  return sortCapabilities([...capabilities]);
}

function normalizeEntry(raw: OpenRouterModel): CatalogEntry | null {
  const id = typeof raw.id === "string" ? raw.id.trim() : "";
  if (!id) return null;
  const capabilities = inferCapabilities(raw);
  if (capabilities.length === 0) return null;

  return {
    id,
    name: typeof raw.name === "string" && raw.name.trim().length > 0 ? raw.name.trim() : id,
    description: typeof raw.description === "string" ? raw.description.trim() || null : null,
    contextLength: safeContextLength(raw.context_length),
    capabilities,
    availableOnProvider: null,
    source: "openrouter",
  };
}

function getRefreshTimeoutMs() {
  const raw = process.env.LLM_MODEL_CATALOG_REFRESH_TIMEOUT_MS?.trim();
  if (!raw) return DEFAULT_REFRESH_TIMEOUT_MS;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_REFRESH_TIMEOUT_MS;
  }
  return Math.floor(parsed);
}

async function fetchOpenRouterModels() {
  const timeoutMs = getRefreshTimeoutMs();
  const response = await fetch(OPENROUTER_MODELS_URL, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) {
    throw new Error(`OpenRouter models fetch failed: ${response.status} ${response.statusText}`);
  }
  const payload = (await response.json()) as { data?: unknown };
  if (!Array.isArray(payload.data)) {
    throw new Error("OpenRouter models payload is missing data[]");
  }
  return payload.data.filter(
    (item): item is OpenRouterModel => typeof item === "object" && item !== null
  );
}

async function main() {
  try {
    const models = await fetchOpenRouterModels();
    const entries = models
      .map(normalizeEntry)
      .filter((entry): entry is CatalogEntry => Boolean(entry))
      .sort((left, right) => left.name.localeCompare(right.name, "en"));

    await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
    await writeFile(
      OUTPUT_PATH,
      `${JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          items: entries,
        },
        null,
        2
      )}\n`
    );

    console.log(`[llm-catalog] wrote ${entries.length} OpenRouter entries to ${OUTPUT_PATH}`);
  } catch (error) {
    const fallbackExists = await readFile(FALLBACK_PATH, "utf8")
      .then((content) => content.trim().length > 0)
      .catch(() => false);
    console.warn(
      `[llm-catalog] failed to refresh OpenRouter snapshot, keeping checked-in fallback only: ${error instanceof Error ? error.message : String(error)}`
    );
    if (!fallbackExists) {
      console.warn("[llm-catalog] checked-in fallback catalog is missing or empty");
    }
  }
}

await main();
