import { buildEmbeddingInput, hashEmbeddingInput } from "@/lib/ai/embeddings";

export function computePostContentHash(input: {
  title?: string | null;
  excerpt?: string | null;
  body?: string | null;
}) {
  return hashEmbeddingInput(
    buildEmbeddingInput({
      title: input.title,
      excerpt: input.excerpt,
      body: input.body,
    })
  );
}
