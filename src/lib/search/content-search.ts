import { and, desc, eq, inArray, type SQL, sql } from "drizzle-orm";
import type { SearchResult, SemanticSearchInput } from "@/lib/ai/search";
import { buildSearchSnippet } from "@/lib/ai/search-snippet";
import { db } from "@/lib/db";
import { posts } from "@/lib/schema";
import {
  getSearchLiteralTerms,
  parseSearchQuery,
  renderFts5Query,
  SEARCH_COLUMNS,
  type SearchColumn,
  type SearchQueryAst,
  type SearchQueryPlan,
} from "./query";

const BM25_WEIGHTS = [0, 0, 1, 8, 4, 1, 4] as const;
const MAX_SEARCH_ROWS = 200;

type ContentSearchRow = {
  id: string;
  slug: string;
  title: string | null;
  excerpt: string | null;
  body: string;
  tags: string | null;
  type: string;
  publishDate: number;
};

export type ContentSearchExecution = {
  results: SearchResult[];
  source: "fts";
  plan: SearchQueryPlan;
};

function getSearchColumn(column: SearchColumn) {
  switch (column) {
    case "slug":
      return posts.slug;
    case "title":
      return posts.title;
    case "excerpt":
      return posts.excerpt;
    case "body":
      return posts.body;
    case "tags":
      return posts.tags;
  }
}

function getSearchColumns(column?: SearchColumn) {
  return column ? [getSearchColumn(column)] : SEARCH_COLUMNS.map(getSearchColumn);
}

function escapeLikeValue(value: string) {
  return value.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_");
}

function buildLikePredicate(value: string, column?: SearchColumn): SQL {
  const pattern = `%${escapeLikeValue(value)}%`;
  const clauses = getSearchColumns(column).map(
    (searchColumn) => sql`${searchColumn} LIKE ${pattern} ESCAPE ${"\\"}`
  );
  return sql`(${sql.join(clauses, sql` OR `)})`;
}

function buildFtsExistsPredicate(ast: SearchQueryAst, column?: SearchColumn): SQL {
  const scopedAst: SearchQueryAst = column ? { kind: "column", column, child: ast } : ast;
  return sql`EXISTS (
    SELECT 1
    FROM posts_search_fts
    WHERE posts_search_fts.post_id = ${posts.id}
      AND posts_search_fts MATCH ${renderFts5Query(scopedAst)}
  )`;
}

function isShortAst(ast: SearchQueryAst) {
  if (ast.kind !== "term" && ast.kind !== "phrase" && ast.kind !== "prefix") return false;
  return Array.from(ast.value.replace(/\s+/gu, "")).length < 3;
}

function getLikeLeafValue(ast: Extract<SearchQueryAst, { kind: "term" | "phrase" | "prefix" }>) {
  return ast.kind === "prefix" ? ast.value.replace(/\*$/u, "") : ast.value;
}

function buildAstPredicate(ast: SearchQueryAst, scopedColumn?: SearchColumn): SQL {
  switch (ast.kind) {
    case "term":
    case "phrase":
    case "prefix":
      return isShortAst(ast)
        ? buildLikePredicate(getLikeLeafValue(ast), scopedColumn)
        : buildFtsExistsPredicate(ast, scopedColumn);
    case "column":
      return buildAstPredicate(ast.child, ast.column);
    case "near":
      return buildFtsExistsPredicate(ast, scopedColumn);
    case "and":
      return sql`(${sql.join(
        ast.children.map((child) => buildAstPredicate(child, scopedColumn)),
        sql` AND `
      )})`;
    case "or":
      return sql`(${sql.join(
        ast.children.map((child) => buildAstPredicate(child, scopedColumn)),
        sql` OR `
      )})`;
    case "not":
      return sql`(${buildAstPredicate(ast.include, scopedColumn)} AND NOT (${buildAstPredicate(
        ast.exclude,
        scopedColumn
      )}))`;
  }
}

