import Link from "next/link";

// 强制动态渲染，避免静态生成问题
export const dynamic = "force-dynamic";

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-base-100">
      <div className="text-center">
        <h1 className="text-9xl font-bold text-primary mb-4">404</h1>
        <h2 className="text-3xl font-semibold text-base-content mb-4">页面未找到</h2>
        <p className="text-lg text-base-content/70 mb-8 max-w-md mx-auto">
          抱歉，您访问的页面不存在或已被移动。
        </p>
        <div className="flex gap-4 justify-center">
          <Link href="/" className="btn btn-primary">
            返回首页
          </Link>
          <Link href="/posts" className="btn btn-outline">
            浏览文章
          </Link>
        </div>
      </div>
    </div>
  );
}
