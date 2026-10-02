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
  const documents = payload.documents.map((document) => {
    const href = playbookHref(document.route);
    const parts = href.split("/");
    const detail =
      parts[2] === "topics"
        ? catalog.topic_details.find((item) => item.item.slug === parts[3])
        : catalog.project_details.find((item) => item.item.slug === parts[3]);
    if (parts[3] && !detail) throw new Error("Search references a non-public object");
    if (
      document.section_id &&
      !detail?.sections.some((section) => section.id === document.section_id)
    )
      throw new Error("Search references an unknown section");
    return { ...document, route: href };
  });
  for (const policy of catalog.topic_details.flatMap((topic) => topic.policy_skills)) {
    documents.push({
      id: `policy:${policy.summary.slug}`,
      kind: "page",
      title: policy.summary.name,
      subtitle: policy.summary.description,
      body: policy.instruction_markdown,
      route: `/playbook/policies/${policy.summary.slug}/`,
      keywords: [policy.summary.slug, policy.summary.primary_topic],
      section_id: null,
      command_id: null,
    });
  }
  if (new Set(documents.map((document) => document.id)).size !== documents.length)
    throw new Error("Duplicate search document identity");
  return { generated_at: payload.generated_at, documents };
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
