import { createRequire } from "node:module";
import path from "node:path";
import { ContentSearchError } from "./native-query";
import type { SearchQueryAst } from "./query";

export type IndexUpdate = {
  id: string;
  version: string;
  deleted?: boolean;
  slug?: string;
  title?: string;
  excerpt?: string;
  body?: string;
  tags?: string;
  type?: string;
  published?: boolean;
  publishDate?: number;
};
export type IndexHit = { id: string; version: string; score: number };
type Binding = {
  inventory(): Promise<string>;
  apply(json: string): Promise<void>;
  search(json: string): Promise<string>;
};
type NativeModule = { openSearchIndex(directory: string): Promise<Binding> };
const require = createRequire(import.meta.url);

export class NativeIndex {
  private constructor(private binding: Binding) {}
  static async open(directory: string) {
    try {
      const file =
        process.env.SEARCH_NATIVE_PATH ?? path.resolve("native/search/search.linux-x64.node");
      const native: NativeModule = require(file);
      return new NativeIndex(await native.openSearchIndex(directory));
    } catch {
      throw new ContentSearchError("SERVICE_UNAVAILABLE", "search-engine-unavailable");
    }
  }
  async inventory(): Promise<IndexHit[]> {
    try {
      return JSON.parse(await this.binding.inventory());
    } catch {
      throw new ContentSearchError("SERVICE_UNAVAILABLE", "search-index-check-failed");
    }
  }
  async apply(updates: IndexUpdate[]) {
    try {
      await this.binding.apply(JSON.stringify(updates));
    } catch {
      throw new ContentSearchError("SERVICE_UNAVAILABLE", "search-index-commit-failed");
    }
  }
  async search(
    ast: SearchQueryAst,
    options: { limit: number; offset?: number; type?: string; publishedOnly?: boolean }
  ) {
    try {
      const result: IndexHit[] = JSON.parse(
        await this.binding.search(
          JSON.stringify({
            ast,
            limit: options.limit,
            offset: options.offset ?? 0,
            type: options.type === "all" ? undefined : options.type,
            published_only: options.publishedOnly !== false,
          })
        )
      );
      return result;
    } catch (error) {
      if (error instanceof Error && error.message.includes("query budget exceeded"))
        throw new ContentSearchError("BAD_REQUEST", "query-budget-exceeded");
      throw new ContentSearchError("SERVICE_UNAVAILABLE", "search-index-query-failed");
    }
  }
}
