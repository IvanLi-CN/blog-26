import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { parseSupplementFiles, readSupplementArchive } from "./bundle";
import {
  decodePlaybookRawFiles,
  decodeUtf8,
  encodeJson,
  encodePlaybookRawFiles,
  parseJson,
  parseManifest,
  verifyFile,
} from "./manifest";
import { playbookHref } from "./navigation";
import {
  assertPublicRelationIndex,
  assertSupplementCatalog,
  type PlaybookPublicRelationIndex,
  relationEdgeSchema,
  searchSchema,
} from "./schema";
import type {
  PlaybookAdminCatalog,
  PlaybookAdminEdition,
  PlaybookAdminTopicDetail,
  PlaybookEdition,
  PlaybookPublicCatalog,
  PlaybookSearchDocument,
  PlaybookSupplement,
  PlaybookSupplementEnvelope,
  PlaybookSupplementSeed,
} from "./types";

export function parseSupplementSyncEndpoint(value: string): URL {
  let endpoint: URL;
  try {
    endpoint = new URL(value);
  } catch {
    throw new Error("Playbook supplement sync URL must be a valid HTTPS URL");
  }
  if (
    endpoint.protocol !== "https:" ||
    endpoint.username ||
    endpoint.password ||
    endpoint.search ||
    endpoint.hash
  )
    throw new Error("Playbook supplement sync URL must be a credential-free HTTPS URL");
  return endpoint;
}

export function validatePlaybookSupplement(
  value: unknown,
  rawFiles?: ReadonlyMap<string, Uint8Array>,
  publicRelationIndex?: PlaybookPublicRelationIndex
): PlaybookSupplementEnvelope {
  if (!value || typeof value !== "object") throw new Error("Invalid Playbook supplement envelope");
  const input = value as Record<string, unknown>;
  const manifest = parseManifest(input.manifest, "supplement");
  const catalog = assertSupplementCatalog(input.catalog);
  if (publicRelationIndex)
    assertSupplementRelationBoundary(catalog, assertPublicRelationIndex(publicRelationIndex));
  const search = searchSchema.parse(input.search);
  const embeddedRawFiles =
    input.rawFiles === undefined ? undefined : decodePlaybookRawFiles(input.rawFiles);
  const verifiedRawFiles = rawFiles ?? embeddedRawFiles;
  // Archive readers verify the original bytes. A parsed seed is a derived object
  // and must not be reserialized before comparing it with the upstream digest.
  if (verifiedRawFiles) {
    const catalogBytes = verifiedRawFiles.get("catalog.json");
    const searchBytes = verifiedRawFiles.get("search-documents.json");
    if (!catalogBytes || !searchBytes) throw new Error("Supplement data files are incomplete");
    verifyFile(catalogBytes, manifest.files[0]);
    verifyFile(searchBytes, manifest.files[1]);
    const decodedCatalog = parseJson(decodeUtf8(catalogBytes, "Supplement catalog"));
    const decodedSearch = parseJson(decodeUtf8(searchBytes, "Supplement search"));
    if (encodeJson(decodedCatalog) !== encodeJson(catalog))
      throw new Error("Supplement catalog projection does not match package bytes");
    if (encodeJson(decodedSearch) !== encodeJson(search))
      throw new Error("Supplement search projection does not match package bytes");
  }
  assertUniqueSearchIds(search.documents);
  return { manifest, catalog, search };
}

export function publicRelationIndexFromCatalog(
  catalog: PlaybookPublicCatalog
): PlaybookPublicRelationIndex {
  return assertPublicRelationIndex({
    projects: catalog.snapshot.projects.map(({ slug, name }) => ({ slug, name })),
    topics: catalog.snapshot.topics.map(({ slug, related_projects }) => ({
      slug,
      related_projects,
    })),
  });
}

