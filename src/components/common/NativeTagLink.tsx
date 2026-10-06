import Icon from "@/components/ui/Icon";

export interface NativeTagLinkProps {
  href: string;
  label: string;
  iconId?: string;
  iconSvg?: string | null;
  className?: string;
}

/** Shared static presenter: Astro supplies runtime URLs and resolved server icons. */
export function NativeTagLink({
  href,
  label,
  iconId = "tabler:hash",
  iconSvg,
  className = "",
}: NativeTagLinkProps) {
  return (
    <a
      href={href}
      className={`nature-chip-link native-tag-link nature-hover-hitbox nature-hover-hitbox-inline group align-middle ${className}`}
    >
      <span className="nature-hover-lift nature-hover-surface native-tag-link-surface inline-flex items-center gap-1 rounded-full border border-[color:var(--nature-line)] bg-[rgba(var(--nature-highlight-rgb),0.24)] px-2.5 py-1 text-sm font-medium text-[color:var(--nature-text-soft)] transition-all duration-200 group-hover:text-[color:var(--nature-accent-strong)]">
        <span
          className="hidden sm:inline-flex shrink-0 text-[color:var(--nature-accent-strong)]"
          aria-hidden="true"
        >
          {iconSvg ? (
            <span
              className="inline-flex [&>svg]:h-3 [&>svg]:w-3"
              dangerouslySetInnerHTML={{ __html: iconSvg }}
            />
          ) : iconId === "tabler:hash" ? (
            <svg
              className="h-3 w-3"
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M5 9h14M4 15h14M11 4L7 20M17 4l-4 16" />
            </svg>
          ) : (
            <Icon name={iconId} className="h-3 w-3" />
          )}
        </span>
        <span className="native-tag-link-label">{label}</span>
      </span>
    </a>
  );
}
