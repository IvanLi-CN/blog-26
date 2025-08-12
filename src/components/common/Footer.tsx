import Link from "next/link";

export default function Footer() {
  return (
    <footer className="footer footer-center p-10 bg-base-200 text-base-content">
      <div>
        <div className="grid grid-flow-col gap-4">
          <Link href="/about" className="link link-hover">
            关于
          </Link>
          <Link href="/contact" className="link link-hover">
            联系
          </Link>
          <Link href="/posts" className="link link-hover">
            文章
          </Link>
          <Link href="/admin/dashboard" className="link link-hover">
            管理
          </Link>
        </div>
        <div>
          <p>Copyright © 2024 - Ivan&apos;s Blog. Built with Next.js 15 + daisyUI</p>
        </div>
      </div>
    </footer>
  );
}
