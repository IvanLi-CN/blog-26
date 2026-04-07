"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { footerData, headerData } from "../../config/navigation";
import { SITE } from "../../config/site";
import Icon from "../ui/Icon";
import ThemeToggle from "./ThemeToggle";

export default function MobileMenu() {
  const [isOpen, setIsOpen] = useState(false);
  const router = useRouter();

  // 切换菜单状态
  const toggleMenu = () => {
    setIsOpen(!isOpen);
    document.body.style.overflow = isOpen ? "" : "hidden";
  };

  // 关闭菜单
  const closeMenu = () => {
    setIsOpen(false);
    document.body.style.overflow = "";
  };

  // 处理搜索提交
  const handleSearchSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const query = formData.get("q") as string;

    if (query.trim()) {
      router.push(`/search?q=${encodeURIComponent(query.trim())}`);
      closeMenu();
    }
  };

  // 清理副作用
  useEffect(() => {
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  return (
    <>
      <button
        type="button"
        className="nature-icon-button inline-flex md:!hidden"
        aria-label="Toggle Menu"
        onClick={toggleMenu}
      >
        <Icon
          name={isOpen ? "line-md:menu-to-close-transition" : "line-md:menu"}
          className="w-6 h-6"
        />
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex flex-col bg-[rgba(8,12,10,0.56)] backdrop-blur-xl md:hidden">
          <div className="nature-container flex items-center justify-between px-2 py-4">
            <div className="nature-surface flex w-full items-center justify-between px-4 py-3">
              <Link
                href="/"
                className="font-heading text-xl font-semibold tracking-[-0.04em] text-[color:var(--nature-text)]"
                onClick={closeMenu}
              >
                {SITE.name}
              </Link>
              <button
                type="button"
                className="nature-icon-button inline-flex"
                aria-label="Close menu"
                onClick={closeMenu}
              >
                <Icon name="tabler:x" className="w-6 h-6" />
              </button>
            </div>
          </div>

          <div className="flex-grow overflow-auto px-4 pb-8">
            <div className="nature-container flex h-full flex-col">
              <div className="flex justify-center px-4 py-8">
                <form onSubmit={handleSearchSubmit} className="w-full max-w-md">
                  <label className="nature-input-shell text-lg">
                    <Icon
                      name="tabler:search"
                      className="w-5 h-5 text-[color:var(--nature-text-faint)]"
                    />
                    <input
                      type="text"
                      name="q"
                      placeholder="搜索文章..."
                      className="nature-input"
                    />
                  </label>
                </form>
              </div>

              <div className="nature-surface flex flex-1 flex-col justify-between px-6 py-8">
                <nav className="flex flex-1 items-center justify-center">
                  <ul className="space-y-4 text-3xl font-semibold">
                    {headerData.links.map((link) => (
                      <li key={link.href}>
                        <Link
                          href={link.href}
                          prefetch={!(link.href === "/projects" || link.href === "/tags")}
                          className="flex items-center gap-3 text-[color:var(--nature-text)] transition hover:text-[color:var(--nature-accent-strong)]"
                          onClick={closeMenu}
                        >
                          <Icon name={link.icon} className="w-8 h-8" />
                          <span>{link.text}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </nav>

                <div className="space-y-6">
                  <div className="grid justify-center gap-y-4">
                    {footerData.socialLinks.map((social) => (
                      <a
                        key={social.href}
                        className="inline-grid grid-cols-[auto_1fr] items-center gap-x-3 text-[color:var(--nature-text-soft)] transition hover:text-[color:var(--nature-accent-strong)]"
                        href={social.href}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <Icon name={social.icon} className="w-6 h-6" />
                        <span className="text-left">{social.ariaLabel}</span>
                      </a>
                    ))}
                  </div>

                  <div className="flex items-center justify-between gap-4">
                    <div className="text-sm text-[color:var(--nature-text-soft)]">
                      &copy; {new Date().getFullYear()} {SITE.name}
                    </div>
                    <div className="flex items-center gap-3">
                      <ThemeToggle iconClass="w-5 h-5" />
                      <a
                        className="nature-icon-button inline-flex"
                        aria-label="RSS Feed"
                        title="RSS Feed"
                        href="/rss.xml"
                      >
                        <Icon name="tabler:rss" className="w-5 h-5" />
                      </a>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
