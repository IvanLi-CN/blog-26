import { access, readFile } from "node:fs/promises";
import path from "node:path";
import {
  type AdminLlmCatalogResponse,
  adminLlmCatalogResponseSchema,
  type LlmTier,
  type ModelCapability,
  type ModelCatalogEntry,
  modelCatalogEntrySchema,
} from "@/lib/llm-settings";
import { getResolvedLlmConfig, normalizeOpenAiCompatibleBaseUrl } from "./llm-settings";

type CatalogFilePayload = {
  generatedAt: string | null;
  items: ModelCatalogEntry[];
};

type ProviderModelPayload = Record<string, unknown>;

type ProviderModelIndex = {
  success: boolean;
  ids: Set<string>;
  items: ProviderModelPayload[];
};

const GENERATED_CATALOG_PATH = path.join(process.cwd(), "src/generated/llm-model-catalog.json");
const FALLBACK_CATALOG_PATH = path.join(
  process.cwd(),
  "src/server/llm/model-catalog-fallback.json"
);
const OVERRIDES_CATALOG_PATH = path.join(
  process.cwd(),
  "src/server/llm/model-catalog-overrides.json"
);

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

function tierCapability(tier: LlmTier): ModelCapability {
  return tier === "chat" ? "chat" : tier === "embedding" ? "embeddings" : "rerank";
}

function matchesTier(entry: ModelCatalogEntry, tier?: LlmTier) {
  if (!tier) return true;
  return entry.capabilities.includes(tierCapability(tier));
}

function normalizeCapabilityList(values: unknown[]): ModelCapability[] {
  const normalized = values.filter((value): value is ModelCapability =>
    CAPABILITY_ORDER.includes(value as ModelCapability)
  );
  return sortCapabilities(normalized);
}

