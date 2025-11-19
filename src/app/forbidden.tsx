import AdminAccessDenied from "@/components/admin/AdminAccessDenied";

export default function Forbidden() {
  return <AdminAccessDenied status={403} />;
}