export function buildContentSearchCondition(
  queryOrPlan: string | SearchQueryPlan
): SQL | undefined {
  const plan = typeof queryOrPlan === "string" ? parseSearchQuery(queryOrPlan) : queryOrPlan;
  if (!plan.ast) return plan.query ? sql`0 = 1` : undefined;

  const predicate = buildAstPredicate(plan.ast);
  if (!plan.hasShortLeaf) return predicate;

  // Keep the short-leaf LIKE path explicit without allowing a missing FTS migration to hide.
  const indexGuard = sql`COALESCE((SELECT 1 FROM posts_search_fts LIMIT 1), 1) = 1`;
  return sql`(${indexGuard} AND ${predicate})`;
}

function buildPostFilters(input: SemanticSearchInput): SQL[] {
  const conditions: SQL[] = [];
  if (input.type && input.type !== "all") {
    conditions.push(eq(posts.type, input.type));
  } else {
    conditions.push(inArray(posts.type, ["post", "memo"]));
  }
  if (input.publishedOnly !== false) {
    conditions.push(eq(posts.draft, false), eq(posts.public, true));
  }
  return conditions;
}

function buildRawPostFilters(input: SemanticSearchInput) {
  const conditions: SQL[] = [sql`p.type IN ('post', 'memo')`];
  if (input.type && input.type !== "all") {
    conditions.push(sql`p.type = ${input.type}`);
  }
  if (input.publishedOnly !== false) {
    conditions.push(sql`p.draft = 0`, sql`p.public = 1`);
  }
  return sql.join(conditions, sql` AND `);
}

function buildSnippetQuery(plan: SearchQueryPlan) {
  return getSearchLiteralTerms(plan.ast).join(" ") || plan.query;
}

function toSearchResult(
  row: ContentSearchRow,
  plan: SearchQueryPlan,
  final?: number
): SearchResult {
  return {
    slug: row.slug,
    title: row.title,
    excerpt: row.excerpt,
    snippet: buildSearchSnippet(buildSnippetQuery(plan), row),
    type: row.type === "post" || row.type === "memo" ? row.type : undefined,
    ...(typeof final === "number" ? { final } : {}),
  };
}

function normalizeBm25Scores(rows: Array<ContentSearchRow & { searchScore: number }>) {
  const scores = rows.map((row) => row.searchScore).filter(Number.isFinite);
  const min = Math.min(...scores);
  const max = Math.max(...scores);
  return rows.map((row) => {
    const final =
      !Number.isFinite(row.searchScore) || scores.length === 0
        ? undefined
        : min === max
          ? 0.98
          : Math.max(0.12, Math.min(0.98, (max - row.searchScore) / (max - min)));
    return { row, final };
  });
}

async function executePureFtsSearch(
  input: SemanticSearchInput,
  plan: SearchQueryPlan,
  limit: number
) {
  const rows = (await db.all(sql`
    SELECT
      p.id AS id,
      p.slug AS slug,
      p.title AS title,
      p.excerpt AS excerpt,
      p.body AS body,
      p.tags AS tags,
      p.type AS type,
      p.publish_date AS publishDate,
      bm25(posts_search_fts, ${sql.raw(BM25_WEIGHTS.join(","))}) AS searchScore
    FROM posts_search_fts
    INNER JOIN posts AS p ON p.id = posts_search_fts.post_id
    WHERE posts_search_fts MATCH ${plan.ftsQuery}
      AND ${buildRawPostFilters(input)}
    ORDER BY searchScore ASC, p.publish_date DESC, p.id DESC
    LIMIT ${limit}
  `)) as Array<ContentSearchRow & { searchScore: number }>;

  return normalizeBm25Scores(rows).map(({ row, final }) => toSearchResult(row, plan, final));
}

function normalizeText(value: string | null | undefined) {
  return (value ?? "").normalize("NFKC").toLocaleLowerCase();
}

function countOccurrences(value: string, term: string) {
  if (!value || !term) return 0;
  let count = 0;
  let offset = 0;
  while (true) {
    const index = value.indexOf(term, offset);
    if (index === -1) return count;
    count += 1;
    offset = index + Math.max(1, term.length);
  }
}

const SEARCH_FIELD_WEIGHTS: Record<SearchColumn, number> = {
  slug: 1,
  title: 8,
  excerpt: 4,
  body: 1,
  tags: 4,
};

