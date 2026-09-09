import { NextResponse } from "next/server";
import { applyConfiguredViewReset, readAnonymousViews, recordAnonymousView, resetAnonymousViews } from "@/app/analytics-store";
import { getProAccess } from "@/app/pro-access";

export const dynamic = "force-dynamic";

const responseHeaders = { "Cache-Control": "private, no-store" };

export async function POST(request: Request) {
  if (request.headers.get("sec-fetch-site") === "cross-site") {
    return NextResponse.json({ error: "invalid_origin" }, { status: 403, headers: responseHeaders });
  }

  try {
    await applyConfiguredViewReset();
    const { isOwner } = await getProAccess();
    if (isOwner) return NextResponse.json({ counted: false, ownerExcluded: true }, { headers: responseHeaders });
    await recordAnonymousView();
    return NextResponse.json({ counted: true }, { headers: responseHeaders });
  } catch {
    return NextResponse.json({ counted: false }, { status: 503, headers: responseHeaders });
  }
}

export async function GET() {
  try {
    await applyConfiguredViewReset();
  } catch {
    return NextResponse.json({ error: "analytics_unavailable" }, { status: 503, headers: responseHeaders });
  }

  const { isOwner } = await getProAccess();
  if (!isOwner) return NextResponse.json({ error: "owner_access_required" }, { status: 403, headers: responseHeaders });

  try {
    return NextResponse.json({ totalViews: await readAnonymousViews() }, { headers: responseHeaders });
  } catch {
    return NextResponse.json({ error: "analytics_unavailable" }, { status: 503, headers: responseHeaders });
  }
}

export async function DELETE() {
  const { isOwner } = await getProAccess();
  if (!isOwner) return NextResponse.json({ error: "owner_access_required" }, { status: 403, headers: responseHeaders });

  try {
    await resetAnonymousViews();
    return NextResponse.json({ totalViews: 0 }, { headers: responseHeaders });
  } catch {
    return NextResponse.json({ error: "analytics_unavailable" }, { status: 503, headers: responseHeaders });
  }
}
