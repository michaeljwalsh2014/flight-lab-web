import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../app/pro/pro-ui.tsx", import.meta.url), "utf8");
const fn = source.match(/export function estimatedProgress[\s\S]*?\n}/)[0];
const js = ts.transpileModule(fn, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText;
const { estimatedProgress } = await import(`data:text/javascript,${encodeURIComponent(js)}`);

test("inspection estimates keep advancing through normal and extended AI waits", () => {
  for (const duration of [2500, 6000, 25000, 60000]) {
    let previous = 0;
    for (let elapsed = 0; elapsed <= duration * 10; elapsed += 200) {
      const value = estimatedProgress(elapsed, duration);
      assert.ok(value > previous, `progress stalled at ${elapsed}ms for ${duration}ms inspection`);
      assert.ok(value < 100, "unfinished work must never claim completion");
      previous = value;
    }
  }
});

test("six-photo inspection advances more slowly than one-photo inspection", () => {
  assert.ok(estimatedProgress(20000, 60000) < estimatedProgress(20000, 25000));
  assert.ok(estimatedProgress(60000, 60000) < 90);
  assert.ok(estimatedProgress(120000, 60000) > estimatedProgress(60000, 60000));
});

test("every fresh request starts low and long requests stay below completion", () => {
  assert.equal(estimatedProgress(0, 25000), 1);
  assert.ok(estimatedProgress(3600000, 25000) < 100);
  assert.ok(Number.isFinite(estimatedProgress(100, 0)));
});
