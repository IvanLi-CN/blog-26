import { z } from "zod";

export const PLAYBOOK_REPOSITORY = "IvanLi-CN/style-playbook-skills";
export const PLAYBOOK_MAX_MANIFEST_BYTES = 64 * 1024;
export const PLAYBOOK_MAX_BUNDLE_BYTES = 64 * 1024 * 1024;
export const digestSchema = z.string().regex(/^[a-f0-9]{64}$/);
export const commitSchema = z.string().regex(/^[a-f0-9]{40}$/);
export const stableTagSchema = z.string().regex(/^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/);
export const slugSchema = z.string().regex(/^[a-z0-9][a-z0-9._-]*$/);
export const safePathSchema = z
  .string()
  .min(1)
  .refine(
    (path) =>
      !path.startsWith("/") &&
      !path.includes("\\") &&
      path.split("/").every((part) => part !== "" && part !== "." && part !== "..") &&
      ![...path].some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127),
    "Unsafe path"
  );

const text = z.string().max(16 * 1024 * 1024);
const nullableText = text.nullish();
const normalizedKey = (key: string) => key.replace(/[^a-z0-9]/giu, "").toLowerCase();
const credentialTerms = new Set([
  "auth",
  "authorization",
  "credential",
  "credentials",
  "password",
  "passwd",
  "secret",
  "token",
  "pat",
]);
function isCredentialKey(key: string) {
  const terms = key
    .replace(/([A-Z]+)([A-Z][a-z])/gu, "$1 $2")
    .replace(/([a-z0-9])([A-Z])/gu, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9]+/u);
  return (
    terms.some((term) => credentialTerms.has(term)) ||
    /(?:token|secret|password|passwd|credentials?|apikey|privatekey|authorization)$/u.test(
      normalizedKey(key)
    )
  );
}
const sectionSchema = z.strictObject({
  id: z
    .string()
    .min(1)
    .regex(/^[^/#\s]+$/u)
    .refine(
      (value) => ![...value].some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)
    ),
  title: text,
  markdown: text,
});
// Mirrors the upstream public metadata boundary; prose remains exporter-owned.
const privateMetadataKeys = new Set([
  "catalogcategories",
  "sourceurl",
  "repositoryurl",
  "repourl",
  "repopath",
  "checkoutpath",
  "managedcheckoutpath",
  "projectsmanifestdir",
  "manifestdir",
  "rawoutput",
  "rawexcerpt",
  "excerpt",
  "line",
  "sessionlog",
  "sessionlogpath",
  "stacktrace",
  "prompt",
  "finalmessage",
  "finalmessageexcerpt",
  "event",
  "events",
  "eventtype",
  "payloadjson",
  "threadid",
  "selectedproject",
  "selectedprojectslugs",
  "selectedreference",
  "selectedreferences",
  "messages",
  "errormessage",
  "metadata",
  "stdout",
  "stderr",
  "log",
  "logs",
  "code",
  "snippet",
  "rawcode",
  "sourcecode",
  "fingerprintdoc",
  "apikey",
  "accesstoken",
  "privatekey",
  "password",
  "secret",
]);
const metadataSchema = z.strictObject({
  key: text.refine(
    (key) => !privateMetadataKeys.has(normalizedKey(key)) && !isCredentialKey(key),
    "Internal metadata field"
  ),
  value: text,
});
const projectRefSchema = z.strictObject({ slug: slugSchema, name: text });
const projectSchema = z.strictObject({
  slug: slugSchema,
  name: text,
  description: nullableText,
  source: text,
  tags: z.array(text),
  snapshot_exists: z.boolean(),
  visibility: z.literal("public").nullable(),
  created_at: nullableText,
  updated_at: nullableText,
});
const topicSchema = z.strictObject({
  slug: slugSchema,
  token: text,
  description: nullableText,
  categories: z.array(text),
  project_count: z.number().int().nonnegative(),
  related_projects: z.array(projectRefSchema),
});
const resourceSchema = z.strictObject({ path: safePathSchema, kind: text, content: text });
const policySchema = z.strictObject({
  summary: z.strictObject({
    slug: slugSchema,
    name: text,
    description: text,
    primary_topic: slugSchema,
    policy_dependencies: z.array(slugSchema),
  }),
  frontmatter: z.record(z.string(), z.unknown()),
  instruction_markdown: text,
  resources: z.array(resourceSchema),
});
export const catalogSchema = z.strictObject({
  snapshot: z.strictObject({
    index: z.strictObject({
      generated_at: z.string().datetime({ offset: true }),
      project_count: z.number().int().nonnegative(),
      topic_count: z.number().int().nonnegative(),
    }),
    projects: z.array(projectSchema),
    topics: z.array(topicSchema),
  }),
  project_details: z.array(
    z.strictObject({
      item: projectSchema,
      title: text,
      doc_metadata: z.array(metadataSchema),
      stack: z.unknown(),
      sections: z.array(sectionSchema),
    })
  ),
  topic_details: z.array(
    z.strictObject({
      item: topicSchema,
      doc_metadata: z.array(metadataSchema),
      sections: z.array(sectionSchema),
      policy_skills: z.array(policySchema),
    })
  ),
});
export const searchSchema = z.strictObject({
  generated_at: z.string().datetime({ offset: true }),
  documents: z.array(
    z.strictObject({
      id: text.min(1),
      kind: z.enum(["command", "page", "section"]),
      title: text,
      subtitle: nullableText,
      body: text,
      route: text,
      section_id: nullableText,
      keywords: z.array(text),
      command_id: nullableText,
    })
  ),
});
export const sourceSchema = z.strictObject({
  repository: z.literal(PLAYBOOK_REPOSITORY),
  releaseId: z.string().regex(/^[1-9]\d*$/),
  tag: stableTagSchema,
  commit: commitSchema,
  publishedAt: z.string().datetime({ offset: true }),
});
export const bundleSchema = z.strictObject({
  name: z.literal("playbook-public.tar.gz"),
  sha256: digestSchema,
  size: z.number().int().positive().max(PLAYBOOK_MAX_BUNDLE_BYTES),
});
export const fileSchema = z.strictObject({
  path: safePathSchema,
  sha256: digestSchema,
  size: z
    .number()
    .int()
    .nonnegative()
    .max(32 * 1024 * 1024),
});
export const manifestSchema = z.strictObject({
  schemaVersion: z.literal(1),
  source: sourceSchema,
  bundle: bundleSchema,
  files: z.array(fileSchema).length(2),
});
export const editionSchema = z.strictObject({
  schemaVersion: z.literal(1),
  editionDigest: digestSchema,
  rendererCommit: commitSchema,
  contentSnapshotIdentity: digestSchema,
  source: sourceSchema,
  bundle: bundleSchema,
  files: z.array(fileSchema).length(3),
  generatedAt: z.string().datetime({ offset: true }),
  previous: z.strictObject({ tag: stableTagSchema, editionDigest: digestSchema }).optional(),
});

export function assertPublicCatalog(value: unknown) {
  const catalog = catalogSchema.parse(value);
  // Fixed objects are strict schemas; arbitrary public records share the metadata boundary.
  for (const project of catalog.project_details) rejectInternalFields(project.stack);
  for (const topic of catalog.topic_details)
    for (const policy of topic.policy_skills) rejectInternalFields(policy.frontmatter);
  unique(catalog.snapshot.projects.map((item) => item.slug));
  unique(catalog.snapshot.topics.map((item) => item.slug));
  unique(catalog.project_details.map((item) => item.item.slug));
  unique(catalog.topic_details.map((item) => item.item.slug));
  if (
    catalog.snapshot.index.project_count !== catalog.snapshot.projects.length ||
    catalog.snapshot.index.topic_count !== catalog.snapshot.topics.length
  )
    throw new Error("Catalog counts do not match");
  const projects = new Map(catalog.snapshot.projects.map((item) => [item.slug, item]));
  const topics = new Map(catalog.snapshot.topics.map((item) => [item.slug, item]));
  if (
    catalog.project_details.length !== projects.size ||
    catalog.topic_details.length !== topics.size
  )
    throw new Error("Catalog details are incomplete");
  for (const detail of catalog.project_details) {
    if (JSON.stringify(projects.get(detail.item.slug)) !== JSON.stringify(detail.item))
      throw new Error("Project detail identity mismatch");
    unique(detail.sections.map((section) => section.id));
  }
  const policies = catalog.topic_details.flatMap((detail) => detail.policy_skills);
  unique(policies.map((policy) => policy.summary.slug));
  const policySlugs = new Set(policies.map((policy) => policy.summary.slug));
  for (const detail of catalog.topic_details) {
    if (JSON.stringify(topics.get(detail.item.slug)) !== JSON.stringify(detail.item))
      throw new Error("Topic detail identity mismatch");
    unique(detail.sections.map((section) => section.id));
    unique(detail.item.related_projects.map((project) => project.slug));
    if (
      detail.item.project_count !== detail.item.related_projects.length ||
      detail.item.related_projects.some(
        (project) => projects.get(project.slug)?.name !== project.name
      )
    )
      throw new Error("Topic has invalid project references");
    for (const policy of detail.policy_skills) {
      if (policy.frontmatter.visibility !== "public")
        throw new Error("Non-public policy in public catalog");
      if (
        policy.summary.primary_topic !== detail.item.slug ||
        policy.summary.policy_dependencies.some((slug) => !policySlugs.has(slug))
      )
        throw new Error("Policy has invalid public dependencies");
      unique(policy.resources.map((resource) => resource.path));
      if (
        policy.resources.some(
          (resource) =>
            resource.path === "SKILL.md" ||
            resource.path.startsWith("SKILL.md/") ||
            policy.resources.some((other) => other.path.startsWith(`${resource.path}/`))
        )
      )
        throw new Error("Policy resource path collision");
    }
  }
  return catalog;
}

function unique(values: string[]) {
  if (new Set(values).size !== values.length) throw new Error("Duplicate playbook identity");
}

const internalRecordKeys = new Set([
  "repopath",
  "snapshotdoc",
  "fingerprintdoc",
  "packagepath",
  "latestgeneration",
  "relatedgenerations",
  "generationruns",
  "threadid",
  "apikey",
  "accesstoken",
  "privatekey",
  "password",
  "secret",
]);

function rejectInternalFields(value: unknown) {
  if (!value || typeof value !== "object") return;
  for (const [key, nested] of Object.entries(value)) {
    if (
      internalRecordKeys.has(normalizedKey(key)) ||
      privateMetadataKeys.has(normalizedKey(key)) ||
      isCredentialKey(key)
    )
      throw new Error(`Internal field in public playbook: ${key}`);
    rejectInternalFields(nested);
  }
}