function inferCapabilitiesFromProviderModel(raw: ProviderModelPayload): ModelCapability[] {
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

function safeContextLength(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return null;
  return Math.floor(value);
}

function normalizeCatalogEntry(
  raw: Partial<ModelCatalogEntry> & Record<string, unknown>,
  fallbackSource: ModelCatalogEntry["source"]
): ModelCatalogEntry | null {
  const id = typeof raw.id === "string" ? raw.id.trim() : "";
  if (!id) return null;
  const capabilities = Array.isArray(raw.capabilities)
    ? normalizeCapabilityList(raw.capabilities)
    : inferCapabilitiesFromProviderModel(raw);

  const entry = {
    id,
    name:
      typeof raw.name === "string" && raw.name.trim().length > 0 ? raw.name.trim() : raw.id.trim(),
    description: typeof raw.description === "string" ? raw.description.trim() || null : null,
    contextLength:
      typeof raw.contextLength === "number"
        ? safeContextLength(raw.contextLength)
        : safeContextLength(raw.context_length),
    capabilities,
    availableOnProvider:
      typeof raw.availableOnProvider === "boolean" ? raw.availableOnProvider : null,
    source:
      raw.source === "openrouter" ||
      raw.source === "fallback" ||
      raw.source === "curated" ||
      raw.source === "provider"
        ? raw.source
        : fallbackSource,
  } satisfies ModelCatalogEntry;

  if (entry.capabilities.length === 0) return null;
  return modelCatalogEntrySchema.parse(entry);
}

async function readCatalogFileIfExists(
  filePath: string,
  fallbackSource: ModelCatalogEntry["source"]
) {
  try {
    await access(filePath);
  } catch {
    return null;
  }

  const raw = JSON.parse(await readFile(filePath, "utf8")) as unknown;
  if (Array.isArray(raw)) {
    return {
      generatedAt: null,
      items: raw
        .map((item) => normalizeCatalogEntry(item as Record<string, unknown>, fallbackSource))
        .filter((item): item is ModelCatalogEntry => Boolean(item)),
    } satisfies CatalogFilePayload;
  }

  if (typeof raw === "object" && raw !== null) {
    const obj = raw as { generatedAt?: unknown; items?: unknown };
    const items = Array.isArray(obj.items)
      ? obj.items
          .map((item) => normalizeCatalogEntry(item as Record<string, unknown>, fallbackSource))
          .filter((item): item is ModelCatalogEntry => Boolean(item))
      : [];
    return {
      generatedAt: typeof obj.generatedAt === "string" ? obj.generatedAt : null,
      items,
    } satisfies CatalogFilePayload;
  }

  return null;
}

function buildIdVariants(id: string) {
  const normalized = id.trim().toLowerCase();
  const variants = new Set<string>();
  if (!normalized) return variants;
  variants.add(normalized);
  const segments = normalized.split("/").filter(Boolean);
  if (segments.length > 0) {
    variants.add(segments[segments.length - 1] ?? normalized);
  }
  if (normalized.includes(":")) {
    variants.add(normalized.split(":")[0] ?? normalized);
  }
  return variants;
}

function matchesProviderId(catalogId: string, providerId: string) {
  const left = buildIdVariants(catalogId);
  const right = buildIdVariants(providerId);
  for (const candidate of left) {
    if (right.has(candidate)) return true;
  }
  return false;
}

async function fetchProviderModelIndex({
  baseUrl,
  apiKey,
  signal,
}: {
  baseUrl: string | null;
  apiKey: string | null;
  signal?: AbortSignal;
}): Promise<ProviderModelIndex> {
  if (!baseUrl || !apiKey) {
    return { success: false, ids: new Set(), items: [] };
  }

  const normalizedBaseUrl = normalizeOpenAiCompatibleBaseUrl(baseUrl);
  if (!normalizedBaseUrl) {
    return { success: false, ids: new Set(), items: [] };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);
  const abortListener = () => controller.abort();
  signal?.addEventListener("abort", abortListener, { once: true });

  try {
    const response = await fetch(`${normalizedBaseUrl}/models`, {
      headers: {
        accept: "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      return { success: false, ids: new Set(), items: [] };
    }

    const payload = (await response.json()) as { data?: unknown };
    const items = Array.isArray(payload.data)
      ? payload.data.filter(
          (item): item is ProviderModelPayload => typeof item === "object" && item !== null
        )
      : [];

    return {
      success: true,
      ids: new Set(
        items
          .map((item) => (typeof item.id === "string" ? item.id.trim().toLowerCase() : ""))
          .filter(Boolean)
      ),
      items,
    };
  } catch {
    return { success: false, ids: new Set(), items: [] };
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", abortListener);
  }
}

function responseSourceFromCatalog({
  generated,
  fallback,
  overrides,
}: {
  generated: boolean;
  fallback: boolean;
  overrides: boolean;
}): AdminLlmCatalogResponse["source"] {
  if (generated && !fallback && !overrides) return "generated";
  if (!generated) return "fallback";
  return "mixed";
}

function sortCatalogItems(items: ModelCatalogEntry[]) {
  const sourceWeight: Record<ModelCatalogEntry["source"], number> = {
    provider: 0,
    openrouter: 1,
    curated: 2,
    fallback: 3,
  };

  return [...items].sort((left, right) => {
    const availabilityWeight =
      Number(Boolean(right.availableOnProvider)) - Number(Boolean(left.availableOnProvider));
    if (availabilityWeight !== 0) return availabilityWeight;

    const capabilityWeight =
      CAPABILITY_ORDER.indexOf(left.capabilities[0] ?? "chat") -
      CAPABILITY_ORDER.indexOf(right.capabilities[0] ?? "chat");
    if (capabilityWeight !== 0) return capabilityWeight;

    const sourceDiff = sourceWeight[left.source] - sourceWeight[right.source];
    if (sourceDiff !== 0) return sourceDiff;

    return left.name.localeCompare(right.name, "en");
  });
}

export async function getAdminLlmModelCatalog({
  tier,
  signal,
}: {
  tier?: LlmTier;
  signal?: AbortSignal;
} = {}): Promise<AdminLlmCatalogResponse> {
  const [generatedCatalog, fallbackCatalog, overridesCatalog, resolvedConfig] = await Promise.all([
    readCatalogFileIfExists(GENERATED_CATALOG_PATH, "openrouter"),
    readCatalogFileIfExists(FALLBACK_CATALOG_PATH, "fallback"),
    readCatalogFileIfExists(OVERRIDES_CATALOG_PATH, "curated"),
    getResolvedLlmConfig(),
  ]);

  const catalogMap = new Map<string, ModelCatalogEntry>();

  for (const item of generatedCatalog?.items ?? []) {
    if (!matchesTier(item, tier)) continue;
    catalogMap.set(item.id.toLowerCase(), item);
  }

  for (const item of fallbackCatalog?.items ?? []) {
    if (!matchesTier(item, tier)) continue;
    const key = item.id.toLowerCase();
    if (!catalogMap.has(key)) {
      catalogMap.set(key, item);
    }
  }

  for (const item of overridesCatalog?.items ?? []) {
    if (!matchesTier(item, tier)) continue;
    const key = item.id.toLowerCase();
    const previous = catalogMap.get(key);
    catalogMap.set(
      key,
      modelCatalogEntrySchema.parse({
        ...(previous ?? {}),
        ...item,
        source: "curated",
      })
    );
  }

  const providerTargets = tier
    ? [resolvedConfig[tier]]
    : [resolvedConfig.chat, resolvedConfig.embedding, resolvedConfig.rerank];

  const providerIndexes = await Promise.all(
    providerTargets.map((target) =>
      fetchProviderModelIndex({
        baseUrl: target.baseUrl,
        apiKey: target.apiKey,
        signal,
      })
    )
  );

  const providerSuccess = providerIndexes.some((index) => index.success);
  const providerItems = providerIndexes.flatMap((index) => index.items);

  if (providerSuccess) {
    for (const [key, entry] of catalogMap.entries()) {
      const available = providerItems.some((item) =>
        typeof item.id === "string" ? matchesProviderId(entry.id, item.id) : false
      );
      catalogMap.set(key, { ...entry, availableOnProvider: available });
    }

    for (const providerItem of providerItems) {
      const providerId = typeof providerItem.id === "string" ? providerItem.id.trim() : "";
      if (!providerId) continue;

      const alreadyExists = [...catalogMap.values()].some((entry) =>
        matchesProviderId(entry.id, providerId)
      );
      if (alreadyExists) continue;

      const inferred = normalizeCatalogEntry(
        {
          id: providerId,
          name:
            typeof providerItem.name === "string" && providerItem.name.trim().length > 0
              ? providerItem.name
              : providerId,
          description:
            typeof providerItem.description === "string" ? providerItem.description : null,
          contextLength: safeContextLength(
            providerItem.context_length ??
              (typeof providerItem.top_provider === "object" && providerItem.top_provider !== null
                ? (providerItem.top_provider as Record<string, unknown>).context_length
                : undefined)
          ),
          capabilities: (() => {
            const caps = inferCapabilitiesFromProviderModel(providerItem);
            if (caps.length > 0) return caps;
            return tier ? [tierCapability(tier)] : ["chat"];
          })(),
          availableOnProvider: true,
          source: "provider",
        },
        "provider"
      );

      if (!inferred || !matchesTier(inferred, tier)) continue;
      catalogMap.set(inferred.id.toLowerCase(), inferred);
    }
  }

  const response = {
    generatedAt: generatedCatalog?.generatedAt ?? null,
    source: responseSourceFromCatalog({
      generated: Boolean(generatedCatalog),
      fallback: Boolean(fallbackCatalog),
      overrides: Boolean(overridesCatalog),
    }),
    items: sortCatalogItems([...catalogMap.values()]),
  } satisfies AdminLlmCatalogResponse;

  return adminLlmCatalogResponseSchema.parse(response);
}
