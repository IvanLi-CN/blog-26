export type LlmModelSource = "upstream" | "builtin";
export type LlmModelCapability =
  | "chat"
  | "reasoning"
  | "coding"
  | "embedding"
  | "multimodal"
  | "rerank"
  | "routing"
  | "custom";

export interface LlmModelInfo {
  id: string;
  name: string;
  description?: string;
  provider?: string;
  capabilities?: LlmModelCapability[];
}

export interface LlmModelOption {
  id: string;
  name: string;
  description?: string;
  provider?: string;
  capabilities?: LlmModelCapability[];
  source: LlmModelSource;
  known: boolean;
}

export const BUILTIN_LLM_MODELS: LlmModelInfo[] = [
  {
    id: "gpt-5.5",
    name: "GPT-5.5",
    description: "OpenAI flagship model for complex reasoning, coding, and professional work.",
    provider: "OpenAI",
    capabilities: ["reasoning"],
  },
  {
    id: "gpt-5.4",
    name: "GPT-5.4",
    description: "More affordable OpenAI model for coding and professional work.",
    provider: "OpenAI",
    capabilities: ["coding"],
  },
  {
    id: "gpt-5.4-mini",
    name: "GPT-5.4 mini",
    description: "Strong mini OpenAI model for lower-latency coding and agentic tasks.",
    provider: "OpenAI",
    capabilities: ["coding"],
  },
  {
    id: "gpt-5.4-nano",
    name: "GPT-5.4 nano",
    description: "Smallest GPT-5.4 variant for low-latency, lower-cost workloads.",
    provider: "OpenAI",
    capabilities: ["chat"],
  },
  {
    id: "chatgpt-4o-latest",
    name: "ChatGPT-4o latest",
    description: "Latest ChatGPT-optimized GPT-4o snapshot for general conversational tasks.",
    provider: "OpenAI",
    capabilities: ["chat", "multimodal"],
  },
  {
    id: "gpt-3.5-turbo",
    name: "GPT-3.5 Turbo",
    description: "Legacy fast chat model for simple generation and compatibility workflows.",
    provider: "OpenAI",
    capabilities: ["chat"],
  },
  {
    id: "gpt-4",
    name: "GPT-4",
    description: "Older high-intelligence OpenAI model for chat and text generation.",
    provider: "OpenAI",
    capabilities: ["chat"],
  },
  {
    id: "gpt-4-turbo",
    name: "GPT-4 Turbo",
    description: "Legacy GPT-4 class model for higher quality text and tool workflows.",
    provider: "OpenAI",
    capabilities: ["chat"],
  },
  {
    id: "gpt-4o-mini",
    name: "GPT-4o mini",
    description: "Fast, economical model for routine tagging and lightweight content tasks.",
    provider: "OpenAI",
    capabilities: ["chat", "multimodal"],
  },
  {
    id: "gpt-4o",
    name: "GPT-4o",
    description: "General-purpose multimodal model for higher quality organization tasks.",
    provider: "OpenAI",
    capabilities: ["chat", "multimodal"],
  },
  {
    id: "gpt-4.1",
    name: "GPT-4.1",
    description: "Strong general reasoning and instruction following for complex content curation.",
    provider: "OpenAI",
    capabilities: ["reasoning"],
  },
  {
    id: "gpt-4.1-mini",
    name: "GPT-4.1 mini",
    description: "Balanced latency and quality for admin automation workflows.",
    provider: "OpenAI",
    capabilities: ["chat"],
  },
  {
    id: "gpt-4.1-nano",
    name: "GPT-4.1 nano",
    description: "Low-latency option for simple classification and formatting tasks.",
    provider: "OpenAI",
    capabilities: ["chat"],
  },
  {
    id: "o4-mini",
    name: "o4-mini",
    description: "Compact reasoning model for structured planning and validation prompts.",
    provider: "OpenAI",
    capabilities: ["reasoning"],
  },
  {
    id: "o1",
    name: "o1",
    description: "Previous full OpenAI o-series reasoning model.",
    provider: "OpenAI",
    capabilities: ["reasoning"],
  },
  {
    id: "o1-pro",
    name: "o1-pro",
    description: "Higher-compute o1 variant for better reasoning responses.",
    provider: "OpenAI",
    capabilities: ["reasoning"],
  },
  {
    id: "o3",
    name: "o3",
    description: "Reasoning-focused model for harder organization and synthesis tasks.",
    provider: "OpenAI",
    capabilities: ["reasoning"],
  },
  {
    id: "o3-mini",
    name: "o3-mini",
    description: "Smaller reasoning model for structured analysis with lower latency.",
    provider: "OpenAI",
    capabilities: ["reasoning"],
  },
  {
    id: "o3-pro",
    name: "o3-pro",
    description: "Higher-compute o3 variant for better reasoning responses.",
    provider: "OpenAI",
    capabilities: ["reasoning"],
  },
];

