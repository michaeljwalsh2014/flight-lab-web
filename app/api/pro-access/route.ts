import { NextResponse } from "next/server";
import { getChatGPTUser } from "@/app/chatgpt-auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getChatGPTUser();
  const ownerEmail = (process.env.FLIGHT_LAB_OWNER_EMAIL ?? "").trim().toLowerCase();
  const isOwner = Boolean(user && ownerEmail && user.email.trim().toLowerCase() === ownerEmail);

  return NextResponse.json(
    {
      authenticated: Boolean(user),
      isOwner,
      displayName: isOwner ? user?.displayName ?? "Flight Lab Owner" : null,
    },
    {
      headers: {
        "Cache-Control": "private, no-store",
      },
    },
  );
}
