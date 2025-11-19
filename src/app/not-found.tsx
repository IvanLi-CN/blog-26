"use client";

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-base-200 px-4">
      <div className="max-w-md w-full space-y-6 text-center">
        <div className="space-y-2">
          <p className="text-sm font-semibold tracking-widest text-error/80 uppercase">Not Found</p>
          <h1 className="text-4xl font-bold text-base-content">404 页面未找到</h1>
          <p className="text-base text-base-content/70">抱歉，您访问的页面不存在或已被移动。</p>
        </div>
        <div className="card bg-base-100 shadow-md border border-base-200">
          <div className="card-body space-y-3">
            <h2 className="card-title justify-center text-base-content/80 text-sm">无法找到页面</h2>
            <p className="text-sm text-base-content/70">
              您可以检查链接是否正确，或返回首页继续浏览。
            </p>
            <div className="pt-2 flex justify-center">
              <a href="/" className="btn btn-outline btn-sm">
                返回首页
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
