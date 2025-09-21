import Link from "next/link";

interface ProjectCardProps {
  title: string;
  href: string;
  category: string;
}

export default function ProjectCard({ title, href, category }: ProjectCardProps) {
  return (
    <div className="card bg-base-100 shadow-sm hover:shadow-md transition-all duration-200">
      <div className="card-body p-2 sm:p-3">
        <h3 className="card-title text-sm mb-1 line-clamp-1">
          <Link href={href} prefetch={false} className="hover:text-primary transition-colors">
            {title}
          </Link>
        </h3>
        <span className="badge badge-outline badge-xs">{category}</span>
      </div>
    </div>
  );
}
