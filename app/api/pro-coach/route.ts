import { NextResponse } from "next/server";
import { getProAccess } from "@/app/pro-access";

export const dynamic = "force-dynamic";

type SafeMessage = { role: "user" | "assistant"; text: string };
type RequestBody = {
  message?: unknown;
  history?: unknown;
  context?: unknown;
  coachId?: unknown;
};

const requestWindows = new Map<string, number[]>();
const MODEL = "gpt-5.6-terra";
const COACH_INSTRUCTIONS = `You are Flight Lab Pro Coach: a warm, natural conversational AI with deep paper-airplane coaching expertise.
Respond to the user's actual message first. You can greet them, make light conversation, answer ordinary questions, and acknowledge feelings naturally. Never treat every message as a request for airplane analysis.
Do not demand a photo, scan, flight, or measurement. If the user is chatting casually, reply conversationally; you may offer airplane help in one brief, optional sentence only when it feels natural. Do not repeat that offer in every reply.
When the user asks about a paper airplane, use supplied evidence when it exists. Never invent a visual detail, measurement, or causal claim. Clearly distinguish observations from inferences and say when a photo, scan, or measured throw would reduce uncertainty.
For an evidence-based coaching request, prioritize cloud-vision observations, reconstructed-mesh measurements, and tracked-flight measurements. Name the specific evidence used, then recommend one small, reversible change followed by three comparable throws.
Read previous test results and recent assistant replies. Do not repeat an action marked same or worse. If an earlier action helped, preserve it and test a different variable.
Use only the currently selected plane for plane-specific advice. Do not combine flights from different planes.
Keep replies concise, friendly, and clear for a young builder without sounding childish or robotic.
Avoid unsafe throwing advice and never suggest throwing near people, roads, glass, or animals.`;

function json(body: object, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
}

function validSharePath(request: Request) {
  const expected = (process.env.FLIGHT_LAB_PRO_SHARE_TOKEN ?? "").trim();
  const suppliedPath = request.headers.get("x-flight-lab-pro-path") ?? "";
  const supplied = suppliedPath.match(/^\/pro\/share\/([^/?#]+)\/?$/)?.[1] ?? "";
  return Boolean(expected && supplied && supplied === expected);
}

function safeHistory(value: unknown): SafeMessage[] {
  if (!Array.isArray(value)) return [];
  return value.slice(-6).flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    if ((record.role !== "user" && record.role !== "assistant") || typeof record.text !== "string") return [];
    return [{ role: record.role, text: record.text.slice(0, 700) }];
  });
}

function safeContext(value: unknown) {
  if (!value || typeof value !== "object") return {};
  const serialized = JSON.stringify(value);
  if (serialized.length > 8000) return {};
  return JSON.parse(serialized) as Record<string, unknown>;
}

async function safetyIdentifier(value: string) {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return `flight-lab-${Array.from(new Uint8Array(digest)).slice(0, 12).map((byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

function withinRateLimit(identifier: string) {
  const now = Date.now();
  const cutoff = now - 10 * 60 * 1000;
  const recent = (requestWindows.get(identifier) ?? []).filter((time) => time > cutoff);
  if (recent.length >= 10) return false;
  requestWindows.set(identifier, [...recent, now]);
  if (requestWindows.size > 2500) requestWindows.clear();
  return true;
}

function extractOutput(payload: unknown) {
  if (!payload || typeof payload !== "object") return "";
  const output = (payload as { output?: unknown }).output;
  if (!Array.isArray(output)) return "";
  for (const item of output) {
    if (!item || typeof item !== "object" || (item as { type?: unknown }).type !== "message") continue;
    const content = (item as { content?: unknown }).content;
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      if (part && typeof part === "object" && (part as { type?: unknown }).type === "output_text" && typeof (part as { text?: unknown }).text === "string") return (part as { text: string }).text.trim();
    }
  }
  return "";
}

export async function POST(request: Request) {
  const { user, isOwner } = await getProAccess();
  if (!(user && isOwner) && !validSharePath(request)) return json({ error: "pro_access_required" }, 403);

  let body: RequestBody;
  try {
    body = await request.json() as RequestBody;
  } catch {
    return json({ error: "invalid_request" }, 400);
  }

  const message = typeof body.message === "string" ? body.message.trim().slice(0, 600) : "";
  const coachId = typeof body.coachId === "string" && /^[a-zA-Z0-9-]{8,80}$/.test(body.coachId) ? body.coachId : "";
  if (!message || !coachId) return json({ error: "invalid_request" }, 400);
  const identifier = await safetyIdentifier(coachId);
  if (!withinRateLimit(identifier)) return json({ error: "rate_limited", message: "Take a short break, then ask again." }, 429);

  const apiKey = (process.env.OPENAI_API_KEY ?? "").trim();
  if (!apiKey) return json({ error: "coach_unavailable" }, 503);

  const context = safeContext(body.context);
  const conversation = safeHistory(body.history);
  const input = [
    {
      role: "system",
      content: COACH_INSTRUCTIONS,
    },
    ...conversation.map((item) => ({
      role: item.role,
      content: item.text,
    })),
    {
      role: "user",
      content: `Latest Flight Lab evidence (on-device measurements plus optional cloud-vision findings):\n${JSON.stringify(context)}\n\nQuestion: ${message}`,
    },
  ];

  let upstream: Response;
  try {
    upstream = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        input,
        max_output_tokens: 700,
        reasoning: { effort: "low" },
        text: { verbosity: "low" },
        safety_identifier: identifier,
      }),
    });
  } catch {
    return json({ error: "coach_unavailable" }, 502);
  }

  if (!upstream.ok) {
    const requestId = upstream.headers.get("x-request-id");
    return json({ error: "coach_unavailable", requestId }, 502);
  }
  const payload = await upstream.json() as unknown;
  const reply = extractOutput(payload);
  if (!reply) return json({ error: "coach_unavailable" }, 502);
  return json({ reply, model: MODEL });
}
