import assert from "node:assert/strict";
import test, { beforeEach } from "node:test";
import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import ts from "typescript";
beforeEach(() => { delete process.env.FLIGHT_LAB_BROWSER_CODE_HASH; });
async function configureCode(store) {
 const code = `FL-FIXTURE-${crypto.randomUUID()}`;
 process.env.FLIGHT_LAB_BROWSER_CODE_HASH = await store.sha256(store.normalizeCode(code));
 return code;
}
function setup() {
 const sql = new DatabaseSync(":memory:");
 for (const file of readdirSync(new URL("../drizzle", import.meta.url)).filter(f => f.endsWith(".sql")).sort()) sql.exec(readFileSync(new URL(`../drizzle/${file}`, import.meta.url), "utf8").replaceAll("--> statement-breakpoint", ""));
 const db = { prepare(query) {
   const bind = (...args) => ({ first: async () => sql.prepare(query).get(...args) ?? null, run: async () => sql.prepare(query).run(...args), all: async () => ({ results: sql.prepare(query).all(...args) }) });
   return { bind, ...bind() };
 }, async batch(statements) { sql.exec("BEGIN"); try { const results = []; for (const statement of statements) results.push(await statement.run()); sql.exec("COMMIT"); return results; } catch (error) { sql.exec("ROLLBACK"); throw error; } } };
 const cache = new Map();
 const load = name => {
  if (name === "@/app/pro-access") return { getProAccess: async () => ({ account: null }) };
  if (name === "next/headers") return { headers: async () => new Headers() };
  if (name === "cloudflare:workers") return { env: { DB: db } };
  name = name.replace("@/app/", "./");
  if (cache.has(name)) return cache.get(name);
  const source = ts.transpileModule(readFileSync(new URL(`../app/${name.replace("./", "")}.ts`, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const result = {}; cache.set(name, result); new Function("require", "exports", source)(load, result); return result;
 };
 return { store: load("./billing-store"), stripe: load("./stripe-server"), sql, load };
}
test("second incorrect guess locks the correct code out for exactly 24 hours", async () => {
 const { store } = setup(); const code = await configureCode(store); const now = 100000;
 assert.equal((await store.redeemCode("alice", "wrong", now)).remaining, 1);
 const second = await store.redeemCode("alice", "wrong", now + 1000);
 assert.equal(second.remaining, 0); assert.equal(second.retryAt, now + 1000 + store.LOCKOUT_MS);
 assert.equal((await store.redeemCode("alice", code, second.retryAt - 1)).ok, false);
 assert.equal((await store.redeemCode("alice", code, second.retryAt)).ok, true);
});
test("one code works for multiple accounts and only hashes are stored", async () => {
 const { store, sql } = setup(); const code = await configureCode(store);
 assert.equal((await store.redeemCode("alice", code.toLowerCase())).ok, true);
 assert.equal((await store.redeemCode("bob", code)).ok, true);
 assert.equal((await store.readEntitlement("alice")).hasPro, true);
 assert.equal((await store.readEntitlement("charlie")).hasPro, false);
 assert.ok(!JSON.stringify(sql.prepare("SELECT * FROM pro_codes").all()).includes(code));
 const replacement = await configureCode(store);
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

test("anonymous Pro access page offers code entry without sign-in or payments", async () => {
 const { default: worker } = await import(new URL(`../dist/server/index.js?billing=${Date.now()}`, import.meta.url));
 const response = await worker.fetch(new Request("http://localhost/pricing", { headers: { accept: "text/html" } }), { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } }, { waitUntil() {}, passThroughOnException() {} });
 assert.equal(response.status, 200);
 const html = await response.text();
 assert.match(html, /Enter code/); assert.match(html, /No sign-in or payment is needed/); assert.match(html, /Unlock Pro/); assert.doesNotMatch(html, /Sign in to get Pro|Subscribe for/);
});


test("anonymous code redemption sets a verified secure pass without granting a network address permanent access", async () => {
 const { store, sql, load } = setup();
 process.env.FLIGHT_LAB_BROWSER_CODE_HASH = await store.sha256(store.normalizeCode("FLIGHT-FIXTURE"));
 process.env.FLIGHT_LAB_BROWSER_PASS_SECRET = "fixture-secret-only";
 const api = load("./api/billing/redeem/route");
 const request = origin => new Request("https://flight-lab-airplane.mikewalsh3119.chatgpt.site/api/billing/redeem", { method: "POST", headers: { origin, "content-type": "application/json", "cf-connecting-ip": "192.0.2.1" }, body: JSON.stringify({ code: "FLIGHT-FIXTURE" }) });
 assert.equal((await api.POST(request("https://unrelated.example"))).status, 403);
 const response = await api.POST(request("https://flight-lab-airplane.mikewalsh3119.chatgpt.site"));
 assert.equal(response.status, 200); assert.equal((await response.json()).ok, true);
 const cookie = response.headers.get("set-cookie");
 assert.match(cookie, /HttpOnly/); assert.match(cookie, /Secure/); assert.match(cookie, /SameSite=Lax/);
 const token = cookie.split(";")[0].split("=")[1];
 assert.equal(await load("./browser-pro-pass").verifyBrowserPass(token), true);
 assert.equal(sql.prepare("SELECT COUNT(*) AS count FROM pro_grants").get().count, 0);
 delete process.env.FLIGHT_LAB_BROWSER_CODE_HASH; delete process.env.FLIGHT_LAB_BROWSER_PASS_SECRET;
});


test("legacy active codes are rejected even for an account that already has a grant", async () => {
 const { store, sql } = setup();
 const configured = await configureCode(store);
 const legacy = "FL-OLD-CODE";
 sql.prepare("INSERT INTO pro_codes (digest, active, created_at) VALUES (?, 1, 1)").run(await store.sha256(store.normalizeCode(legacy)));
 sql.prepare("INSERT INTO pro_grants (account, created_at) VALUES ('existing', 1)").run();
 assert.equal((await store.redeemCode("existing", legacy)).ok, false);
 assert.equal((await store.readEntitlement("existing")).hasPro, true);
 assert.equal((await store.redeemCode("new-browser", legacy, Date.now(), false)).ok, false);
 assert.equal((await store.redeemCode("new-browser", configured, Date.now(), false)).ok, true);
 assert.equal(sql.prepare("SELECT COUNT(*) AS count FROM pro_codes").get().count, 1);
});

test("missing configured code never falls back to stored legacy codes", async () => {
 const { store, sql } = setup();
 sql.prepare("INSERT INTO pro_codes (digest, active, created_at) VALUES (?, 1, 1)").run(await store.sha256(store.normalizeCode("LEGACY")));
 assert.equal((await store.redeemCode("test", "LEGACY")).ok, false);
});

test("additional code generation is disabled", async () => {
 const { load } = setup();
 const response = await load("./api/billing/codes/route").POST(new Request("https://flight-lab-airplane.mikewalsh3119.chatgpt.site/api/billing/codes", { method: "POST", headers: { origin: "https://flight-lab-airplane.mikewalsh3119.chatgpt.site" } }));
 assert.equal(response.status, 409);
 assert.equal((await response.json()).code, undefined);
});

test("lockout status survives reload checks without spending attempts or extending expiry", async () => {
 const { store, sql, load } = setup();
 const request = new Request("https://flight-lab-airplane.mikewalsh3119.chatgpt.site/api/billing/redeem", { headers: { "cf-connecting-ip": "192.0.2.55" } });
 const identity = await store.codeAttemptIdentity(null, request.headers);
 const now = Date.now();
 assert.equal(await store.readCodeLockout(identity, now), 0);
 await store.redeemCode(identity, "wrong", now, false);
 assert.equal(await store.readCodeLockout(identity, now), 0);
 const second = await store.redeemCode(identity, "wrong", now + 1, false);
 for (let reload = 0; reload < 3; reload++) {
  const response = await load("./api/billing/redeem/route").GET(request);
  assert.equal(response.status, 200);
  assert.match(response.headers.get("cache-control"), /no-store/);
  assert.equal((await response.json()).retryAt, second.retryAt);
 }
 const row = sql.prepare("SELECT attempts, resets_at FROM pro_code_attempts WHERE account = ?").get(identity);
 assert.equal(row.attempts, 2); assert.equal(row.resets_at, second.retryAt);
 assert.equal(await store.readCodeLockout(identity, second.retryAt - 1), second.retryAt);
 assert.equal(await store.readCodeLockout(identity, second.retryAt), 0);
});
