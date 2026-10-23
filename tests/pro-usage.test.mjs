import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import ts from "typescript";
test("Pro daily allowance is atomic, per verified account, and resets at 6 a.m. Central", async () => {
 const sql = new DatabaseSync(":memory:");
 const db = { prepare(query) { const bind = (...args) => ({ first: async () => sql.prepare(query).get(...args), run: async () => sql.prepare(query).run(...args) }); return { bind, ...bind() }; } };
 let user = { email: "first@example.com" };
 const cache = new Map();
 function load(name) {
  if (name === "./pro-access") return { getProAccess: async () => ({ user }) };
  if (name === "cloudflare:workers") return { env: { DB: db } };
  if (cache.has(name)) return cache.get(name);
  const source = ts.transpileModule(readFileSync(new URL(`../app/${name.replace("./", "")}.ts`, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {}; cache.set(name, exports); new Function("require", "exports", source)(load, exports); return exports;
 }
 const { reserveProMessage } = load("./ai-usage");
 const before = new Date("2026-10-23T10:59:59Z");
 const results = await Promise.all(Array.from({ length: 55 }, () => reserveProMessage(before)));
 assert.equal(results.filter(x => x === "allowed").length, 50);
 assert.equal(results.filter(x => x === "exhausted").length, 5);
 user = { email: "FIRST@example.com" }; assert.equal(await reserveProMessage(before), "exhausted");
 user = { email: "second@example.com" }; assert.equal(await reserveProMessage(before), "allowed");
 user = { email: "first@example.com" }; assert.equal(await reserveProMessage(new Date("2026-10-23T11:00:00Z")), "allowed");
 user = null; assert.equal(await reserveProMessage(before), "sign_in_required");
});
