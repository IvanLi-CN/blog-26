export type PlaybookSearchDocumentKind = "command" | "page" | "section";

export interface PlaybookDocSection {
  id: string;
  title: string;
  markdown: string;
}

export interface PlaybookDocMetadataField {
  key: string;
  value: string;
}

export interface PlaybookTopicProjectRef {
  slug: string;
  name: string;
}

export interface PlaybookPolicySkillSummary {
  slug: string;
  name: string;
  description: string;
  primary_topic: string;
  policy_dependencies: string[];
}

export interface PlaybookPolicySkillResource {
  path: string;
  kind: string;
  content: string;
}

export interface PlaybookPolicySkillDetail {
  summary: PlaybookPolicySkillSummary;
  frontmatter: Record<string, unknown>;
  instruction_markdown: string;
  resources: PlaybookPolicySkillResource[];
}

export interface PlaybookPublicProjectListItem {
  slug: string;
  name: string;
  description?: string | null;
  source: string;
  tags: string[];
  snapshot_exists: boolean;
  catalog_visibility: "public";
  source_visibility: "public" | "private";
  created_at?: string | null;
  updated_at?: string | null;
}

export interface PlaybookPublicTopicListItem {
  slug: string;
  token: string;
  description?: string | null;
  categories: string[];
  project_count: number;
  related_projects: PlaybookTopicProjectRef[];
  catalog_visibility: "public";
}

export interface PlaybookPublicProjectDetail {
  item: PlaybookPublicProjectListItem;
  title: string;
  doc_metadata: PlaybookDocMetadataField[];
  stack: unknown;
  preamble: string;
  sections: PlaybookDocSection[];
}

export interface PlaybookPublicTopicDetail {
  item: PlaybookPublicTopicListItem;
  doc_metadata: PlaybookDocMetadataField[];
  preamble: string;
  sections: PlaybookDocSection[];
  policy_skills: PlaybookPolicySkillDetail[];
}

export interface PlaybookPublicCatalog {
  snapshot: {
    index: { generated_at: string; project_count: number; topic_count: number };
    projects: PlaybookPublicProjectListItem[];
    topics: PlaybookPublicTopicListItem[];
  };
  project_details: PlaybookPublicProjectDetail[];
  topic_details: PlaybookPublicTopicDetail[];
}

export interface PlaybookSearchDocument {
  id: string;
  kind: PlaybookSearchDocumentKind;
  title: string;
  subtitle?: string | null;
  body: string;
  route: string;
  section_id?: string | null;
  keywords: string[];
  command_id?: string | null;
}

export interface PlaybookSearchPayload {
  generated_at: string;
  documents: PlaybookSearchDocument[];
}

export interface PlaybookSupplementProjectListItem {
  slug: string;
  name: string;
  description?: string | null;
  source: string;
  tags: string[];
  snapshot_exists: boolean;
  catalog_visibility: "private";
  source_visibility: "public" | "private";
  created_at?: string | null;
  updated_at?: string | null;
}

export interface PlaybookSupplementTopicListItem {
  slug: string;
  token: string;
  description?: string | null;
  categories: string[];
  project_count: number;
  related_projects: PlaybookTopicProjectRef[];
  catalog_visibility: "private";
}

export interface PlaybookSupplementProjectDetail {
  item: PlaybookSupplementProjectListItem;
  title: string;
  doc_metadata: PlaybookDocMetadataField[];
  stack: unknown;
  preamble: string;
  sections: PlaybookDocSection[];
}

export interface PlaybookSupplementTopicDetail {
  item: PlaybookSupplementTopicListItem;
  doc_metadata: PlaybookDocMetadataField[];
  preamble: string;
  sections: PlaybookDocSection[];
}

export interface PlaybookSupplementCatalog {
  snapshot: {
    index: { generated_at: string; project_count: number; topic_count: number };
    projects: PlaybookSupplementProjectListItem[];
    topics: PlaybookSupplementTopicListItem[];
  };
  project_details: PlaybookSupplementProjectDetail[];
  topic_details: PlaybookSupplementTopicDetail[];
  private_source_metadata: {
    project_slug: string;
    source: string;
    source_visibility: "private";
  }[];
  relation_edges: { topic_slug: string; project_slug: string; project_name: string }[];
}

export interface PlaybookSupplement {
  catalog: PlaybookSupplementCatalog;
  search: PlaybookSearchPayload;
}

export interface PlaybookSourceIdentity {
  repository: string;
  releaseId: string;
  tag: string;
  commit: string;
  publishedAt: string;
}

export interface PlaybookBundleIdentity {
  name: string;
  sha256: string;
  size: number;
}

export interface PlaybookManifestFile {
  path: string;
  sha256: string;
  size: number;
}

export interface PlaybookManifest {
  schemaVersion: 1;
  source: PlaybookSourceIdentity;
  bundle: PlaybookBundleIdentity;
  files: PlaybookManifestFile[];
}

export interface PlaybookEditionIdentity {
  schemaVersion: 1;
  editionDigest: string;
  rendererCommit: string;
  contentSnapshotIdentity: string;
  source: PlaybookSourceIdentity;
  bundle: PlaybookBundleIdentity;
  files: PlaybookManifestFile[];
  generatedAt: string;
  previous?: { tag: string; editionDigest: string };
}

export interface PlaybookEdition {
  edition: PlaybookEditionIdentity;
  catalog: PlaybookPublicCatalog;
  search: PlaybookSearchPayload;
  legacyCatalog?: boolean;
  legacyRawFiles?: { catalog: string; search: string };
}

export interface PlaybookSupplementEnvelope extends PlaybookSupplement {
  manifest: PlaybookManifest;
}

export type PlaybookAdminProjectListItem =
  | PlaybookPublicProjectListItem
  | PlaybookSupplementProjectListItem;
export type PlaybookAdminTopicListItem =
  | PlaybookPublicTopicListItem
  | PlaybookSupplementTopicListItem;
export type PlaybookAdminProjectDetail =
  | PlaybookPublicProjectDetail
  | PlaybookSupplementProjectDetail;
export type PlaybookAdminTopicDetail = PlaybookPublicTopicDetail | PlaybookSupplementTopicDetail;

export interface PlaybookAdminCatalog {
  snapshot: {
    index: { generated_at: string; project_count: number; topic_count: number };
    projects: PlaybookAdminProjectListItem[];
    topics: PlaybookAdminTopicListItem[];
  };
  project_details: PlaybookAdminProjectDetail[];
  topic_details: PlaybookAdminTopicDetail[];
  private_source_metadata: PlaybookSupplementCatalog["private_source_metadata"];
  relation_edges: PlaybookSupplementCatalog["relation_edges"];
}

export interface PlaybookAdminEdition {
  edition: PlaybookEditionIdentity;
  catalog: PlaybookAdminCatalog;
  search: PlaybookSearchPayload;
  supplement?: PlaybookSupplementEnvelope;
}
