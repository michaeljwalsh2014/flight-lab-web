import { getChatGPTUser } from "@/app/chatgpt-auth";
import { readBrowserPass } from "./browser-pro-pass";
import { readEntitlement, sha256 } from "./billing-store";

export async function getProAccess() {
  const user = await getChatGPTUser();
  const ownerEmail = (process.env.FLIGHT_LAB_OWNER_EMAIL ?? "").trim().toLowerCase();
  const isOwner = Boolean(user && ownerEmail && user.email.trim().toLowerCase() === ownerEmail);
  const account = user ? await sha256(`flight-lab-account:${user.id ?? user.email.trim().toLowerCase()}`) : null;
  let hasPro = isOwner;
  let freePass = false;
  let unavailable = false;
  if (account && !isOwner) {
    try { const entitlement = await readEntitlement(account); hasPro = entitlement.hasPro; freePass = entitlement.grant; }
    catch { unavailable = true; }
  }
  const passIdentity = await readBrowserPass();
  if (passIdentity) { hasPro = true; freePass = true; unavailable = false; }
  return { user, account, passIdentity, isOwner, hasPro, freePass, unavailable, displayName: user?.displayName ?? (passIdentity ? "Pro Pass" : null) };
}
