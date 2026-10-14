import { createHash } from "node:crypto";
import {
  getPlaybookPolicies,
  normalizePlaybookSearch,
  playbookHref,
  playbookVersionHref,
} from "@/lib/playbook/navigation";
import { createPlaybookSearchPages } from "@/lib/playbook/search";
import type {
  PlaybookEdition,
  PlaybookPolicySkillDetail,
  PlaybookSearchDocument,
} from "@/lib/playbook/types";
import {
  positiveSearchTerms,
  type SearchHighlightTerm,
  searchHighlightSpans,
} from "@/lib/search/highlights";
import { parseSearchQuery, type SearchColumn, type SearchQueryAst } from "@/lib/search/query";

export type PlaybookSearchType = "topic" | "experience" | "policy";
export type PlaybookSearchLocation = {
  kind: "section" | "resource";
  id: string;
  title: string;
  href: string;
  snippet: string;
  order: number;
  score?: number;
  resourcePath?: string;
};

export type PlaybookSearchCandidate = {
  id: string;
  source: "playbook";
  type: PlaybookSearchType;
  slug: string;
  title: string;
  excerpt: string | null;
  body: string;
  tags: string[];
  route: string;
  href: string;
  version: string;
  score: number;
  locations: PlaybookSearchLocation[];
  edition: {
    edition: string;
    sourceReleaseId: string;
    sourceTag: string;
  };
  contentHash: string;
};

export type PlaybookSearchChunk = {
  id: string;
  parentId: string;
  type: PlaybookSearchType;
  slug: string;
  title: string;
  excerpt: string | null;
  body: string;
  route: string;
  location?: PlaybookSearchLocation;
  chunkIndex: number;
  contentHash: string;
};

type PlaybookChunk = {
  document: PlaybookSearchDocument;
  type: PlaybookSearchType;
  slug: string;
  canonicalRoute: string;
  title: string;
  excerpt: string | null;
  body: string;
  tags: string[];
  location?: PlaybookSearchLocation;
};

const FIELD_WEIGHT: Record<SearchColumn, number> = {
  title: 8,
  excerpt: 4,
  body: 1,
  slug: 1,
  tags: 4,
};

function editionVersion(edition: PlaybookEdition) {
  return `${edition.edition.editionDigest}:${edition.edition.source.releaseId}:${edition.edition.source.tag}`;
}

function parentIdentity(edition: PlaybookEdition, type: PlaybookSearchType, slug: string) {
  return `playbook:${editionVersion(edition)}:${type}:${slug}`;
}

function parseRoute(route: string) {
  const canonical = playbookHref(route).replace(/\/$/u, "");
  const [, , type, slug] = canonical.split("/");
  if (!slug || !["topics", "projects", "policies"].includes(type)) return undefined;
  return {
    canonicalRoute: `${canonical}/`,
    type:
      type === "topics"
        ? ("topic" as const)
        : type === "projects"
          ? ("experience" as const)
          : ("policy" as const),
    slug,
  };
}

function snippet(body: string, _query: string, terms: SearchHighlightTerm[]) {
  const points = Array.from(body);
  if (!points.length) return "";
  const spans = searchHighlightSpans(body, terms);
  const startPoint = spans.length
    ? Math.max(0, Array.from(body.slice(0, spans[0].start)).length - 50)
    : 0;
  const slice = points.slice(startPoint, startPoint + 180).join("");
  return `${startPoint ? "…" : ""}${slice}`;
}

function fieldValue(chunk: PlaybookChunk, field: SearchColumn) {
  switch (field) {
    case "slug":
      return chunk.slug;
    case "title":
      return chunk.title;
    case "excerpt":
      return chunk.excerpt ?? "";
    case "body":
      return chunk.body;
    case "tags":
      return chunk.tags.join(" ");
  }
}

function contains(chunk: PlaybookChunk, value: string, field?: SearchColumn, prefix = false) {
  const fields = field ? [field] : (Object.keys(FIELD_WEIGHT) as SearchColumn[]);
  return fields.some(
    (name) => searchHighlightSpans(fieldValue(chunk, name), [{ value, prefix }]).length
  );
}

function evaluateAst(chunk: PlaybookChunk, ast: SearchQueryAst): boolean {
  switch (ast.kind) {
    case "term":
      return contains(chunk, ast.value);
    case "phrase":
      return contains(chunk, ast.value);
    case "prefix":
      return contains(chunk, ast.value, undefined, true);
    case "column":
      return evaluateColumn(chunk, ast.column, ast.child);
    case "near":
      return ast.atoms.every((atom) => evaluateAst(chunk, atom));
    case "and":
      return ast.children.every((child) => evaluateAst(chunk, child));
    case "or":
      return ast.children.some((child) => evaluateAst(chunk, child));
    case "not":
      return evaluateAst(chunk, ast.include) && !evaluateAst(chunk, ast.exclude);
  }
}

