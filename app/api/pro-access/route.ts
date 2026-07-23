import { NextResponse } from "next/server";
import { getProAccess } from "@/app/pro-access";

export const dynamic = "force-dynamic";

export async function GET() {
  const { user, isOwner, displayName } = await getProAccess();

  return NextResponse.json(
    {
      authenticated: Boolean(user),
      isOwner,
      displayName,
    },
    {
      headers: {
        "Cache-Control": "private, no-store",
      },
    },
  );
}
