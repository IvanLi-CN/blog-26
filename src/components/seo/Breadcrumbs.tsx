import { Icon } from "@iconify/react";
import Link from "next/link";

interface BreadcrumbItem {
  name: string;
  href?: string;
}

interface BreadcrumbsProps {
  items: BreadcrumbItem[];
  className?: string;
}

export default function Breadcrumbs({ items, className = "" }: BreadcrumbsProps) {
  return (
    <nav
      className={`flex items-center space-x-1 text-sm text-gray-500 dark:text-gray-400 ${className}`}
      aria-label="面包屑导航"
    >
      <ol
        className="flex items-center space-x-1"
        itemScope
        itemType="https://schema.org/BreadcrumbList"
      >
        {items.map((item, index) => (
          <li
            key={item.href || item.name || index}
            className="flex items-center"
            itemProp="itemListElement"
            itemScope
            itemType="https://schema.org/ListItem"
          >
            {index > 0 && (
              <Icon
                icon="tabler:chevron-right"
                className="w-4 h-4 mx-1 text-gray-400 dark:text-gray-500"
              />
            )}

            {item.href ? (
              <Link
                href={item.href}
                className="hover:text-primary transition-colors duration-200"
                itemProp="item"
              >
                <span itemProp="name">{item.name}</span>
              </Link>
            ) : (
              <span className="text-gray-700 dark:text-gray-300 font-medium" itemProp="name">
                {item.name}
              </span>
            )}

            <meta itemProp="position" content={String(index + 1)} />
          </li>
        ))}
      </ol>
    </nav>
  );
}
