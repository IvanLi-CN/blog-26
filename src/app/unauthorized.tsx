import AdminAccessDenied from "@/components/admin/AdminAccessDenied";
import { getSsoEmailHeaderName } from "@/lib/admin-config";

export default function Unauthorized() {
  const emailHeaderName = getSsoEmailHeaderName();
  return <AdminAccessDenied status={401} emailHeaderName={emailHeaderName} />;
}
