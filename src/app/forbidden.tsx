import AdminAccessDenied from "@/components/admin/AdminAccessDenied";
import { getSsoEmailHeaderName } from "@/lib/admin-config";

export default function Forbidden() {
  const emailHeaderName = getSsoEmailHeaderName();
  return <AdminAccessDenied status={403} emailHeaderName={emailHeaderName} />;
}
