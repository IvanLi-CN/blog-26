"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { headerData } from "../../config/navigation";
import { SITE } from "../../config/site";
import Icon from "../ui/Icon";
import MobileMenu from "./MobileMenu";
import SearchBox from "./SearchBox";
import ThemeToggle from "./ThemeToggle";

interface HeaderProps {
  isSticky?: boolean;
  showSearchBox?: boolean;
  showToggleTheme?: boolean;
  showRssFeed?: boolean;
}

export default function Header({
  isSticky = false,
  showSearchBox = true,
  showToggleTheme = true,
  showRssFeed = true,
}: HeaderProps) {
  const pathname = usePathname();

  const isActive = (path: string) => {
    if (!pathname) return false;
    if (path === "/") {
      return pathname === "/";
    }
    return pathname.startsWith(path);
  };

  return (
    <header
      className={`
        ${isSticky ? "sticky" : "relative"}
        top-0 z-40 flex-none w-full px-3 pt-3 sm:px-4
      `}
    >
      <div className="nature-container">
        <div className="nature-surface flex items-center gap-4 px-4 py-3 sm:px-5">
          <Link
            href="/"
            className="min-w-fit pl-1 font-heading text-xl font-semibold tracking-[-0.04em] text-[color:var(--nature-text)] transition-colors hover:text-[color:var(--nature-accent-strong)] sm:text-2xl"
          >
            {SITE.name}
          </Link>

          <nav className="hidden md:flex" aria-label="Main navigation">
            <ul className="flex items-center gap-1 text-sm font-medium">
              {headerData.links.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    prefetch={!(link.href === "/projects" || link.href === "/tags")}
                    className={`inline-flex items-center gap-2 rounded-full px-4 py-2 transition ${
                      isActive(link.href)
                        ? "aw-link-active"
                        : "text-[color:var(--nature-text-soft)] hover:bg-[rgba(var(--nature-accent-rgb),0.1)] hover:text-[color:var(--nature-accent-strong)]"
                    }`}
                  >
                    <Icon name={link.icon} className="h-4 w-4" />
                    {link.text}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <div className="ml-auto hidden items-center gap-3 md:flex">
            {showSearchBox && <SearchBox />}
            {showToggleTheme && <ThemeToggle iconClass="h-4 w-4" />}
            {showRssFeed && (
              <a
                className="nature-icon-button"
                aria-label="RSS Feed"
                title="RSS Feed"
                href="/rss.xml"
              >
                <Icon name="tabler:rss" className="h-5 w-5" />
              </a>
            )}
          </div>

          <div className="ml-auto flex items-center md:hidden">
            <MobileMenu />
          </div>
        </div>
      </div>
    </header>
  );
}