function assertSupplementRelationBoundary(
  catalog: PlaybookSupplementEnvelope["catalog"],
  publicRelationIndex: PlaybookPublicRelationIndex
) {
  const supplementProjects = new Map(
    catalog.snapshot.projects.map((project) => [project.slug, project])
  );
  const supplementTopics = new Map(catalog.snapshot.topics.map((topic) => [topic.slug, topic]));
  const publicProjects = new Map(
    publicRelationIndex.projects.map((project) => [project.slug, project])
  );
  const publicTopics = new Map(publicRelationIndex.topics.map((topic) => [topic.slug, topic]));
  for (const slug of supplementProjects.keys()) {
    if (publicProjects.has(slug)) throw new Error("Supplement duplicates a public project");
  }
  for (const slug of supplementTopics.keys()) {
    if (publicTopics.has(slug)) throw new Error("Supplement duplicates a public topic");
  }

  const projectBySlug = new Map([...publicProjects, ...supplementProjects]);
  const topicBySlug = new Map([...publicTopics, ...supplementTopics]);
  const edgeKeys = new Set(
    catalog.relation_edges.map((edge) => `${edge.topic_slug}\0${edge.project_slug}`)
  );
  for (const topic of catalog.snapshot.topics) {
    for (const project of topic.related_projects) {
      const resolved = projectBySlug.get(project.slug);
      if (!resolved) throw new Error("Supplement topic references an unknown project");
      if (resolved.name !== project.name) throw new Error("Supplement topic project name mismatch");
      if (!edgeKeys.has(`${topic.slug}\0${project.slug}`))
        throw new Error("Supplement relation edges are incomplete");
    }
  }
  for (const edge of catalog.relation_edges) {
    const topic = topicBySlug.get(edge.topic_slug);
    const project = projectBySlug.get(edge.project_slug);
    if (!topic || !project) throw new Error("Supplement relation references an unknown object");
    if (project.name !== edge.project_name)
      throw new Error("Supplement relation has a conflicting project name");
    const topicIsSupplement = supplementTopics.has(edge.topic_slug);
    const projectIsSupplement = supplementProjects.has(edge.project_slug);
    if (!topicIsSupplement && !projectIsSupplement)
      throw new Error("Supplement relation is not an overlay edge");
    if (topicIsSupplement) {
      const relatedProject = topic.related_projects.find(
        (related) => related.slug === edge.project_slug
      );
      if (!relatedProject || relatedProject.name !== edge.project_name)
        throw new Error("Supplement relation does not match Topic related_projects");
    }
  }
}

export function validatePlaybookSupplementSeed(value: unknown): PlaybookSupplementSeed {
  if (!value || typeof value !== "object") throw new Error("Invalid Playbook supplement seed");
  const rawFiles = decodePlaybookRawFiles((value as Record<string, unknown>).rawFiles);
  return {
    ...validatePlaybookSupplement(value, rawFiles),
    rawFiles: encodePlaybookRawFiles(rawFiles),
  };
}

export async function readPlaybookSupplement(
  root: string,
  expectedSourceTimestamp?: number
): Promise<PlaybookSupplementSeed> {
  const manifest = parseManifest(
    parseJson(
      decodeUtf8(
        await readFile(join(root, "playbook-private-supplement-manifest.json")),
        "Supplement manifest"
      )
    ),
    "supplement"
  );
  const archive = await readFile(join(root, manifest.bundle.name));
  const files = readSupplementArchive(archive, manifest, expectedSourceTimestamp);
  const parsed: PlaybookSupplement = parseSupplementFiles(files);
  return {
    ...validatePlaybookSupplement({ manifest, ...parsed }, files),
    rawFiles: encodePlaybookRawFiles(files),
  };
}

