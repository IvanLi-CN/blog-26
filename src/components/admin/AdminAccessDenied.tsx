interface AdminAccessDeniedProps {
  status: 401 | 403;
  emailHeaderName: string;
}

export default function AdminAccessDenied(props: AdminAccessDeniedProps) {
  const { status, emailHeaderName } = props;
  const isUnauthorized = status === 401;

  const title = isUnauthorized ? "401 未登录" : "403 权限不足";
  const description = isUnauthorized
    ? "当前请求缺少管理员身份信息。请通过上游登录系统完成登录，并确保网关正确注入邮箱请求头后再访问后台。"
    : "当前登录用户不具备管理员权限。如果这是误判，请联系站点维护者检查管理员邮箱配置或网关转发设置。";

  return (
    <div className="min-h-screen flex items-center justify-center bg-base-200 px-4">
      <div className="max-w-lg w-full space-y-6 text-center">
        <div className="space-y-2">
          <p className="text-sm font-semibold tracking-widest text-error/80 uppercase">
            Admin Only
          </p>
          <h1 className="text-4xl font-bold text-base-content">{title}</h1>
          <p className="text-base text-base-content/70">{description}</p>
        </div>
        <div className="card bg-base-100 shadow-xl">
          <div className="card-body space-y-3">
            <h2 className="card-title justify-center text-base-content/80">访问说明</h2>
            <p className="text-sm text-base-content/70">
              本站后台现在完全依赖反向代理或 SSO 注入的邮箱请求头来识别管理员身份。
            </p>
            <ul className="text-left text-sm text-base-content/70 space-y-1">
              <li>
                <span className="font-semibold">请求头名称：</span>
                <code className="bg-base-200 px-2 py-1 rounded text-xs">{emailHeaderName}</code>
              </li>
              <li>请在上游网关或调试工具中注入正确的管理员邮箱后重新访问本页面。</li>
            </ul>
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
