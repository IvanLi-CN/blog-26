import { SITE } from "@/config/site";

interface ArticleLicenseProps {
  author?: string;
  year?: number;
  className?: string;
}

export default function ArticleLicense({
  author = SITE.author.name,
  year = new Date().getFullYear(),
  className = "",
}: ArticleLicenseProps) {
  return (
    <div className={`border-t border-gray-200 dark:border-gray-700 pt-4 mt-6 ${className}`}>
      <div className="flex items-center gap-3 text-sm text-gray-600 dark:text-gray-400">
        <div className="flex items-center gap-2">
          <span>Licensed under</span>
          <a
            href="https://creativecommons.org/licenses/by-nc-nd/4.0/"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:underline font-medium"
          >
            <div className="flex items-center gap-1">
              {/* CC Icon */}
              <svg
                className="w-4 h-4"
                viewBox="0 0 64 64"
                role="img"
                aria-label="Creative Commons"
                fill="currentColor"
              >
                <title>Creative Commons</title>
                <circle cx="32" cy="32" r="30" stroke="currentColor" strokeWidth="4" fill="none" />
                <path
                  d="M25.5 26.5c-1.5-1.5-3.5-2.5-5.5-2.5-4.5 0-8 3.5-8 8s3.5 8 8 8c2 0 4-1 5.5-2.5M42.5 26.5c-1.5-1.5-3.5-2.5-5.5-2.5-4.5 0-8 3.5-8 8s3.5 8 8 8c2 0 4-1 5.5-2.5"
                  stroke="currentColor"
                  strokeWidth="3"
                  fill="none"
                />
              </svg>

              {/* BY Icon */}
              <svg
                className="w-4 h-4"
                viewBox="0 0 64 64"
                role="img"
                aria-label="Attribution"
                fill="currentColor"
              >
                <title>Attribution</title>
                <circle cx="32" cy="32" r="30" stroke="currentColor" strokeWidth="4" fill="none" />
                <circle cx="32" cy="25" r="6" fill="currentColor" />
                <path d="M20 35h24v12H20z" fill="currentColor" />
              </svg>

              {/* NC Icon */}
              <svg
                className="w-4 h-4"
                viewBox="0 0 64 64"
                role="img"
                aria-label="Non Commercial"
                fill="currentColor"
              >
                <title>Non Commercial</title>
                <circle cx="32" cy="32" r="30" stroke="currentColor" strokeWidth="4" fill="none" />
                <circle cx="32" cy="32" r="12" stroke="currentColor" strokeWidth="6" fill="none" />
                <line x1="20" y1="20" x2="44" y2="44" stroke="currentColor" strokeWidth="4" />
              </svg>

              {/* ND Icon */}
              <svg
                className="w-4 h-4"
                viewBox="0 0 64 64"
                role="img"
                aria-label="No Derivatives"
                fill="currentColor"
              >
                <title>No Derivatives</title>
                <circle cx="32" cy="32" r="30" stroke="currentColor" strokeWidth="4" fill="none" />
                <path d="M20 28h24v8H20z" fill="currentColor" />
                <path d="M28 20v24h8V20z" fill="currentColor" />
              </svg>
            </div>
            <span className="ml-1">CC BY-NC-ND 4.0</span>
          </a>
        </div>
        <span className="text-gray-400 dark:text-gray-500">•</span>
        <span>
          © {year} {author}
        </span>
      </div>
    </div>
  );
}
