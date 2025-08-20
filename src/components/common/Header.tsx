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
        top-0 z-40 flex-none mx-auto w-full border-b border-gray-50/0 transition-[opacity] ease-in-out
      `}
    >
      <div className="navbar bg-base-100 max-w-7xl mx-auto">
        <div className="flex-1">
          <Link
            href="/"
            className="inline-block px-4 font-bold text-xl 2xl:text-2xl hover:text-primary drop-shadow drop-shadow-secondary/30 transition-colors cursor-pointer"
          >
            {SITE.name}
          </Link>
        </div>

        {/* 桌面端导航 */}
        <nav
          className="items-center w-full md:w-auto hidden md:flex md:mx-5"
          aria-label="Main navigation"
        >
          <ul className="flex flex-col md:flex-row md:self-center w-full md:w-auto text-xl md:text-[0.9375rem] tracking-[0.01rem] font-medium md:justify-center">
            {headerData.links.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className={`btn btn-ghost ${isActive(link.href) ? "aw-link-active" : ""}`}
                >
                  {link.text}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        {/* 桌面端搜索和操作 */}
        <div className="hidden md:flex items-center ml-4 mr-4">
          {showSearchBox && <SearchBox />}
          <div className="ml-6 flex">
            {showToggleTheme && <ThemeToggle iconClass="w-5 h-5" />}
            {showRssFeed && (
              <a
                className="btn btn-ghost btn-circle"
                aria-label="RSS Feed"
                title="RSS Feed"
                href="/rss.xml"
              >
                <Icon name="tabler:rss" className="w-5 h-5" />
              </a>
            )}
          </div>
        </div>

        {/* 移动端菜单切换 */}
        <div className="flex items-center md:hidden">
          <MobileMenu />
        </div>
      </div>
    </header>
  );
}
