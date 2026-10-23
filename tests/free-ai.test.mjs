import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import ts from "typescript";
function setup() {
  const sql = new DatabaseSync(":memory:");
  const db = { prepare(query) {
    const bind = (...args) => ({ first: async () => sql.prepare(query).get(...args) ?? null, run: async () => sql.prepare(query).run(...args) });
    return { bind, ...bind() };
  } };
  let user = { email: "free@example.com" }, calls = 0, fail = false;
  const cache = new Map();
  function load(name) {
    if (name === "@/app/chatgpt-auth") return { getChatGPTUser: async () => user };
    if (name === "cloudflare:workers") return { env: { DB: db } };
    if (name === "@/app/gemini-server") return { geminiAvailable: () => true, generateGeminiResult: async options => { calls++; assert.equal(options.search, undefined); assert.equal(options.preferFastModel, true); if (fail) throw new Error("upstream"); return { text: "Try one small fold adjustment." }; }, publicAIError: () => ({ status: 503, body: { message: "Try again shortly." } }) };
    if (cache.has(name)) return cache.get(name);
    const file = `../${name.replace("@/", "")}.ts`;
    const source = ts.transpileModule(readFileSync(new URL(file, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    const exports = {}; cache.set(name, exports); new Function("require", "exports", source)(load, exports); return exports;
  }
  const api = load("@/app/api/free-ai/route"), usage = load("@/app/free-usage");
  const send = (body, origin = "https://flight.test") => api.POST(new Request("https://flight.test/api/free-ai", { method: "POST", headers: { "Content-Type": "application/json", origin }, body: JSON.stringify(body) }));
  return { api, usage, db, send, calls: () => calls, user: value => { user = value; }, fail: value => { fail = value; } };
}
test("free Coach and photo usage require a verified account", async () => {
  const app = setup(); app.user(null);
  assert.equal((await app.api.GET()).status, 401);
  assert.equal((await app.send({ action: "message", message: "hello" })).status, 401);
  assert.equal((await app.send({ action: "photo" })).status, 401);
  assert.equal(app.calls(), 0);
});
test("free daily limits are 20 messages and three photos, counted separately", async () => {
  const app = setup();
  for (let i = 0; i < 20; i++) assert.equal((await app.send({ action: "message", message: "help", coachId: `changed-${i}` })).status, 200);
  assert.equal((await app.send({ action: "message", message: "one more" })).status, 429);
  for (let i = 0; i < 3; i++) assert.equal((await app.send({ action: "photo" })).status, 200);
  assert.equal((await app.send({ action: "photo" })).status, 429);
  assert.equal(app.calls(), 20);
  const status = await (await app.api.GET()).json();
  assert.equal(status.messagesRemaining, 0); assert.equal(status.photosRemaining, 0);
});
test("concurrent requests cannot exceed the free daily budget", async () => {
  const app = setup();
  const responses = await Promise.all(Array.from({ length: 25 }, () => app.send({ action: "message", message: "help" })));
  assert.equal(responses.filter(response => response.status === 200).length, 20);
  assert.equal(responses.filter(response => response.status === 429).length, 5);
  assert.equal(app.calls(), 20);
});
test("failed AI responses restore the free message allowance", async () => {
  const app = setup(); app.fail(true);
  assert.equal((await app.send({ action: "message", message: "help" })).status, 503);
  assert.equal((await (await app.api.GET()).json()).messagesRemaining, 20);
  app.fail(false); assert.equal((await app.send({ action: "message", message: "retry" })).status, 200);
  assert.equal((await (await app.api.GET()).json()).messagesRemaining, 19);
});
test("free allowances follow the verified account and ignore forged client IDs", async () => {
  const app = setup(); await app.send({ action: "photo", email: "other@example.com", coachId: "fake" });
  assert.equal((await (await app.api.GET()).json()).photosRemaining, 2);
  app.user({ email: "different@example.com" }); assert.equal((await (await app.api.GET()).json()).photosRemaining, 3);
  app.user({ email: "FREE@example.com" }); assert.equal((await (await app.api.GET()).json()).photosRemaining, 2);
});
test("allowances reset at 6 a.m. Central even after only one use", async () => {
  const app = setup(); const db = await app.usage.freeUsageDb(); const id = await app.usage.freeIdentity("person@example.com");
  const before = new Date("2026-10-23T10:59:59Z"), atReset = new Date("2026-10-23T11:00:00Z");
  await app.usage.reserveFreeUsage(db, id, "photos", before);
  await app.usage.reserveFreeUsage(db, id, "messages", before);
  assert.equal((await app.usage.readFreeUsage(db, id, before)).photosRemaining, 2);
  assert.equal((await app.usage.readFreeUsage(db, id, before)).messagesRemaining, 19);
  assert.equal((await app.usage.readFreeUsage(db, id, atReset)).photosRemaining, 3);
  assert.equal((await app.usage.readFreeUsage(db, id, atReset)).messagesRemaining, 20);
  assert.equal((await app.usage.readFreeUsage(db, id, before)).photosRemaining, 2);
});
test("6 a.m. reset respects standard time, daylight time, DST transitions, and year rollover", () => {
  const { freePeriod } = setup().usage;
  for (const [instant, period, resetsAt] of [
    ["2026-10-23T10:59:59Z", "2026-10-22", "2026-10-23T11:00:00.000Z"],
    ["2026-10-23T11:00:00Z", "2026-10-23", "2026-10-24T11:00:00.000Z"],
    ["2026-11-01T11:59:59Z", "2026-10-31", "2026-11-01T12:00:00.000Z"],
    ["2026-11-01T12:00:00Z", "2026-11-01", "2026-11-02T12:00:00.000Z"],
    ["2027-03-14T10:59:59Z", "2027-03-13", "2027-03-14T11:00:00.000Z"],
    ["2027-03-14T11:00:00Z", "2027-03-14", "2027-03-15T11:00:00.000Z"],
    ["2027-01-01T05:00:00Z", "2026-12-31", "2027-01-01T12:00:00.000Z"],
  ]) assert.deepEqual(freePeriod(new Date(instant)), { period, resetsAt });
});
test("invalid requests, video requests and cross-origin requests cannot spend quota", async () => {
  const app = setup();
  assert.equal((await app.send({ action: "message", message: "" })).status, 400);
  assert.equal((await app.send({ action: "video" })).status, 400);
  assert.equal((await app.send({ action: "photo" }, "https://other.test")).status, 403);
  assert.equal((await (await app.api.GET()).json()).messagesRemaining, 20); assert.equal(app.calls(), 0);
});
