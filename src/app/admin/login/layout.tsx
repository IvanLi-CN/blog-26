export default function AdminLoginLayout({ children }: { children: React.ReactNode }) {
  // 登录页面不需要权限检查，使用独立的布局
  return <>{children}</>;
}
