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
Answer from your own knowledge and the supplied conversation normally. Do not turn an ordinary question into a web lookup, encyclopedia entry, or sourced report. The client handles outside lookup separately only when the user explicitly requests it or the answer clearly requires fresh information.
Treat short follow-ups, pronouns, and corrections as part of the conversation. When the user says something like “isn’t it…?”, “I thought…”, or “you said…”, connect it to the previous exchange, evaluate the correction, and acknowledge it plainly when they are right. If your earlier answer was wrong, apologize briefly and replace it with the correct answer. Do not claim you cannot understand a follow-up when its meaning is clear from recent messages.
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

function coachReasoningEffort(message: string, context: Record<string, unknown>) {
  const asksForJudgment = /\b(why|compare|diagnose|figure out|analy[sz]e|improve|recommend|should|best next|what went wrong|how can I fix|what should I change)\b/i.test(message);
  const concernsFlightEvidence = /\b(plane|airplane|flight|throw|wing|fold|nose|tail|dive|stall|turn|wobble|spiral|distance|scan|track)\b/i.test(message)
    || Object.keys(context).length > 0;
  const correctsEarlierAnswer = /\b(isn['’]?t it|aren['’]?t they|i thought|actually|that['’]?s (?:not right|wrong)|you said)\b/i.test(message);
  return (asksForJudgment && concernsFlightEvidence) || correctsEarlierAnswer ? "medium" : "low";
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

async function hasProAccess(request: Request) {
  const { user, isOwner } = await getProAccess();
  return Boolean((user && isOwner) || validSharePath(request));
}

export async function GET(request: Request) {
  if (!(await hasProAccess(request))) return json({ error: "pro_access_required" }, 403);
  const available = Boolean((process.env.OPENAI_API_KEY ?? "").trim());
  return json({ available, typedModel: MODEL, voiceModel: "gpt-realtime-2.1" });
}

export async function POST(request: Request) {
  if (!(await hasProAccess(request))) return json({ error: "pro_access_required" }, 403);

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
  const reasoningEffort = coachReasoningEffort(message, context);
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
        reasoning: { effort: reasoningEffort },
        text: { verbosity: "low" },
        safety_identifier: identifier,
        stream: true,
      }),
    });
  } catch {
    return json({ error: "coach_unavailable" }, 502);
  }

  if (!upstream.ok) {
    const requestId = upstream.headers.get("x-request-id");
    return json({ error: "coach_unavailable", requestId }, 502);
  }
  if (!upstream.body) return json({ error: "coach_unavailable" }, 502);

  const output = new ReadableStream<Uint8Array>({
    async start(controller) {
      const reader = upstream.body!.getReader();
      const decoder = new TextDecoder();
      const encoder = new TextEncoder();
      let buffer = "";
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true }).replaceAll("\r\n", "\n");
          let boundary = buffer.indexOf("\n\n");
          while (boundary >= 0) {
            const frame = buffer.slice(0, boundary);
            buffer = buffer.slice(boundary + 2);
            const data = frame.split("\n").filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trimStart()).join("\n");
            if (data && data !== "[DONE]") {
              const event = JSON.parse(data) as { type?: string; delta?: string };
              if (event.type === "response.output_text.delta" && typeof event.delta === "string") controller.enqueue(encoder.encode(event.delta));
            }
            boundary = buffer.indexOf("\n\n");
          }
        }
        controller.close();
      } catch (error) {
        controller.error(error);
      } finally {
        reader.releaseLock();
      }
    },
  });

  return new Response(output, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "private, no-store",
      "X-Flight-Lab-Model": MODEL,
    },
  });
}
