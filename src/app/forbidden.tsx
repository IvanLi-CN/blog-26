import AdminAccessDenied from "@/components/auth/AdminAccessDenied";

export default function Forbidden() {
  return <AdminAccessDenied status={403} />;
}
