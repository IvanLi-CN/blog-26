import Link from "next/link";

interface ProjectCardProps {
  title: string;
  href: string;
  category: string;
}

export default function ProjectCard({ title, href, category }: ProjectCardProps) {
  return (
    <div className="nature-panel nature-panel-soft h-full">
      <div className="nature-panel-body flex h-full flex-col gap-3 p-4">
        <h3 className="line-clamp-1 text-sm font-semibold text-[color:var(--nature-text)] sm:text-base">
          <Link
            href={href}
            prefetch={false}
            className="transition-colors hover:text-[color:var(--nature-accent-strong)]"
          >
            {title}
          </Link>
        </h3>
        <span className="nature-chip w-fit text-xs">{category}</span>
      </div>
    </div>
  );
}