export function mergePlaybookSupplement(
  edition: PlaybookEdition,
  supplement?: PlaybookSupplementEnvelope
): PlaybookAdminEdition {
  if (!supplement) {
    return {
      edition: edition.edition,
      catalog: publicAdminCatalog(edition),
      search: edition.search,
    };
  }
  if (!samePlaybookSource(edition.edition.source, supplement.manifest.source))
    throw new Error("Playbook supplement source identity mismatch");

  const publicCatalog = publicAdminCatalog(edition);
  const publicProjectSlugs = new Set(publicCatalog.snapshot.projects.map((item) => item.slug));
  const publicTopicSlugs = new Set(publicCatalog.snapshot.topics.map((item) => item.slug));
  if (supplement.catalog.snapshot.projects.some((item) => publicProjectSlugs.has(item.slug)))
    throw new Error("Supplement duplicates a public project");
  if (supplement.catalog.snapshot.topics.some((item) => publicTopicSlugs.has(item.slug)))
    throw new Error("Supplement duplicates a public topic");

  const projects = [...publicCatalog.snapshot.projects, ...supplement.catalog.snapshot.projects];
  const topics = [...publicCatalog.snapshot.topics, ...supplement.catalog.snapshot.topics];
  const projectBySlug = new Map(projects.map((item) => [item.slug, item]));
  const topicBySlug = new Map(topics.map((item) => [item.slug, item]));
  const relations = supplement.catalog.relation_edges.map((edge) => relationEdgeSchema.parse(edge));
  const relationByTopic = new Map<string, Map<string, string>>();
  for (const edge of relations) {
    if (!topicBySlug.has(edge.topic_slug) || !projectBySlug.has(edge.project_slug))
      throw new Error("Supplement relation references an unknown object");
    const topicRelations = relationByTopic.get(edge.topic_slug) ?? new Map<string, string>();
    const previousName = topicRelations.get(edge.project_slug);
    if (previousName && previousName !== edge.project_name)
      throw new Error("Supplement relation has conflicting project names");
    topicRelations.set(edge.project_slug, edge.project_name);
    relationByTopic.set(edge.topic_slug, topicRelations);
  }

  const mergedTopics = topics.map((topic) => {
    const overlay = relationByTopic.get(topic.slug);
    if (!overlay) return topic;
    const related = [...topic.related_projects];
    for (const [projectSlug, projectName] of overlay) {
      const existing = related.find((project) => project.slug === projectSlug);
      if (existing && existing.name !== projectName)
        throw new Error("Supplement relation has conflicting project names");
      if (!existing) related.push({ slug: projectSlug, name: projectName });
    }
    return { ...topic, related_projects: related, project_count: related.length };
  });
  const mergedTopicBySlug = new Map(mergedTopics.map((topic) => [topic.slug, topic]));
  const projectDetails = [
    ...publicCatalog.project_details,
    ...supplement.catalog.project_details,
  ].map((detail) => {
    const item = projectBySlug.get(detail.item.slug);
    if (!item) throw new Error("Supplement project detail references an unknown project");
    return { ...detail, item };
  });
  const topicDetails = [...publicCatalog.topic_details, ...supplement.catalog.topic_details].map(
    (detail) => {
      const item = mergedTopicBySlug.get(detail.item.slug);
      if (!item) throw new Error("Supplement topic detail references an unknown topic");
      return { ...detail, item } as PlaybookAdminTopicDetail;
    }
  );
  const catalog: PlaybookAdminCatalog = {
    snapshot: {
      index: {
        generated_at: publicCatalog.snapshot.index.generated_at,
        project_count: projects.length,
        topic_count: mergedTopics.length,
      },
      projects,
      topics: mergedTopics,
    },
    project_details: projectDetails,
    topic_details: topicDetails,
    private_source_metadata: supplement.catalog.private_source_metadata,
    relation_edges: relations,
  };
  validateAdminCatalog(catalog);
  const search = {
    generated_at: edition.search.generated_at,
    documents: [...edition.search.documents, ...supplement.search.documents],
  };
  assertUniqueSearchIds(search.documents);
  for (const document of search.documents) validateAdminSearchRoute(catalog, document);
  return { edition: edition.edition, catalog, search, supplement };
}

