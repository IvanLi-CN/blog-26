"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function Header() {
  const pathname = usePathname();

  const isActive = (path: string) => {
    if (path === "/") {
      return pathname === "/";
    }
    return pathname.startsWith(path);
  };

  return (
    <div className="navbar bg-base-100 shadow-lg">
      <div className="flex-1">
        <Link href="/" className="btn btn-ghost text-xl">
          Ivan&apos;s Blog
        </Link>
      </div>
      <div className="flex-none">
        <ul className="menu menu-horizontal px-1">
          <li>
            <Link
              href="/"
              className={
                isActive("/") && !isActive("/posts") && !isActive("/about") ? "active" : ""
              }
            >
              首页
            </Link>
          </li>
          <li>
            <Link href="/posts" className={isActive("/posts") ? "active" : ""}>
              文章
            </Link>
          </li>
          <li>
            <Link href="/about" className={isActive("/about") ? "active" : ""}>
              关于
            </Link>
          </li>
          <li>
            <Link href="/admin/dashboard" className={isActive("/admin") ? "active" : ""}>
              管理
            </Link>
          </li>
        </ul>
      </div>
    </div>
  );
}
