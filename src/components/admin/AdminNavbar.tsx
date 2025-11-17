"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { type SyntheticEvent, useEffect, useRef, useState } from "react";
import ThemeToggle from "../common/ThemeToggle";

type DropdownItem = {
  label: string;
  href: string;
};

type DropdownMenu = {
  key: string;
  summary: string;
  width: string;
  items: DropdownItem[];
};

const dropdownMenus: DropdownMenu[] = [
  {
    key: "tags",
    summary: "标签管理",
    width: "w-44",
    items: [
      { label: "分组管理", href: "/admin/tags" },
      { label: "图标匹配", href: "/admin/tag-icons" },
    ],
  },
  {
    key: "more",
    summary: "更多",
    width: "w-40",
    items: [
      { label: "缓存管理", href: "/admin/cache" },
      { label: "向量化", href: "/admin/vectorize" },
      { label: "定时任务", href: "/admin/schedules" },
      { label: "访问令牌", href: "/admin/pats" },
      { label: "API 文档", href: "/admin/trpc-docs" },
    ],
  },
];

export default function AdminNavbar() {
  const pathname = usePathname();
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const prevPathname = useRef(pathname);

  useEffect(() => {
    if (prevPathname.current !== pathname) {
      setOpenMenu(null);
      prevPathname.current = pathname;
    }
  }, [pathname]);

  const handleToggle = (key: string) => (event: SyntheticEvent<HTMLDetailsElement>) => {
    const target = event.currentTarget as HTMLDetailsElement;
    setOpenMenu(target.open ? key : null);
  };

  return (
    <div className="navbar bg-base-100 shadow-lg relative z-20">
      <div className="flex-1">
        <Link className="btn btn-ghost text-xl" href="/admin/dashboard">
          管理后台
        </Link>
      </div>
      <div className="flex-none flex items-center">
        <ul className="menu menu-horizontal px-1">
          <li>
            <Link href="/admin/dashboard">仪表盘</Link>
          </li>
          <li>
            <Link href="/admin/posts">文章管理</Link>
          </li>
          {dropdownMenus.map((menu) => (
            <li key={menu.key}>
              <details
                className="group"
                onToggle={handleToggle(menu.key)}
                open={openMenu === menu.key}
              >
                <summary>{menu.summary}</summary>
                <ul className={`bg-base-100 rounded-t-none p-2 ${menu.width}`}>
                  {menu.items.map((item) => (
                    <li key={item.href} className="w-full">
                      <Link href={item.href}>{item.label}</Link>
                    </li>
                  ))}
                </ul>
              </details>
            </li>
          ))}
          <li>
            <Link href="/admin/comments">评论管理</Link>
          </li>
          <li>
            <Link href="/admin/data-sync">数据同步</Link>
          </li>
          <li>
            <Link href="/" className="btn btn-outline btn-sm">
              返回首页
            </Link>
          </li>
        </ul>
        <div className="ml-2">
          <ThemeToggle iconClass="w-5 h-5" />
        </div>
      </div>
    </div>
  );
}