export function searchPlaybookAdmin(edition: PlaybookAdminEdition, query: string, limit = 50) {
  const terms = query.trim().toLocaleLowerCase().split(/\s+/u).filter(Boolean);
  const boundedLimit = Math.max(1, Math.min(limit, 100));
  const scored = edition.search.documents
    .map((document) => ({ document, score: scoreDocument(document, terms) }))
    .filter(({ score }) => terms.length === 0 || score > 0)
    .sort(
      (left, right) => right.score - left.score || left.document.id.localeCompare(right.document.id)
    );
  return scored.slice(0, boundedLimit).map(({ document, score }) => ({ document, score }));
}

function publicAdminCatalog(edition: PlaybookEdition): PlaybookAdminCatalog {
  return {
    snapshot: edition.catalog.snapshot,
    project_details: edition.catalog.project_details,
    topic_details: edition.catalog.topic_details,
    private_source_metadata: [],
    relation_edges: [],
  };
}

export function samePlaybookSource(
  a: PlaybookEdition["edition"]["source"],
  b: PlaybookSupplementEnvelope["manifest"]["source"]
) {
  return encodeJson(a) === encodeJson(b);
}

function assertUniqueSearchIds(documents: PlaybookSearchDocument[]) {
  if (new Set(documents.map((document) => document.id)).size !== documents.length)
    throw new Error("Duplicate search document identity");
}

function validateAdminCatalog(catalog: PlaybookAdminCatalog) {
  const projects = new Map(catalog.snapshot.projects.map((item) => [item.slug, item]));
  const topics = new Map(catalog.snapshot.topics.map((item) => [item.slug, item]));
  if (
    catalog.snapshot.index.project_count !== projects.size ||
    catalog.snapshot.index.topic_count !== topics.size
  )
    throw new Error("Admin catalog counts do not match");
  for (const topic of catalog.snapshot.topics) {
    if (
      topic.project_count !== topic.related_projects.length ||
      topic.related_projects.some((project) => projects.get(project.slug)?.name !== project.name)
    )
      throw new Error("Admin topic has invalid project references");
  }
  for (const metadata of catalog.private_source_metadata) {
    if (!projects.has(metadata.project_slug))
      throw new Error("Private source metadata references an unknown project");
    const project = projects.get(metadata.project_slug);
    if (project?.source_visibility !== "private")
      throw new Error("Private source metadata has a non-private project");
  }
  for (const detail of catalog.project_details) {
    if (projects.get(detail.item.slug) !== detail.item)
      throw new Error("Admin project detail mismatch");
  }
  for (const detail of catalog.topic_details) {
    if (topics.get(detail.item.slug) !== detail.item)
      throw new Error("Admin topic detail mismatch");
  }
}

function validateAdminSearchRoute(catalog: PlaybookAdminCatalog, document: PlaybookSearchDocument) {
  const href = playbookHref(document.route, document.section_id);
  const [pathname, anchor] = href.split("#");
  const [, , group, slug] = pathname.split("/");
  const detail =
    group === "topics"
      ? catalog.topic_details.find((entry) => entry.item.slug === slug)
      : group === "projects"
        ? catalog.project_details.find((entry) => entry.item.slug === slug)
        : catalog.topic_details
            .filter((entry) => "policy_skills" in entry)
            .flatMap((entry) => ("policy_skills" in entry ? entry.policy_skills : []))
            .find((entry) => entry.summary.slug === slug);
  if (slug && !detail) throw new Error("Search references an unknown admin object");
  if (anchor) {
    const id = decodeURIComponent(anchor);
    const valid =
      detail &&
      ("sections" in detail
        ? detail.sections.some((section) => section.id === id)
        : id === "installation" || (id === "resources" && detail.resources.length > 0));
    if (!valid) throw new Error("Search references an unknown section");
  }
}

function scoreDocument(document: PlaybookSearchDocument, terms: string[]) {
  if (terms.length === 0) return 0;
  const haystack = [document.title, document.subtitle ?? "", document.body, ...document.keywords]
    .join(" ")
    .toLocaleLowerCase();
  return terms.reduce((score, term) => score + (haystack.includes(term) ? 1 : 0), 0);
}
