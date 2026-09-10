import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

function loadRoutes({ fetch, env = { GEMINI_API_KEY: "test-secret" }, owner = true } = {}) {
  const cache = new Map();
  function load(name) {
    if (name === "next/server") return { NextResponse: { json: (value, init) => Response.json(value, init) } };
    if (name === "@/app/pro-access") return { getProAccess: async () => ({ user: owner ? { email: "owner@example.com" } : null, isOwner: owner }) };
    if (name === "react") return {};
    if (cache.has(name)) return cache.get(name);
    const file = new URL(`../${name.replace("@/", "")}.ts`, import.meta.url);
    const compiled = ts.transpileModule(readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    const exports = {};
    cache.set(name, exports);
    new Function("require", "exports", "process", "fetch", compiled)(load, exports, { env }, fetch);
    return exports;
  }
  return { video: load("@/app/api/pro-video/route"), scan: load("@/app/api/pro-scan/route"), coach: load("@/app/api/pro-coach/route"), gemini: load("@/app/gemini-server"), models: load("@/app/pro/model-version") };
}
const views = ["top", "nose", "left", "right", "underside", "tail"];
const images = Object.fromEntries(views.map((view) => [view, "data:image/png;base64,aGVsbG8="]));
const analysis = { recognizable: true, confidence: 70, observations: ["Left wing visible", "Nose centered"], uncertainties: [], issues: [], symmetryScore: 80, noseAlignment: "centered", wingDihedral: "slight", foldDefinition: "crisp", inspectionSummary: "Visible folds appear consistent." };
const request = (body) => new Request("https://flightlab.test/api", { method: "POST", body: JSON.stringify({ modelVersion: "v40", ...body }) });
const completion = (text, finishReason = "STOP") => Response.json({ candidates: [{ finishReason, content: { parts: [{ thought: true, text: "private reasoning" }, { text }] } }] });

test("six-view scan sends labeled image bytes to Gemini and preserves the report contract", async () => {
  let upstreamCalls = 0;
  const { scan } = loadRoutes({ fetch: async (url, init) => {
    upstreamCalls++;
    assert.match(url, /^https:\/\/generativelanguage\.googleapis\.com\//);
    assert.equal(init.headers["x-goog-api-key"], "test-secret");
    assert.doesNotMatch(url, /test-secret/);
    const body = JSON.parse(init.body);
    const parts = body.contents[0].parts;
    assert.equal(parts.filter((part) => part.inlineData).length, 6);
    assert.deepEqual(parts.filter((part) => part.inlineData).map((part) => part.inlineData), views.map(() => ({ mimeType: "image/png", data: "aGVsbG8=" })));
    for (const view of views) assert.ok(parts.some((part) => part.text === `${view.toUpperCase()} VIEW`));
    assert.equal(body.generationConfig.responseJsonSchema.type, "object");
    return completion(JSON.stringify(analysis));
  } });
  const response = await scan.POST(request({ coachId: "scan-test-001", images }));
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).analysis, analysis);
  assert.equal(upstreamCalls, 1);
});

test("unauthorized and incomplete scans cannot call the paid provider", async () => {
  const fetch = async () => { throw new Error("Provider must not be called"); };
  const denied = loadRoutes({ fetch, owner: false });
  assert.equal((await denied.scan.POST(request({ coachId: "scan-test-002", images }))).status, 403);
  assert.equal((await denied.coach.POST(request({ coachId: "coach-test-01", message: "Hello" }))).status, 403);
  const allowed = loadRoutes({ fetch });
  assert.equal((await allowed.scan.POST(request({ coachId: "scan-test-003", images: { top: images.top } }))).status, 400);
});

test("invalid or truncated Gemini reports fail cleanly without exposing the key", async () => {
  for (const upstream of [completion(JSON.stringify({ ...analysis, symmetryScore: 1000 })), completion("partial", "MAX_TOKENS"), new Response("test-secret", { status: 429 })]) {
    const { scan } = loadRoutes({ fetch: async () => upstream.clone() });
    const response = await scan.POST(request({ coachId: "scan-test-004", images }));
    assert.equal(response.status, upstream.status === 429 ? 429 : 502);
    const failure = await response.json();
    assert.ok(failure.message);
    assert.doesNotMatch(JSON.stringify(failure), /test-secret|Gemini/);
  }
});

