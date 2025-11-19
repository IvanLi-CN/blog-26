import AdminAccessDenied from "@/components/admin/AdminAccessDenied";

export default function Unauthorized() {
  return <AdminAccessDenied status={401} />;
}
