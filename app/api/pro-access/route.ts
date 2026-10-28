import { NextResponse } from "next/server";
import { getProAccess } from "@/app/pro-access";

export const dynamic = "force-dynamic";

export async function GET() {
  const { user, isOwner, hasPro, freePass, unavailable, displayName } = await getProAccess();

  return NextResponse.json(
    {
      authenticated: Boolean(user),
      isOwner,
      hasPro,
      freePass,
      unavailable,
      displayName,
    },
    {
      headers: {
        "Cache-Control": "private, no-store",
      },
    },
  );
}