test("busy and timed-out requests use a backup; quota errors do not retry", async () => {
  for (const timeout of [false, true]) {
    const calls = [];
    const { gemini } = loadRoutes({ fetch: async (url) => {
      calls.push(url);
      if (calls.length === 1) {
        if (timeout) throw new DOMException("Timeout", "TimeoutError");
        return new Response("busy", { status: 503 });
      }
      return completion("A complete answer.");
    } });
    assert.deepEqual(await gemini.generateGeminiResult({ instructions: "Answer", contents: [] }), { text: "A complete answer.", model: "gemini-3.5-flash-lite" });
    assert.equal(calls.length, 2);
    assert.match(calls[0], /gemini-3.5-flash:/);
    assert.match(calls[1], /gemini-3.5-flash-lite:/);
  }
  let count = 0;
  const { coach } = loadRoutes({ fetch: async () => { count++; return new Response("secret", { status: 429 }); } });
  const response = await coach.POST(request({ coachId: "quota-test-001", message: "Find a record", searchMode: "search" }));
  assert.equal(response.status, 429);
  assert.match((await response.json()).message, /Choose Answer/);
  assert.equal(count, 1);
});

test("v40 always sends factual questions to Gemini instead of the built-in pack", async () => {
  let count = 0;
  const { coach } = loadRoutes({ fetch: async (url) => {
    count++;
    assert.match(url, /generativelanguage\.googleapis\.com/);
    return completion("Parker Solar Probe is the fastest human-made object.");
  } });
  const response = await coach.POST(request({ coachId: "object-test-001", message: "What's the fastest man-made object?", searchMode: "answer" }));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("X-Flight-Lab-Source"), "cloud");
  assert.match(await response.text(), /Parker Solar Probe/);
  assert.equal(count, 1);
});

test("video review sends chronological real frames and rejects invalid or unauthorized requests", async () => {
  const frames = [0, 1, 2, 3].map((time) => ({ time, image: images.top }));
  const review = { canReview: false, summary: "No motion evidence.", observations: ["Identical images."], uncertainties: ["Flight is not visible."], nextTest: "Film a complete throw.", releaseStrength: "uncertain", releaseConfidence: 10 };
  let count = 0;
  const { video } = loadRoutes({ fetch: async (_url, init) => {
    count++;
    const body = JSON.parse(init.body);
    const parts = body.contents[0].parts;
    assert.equal(parts.filter((p) => p.inlineData).length, 4);
    assert.deepEqual(parts.filter((p) => p.inlineData).map((p) => p.inlineData.data), frames.map(() => "aGVsbG8="));
    assert.match(parts[1].text, /0.000 seconds/);
    assert.match(parts[7].text, /3.000 seconds/);
    assert.match(body.systemInstruction.parts[0].text, /Never invent physical distance/);
    assert.match(body.systemInstruction.parts[0].text, /release strength/i);
    return completion(JSON.stringify(review));
  } });
  const body = { duration: 4, coachId: "video-test-001", frames };
  assert.deepEqual((await (await video.POST(request(body))).json()).analysis, review);
  for (const invalid of [{ duration: 46 }, { frames: [] }, { frames: [{ ...frames[0], time: -.5 }, ...frames.slice(1)] }, { modelVersion: "v39" }]) {
    assert.equal((await video.POST(request({ ...body, ...invalid }))).status, 400);
  }
  const denied = loadRoutes({ owner: false, fetch: async () => { throw new Error("must not call"); } });
  assert.equal((await denied.video.POST(request(body))).status, 403);
  assert.equal(count, 1);
});