function evaluateColumn(chunk: PlaybookChunk, column: SearchColumn, ast: SearchQueryAst): boolean {
  switch (ast.kind) {
    case "term":
      return contains(chunk, ast.value, column);
    case "phrase":
      return contains(chunk, ast.value, column);
    case "prefix":
      return contains(chunk, ast.value, column, true);
    case "column":
      return evaluateColumn(chunk, ast.column, ast.child);
    case "near":
      return ast.atoms.every((atom) => evaluateColumn(chunk, column, atom));
    case "and":
      return ast.children.every((child) => evaluateColumn(chunk, column, child));
    case "or":
      return ast.children.some((child) => evaluateColumn(chunk, column, child));
    case "not":
      return (
        evaluateColumn(chunk, column, ast.include) && !evaluateColumn(chunk, column, ast.exclude)
      );
  }
}

function scoreAst(chunk: PlaybookChunk, ast: SearchQueryAst): number {
  switch (ast.kind) {
    case "term":
    case "phrase":
    case "prefix": {
      const value = ast.kind === "prefix" ? ast.value : ast.value;
      return (Object.keys(FIELD_WEIGHT) as SearchColumn[]).reduce(
        (score, field) =>
          score + (contains(chunk, value, field, ast.kind === "prefix") ? FIELD_WEIGHT[field] : 0),
        0
      );
    }
    case "column":
      return evaluateColumn(chunk, ast.column, ast.child)
        ? FIELD_WEIGHT[ast.column] * scoreAstInField(chunk, ast.child, ast.column)
        : 0;
    case "near":
      return ast.atoms.reduce((score, child) => score + scoreAst(chunk, child), 0);
    case "and":
    case "or":
      return ast.children.reduce((score, child) => score + scoreAst(chunk, child), 0);
    case "not":
      return scoreAst(chunk, ast.include);
  }
}

function scoreAstInField(chunk: PlaybookChunk, ast: SearchQueryAst, field: SearchColumn): number {
  switch (ast.kind) {
    case "term":
    case "phrase":
    case "prefix":
      return contains(chunk, ast.value, field, ast.kind === "prefix") ? 1 : 0;
    case "column":
      return scoreAstInField(chunk, ast.child, ast.column);
    case "near":
      return ast.atoms.reduce((score, child) => score + scoreAstInField(chunk, child, field), 0);
    case "and":
    case "or":
      return ast.children.reduce((score, child) => score + scoreAstInField(chunk, child, field), 0);
    case "not":
      return scoreAstInField(chunk, ast.include, field);
  }
}

function resourceChunk(
  edition: PlaybookEdition,
  policy: PlaybookPolicySkillDetail,
  path: string,
  kind: string,
  content: string
): PlaybookChunk {
  const route = `/policies/${policy.summary.slug}/`;
  const fileIndex =
    path === "SKILL.md" ? 0 : policy.resources.findIndex((item) => item.path === path) + 1;
  const resourceAnchor = `policy-${policy.summary.slug}-resources-file-${Math.max(0, fileIndex)}`;
  return {
    document: {
      id: `resource:${policy.summary.slug}:${path}`,
      kind: "section",
      title: path,
      subtitle: kind,
      body: content,
      route,
      section_id: "resources",
      keywords: [path, kind, policy.summary.slug],
      command_id: null,
    },
    type: "policy",
    slug: policy.summary.slug,
    canonicalRoute: route,
    title: policy.summary.name,
    excerpt: policy.summary.description,
    body: content,
    tags: [path, kind, policy.summary.slug],
    location: {
      kind: "resource",
      id: `resource:${path}`,
      title: path,
      href: `${playbookVersionHref(edition.edition, route)}#${resourceAnchor}`,
      snippet: snippet(content, path, [{ value: path }]),
      order: 1,
      resourcePath: path,
    },
  };
}

