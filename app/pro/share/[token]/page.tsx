import { redirect } from "next/navigation";
import FlightLabApp from "@/app/flight-lab-app";
import ProVideoLab from "@/app/pro/pro-video-lab";

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

  return (
    <>
      <FlightLabApp sharedProPass />
      <ProVideoLab displayName="Pro Pass" />
    </>
  );
}
