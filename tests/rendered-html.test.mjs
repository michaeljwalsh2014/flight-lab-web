import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("renders the finished Flight Lab website", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Flight Lab — Throw\. Measure\. Improve\.<\/title>/i);
  assert.match(html, /Measure a throw/i);
  assert.match(html, /Add to Home Screen/i);
  assert.match(html, /No throws yet/i);
  assert.doesNotMatch(html, /Your site is taking shape|codex-preview/i);
});

test("includes all three browser-friendly measuring tools", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(page, /Choose a measuring tool/);
  assert.match(page, /Walk & count/);
  assert.match(page, /Outdoor GPS/);
  assert.match(page, /Tape or Measure app/);
  assert.match(page, /Automatic step counting/);
  assert.match(page, /Allow location & set launch point/);
  assert.match(page, /error\.PERMISSION_DENIED/);
  assert.match(page, /error\.TIMEOUT/);
  assert.match(page, /heightDraft/);
  assert.match(page, /You can erase the current number and type any height/);
});

test("requires two airplane photos and can reject invalid images", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(page, /top view/i);
  assert.match(page, /bottom view/i);
  assert.match(page, /inspectPlanePhoto/);
  assert.match(page, /I can’t verify a paper airplane/);
  assert.match(page, /Non-airplane photos will be rejected instead of scored/);
  assert.match(page, /It wobbles side to side/);
  assert.match(page, /It spirals or corkscrews/);
  assert.doesNotMatch(page, /Math\.max\(55/);
});

test("uses on-device AI, plane pictures, and a labeled distance estimate", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(page, /@tensorflow-models\/coco-ssd/);
  assert.match(page, /The AI sees a \$\{unrelated\.class\}, not a plane/);
  assert.match(page, /Loading the on-device AI model/);
  assert.match(page, /Run full AI analysis/);
  assert.match(page, /Estimated next flight/);
  assert.match(page, /Estimate—not a measurement/);
  assert.match(page, /Paper Dart/);
  assert.match(page, /Wide Glider/);
  assert.match(page, /Take a picture or choose one/);
  assert.match(page, /\/plane-presets\/dart\.png/);
  assert.match(page, /\/plane-presets\/glider\.png/);
});

test("can delete a plane or an individual saved flight", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(page, /function deletePlane/);
  assert.match(page, /item\.planeId !== plane\.id/);
  assert.match(page, /function deleteFlight/);
  assert.match(page, /item\.id !== flight\.id/);
  assert.match(page, /aria-label={`Delete \$\{plane\.name\}`}/);
  assert.match(page, /title="Delete this flight"/);
});
