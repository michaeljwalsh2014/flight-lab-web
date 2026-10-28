import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import ts from "typescript";
function setup() {
 const sql = new DatabaseSync(":memory:");
 for (const file of readdirSync(new URL("../drizzle", import.meta.url)).filter(f => f.endsWith(".sql")).sort()) sql.exec(readFileSync(new URL(`../drizzle/${file}`, import.meta.url), "utf8").replaceAll("--> statement-breakpoint", ""));
 const db = { prepare(query) {
   const bind = (...args) => ({ first: async () => sql.prepare(query).get(...args) ?? null, run: async () => sql.prepare(query).run(...args), all: async () => ({ results: sql.prepare(query).all(...args) }) });
   return { bind, ...bind() };
 }, async batch(statements) { sql.exec("BEGIN"); try { const results = []; for (const statement of statements) results.push(await statement.run()); sql.exec("COMMIT"); return results; } catch (error) { sql.exec("ROLLBACK"); throw error; } } };
 const cache = new Map();
 const load = name => {
  if (name === "cloudflare:workers") return { env: { DB: db } };
  name = name.replace("@/app/", "./");
  if (cache.has(name)) return cache.get(name);
  const source = ts.transpileModule(readFileSync(new URL(`../app/${name.replace("./", "")}.ts`, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const result = {}; cache.set(name, result); new Function("require", "exports", source)(load, result); return result;
 };
 return { store: load("./billing-store"), stripe: load("./stripe-server"), sql };
}
test("second incorrect guess locks the correct code out for exactly 24 hours", async () => {
 const { store } = setup(); const code = await store.issueCode(); const now = 100000;
 assert.equal((await store.redeemCode("alice", "wrong", now)).remaining, 1);
 const second = await store.redeemCode("alice", "wrong", now + 1000);
 assert.equal(second.remaining, 0); assert.equal(second.retryAt, now + 1000 + store.LOCKOUT_MS);
 assert.equal((await store.redeemCode("alice", code, second.retryAt - 1)).ok, false);
 assert.equal((await store.redeemCode("alice", code, second.retryAt)).ok, true);
});
test("one code works for multiple accounts and only hashes are stored", async () => {
 const { store, sql } = setup(); const code = await store.issueCode();
 assert.equal((await store.redeemCode("alice", code.toLowerCase())).ok, true);
 assert.equal((await store.redeemCode("bob", code)).ok, true);
 assert.equal((await store.readEntitlement("alice")).hasPro, true);
 assert.equal((await store.readEntitlement("charlie")).hasPro, false);
 assert.ok(!JSON.stringify(sql.prepare("SELECT * FROM pro_codes").all()).includes(code));
 const replacement = await store.issueCode();
 assert.equal((await store.redeemCode("charlie", code)).ok, false);
 assert.equal((await store.redeemCode("charlie", replacement)).ok, true);
 assert.equal((await store.readEntitlement("alice")).hasPro, true);
});
test("concurrent failed guesses reserve no more than two attempts", async () => {
 const { store, sql } = setup();
 const attempts = await Promise.all(Array.from({ length: 12 }, () => store.redeemCode("attacker", "guess", 1000)));
 assert.equal(sql.prepare("SELECT attempts FROM pro_code_attempts").get().attempts, 2);
 assert.equal(attempts.filter(result => result.remaining === 1).length, 1);
 assert.equal(attempts.filter(result => result.remaining === 0).length, 11);
});
test("paid access expires and canceled/unknown subscriptions never grant access", () => {
 const { store } = setup(); const row = { status: "active", paid_until: 2000 };
 assert.equal(store.subscriptionHasAccess(row, 1999), true);
 assert.equal(store.subscriptionHasAccess(row, 2000), false);
 assert.equal(store.subscriptionHasAccess({ ...row, cancel_at_end: 1 }, 1999), true);
 for (const status of ["canceled", "unpaid", "incomplete", "trialing"]) assert.equal(store.subscriptionHasAccess({ ...row, status }, 1000), false);
});
test("webhook rejects spoofed, modified and replayed payloads", async () => {
 const { stripe } = setup(); const raw = '{"type":"invoice.paid"}', secret = "whsec_test", now = 1700000000000, timestamp = String(now / 1000);
 const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
 const bytes = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${timestamp}.${raw}`));
 const signature = `t=${timestamp},v1=${Buffer.from(bytes).toString("hex")}`;
 assert.equal(await stripe.verifyStripeSignature(raw, signature, secret, now), true);
 assert.equal(await stripe.verifyStripeSignature(raw + " ", signature, secret, now), false);
 assert.equal(await stripe.verifyStripeSignature(raw, signature, secret, now + 301000), false);
 assert.equal(await stripe.verifyStripeSignature(raw, `t=${timestamp},v1=bad`, secret, now), false);
});
test("only the configured price and a paid invoice can provide a paid term", () => {
 const { stripe } = setup(); process.env.STRIPE_PRICE_ID = "price_monthly";
 const sub = { id: "sub_example", customer: "cus_example", status: "active", cancel_at_period_end: true, items: { data: [{ price: { id: "price_monthly" }, current_period_end: 100 }] }, latest_invoice: { status: "paid" } };
 assert.equal(stripe.subscriptionSnapshot(sub, "alice", 1).paid_until, 100000);
 assert.equal(stripe.subscriptionSnapshot({ ...sub, latest_invoice: { status: "open" } }, "alice", 1).paid_until, 0);
 assert.equal(stripe.subscriptionSnapshot({ ...sub, items: { data: [{ price: { id: "price_other" }, current_period_end: 100 }] } }, "alice", 1).paid_until, 0);
 delete process.env.STRIPE_PRICE_ID;
});
test("checkout stays disabled without explicit live credentials and activation", () => {
 const { stripe } = setup(); assert.equal(stripe.checkoutReady(), false);
});

test("anonymous pricing page offers sign-in and code options without taking payments", async () => {
 const { default: worker } = await import(new URL(`../dist/server/index.js?billing=${Date.now()}`, import.meta.url));
 const response = await worker.fetch(new Request("http://localhost/pricing", { headers: { accept: "text/html" } }), { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } }, { waitUntil() {}, passThroughOnException() {} });
 assert.equal(response.status, 200);
 const html = await response.text();
 assert.match(html, /\$2\.99/); assert.match(html, /Sign in to get Pro/); assert.match(html, /More/); assert.match(html, /Subscriptions opening soon|Payment setup is in progress/);
});