function getSearchFieldValue(row: ContentSearchRow, column: SearchColumn) {
  switch (column) {
    case "slug":
      return row.slug;
    case "title":
      return row.title ?? "";
    case "excerpt":
      return row.excerpt ?? "";
    case "body":
      return row.body;
    case "tags":
      return row.tags ?? "";
  }
}

function scoreSearchLeaf(row: ContentSearchRow, value: string, scopedColumn?: SearchColumn) {
  const normalizedValue = normalizeText(value);
  if (!normalizedValue) return 0;

  const columns = scopedColumn ? [scopedColumn] : SEARCH_COLUMNS;
  return columns.reduce((total, column) => {
    const matches = Math.min(
      4,
      countOccurrences(normalizeText(getSearchFieldValue(row, column)), normalizedValue)
    );
    return total + matches * SEARCH_FIELD_WEIGHTS[column];
  }, 0);
}

function scoreSearchAst(
  row: ContentSearchRow,
  ast: SearchQueryAst,
  scopedColumn?: SearchColumn
): number {
  switch (ast.kind) {
    case "term":
    case "phrase":
    case "prefix":
      return scoreSearchLeaf(row, ast.value, scopedColumn);
    case "column":
      return scoreSearchAst(row, ast.child, ast.column);
    case "near":
      return ast.atoms.reduce((total, atom) => total + scoreSearchAst(row, atom, scopedColumn), 0);
    case "and":
      return ast.children.reduce(
        (total, child) => total + scoreSearchAst(row, child, scopedColumn),
        0
      );
    case "or":
      return Math.max(...ast.children.map((child) => scoreSearchAst(row, child, scopedColumn)));
    case "not":
      return scoreSearchAst(row, ast.include, scopedColumn);
  }
}

function scoreShortSearchRow(row: ContentSearchRow, plan: SearchQueryPlan) {
  return plan.ast ? scoreSearchAst(row, plan.ast) : 0;
}

async function executeMixedSearch(
  input: SemanticSearchInput,
  plan: SearchQueryPlan,
  limit: number
) {
  const searchCondition = buildContentSearchCondition(plan);
  if (!searchCondition) return [];

  const rows = (await db
    .select({
      id: posts.id,
      slug: posts.slug,
      title: posts.title,
      excerpt: posts.excerpt,
      body: posts.body,
      tags: posts.tags,
      type: posts.type,
      publishDate: posts.publishDate,
    })
    .from(posts)
    .where(and(searchCondition, ...buildPostFilters(input)))
    .orderBy(desc(posts.publishDate), desc(posts.id))
    .limit(Math.max(limit, MAX_SEARCH_ROWS))) as ContentSearchRow[];

  const scored = rows
    .map((row) => ({ row, score: scoreShortSearchRow(row, plan) }))
    .filter(({ score }) => score > 0)
    .sort((left, right) => {
      const scoreDelta = right.score - left.score;
      if (scoreDelta !== 0) return scoreDelta;
      const dateDelta = right.row.publishDate - left.row.publishDate;
      if (dateDelta !== 0) return dateDelta;
      return right.row.id.localeCompare(left.row.id);
    });

  const maxScore = scored[0]?.score ?? 0;
  const minScore = scored.at(-1)?.score ?? 0;
  return scored.slice(0, limit).map(({ row, score }) => {
    const final =
      maxScore === minScore
        ? 0.98
        : Math.max(0.12, Math.min(0.98, (score - minScore) / (maxScore - minScore)));
    return toSearchResult(row, plan, final);
  });
}

export async function executeContentSearch(
  input: SemanticSearchInput
): Promise<ContentSearchExecution> {
  const plan = parseSearchQuery(input.q);
  if (!plan.ast) return { results: [], source: "fts", plan };

  const requestedLimit = input.topK ?? 50;
  const limit = Number.isFinite(requestedLimit)
    ? Math.max(1, Math.min(Math.floor(requestedLimit), 100))
    : 50;
  const results = plan.hasShortLeaf
    ? await executeMixedSearch(input, plan, limit)
    : await executePureFtsSearch(input, plan, limit);
  return { results, source: "fts", plan };
}

export async function searchContent(input: SemanticSearchInput): Promise<SearchResult[]> {
  return (await executeContentSearch(input)).results;
}
