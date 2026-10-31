import { headers } from "next/headers";
import { getProAccess } from "@/app/pro-access";
import { codeAttemptIdentity, readCodeLockout } from "@/app/billing-store";
import ProCodeEntry from "./pro-code-entry";
export const dynamic = "force-dynamic";
export default async function ProAccessPage() {
  const { hasPro, account } = await getProAccess();
  let retryAt = 0;
  let statusUnavailable = false;
  if (!hasPro) {
    try { retryAt = await readCodeLockout(await codeAttemptIdentity(account, await headers())); }
    catch { statusUnavailable = true; }
  }
  return <ProCodeEntry hasPro={hasPro} initialRetryAt={retryAt} initialStatusUnavailable={statusUnavailable} />;
}
