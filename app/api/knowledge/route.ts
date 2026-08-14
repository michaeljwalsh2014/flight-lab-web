import { findBuiltInAnswer } from "@/app/knowledge-base";
import { getProAccess } from "@/app/pro-access";

export const dynamic = "force-dynamic";

const requestWindows = new Map<string, number[]>();

function validSharePath(request: Request) {
  const expected = (process.env.FLIGHT_LAB_PRO_SHARE_TOKEN ?? "").trim();
  const suppliedPath = request.headers.get("x-flight-lab-pro-path") ?? "";
  const supplied = suppliedPath.match(/^\/pro\/share\/([^/?#]+)\/?$/)?.[1] ?? "";
  return Boolean(expected && supplied && supplied === expected);
}

async function hasProAccess(request: Request) {
  const { user, isOwner } = await getProAccess();
  return Boolean((user && isOwner) || validSharePath(request));
}

function withinRateLimit(identifier: string) {
  const now = Date.now();
  const recent = (requestWindows.get(identifier) ?? []).filter((time) => time > now - 10 * 60 * 1000);
  if (recent.length >= 60) return false;
  requestWindows.set(identifier, [...recent, now]);
  if (requestWindows.size > 2500) requestWindows.clear();
  return true;
}

export async function POST(request: Request) {
  if (!(await hasProAccess(request))) return Response.json({ error: "pro_access_required" }, { status: 403 });
  const identifier = request.headers.get("cf-connecting-ip") ?? "local";
  if (!withinRateLimit(identifier)) return Response.json({ error: "rate_limited" }, { status: 429 });

  let question = "";
  try {
    const body = await request.json() as { question?: unknown };
    question = typeof body.question === "string" ? body.question.trim().slice(0, 300) : "";
  } catch { /* Invalid JSON is handled below. */ }
  if (!question) return Response.json({ error: "invalid_request" }, { status: 400 });

  const answer = findBuiltInAnswer(question);
  if (!answer) return Response.json({ error: "no_built_in_answer" }, { status: 404 });

  return Response.json(
    { ...answer, sourceType: "built-in" },
    { headers: { "Cache-Control": "private, max-age=3600", "X-Flight-Lab-Source": "built-in" } },
  );
}
