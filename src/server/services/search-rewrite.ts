import { planNativeQuery } from "@/lib/search/native-query";
import { SearchModelError } from "./search-model";

/** The executor and quality probe accept exactly the same content-free rewrite language. */
export function planSearchRewrites(original: string, queries: string[], maxQueries: number) {
  if (queries.length > maxQueries) throw new SearchModelError("invalid-output");
  return [...new Set(queries.filter((query) => query !== original))].map((query) => {
    try {
      const plan = planNativeQuery(query, false);
      if (
        !plan.ast ||
        (plan.mode !== "simple" && !/^"(?:[^"\\]|\\.)+"$/u.test(query)) ||
        (/^(?:nodejs|node\.js)$/iu.test(original) &&
          plan.literalTerms.some((term) => /^node$/iu.test(term)))
      )
        throw new SearchModelError("invalid-output");
      return { query, ast: plan.ast };
    } catch {
      throw new SearchModelError("invalid-output");
    }
  });
}
