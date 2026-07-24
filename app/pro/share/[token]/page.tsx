import { redirect } from "next/navigation";
import ProDashboard from "@/app/pro/pro-dashboard";

export const dynamic = "force-dynamic";

export default async function SharedProPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const shareToken = (process.env.FLIGHT_LAB_PRO_SHARE_TOKEN ?? "").trim();

  if (!shareToken || token !== shareToken) {
    redirect("/#pro");
  }

  return <ProDashboard displayName="Pro Pass" sharedPass />;
}
