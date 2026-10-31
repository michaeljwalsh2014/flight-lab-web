import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import ts from "typescript";
test("Pro daily allowance is atomic, per verified account, and resets at 6 a.m. Central", async () => {
 const sql = new DatabaseSync(":memory:");
 const db = { prepare(query) { const bind = (...args) => ({ first: async () => sql.prepare(query).get(...args), run: async () => sql.prepare(query).run(...args) }); return { bind, ...bind() }; } };
 let user = { email: "first@example.com" }, passIdentity = null;
 const cache = new Map();
 function load(name) {
  name = name.replace("@/app/", "./");
  if (name === "./pro-access") return { getProAccess: async () => ({ user, passIdentity }) };
  if (name === "cloudflare:workers") return { env: { DB: db } };
  if (cache.has(name)) return cache.get(name);
  const source = ts.transpileModule(readFileSync(new URL(`../app/${name.replace("./", "")}.ts`, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {}; cache.set(name, exports); new Function("require", "exports", source)(load, exports); return exports;
 }
 const { reserveProMessage, reserveProReview, refundProReview } = load("./ai-usage");
 const before = new Date("2026-10-23T10:59:59Z");
 const results = await Promise.all(Array.from({ length: 55 }, () => reserveProMessage(before)));
 assert.equal(results.filter(x => x === "allowed").length, 50);
 assert.equal(results.filter(x => x === "exhausted").length, 5);
 user = { email: "FIRST@example.com" }; assert.equal(await reserveProMessage(before), "exhausted");
 user = { email: "second@example.com" }; assert.equal(await reserveProMessage(before), "allowed");
 user = { email: "first@example.com" }; assert.equal(await reserveProMessage(new Date("2026-10-23T11:00:00Z")), "allowed");
 const reviews = await Promise.all(Array.from({ length: 10 }, () => reserveProReview(before)));
 assert.equal(reviews.filter(x => x === "allowed").length, 7);
 assert.equal(reviews.filter(x => x === "exhausted").length, 3);
 await refundProReview(before); assert.equal(await reserveProReview(before), "allowed");
 assert.equal(await reserveProReview(before), "exhausted");
 assert.equal(await reserveProReview(new Date("2026-10-23T11:00:00Z")), "allowed");
 user = null; assert.equal(await reserveProMessage(before), "sign_in_required");
 passIdentity = "browser-pass:fixture";
 const passReviews = await Promise.all(Array.from({ length: 10 }, () => reserveProReview(before)));
 assert.equal(passReviews.filter(x => x === "allowed").length, 7);
 assert.equal(passReviews.filter(x => x === "exhausted").length, 3);
 await refundProReview(before); assert.equal(await reserveProReview(before), "allowed");
 assert.equal(await reserveProMessage(before), "allowed");
});

test("usage messages show the actual next reset date, including before 6 a.m.", () => {
 const source = ts.transpileModule(readFileSync(new URL("../app/usage-message.ts", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
 const exports = {}; new Function("require", "exports", source)(() => ({}), exports);
 assert.match(exports.exhaustedUsageMessage("Pro AI reviews", "2026-10-23T11:00:00Z"), /run out of Pro AI reviews.*6 a.m. Central on Oct 23, 2026/);
 assert.match(exports.exhaustedUsageMessage("Free Coach messages", "2026-10-24T11:00:00Z"), /Oct 24, 2026/);
});