export const MODEL_INFO_DATABASE: LlmModelInfo[] = [
  ...BUILTIN_LLM_MODELS,
  {
    id: "claude-3-5-haiku-latest",
    name: "Claude 3.5 Haiku",
    description: "Fast Anthropic model for responsive drafting, extraction, and classification.",
    provider: "Anthropic",
    capabilities: ["chat"],
  },
  {
    id: "claude-3-5-sonnet-latest",
    name: "Claude 3.5 Sonnet",
    description: "Balanced Anthropic model for writing, coding, and long-context analysis.",
    provider: "Anthropic",
    capabilities: ["reasoning"],
  },
  {
    id: "claude-3-opus-latest",
    name: "Claude 3 Opus",
    description: "High-capability Anthropic model for complex reasoning and synthesis.",
    provider: "Anthropic",
    capabilities: ["reasoning"],
  },
  {
    id: "deepseek-chat",
    name: "DeepSeek Chat",
    description: "General-purpose DeepSeek chat model for everyday generation tasks.",
    provider: "DeepSeek",
    capabilities: ["chat"],
  },
  {
    id: "deepseek-reasoner",
    name: "DeepSeek Reasoner",
    description: "Reasoning-oriented DeepSeek model for multi-step analysis.",
    provider: "DeepSeek",
    capabilities: ["reasoning"],
  },
  {
    id: "gemini-1.5-pro",
    name: "Gemini 1.5 Pro",
    description: "Google model for long-context reasoning and multimodal workflows.",
    provider: "Google",
    capabilities: ["reasoning", "multimodal"],
  },
  {
    id: "gemini-2.0-flash",
    name: "Gemini 2.0 Flash",
    description: "Fast Google model for low-latency generation and agentic tasks.",
    provider: "Google",
    capabilities: ["chat", "multimodal", "coding"],
  },
  {
    id: "gemini-2.0-flash-lite",
    name: "Gemini 2.0 Flash Lite",
    description: "Lightweight Google model for economical high-throughput prompts.",
    provider: "Google",
    capabilities: ["chat", "multimodal"],
  },
  {
    id: "meta-llama/llama-3.3-70b-instruct",
    name: "Llama 3.3 70B Instruct",
    description: "Open-weight instruction model for general chat and reasoning workflows.",
    provider: "Meta",
    capabilities: ["reasoning"],
  },
  {
    id: "mistral-large-latest",
    name: "Mistral Large",
    description: "Mistral flagship model for advanced reasoning, writing, and coding tasks.",
    provider: "Mistral",
    capabilities: ["reasoning"],
  },
  {
    id: "mistral-small-latest",
    name: "Mistral Small",
    description: "Efficient Mistral model for everyday generation and classification.",
    provider: "Mistral",
    capabilities: ["chat"],
  },
  {
    id: "moonshotai/kimi-k2",
    name: "Kimi K2",
    description: "Moonshot AI model for coding, tool use, and long-context work.",
    provider: "Moonshot AI",
    capabilities: ["coding"],
  },
  {
    id: "openai/gpt-4o-mini",
    name: "GPT-4o mini",
    description: "OpenAI-compatible routed ID for GPT-4o mini.",
    provider: "OpenAI",
    capabilities: ["chat", "multimodal"],
  },
  {
    id: "openrouter/auto",
    name: "OpenRouter Auto",
    description: "Router-selected model for provider-agnostic fallback workflows.",
    provider: "OpenRouter",
    capabilities: ["routing"],
  },
  {
    id: "qwen/qwen2.5-coder-32b-instruct",
    name: "Qwen2.5 Coder 32B Instruct",
    description: "Qwen coding model for code generation, refactoring, and review tasks.",
    provider: "Qwen",
    capabilities: ["coding"],
  },
  {
    id: "qwen/qwen3-32b",
    name: "Qwen3 32B",
    description: "Qwen general model for multilingual reasoning and instruction following.",
    provider: "Qwen",
    capabilities: ["reasoning"],
  },
  {
    id: "qwen/qwen3-235b-a22b",
    name: "Qwen3 235B A22B",
    description: "Large Qwen mixture model for stronger reasoning and synthesis tasks.",
    provider: "Qwen",
    capabilities: ["reasoning"],
  },
  {
    id: "text-embedding-3-large",
    name: "Text Embedding 3 Large",
    description: "OpenAI embedding model for higher quality semantic retrieval.",
    provider: "OpenAI",
    capabilities: ["embedding"],
  },
  {
    id: "text-embedding-3-small",
    name: "Text Embedding 3 Small",
    description: "OpenAI embedding model for economical semantic search workflows.",
    provider: "OpenAI",
    capabilities: ["embedding"],
  },
  {
    id: "BAAI/bge-m3",
    name: "BGE-M3",
    description:
      "BAAI multilingual embedding model for dense, lexical, and multi-vector retrieval.",
    provider: "BAAI",
    capabilities: ["embedding"],
  },
  {
    id: "jina-embeddings-v3",
    name: "Jina Embeddings v3",
    description: "Jina AI multilingual embedding model for retrieval and clustering workflows.",
    provider: "Jina AI",
    capabilities: ["embedding"],
  },
  {
    id: "voyage-3-large",
    name: "Voyage 3 Large",
    description: "Voyage AI high-quality embedding model for production semantic retrieval.",
    provider: "Voyage AI",
    capabilities: ["embedding"],
  },
  {
    id: "rerank-english-v3.0",
    name: "Rerank English v3.0",
    description: "Cohere English reranking model for improving retrieval result ordering.",
    provider: "Cohere",
    capabilities: ["rerank"],
  },
  {
    id: "rerank-multilingual-v3.0",
    name: "Rerank Multilingual v3.0",
    description: "Cohere multilingual reranking model for cross-language retrieval workflows.",
    provider: "Cohere",
    capabilities: ["rerank"],
  },
  {
    id: "jina-reranker-v2-base-multilingual",
    name: "Jina Reranker v2 Base Multilingual",
    description:
      "Jina AI multilingual reranker for relevance scoring and search result refinement.",
    provider: "Jina AI",
    capabilities: ["rerank"],
  },
  {
    id: "BAAI/bge-reranker-v2-m3",
    name: "BGE Reranker v2 M3",
    description: "BAAI multilingual reranker for refining semantic search results.",
    provider: "BAAI",
    capabilities: ["rerank"],
  },
  {
    id: "x-ai/grok-3-mini",
    name: "Grok 3 mini",
    description: "xAI compact model for fast chat and reasoning prompts.",
    provider: "xAI",
    capabilities: ["reasoning"],
  },
  {
    id: "z-ai/glm-4.5",
    name: "GLM-4.5",
    description: "Z.ai model for agentic coding, reasoning, and general chat tasks.",
    provider: "Z.ai",
    capabilities: ["reasoning", "coding"],
  },
];

const MODEL_INFO_MAP = new Map(MODEL_INFO_DATABASE.map((model) => [model.id, model]));

export function findBuiltinLlmModel(modelId: string): LlmModelInfo | undefined {
  return findLlmModelInfo(modelId);
}

export function findLlmModelInfo(modelId: string): LlmModelInfo | undefined {
  return MODEL_INFO_MAP.get(modelId.trim());
}

export function toBuiltinLlmModelOptions(): LlmModelOption[] {
  return MODEL_INFO_DATABASE.map((model) => ({
    ...model,
    source: "builtin",
    known: true,
  }));
}

export function decorateUpstreamLlmModelNames(
  modelIds: string[],
  fallbackCapability?: LlmModelCapability
): LlmModelOption[] {
  const uniqueIds = [...new Set(modelIds.map((id) => id.trim()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b)
  );

  return uniqueIds.map((id) => {
    const modelInfo = findLlmModelInfo(id);
    return {
      id,
      name: modelInfo?.name ?? id,
      description: modelInfo?.description,
      provider: modelInfo?.provider,
      capabilities:
        modelInfo?.capabilities ?? (fallbackCapability ? [fallbackCapability] : undefined),
      source: "upstream",
      known: Boolean(modelInfo),
    };
  });
}
