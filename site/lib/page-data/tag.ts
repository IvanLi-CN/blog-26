import { buildTagHref, readTagRoutePath } from "@/lib/tag-href";
import { getProjectBySlug } from "../projects";
import { getSnapshot, pickTagIconSvg } from "../public-site";
import type { PageContext } from "../route-data-utils";
import { PublicRouteNotFound, timelinePreviews } from "../route-data-utils";
import { toPublicSitePath } from "../runtime-urls";
export async function loadtag(Astro: PageContext) {
  const snapshot = await getSnapshot();
  const summaryFromProps = (Astro.props as { summary?: (typeof snapshot.tags.summaries)[number] })
    .summary;
  const tagPath = readTagRoutePath(Astro.url.pathname, toPublicSitePath("/tags") ?? "/tags");
  const summary =
    summaryFromProps ??
    snapshot.tags.summaries.find(
      (candidate) => candidate.segments.join("/") === tagPath || candidate.name === tagPath
    );
  if (!summary) throw new PublicRouteNotFound();
  const items = timelinePreviews(snapshot.tags.timelines[summary.name] ?? []);
  const projects = (snapshot.tags.projectsByTag?.[summary.name] ?? []).flatMap((slug) => {
    const project = getProjectBySlug(slug);
    return project ? [project] : [];
  });
  const breadcrumbs = summary.segments.map((segment, index) => ({
    label: segment,
    href: toPublicSitePath(buildTagHref(summary.segments.slice(0, index + 1).join("/"))),
  }));
  const { iconId, iconSvg } = pickTagIconSvg(
    summary.name,
    snapshot.tags.tagIconMap,
    snapshot.tags.tagIconSvgMap
  );
  return { summaryFromProps, tagPath, summary, items, projects, breadcrumbs, iconId, iconSvg };
}
