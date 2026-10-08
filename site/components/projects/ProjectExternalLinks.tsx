import Icon from "@/components/ui/Icon";
import type { ProjectExternalLink, ProjectPublicEntry } from "../../lib/projects";

interface Props {
  links?: readonly ProjectExternalLink[];
  entries?: readonly ProjectPublicEntry[];
  compact?: boolean;
  dense?: boolean;
  iconOnly?: boolean;
  adaptive?: boolean;
}
export default function ProjectExternalLinks(props: Props) {
  const {
    links,
    entries,
    compact = false,
    dense = false,
    iconOnly = false,
    adaptive = false,
  } = props;
  const linkMeta: Record<string, { icon: string; label: string; shortLabel: string }> = {
    github: { icon: "tabler:brand-github", label: "GitHub", shortLabel: "源码" },
    docs: { icon: "tabler:book-2", label: "Docs", shortLabel: "文档" },
    demo: { icon: "tabler:window-maximize", label: "Demo", shortLabel: "演示" },
    site: { icon: "tabler:world", label: "Site", shortLabel: "站点" },
    officialDocs: { icon: "tabler:book-2", label: "官方文档", shortLabel: "文档" },
    repository: { icon: "tabler:brand-github", label: "开源仓库", shortLabel: "源码" },
  };
  const renderedLinks = entries ?? links ?? [];
  return (
    <>
      {renderedLinks.length > 0 && (
        <div
          className={`project-external-links flex flex-wrap ${dense ? "gap-1.5" : "gap-2"} ${compact ? "pt-1" : "pt-2"}`}
          data-project-external-links=""
          data-adaptive={adaptive ? "true" : "false"}
          data-compact={adaptive ? "false" : undefined}
        >
          {renderedLinks.map((link) => {
            const meta = linkMeta[link.kind];
            const accessibleLabel = "label" in link ? link.label || meta.label : meta.label;
            return (
              <a
                key={link.href}
                href={link.href}
                target="_blank"
                rel="noreferrer"
                title={accessibleLabel}
                aria-label={accessibleLabel}
                data-project-external-link=""
                className={`nature-button ${
                  iconOnly || link.kind === "github"
                    ? "nature-button-ghost"
                    : "nature-button-outline"
                } ${iconOnly ? "project-external-link-icon" : dense ? "min-h-8 px-3 py-1.5 text-[0.76rem]" : compact ? "min-h-10 px-4 py-2 text-sm" : "text-sm"}`}
              >
                <Icon name={meta.icon} className="h-4 w-4" />
                {!iconOnly && (
                  <span className="project-external-link-label">
                    {adaptive ? meta.shortLabel : accessibleLabel}
                  </span>
                )}
              </a>
            );
          })}
        </div>
      )}
    </>
  );
}
