"use client";

export default function NotFound() {
  return (
    <div className="nature-app-shell min-h-screen px-4">
      <div className="nature-content-layer flex min-h-screen items-center justify-center">
        <div className="nature-panel w-full max-w-md space-y-6 px-6 py-8 text-center">
          <div className="space-y-2">
            <p className="text-sm font-semibold uppercase tracking-widest text-[color:var(--nature-danger)]">
              Not Found
            </p>
            <h1 className="font-heading text-4xl font-semibold text-[color:var(--nature-text)]">
              404 页面未找到
            </h1>
            <p className="text-base text-[color:var(--nature-text-soft)]">
              抱歉，您访问的页面不存在或已被移动。
            </p>
          </div>
          <div className="nature-panel-soft space-y-3 px-5 py-5">
            <h2 className="text-sm font-semibold text-[color:var(--nature-text-soft)]">
              无法找到页面
            </h2>
            <p className="text-sm text-[color:var(--nature-text-soft)]">
              您可以检查链接是否正确，或返回首页继续浏览。
            </p>
            <div className="flex justify-center pt-2">
              <a href="/" className="nature-button nature-button-outline">
                返回首页
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
