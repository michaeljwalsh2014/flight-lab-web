import { getProAccess } from "@/app/pro-access";

export const dynamic = "force-dynamic";

const requestWindows = new Map<string, number[]>();

const VERIFIED_FACTS: Array<{ match: RegExp; answer: string; source: string }> = [
  {
    match: /(?:who (?:is|was) )?(?:the )?fastest (?:man|male runner|runner|person) (?:in|on) the world|men'?s 100.?m world record/i,
    answer: "Usain Bolt holds the men’s 100-meter world record: 9.58 seconds, set in Berlin on August 16, 2009.",
    source: "https://worldathletics.org/records/all-time-toplists/sprints/100-metres/all/men/senior",
  },
  {
    match: /(?:who (?:is|was) )?(?:the )?fastest (?:woman|female runner) (?:in|on) the world|women'?s 100.?m world record/i,
    answer: "Florence Griffith-Joyner holds the women’s 100-meter world record: 10.49 seconds, set in Indianapolis on July 16, 1988.",
    source: "https://worldathletics.org/records/all-time-toplists/sprints/100-metres/all/women/senior",
  },
];

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
  if (recent.length >= 20) return false;
  requestWindows.set(identifier, [...recent, now]);
  if (requestWindows.size > 2500) requestWindows.clear();
  return true;
}

function searchTerms(question: string) {
  return question
    .replace(/[^a-zA-Z0-9\s'’-]/g, " ")
    .replace(/^(who|what|where|when|which)\s+(is|are|was|were|did|does|do)\s+/i, "")
    .replace(/^tell me about\s+/i, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
}

function shortExtract(value: unknown) {
  if (typeof value !== "string") return "";
  const cleaned = value.replace(/\s+/g, " ").trim();
  const sentences = cleaned.match(/[^.!?]+[.!?]+/g)?.slice(0, 2).join(" ") ?? cleaned;
  return sentences.slice(0, 700).trim();
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

  const verified = VERIFIED_FACTS.find((fact) => fact.match.test(question));
  if (verified) return Response.json({ answer: verified.answer, source: verified.source, sourceName: "Verified record" });

  const query = searchTerms(question);
  if (!query) return Response.json({ error: "no_answer" }, { status: 404 });
  const endpoint = new URL("https://en.wikipedia.org/w/api.php");
  endpoint.search = new URLSearchParams({
    action: "query",
    generator: "search",
    gsrsearch: query,
    gsrlimit: "3",
    prop: "extracts|info",
    exintro: "1",
    explaintext: "1",
    inprop: "url",
    format: "json",
    origin: "*",
  }).toString();

  try {
    const upstream = await fetch(endpoint, { headers: { "User-Agent": "FlightLabCoach/1.0 (educational fact lookup)" } });
    if (!upstream.ok) return Response.json({ error: "lookup_unavailable" }, { status: 502 });
    const data = await upstream.json() as { query?: { pages?: Record<string, { index?: number; title?: string; extract?: string; fullurl?: string }> } };
    const pages = Object.values(data.query?.pages ?? {}).sort((a, b) => (a.index ?? 99) - (b.index ?? 99));
    const page = pages.find((item) => shortExtract(item.extract).length > 40 && item.fullurl);
    if (!page) return Response.json({ error: "no_answer" }, { status: 404 });
    return Response.json({ answer: shortExtract(page.extract), source: page.fullurl, sourceName: `Wikipedia · ${page.title ?? "Article"}` });
  } catch {
    return Response.json({ error: "lookup_unavailable" }, { status: 502 });
  }
}
