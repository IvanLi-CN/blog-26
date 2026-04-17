interface AdminAccessDeniedProps {
  status: 401 | 403;
}

export default function AdminAccessDenied(props: AdminAccessDeniedProps) {
  const { status } = props;
  const isUnauthorized = status === 401;

  const title = isUnauthorized ? "访问受限" : "权限不足";
  const codeLabel = isUnauthorized ? "401" : "403";
  const description = isUnauthorized
    ? "当前请求未包含有效的管理员身份。"
    : "当前身份无权访问此区域。";

  return (
    <div className="min-h-screen flex items-center justify-center bg-base-200 px-4">
      <div className="max-w-md w-full space-y-6 text-center">
        <div className="space-y-2">
          <p className="text-sm font-semibold tracking-widest text-error/80 uppercase">
            Admin Only
          </p>
          <h1 className="text-4xl font-bold text-base-content">
            {codeLabel} {title}
          </h1>
          <p className="text-base text-base-content/70">{description}</p>
        </div>
        <div className="card bg-base-100 shadow-md border border-base-200">
          <div className="card-body space-y-3">
            <h2 className="card-title justify-center text-base-content/80 text-sm">管理访问受限</h2>
            <p className="text-sm text-base-content/70">只有具备管理员权限的账户可以访问此区域。</p>
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
