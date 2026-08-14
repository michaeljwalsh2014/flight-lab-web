import { getProAccess } from "@/app/pro-access";

export const dynamic = "force-dynamic";

const MODEL = "gpt-realtime-2.1";
const requestWindows = new Map<string, number[]>();
const VOICE_INSTRUCTIONS = `You are the Flight Lab Pro Coach, a warm and natural voice companion for paper-airplane builders.
Talk like a friendly person, not a form or an upload wizard. Respond to what the user actually says first. Casual conversation is welcome.
Never demand a photo. When it feels useful, gently offer to look at the plane or guide the user through the six camera angles, but make that invitation optional.
When Flight Lab evidence is supplied in the conversation, use it conservatively. Distinguish visible observations from estimates. Recommend one small reversible change, then three comparable test throws.
Keep spoken answers short unless the user asks for more detail. Do not repeat the same invitation or advice.
Never suggest throwing near people, animals, roads, windows, or fragile objects.`;

function validSharePath(request: Request) {
  const expected = (process.env.FLIGHT_LAB_PRO_SHARE_TOKEN ?? "").trim();
  const suppliedPath = request.headers.get("x-flight-lab-pro-path") ?? "";
  const supplied = suppliedPath.match(/^\/pro\/share\/([^/?#]+)\/?$/)?.[1] ?? "";
  return Boolean(expected && supplied && supplied === expected);
}

async function safetyIdentifier(value: string) {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return `flight-lab-voice-${Array.from(new Uint8Array(digest)).slice(0, 12).map((byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

function withinRateLimit(identifier: string) {
  const now = Date.now();
  const cutoff = now - 10 * 60 * 1000;
  const recent = (requestWindows.get(identifier) ?? []).filter((time) => time > cutoff);
  if (recent.length >= 8) return false;
  requestWindows.set(identifier, [...recent, now]);
  if (requestWindows.size > 2500) requestWindows.clear();
  return true;
}

function failure(error: string, status: number) {
  return Response.json({ error }, { status, headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(request: Request) {
  const { user, isOwner } = await getProAccess();
  if (!(user && isOwner) && !validSharePath(request)) return failure("pro_access_required", 403);

  const coachId = new URL(request.url).searchParams.get("coachId") ?? "";
  if (!/^[a-zA-Z0-9-]{8,80}$/.test(coachId)) return failure("invalid_request", 400);
  const identifier = await safetyIdentifier(coachId);
  if (!withinRateLimit(identifier)) return failure("rate_limited", 429);

  const apiKey = (process.env.OPENAI_API_KEY ?? "").trim();
  if (!apiKey) return failure("voice_unavailable", 503);

  const sdp = await request.text();
  if (!sdp || sdp.length > 200_000) return failure("invalid_request", 400);

  const form = new FormData();
  form.set("sdp", new Blob([sdp], { type: "application/sdp" }));
  form.set("session", JSON.stringify({
    type: "realtime",
    model: MODEL,
    instructions: VOICE_INSTRUCTIONS,
    audio: { output: { voice: "marin" } },
  }));

  let upstream: Response;
  try {
    upstream = await fetch("https://api.openai.com/v1/realtime/calls", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "OpenAI-Safety-Identifier": identifier,
      },
      body: form,
    });
  } catch {
    return failure("voice_unavailable", 502);
  }

  const answer = await upstream.text();
  if (!upstream.ok) return failure("voice_unavailable", 502);
  return new Response(answer, {
    status: 200,
    headers: { "Content-Type": "application/sdp", "Cache-Control": "private, no-store" },
  });
}