test("text Coach uses Gemini, passes conversation history and evidence, and omits thinking", async () => {
  const { coach } = loadRoutes({ fetch: async (_url, init) => {
    const body = JSON.parse(init.body);
    assert.match(body.systemInstruction.parts[0].text, /Always identify yourself simply as Flight Lab Coach/);
    assert.doesNotMatch(body.systemInstruction.parts[0].text, /Google|Gemini/);
    assert.equal(body.contents[0].role, "model");
    assert.match(body.contents.at(-1).parts[0].text, /left wing/);
    assert.equal(body.generationConfig.thinkingConfig.thinkingLevel, "high");
    return completion("Try one small adjustment.");
  } });
  const status = await coach.GET(new Request("https://flightlab.test/api?modelVersion=v40"));
  assert.equal((await status.json()).typedModel, "gemini-3.5-flash");
  const response = await coach.POST(request({ coachId: "coach-test-02", message: "What should I try?", thinkingMode: "hard", history: [{ role: "assistant", text: "Tell me about the plane." }], context: { observation: "left wing" } }));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("X-Flight-Lab-Model"), "gemini-3.5-flash");
  assert.equal(await response.text(), "Try one small adjustment.");
});

test("Coach Auto lets Gemini choose thinking dynamically", async () => {
  const { coach } = loadRoutes({ fetch: async (_url, init) => {
    const body = JSON.parse(init.body);
    assert.equal(body.generationConfig.thinkingConfig, undefined);
    return completion("Automatic answer.");
  } });
  const response = await coach.POST(request({ coachId: "coach-test-auto", message: "Explain lift", thinkingMode: "auto" }));
  assert.equal(response.status, 200);
});

test("Coach Fast uses the low-latency model with short minimal-thinking replies", async () => {
  const { coach } = loadRoutes({ fetch: async (url, init) => {
    const body = JSON.parse(init.body);
    assert.match(url, /gemini-3\.5-flash-lite:/);
    assert.equal(body.generationConfig.thinkingConfig.thinkingLevel, "minimal");
    assert.equal(body.generationConfig.maxOutputTokens, 768);
    assert.match(body.systemInstruction.parts[0].text, /no more than four concise sentences/);
    return completion("A quick answer.");
  } });
  const response = await coach.POST(request({ coachId: "coach-test-fast", message: "Explain lift", thinkingMode: "fast" }));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("X-Flight-Lab-Model"), "gemini-3.5-flash-lite");
  assert.equal(await response.text(), "A quick answer.");
});

test("existing OpenAI fallback and explicit web search remain available", async () => {
  const { coach } = loadRoutes({ env: { GEMINI_API_KEY: "test-secret", OPENAI_API_KEY: "existing-secret" }, fetch: async (url) => {
    assert.equal(url, "https://api.openai.com/v1/responses");
    return Response.json({ output: [{ content: [{ type: "output_text", text: "A sourced answer." }] }] });
  } });
  const response = await coach.POST(request({ coachId: "coach-test-03", message: "Search for a record", searchMode: "search", modelVersion: "v39" }));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("X-Flight-Lab-Source"), "web");
  const fallback = loadRoutes({ env: { OPENAI_API_KEY: "existing-secret" } });
  assert.equal((await (await fallback.coach.GET(new Request("https://flightlab.test/api"))).json()).typedModel, "gpt-5.6-terra");
});

test("Flight Lab 4.0 and 4.6 use advanced AI while 3.8 and 3.9 retain their existing provider", async () => {
  const { coach, scan, models } = loadRoutes({ fetch: async () => { throw new Error("Provider must not be called"); } });
  assert.deepEqual(models.COACH_MODEL_OPTIONS.map((option) => option.model), ["v46", "v40", "v39", "v38"]);
  assert.deepEqual(models.COACH_MODEL_OPTIONS.map((option) => option.label), ["Flight Lab 4.6", "Flight Lab 4.0", "Flight Lab 3.9", "Flight Lab 3.8"]);
  for (const version of ["v38", "v39", "v40", "v46"]) assert.equal(models.normalizeModelVersion(version), version);
  assert.equal(models.normalizeModelVersion("v37"), "v38");
  assert.equal(models.normalizeModelVersion(null), "v40");
  for (const version of ["v38", "v39"]) {
    const status = await coach.GET(new Request(`https://flightlab.test/api?modelVersion=${version}`));
    assert.deepEqual(await status.json(), { available: false, typedModel: "gpt-5.6-terra", voiceModel: "gpt-realtime-2.1" });
    assert.equal((await scan.POST(request({ modelVersion: version, coachId: "legacy-test-01", images }))).status, 503);
  }
});

