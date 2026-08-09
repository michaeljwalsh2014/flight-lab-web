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
const COACH_INSTRUCTIONS = `You are Flight Lab Pro Coach, an evidence-first paper-airplane experiment coach.
Use only supplied measurements and saved results. Never invent a visual detail, measurement, or causal claim.
Separate observation from inference. If evidence is weak, say what scan or throw would reduce uncertainty.
Recommend exactly one small, reversible change followed by three comparable throws.
Read previous test results and do not repeat an action that was marked same or worse unless you clearly explain why new evidence justifies retrying it.
Use the currently selected plane only. Do not combine flights from different planes.
Keep the language clear for a young builder without sounding childish.
Avoid unsafe throwing advice and never suggest throwing near people, roads, glass, or animals.`;

const coachSchema = {
  type: "object",
  properties: {
    observation: { type: "string" },
    inference: { type: "string" },
    confidence: { type: "string", enum: ["low", "medium", "high"] },
    action: { type: "string" },
    testPlan: { type: "string" },
    memoryNote: { type: "string" },
  },
  required: ["observation", "inference", "confidence", "action", "testPlan", "memoryNote"],
  additionalProperties: false,
};

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

function formatCoachReply(value: unknown) {
  if (!value || typeof value !== "object") return "";
  const item = value as Record<string, unknown>;
  if (!["observation", "inference", "confidence", "action", "testPlan", "memoryNote"].every((key) => typeof item[key] === "string")) return "";
  return `What I observed: ${item.observation}\n\nWhat it may mean (${item.confidence} confidence): ${item.inference}\n\nChange one thing: ${item.action}\n\nTest it: ${item.testPlan}\n\n${item.memoryNote}`.trim();
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
      content: `Latest on-device Flight Lab measurements:\n${JSON.stringify(context)}\n\nQuestion: ${message}`,
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
        text: {
          verbosity: "low",
          format: { type: "json_schema", name: "flight_lab_coach", strict: true, schema: coachSchema },
        },
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
  const raw = extractOutput(payload);
  let reply = "";
  try { reply = formatCoachReply(JSON.parse(raw)); } catch { reply = ""; }
  if (!reply) return json({ error: "coach_unavailable" }, 502);
  return json({ reply, model: MODEL });
}
