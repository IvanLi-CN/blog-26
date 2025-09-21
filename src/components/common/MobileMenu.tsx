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
      {/* 移动端菜单按钮 */}
      <button
        type="button"
        className="btn btn-ghost btn-circle md:hidden"
        aria-label="Toggle Menu"
        onClick={toggleMenu}
      >
        <Icon
          name={isOpen ? "line-md:menu-to-close-transition" : "line-md:menu"}
          className="w-6 h-6"
        />
      </button>

      {/* 移动端全屏菜单模态框 */}
      {isOpen && (
        <div className="fixed inset-0 z-50 bg-base-100 md:hidden flex flex-col">
          {/* 顶部栏 */}
          <div className="navbar bg-base-100 max-w-7xl mx-auto">
            <div className="flex-1">
              <Link
                href="/"
                className="inline-block px-4 font-bold text-xl 2xl:text-2xl hover:text-primary drop-shadow drop-shadow-secondary/30 transition-colors cursor-pointer"
                onClick={closeMenu}
              >
                {SITE.name}
              </Link>
            </div>
            <div className="flex items-center">
              <button
                type="button"
                className="btn btn-ghost btn-circle"
                aria-label="Close menu"
                onClick={closeMenu}
              >
                <Icon name="tabler:x" className="w-6 h-6" />
              </button>
            </div>
          </div>

          {/* 内容区域 */}
          <div className="flex-grow flex flex-col container mx-auto px-8">
            {/* 搜索表单（顶部） */}
            <div className="py-8 flex justify-center px-4">
              <form onSubmit={handleSearchSubmit} className="w-full max-w-md">
                <label className="input input-bordered flex items-center gap-2 text-lg shadow-sm focus-within:shadow-md transition-shadow">
                  <Icon name="tabler:search" className="w-5 h-5 opacity-60" />
                  <input type="text" name="q" placeholder="搜索文章..." className="grow" />
                </label>
              </form>
            </div>

            {/* 主要内容（居中的导航） */}
            <div className="flex-grow flex flex-col justify-center items-center">
              <nav>
                <ul className="text-3xl font-bold space-y-4">
                  {headerData.links.map((link) => (
                    <li key={link.href}>
                      <Link
                        href={link.href}
                        prefetch={!(link.href === "/projects" || link.href === "/tags")}
                        className="hover:text-primary transition-colors flex items-center gap-3"
                        onClick={closeMenu}
                      >
                        <Icon name={link.icon} className="w-8 h-8" />
                        <span>{link.text}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </nav>
            </div>

            {/* 底部操作（推到底部） */}
            <div className="py-8">
              {/* 社交链接 */}
              <div className="grid justify-center gap-y-4 mb-6">
                {footerData.socialLinks.map((social) => (
                  <a
                    key={social.href}
                    className="inline-grid grid-cols-[auto_1fr] items-center gap-x-3 text-gray-600 dark:text-gray-400 hover:text-primary"
                    href={social.href}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Icon name={social.icon} className="w-6 h-6" />
                    <span className="text-left">{social.ariaLabel}</span>
                  </a>
                ))}
              </div>

              {/* 版权和切换器 */}
              <div className="flex justify-between items-center w-full">
                <div className="text-sm text-gray-500">
                  &copy; {new Date().getFullYear()} {SITE.name}
                </div>
                <div className="flex items-center gap-4">
                  <ThemeToggle iconClass="w-6 h-6" />
                  <a
                    className="btn btn-ghost btn-circle"
                    aria-label="RSS Feed"
                    title="RSS Feed"
                    href="/rss.xml"
                  >
                    <Icon name="tabler:rss" className="w-6 h-6" />
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