function chunksForEdition(edition: PlaybookEdition) {
  const pages = createPlaybookSearchPages(edition.catalog);
  const pageMap = new Map(pages.map((page) => [page.href, page]));
  const normalized = normalizePlaybookSearch(edition.catalog, edition.search);
  const chunks: PlaybookChunk[] = [];
  for (const document of normalized.documents) {
    const parsed = parseRoute(document.route);
    if (!parsed) continue;
    const page = pageMap.get(parsed.canonicalRoute);
    if (!page) continue;
    const section = document.section_id
      ? page.sections.find((item) => item.id === document.section_id)
      : undefined;
    chunks.push({
      document,
      type: parsed.type,
      slug: parsed.slug,
      canonicalRoute: parsed.canonicalRoute,
      title: page.title,
      excerpt: document.subtitle ?? null,
      body: document.body,
      tags: [...document.keywords, document.title, document.subtitle ?? ""],
      ...(section
        ? {
            location: {
              kind: "section" as const,
              id: section.id,
              title: section.title,
              href: playbookVersionHref(edition.edition, parsed.canonicalRoute, section.id),
              snippet: snippet(document.body, document.body.slice(0, 80), [
                { value: document.title },
              ]),
              order: section.order,
            },
          }
        : {}),
    });
  }
  for (const policy of getPlaybookPolicies(edition.catalog)) {
    const skill = `---\n${JSON.stringify(policy.frontmatter, null, 2)}\n---\n\n${policy.instruction_markdown}\n`;
    chunks.push(resourceChunk(edition, policy, "SKILL.md", "markdown", skill));
    for (const resource of policy.resources)
      chunks.push(resourceChunk(edition, policy, resource.path, resource.kind, resource.content));
  }
  return chunks;
}

/** Stable semantic units; results still aggregate back to their parent object. */
export function listPlaybookSearchChunks(
  edition: PlaybookEdition,
  options: { type?: "all" | PlaybookSearchType } = {}
): PlaybookSearchChunk[] {
  const nextIndex = new Map<string, number>();
  return chunksForEdition(edition).flatMap((chunk) => {
    if (options.type && options.type !== "all" && chunk.type !== options.type) return [];
    const parentId = parentIdentity(edition, chunk.type, chunk.slug);
    const chunkIndex = nextIndex.get(parentId) ?? 0;
    nextIndex.set(parentId, chunkIndex + 1);
    const location = chunk.location
      ? {
          ...chunk.location,
          score: 0,
        }
      : undefined;
    const locationKey = location?.resourcePath ?? location?.id ?? "page";
    return [
      {
        id: `${parentId}:${chunkIndex}:${locationKey}`,
        parentId,
        type: chunk.type,
        slug: chunk.slug,
        title: chunk.title,
        excerpt: chunk.excerpt,
        body: chunk.body,
        route: chunk.canonicalRoute,
        ...(location ? { location } : {}),
        chunkIndex,
        contentHash: createHash("sha256")
          .update(`${chunk.title}\n${chunk.excerpt ?? ""}\n${chunk.body}`)
          .digest("hex"),
      },
    ];
  });
}

/** Return the complete, edition-bound parent projection for embedding preparation. */
export function listPlaybookCandidates(
  edition: PlaybookEdition,
  options: { type?: "all" | PlaybookSearchType } = {}
): PlaybookSearchCandidate[] {
  const groups = new Map<string, PlaybookSearchCandidate>();
  for (const chunk of chunksForEdition(edition)) {
    if (options.type && options.type !== "all" && chunk.type !== options.type) continue;
    const id = parentIdentity(edition, chunk.type, chunk.slug);
    const location = chunk.location
      ? {
          ...chunk.location,
        }
      : undefined;
    const existing = groups.get(id);
    if (!existing) {
      groups.set(id, {
        id,
        source: "playbook",
        type: chunk.type,
        slug: chunk.slug,
        title: chunk.title,
        excerpt: chunk.excerpt,
        body: chunk.body,
        tags: chunk.tags,
        route: chunk.canonicalRoute,
        href: playbookVersionHref(edition.edition, chunk.canonicalRoute),
        version: editionVersion(edition),
        score: 0,
        locations: location ? [location] : [],
        edition: {
          edition: edition.edition.editionDigest,
          sourceReleaseId: edition.edition.source.releaseId,
          sourceTag: edition.edition.source.tag,
        },
        contentHash: createHash("sha256")
          .update(`${chunk.title}\n${chunk.excerpt ?? ""}\n${chunk.body}`)
          .digest("hex"),
      });
    } else if (location && !existing.locations.some((item) => item.href === location.href)) {
      existing.locations.push(location);
      existing.body = `${existing.body}\n\n${chunk.body}`;
      existing.tags = [...new Set([...existing.tags, ...chunk.tags])];
      existing.contentHash = createHash("sha256")
        .update(`${existing.title}\n${existing.excerpt ?? ""}\n${existing.body}`)
        .digest("hex");
    }
  }
  return [...groups.values()].map((candidate) => {
    candidate.locations.sort(
      (a, b) =>
        (b.score ?? 0) - (a.score ?? 0) || a.order - b.order || a.title.localeCompare(b.title)
    );
    return candidate;
  });
}

