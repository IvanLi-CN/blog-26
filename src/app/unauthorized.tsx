import AdminAccessDenied from "@/components/auth/AdminAccessDenied";

export default function Unauthorized() {
  return <AdminAccessDenied status={401} />;
}
