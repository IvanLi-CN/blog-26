import { parseSearchQuery, type SearchQueryAst } from "./query";

const errorBrand = Symbol.for("blog26.content-search-error");
export class ContentSearchError extends Error {
  readonly [errorBrand] = true;
  // The Console entrypoint and its SSR bundle contain separate copies of this module.
  static [Symbol.hasInstance](value: unknown): value is ContentSearchError {
    return value instanceof Error && Reflect.get(value, errorBrand) === true;
  }
  constructor(
    public readonly code: "BAD_REQUEST" | "SERVICE_UNAVAILABLE",
    message: string
  ) {
    super(message);
    this.name = "ContentSearchError";
  }
}

export const NAME_POLICY_VERSION = "technical-v2-node-v1";

function alias(node: SearchQueryAst): SearchQueryAst {
  if (node.kind === "and" || node.kind === "or") {
    return { ...node, children: node.children.map(alias) };
  }
  if (node.kind !== "term") return node;
  switch (node.value.toLowerCase()) {
    case "node":
      return { kind: "or", children: [node, { kind: "term", value: "NodeJS" }] };
    case "nodejs":
    case "node.js":
      return {
        kind: "or",
        children: [
          { kind: "term", value: "NodeJS" },
          { kind: "term", value: "Node.js" },
        ],
      };
    default:
      return node;
  }
}

function countNodes(ast: SearchQueryAst): number {
  switch (ast.kind) {
    case "and":
    case "or":
      return 1 + ast.children.reduce((sum, node) => sum + countNodes(node), 0);
    case "column":
      return 1 + countNodes(ast.child);
    case "not":
      return 1 + countNodes(ast.include) + countNodes(ast.exclude);
    case "near":
      throw new ContentSearchError(
        "BAD_REQUEST",
        "unsupported-query: NEAR is not supported in content search"
      );
    default:
      return 1;
  }
}

/** Legacy list and semantic parsers remain unchanged; only the new engine retires NEAR. */
export function planNativeQuery(query: string, expandAliases = true) {
  const unquoted = query.replace(/"(?:\\.|[^"\\])*"/gu, "");
  if (/(?:^|[\s(:])NEAR\s*\(/iu.test(unquoted)) {
    throw new ContentSearchError(
      "BAD_REQUEST",
      "unsupported-query: NEAR is not supported in content search"
    );
  }
  const plan = parseSearchQuery(query, { native: true });
  if (plan.limitExceeded) throw new ContentSearchError("BAD_REQUEST", "query-budget-exceeded");
  const ast = plan.ast && plan.mode === "simple" && expandAliases ? alias(plan.ast) : plan.ast;
  if (ast && countNodes(ast) > 256)
    throw new ContentSearchError("BAD_REQUEST", "query-budget-exceeded");
  return { ...plan, ast };
}
