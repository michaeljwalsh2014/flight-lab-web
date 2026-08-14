import { redirect } from "next/navigation";
import { getProAccess } from "@/app/pro-access";
import ProDashboard from "./pro-dashboard";

export const dynamic = "force-dynamic";

export default async function ProPage() {
  const { user, isOwner, displayName } = await getProAccess();

  if (!user) {
    redirect("/signin-with-chatgpt?return_to=%2Fpro");
  }
  if (!isOwner) {
    redirect("/#pro");
  }

  return <ProDashboard displayName={displayName ?? "Flight Lab Pro"} />;
}