export function searchPlaybookCandidates(
  edition: PlaybookEdition,
  query: string,
  options: { limit: number; type?: "all" | PlaybookSearchType } = { limit: 20 }
): PlaybookSearchCandidate[] {
  const plan = parseSearchQuery(query);
  if (!plan.ast || plan.limitExceeded) return [];
  const terms = positiveSearchTerms(plan.ast);
  const groups = new Map<string, PlaybookSearchCandidate>();
  for (const chunk of chunksForEdition(edition)) {
    if (options.type && options.type !== "all" && chunk.type !== options.type) continue;
    if (!evaluateAst(chunk, plan.ast)) continue;
    const id = parentIdentity(edition, chunk.type, chunk.slug);
    const score = scoreAst(chunk, plan.ast);
    const href = playbookVersionHref(edition.edition, chunk.canonicalRoute);
    const location = chunk.location
      ? {
          ...chunk.location,
          score,
        }
      : undefined;
    const contentHash = createHash("sha256")
      .update(`${chunk.title}\n${chunk.excerpt ?? ""}\n${chunk.body}`)
      .digest("hex");
    const existing = groups.get(id);
    if (!existing) {
      groups.set(id, {
        id,
        source: "playbook",
        type: chunk.type,
        slug: chunk.slug,
        title: chunk.title,
        excerpt: chunk.excerpt,
        body: chunk.body,
        tags: chunk.tags,
        route: chunk.canonicalRoute,
        href,
        version: editionVersion(edition),
        score,
        locations: location ? [location] : [],
        edition: {
          edition: edition.edition.editionDigest,
          sourceReleaseId: edition.edition.source.releaseId,
          sourceTag: edition.edition.source.tag,
        },
        contentHash,
      });
      continue;
    }
    const previousScore = existing.score;
    existing.score = Math.max(previousScore, score);
    if (score > previousScore) {
      existing.body = chunk.body;
      existing.contentHash = contentHash;
    }
    if (location) {
      const duplicate = existing.locations.find(
        (item) => item.href === location.href && item.resourcePath === location.resourcePath
      );
      if (duplicate) duplicate.score = Math.max(duplicate.score ?? 0, score);
      else existing.locations.push(location);
    }
  }
  const ranked = [...groups.values()].map((candidate) => {
    candidate.locations.sort(
      (a, b) =>
        (b.score ?? 0) - (a.score ?? 0) || a.order - b.order || a.title.localeCompare(b.title)
    );
    const best = candidate.locations[0];
    return {
      ...candidate,
      href: best?.href ?? candidate.href,
      body: candidate.body,
      score: candidate.score,
      _snippet: snippet(candidate.body, query, terms),
    };
  });
  ranked.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  return ranked.slice(0, Math.max(0, options.limit)).map(({ _snippet, ...candidate }) => candidate);
}

export function playbookSearchResult(
  candidate: PlaybookSearchCandidate,
  query: string,
  searchOrigin: "keyword" | "ai" = "keyword"
) {
  const highlightTerms = positiveSearchTerms(parseSearchQuery(query).ast);
  const bestLocation = candidate.locations[0];
  return {
    slug: candidate.slug,
    title: candidate.title,
    excerpt: candidate.excerpt,
    snippet: snippet(candidate.body, query, highlightTerms),
    highlightTerms,
    type: candidate.type,
    source: "playbook" as const,
    edition: candidate.edition,
    href: bestLocation?.href ?? candidate.href,
    final: candidate.score,
    ...(bestLocation?.kind === "resource"
      ? { kind: "resource" as const, resourcePath: bestLocation.resourcePath }
      : {}),
    sections: candidate.locations.map((location) => ({
      href: location.href,
      title: location.title,
      snippet: location.snippet,
      score: candidate.score,
      order: location.order,
      ...(location.kind === "resource"
        ? { kind: "resource" as const, resourcePath: location.resourcePath }
        : {}),
    })),
    searchOrigin,
  };
}

export function playbookCandidateContext(
  candidate: PlaybookSearchCandidate,
  query: string,
  limit: number
) {
  const terms = positiveSearchTerms(parseSearchQuery(query).ast);
  const location = candidate.locations[0];
  return {
    id: candidate.id,
    source: candidate.source,
    type: candidate.type,
    edition: candidate.edition.edition,
    sourceReleaseId: candidate.edition.sourceReleaseId,
    sourceTag: candidate.edition.sourceTag,
    path: location?.resourcePath ?? candidate.route,
    location: location?.title ?? "content",
    title: candidate.title,
    content: `<untrusted-playbook-evidence source="public-edition" path="${location?.resourcePath ?? candidate.route}">\n${snippet(candidate.body, query, terms).slice(0, limit)}\n</untrusted-playbook-evidence>`,
  };
}

export function playbookCandidateKey(candidate: PlaybookSearchCandidate) {
  return candidate.id;
}