test("Flight Lab 4.6 uses Gemini 3.8 Flash while its Fast mode stays on Flash-Lite", async () => {
  const calls = [];
  const { coach } = loadRoutes({ fetch: async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body) });
    return completion(calls.length === 1 ? "A deeper answer." : "A fast answer.");
  } });
  const status = await coach.GET(new Request("https://flightlab.test/api?modelVersion=v46"));
  assert.equal((await status.json()).typedModel, "gemini-3.8-flash");
  const deeper = await coach.POST(request({ modelVersion: "v46", coachId: "coach-v46-hard", message: "Explain this flight", thinkingMode: "hard" }));
  assert.equal(deeper.headers.get("X-Flight-Lab-Model"), "gemini-3.8-flash");
  assert.match(calls[0].url, /gemini-3\.8-flash:/);
  assert.equal(calls[0].body.generationConfig.thinkingConfig.thinkingLevel, "high");
  const fast = await coach.POST(request({ modelVersion: "v46", coachId: "coach-v46-fast", message: "Answer quickly", thinkingMode: "fast" }));
  assert.equal(fast.headers.get("X-Flight-Lab-Model"), "gemini-3.5-flash-lite");
  assert.match(calls[1].url, /gemini-3\.5-flash-lite:/);
  assert.equal(calls[1].body.generationConfig.thinkingConfig.thinkingLevel, "minimal");
});

test("Flight Lab 4.6 photo and video reviews use the newer visual model", async () => {
  const scan = loadRoutes({ fetch: async (url, init) => {
    assert.match(url, /gemini-3\.8-flash:/);
    assert.equal(JSON.parse(init.body).generationConfig.thinkingConfig.thinkingLevel, "medium");
    return completion(JSON.stringify(analysis));
  } }).scan;
  const scanResponse = await scan.POST(request({ modelVersion: "v46", scanMode: "quick", coachId: "scan-v46-001", images: { top: images.top } }));
  assert.equal(scanResponse.status, 200);
  assert.equal((await scanResponse.json()).model, "gemini-3.8-flash");

  const frames = [0, 1, 2, 3].map((time) => ({ time, image: images.top }));
  const review = { canReview: true, summary: "Flight visible.", observations: ["The release is visible."], uncertainties: [], nextTest: "Repeat the throw.", releaseStrength: "normal", releaseConfidence: 70 };
  const video = loadRoutes({ fetch: async (url) => {
    assert.match(url, /gemini-3\.8-flash:/);
    return completion(JSON.stringify(review));
  } }).video;
  const videoResponse = await video.POST(request({ modelVersion: "v46", duration: 4, coachId: "video-v46-001", frames }));
  assert.equal(videoResponse.status, 200);
  assert.equal((await videoResponse.json()).model, "gemini-3.8-flash");
});

test("v40 quick check sends the actual single photo and reported flight context", async () => {
  const { scan } = loadRoutes({ fetch: async (_url, init) => {
    const body = JSON.parse(init.body);
    assert.deepEqual(body.contents[0].parts.filter((part) => part.inlineData), [{ inlineData: { mimeType: "image/png", data: "aGVsbG8=" } }]);
    assert.match(body.contents[0].parts[0].text, /last flight dives/);
    assert.match(body.contents[0].parts[0].text, /reported throw strength strong/);
    return completion(JSON.stringify(analysis));
  } });
  const response = await scan.POST(request({ scanMode: "quick", coachId: "quick-test-001", images: { top: images.top }, planeStyle: "dart", ageRange: "11-13", throwStrength: "strong", lastFlight: "dives", measuredBest: 52 }));
  assert.equal(response.status, 200);
});

test("v40 live search stays on Gemini and includes grounded source links", async () => {
  const { coach } = loadRoutes({ fetch: async (url, init) => {
    assert.match(url, /generativelanguage\.googleapis\.com/);
    assert.deepEqual(JSON.parse(init.body).tools, [{ google_search: {} }]);
    return Response.json({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: "Here is the record." }] }, groundingMetadata: { groundingChunks: [{ web: { uri: "https://example.com/record", title: "Record" } }] } }] });
  } });
  const response = await coach.POST(request({ coachId: "search-test-001", message: "Find a record", searchMode: "search" }));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("X-Flight-Lab-Model"), "gemini-3.5-flash");
  assert.match(await response.text(), /https:\/\/example.com\/record/);
});
