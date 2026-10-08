import { getProjectContentMetadata } from "../project-content";
import {
  getProjectBySlug,
  getProjectCanonicalUrl,
  getProjectDomainDefinition,
  getProjectPublicEntries,
  resolveProjectRelatedEntries,
} from "../projects";
import { getSnapshot } from "../public-site";
import type { PageContext } from "../route-data-utils";
import { PublicRouteNotFound, trimRouteSnapshot } from "../route-data-utils";
export async function loadproject(Astro: PageContext) {
  const slug = (Astro.props as { slug?: string }).slug ?? Astro.params.slug ?? "";
  const project = getProjectBySlug(slug);
  if (!project) throw new PublicRouteNotFound();
  const snapshot = await getSnapshot();
  const domain = getProjectDomainDefinition(project.domain);
  const relatedEntries = resolveProjectRelatedEntries(snapshot, project.relatedEntries);
  const publicEntries = getProjectPublicEntries(project);
  const body = getProjectContentMetadata(project.slug);
  const detailBody = body
    ? { kind: "mdx" as const, body }
    : {
        kind: "catalog" as const,
        description: project.description,
        highlights: project.highlights,
      };
  const canonicalUrl = getProjectCanonicalUrl(project.slug);
  const heroSummary = project.heroSummary ?? project.description;
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "CreativeWork",
    name: project.title,
    description: heroSummary,
    url: canonicalUrl,
    isPartOf: { "@type": "WebSite", name: snapshot.site.title, url: snapshot.site.url },
    keywords: project.techTags.join(", "),
    sameAs: publicEntries.map((entry) => entry.href),
  };
  return {
    slug,
    project,
    snapshot: trimRouteSnapshot(snapshot, "project", Astro.url.pathname),
    domain,
    relatedEntries,
    publicEntries,
    detailBody:
      detailBody.kind === "mdx"
        ? { kind: "mdx" as const, body: { toc: detailBody.body.toc } }
        : detailBody,
    canonicalUrl,
    heroSummary,
    structuredData,
  };
}
