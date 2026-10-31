import { getProAccess } from "@/app/pro-access";
import ProCodeEntry from "./pro-code-entry";
export const dynamic = "force-dynamic";
export default async function ProAccessPage() {
  const { hasPro } = await getProAccess();
  return <ProCodeEntry hasPro={hasPro} />;
}
