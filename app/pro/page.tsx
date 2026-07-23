import { redirect } from "next/navigation";
import { getProAccess } from "@/app/pro-access";
import ProVideoLab from "./pro-video-lab";

export const dynamic = "force-dynamic";

export default async function ProPage() {
  const { user, isOwner, displayName } = await getProAccess();

  if (!user) {
    redirect("/signin-with-chatgpt?return_to=%2Fpro");
  }
  if (!isOwner) {
    redirect("/#pro");
  }

  return <ProVideoLab displayName={displayName ?? "Flight Lab Owner"} />;
}
