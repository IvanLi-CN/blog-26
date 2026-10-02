import type { PlaybookPublicCatalog, PlaybookSearchPayload } from "./types";

export function playbookHref(route: string, sectionId?: string | null) {
  const [pathname, anchor] = route.split("#");
  const match = pathname.match(
    /^\/(?:playbook\/)?(topics|projects|policies)(?:\/([a-z0-9][a-z0-9._-]*))?\/?$/u
  );
  if (!match) throw new Error(`Unsupported public playbook route: ${route}`);
  const id = sectionId || (anchor ? decodeURIComponent(anchor) : undefined);
  return `/playbook/${match[1]}/${match[2] ? `${match[2]}/` : ""}${id ? `#${encodeURIComponent(id)}` : ""}`;
}

export function normalizePlaybookSearch(
  catalog: PlaybookPublicCatalog,
  payload: PlaybookSearchPayload
): PlaybookSearchPayload {
  const documents = payload.documents.map((document) => ({
    ...document,
    route: validatePlaybookSearchRoute(catalog, document),
  }));
  if (new Set(documents.map((document) => document.id)).size !== documents.length)
    throw new Error("Duplicate search document identity");
  for (const policy of catalog.topic_details.flatMap((topic) => topic.policy_skills)) {
    const document: PlaybookSearchPayload["documents"][number] = {
      id: `policy:${policy.summary.slug}`,
      kind: "page",
      title: policy.summary.name,
      subtitle: policy.summary.description,
      body: policy.instruction_markdown,
      route: `/playbook/policies/${policy.summary.slug}/`,
      keywords: [policy.summary.slug, policy.summary.primary_topic],
      section_id: null,
      command_id: null,
    };
    const existing = documents.findIndex((entry) => entry.id === document.id);
    if (existing === -1) documents.push(document);
    else {
      const entry = documents[existing];
      if (entry.kind !== "page" || entry.route !== document.route || entry.section_id)
        throw new Error("Conflicting Policy search identity");
      // Always index the complete catalog instruction, even when upstream supplies a summary.
      documents[existing] = document;
    }
  }
  return { generated_at: payload.generated_at, documents };
}

export function validatePlaybookSearchRoute(
  catalog: PlaybookPublicCatalog,
  document: PlaybookSearchPayload["documents"][number]
) {
  const href = playbookHref(document.route, document.section_id);
  const [pathname, anchor] = href.split("#");
  const [, , group, slug] = pathname.split("/");
  const detail =
    group === "topics"
      ? catalog.topic_details.find((entry) => entry.item.slug === slug)
      : group === "projects"
        ? catalog.project_details.find((entry) => entry.item.slug === slug)
        : getPlaybookPolicies(catalog).find((entry) => entry.summary.slug === slug);
  if (slug && !detail) throw new Error("Search references a non-public object");
  if (anchor) {
    const id = decodeURIComponent(anchor);
    const valid =
      detail &&
      ("sections" in detail
        ? detail.sections.some((section) => section.id === id)
        : id === "installation" || (id === "resources" && detail.resources.length > 0));
    if (!valid) throw new Error("Search references an unknown section");
  }
  return href;
}

export function getPlaybookPolicies(catalog: PlaybookPublicCatalog) {
  return catalog.topic_details.flatMap((topic) => topic.policy_skills);
}

export function rewritePlaybookMarkdown(
  markdown: string,
  resourceBase?: string,
  resourceHref?: (path: string) => string
) {
  return markdown.replace(
    /(\]\()([^\s)]+)([^)]*\))/gu,
    (_whole, start: string, href: string, end: string) => {
      return `${start}${rewritePlaybookUrl(href, resourceBase, resourceHref)}${end}`;
    }
  );
}

export function rewritePlaybookUrl(
  url: string,
  resourceBase?: string,
  resourceHref?: (path: string) => string
) {
  if (/^\/(topics|projects|policies)(\/|$)/u.test(url)) return playbookHref(url);
  if (resourceBase && !/^(?:[a-z][a-z0-9+.-]*:|\/|#)/iu.test(url)) {
    const clean = url.replace(/^\.\//u, "");
    if (!clean.split("/").some((part) => part === ".."))
      return resourceHref
        ? resourceHref(clean)
        : `${resourceBase}${clean.split("/").map(encodeURIComponent).join("/")}`;
  }
  return url;
}
