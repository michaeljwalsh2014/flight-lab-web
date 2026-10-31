import { redirect } from "next/navigation";
import { getProAccess } from "@/app/pro-access";
import ProDashboard from "./pro-dashboard";

export const dynamic = "force-dynamic";

export default async function ProPage() {
  const { isOwner, hasPro, freePass, displayName } = await getProAccess();

  if (!hasPro) {
    redirect("/pricing");
  }

  return <ProDashboard displayName={displayName ?? "Flight Lab Pro"} sharedPass={!isOwner} accessLabel={isOwner ? "Lifetime Pro active" : freePass ? "Free Pro pass active" : "Pro subscription active"} />;
}
