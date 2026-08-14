import { getChatGPTUser } from "@/app/chatgpt-auth";

export async function getProAccess() {
  const user = await getChatGPTUser();
  const ownerEmail = (process.env.FLIGHT_LAB_OWNER_EMAIL ?? "").trim().toLowerCase();
  const isOwner = Boolean(user && ownerEmail && user.email.trim().toLowerCase() === ownerEmail);

  return {
    user,
    isOwner,
    displayName: isOwner ? user?.displayName ?? "Flight Lab Owner" : null,
  };
}
