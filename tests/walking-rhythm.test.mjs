import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import ts from "typescript";
const exports = {};
new Function("exports", ts.transpileModule(readFileSync(new URL("../app/pro/walking-rhythm.ts", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText)(exports);
const { WalkingRhythmCounter } = exports;
function simulate(signal, duration, sampleEvery = 20, counter = new WalkingRhythmCounter()) {
  let count = 0;
  for (let time = 0; time < duration; time += sampleEvery) count += counter.sample(signal(time), time);
  return { count, counter };
}
test("regular walking confirms its first steps together and keeps counting", () => {
  for (const cadence of [450, 600, 900]) {
    const { count } = simulate(t => 9.81 + 2.8 * Math.sin(2 * Math.PI * t / cadence), cadence * 10);
    assert.ok(count >= 9 && count <= 10, `${cadence}ms cadence counted ${count} of 10`);
  }
});
test("one or two isolated movements cannot establish walking", () => {
  assert.equal(simulate(t => t < 1200 ? 9.81 + 2.8 * Math.sin(2 * Math.PI * t / 600) : 9.81, 2500).count, 0);
  assert.equal(simulate(t => t === 500 ? 20 : 9.81, 2000).count, 0);
});
test("rapid shaking and still-device noise do not count", () => {
  assert.equal(simulate(t => 9.81 + 3 * Math.sin(2 * Math.PI * t / 180), 6000).count, 0);
  assert.equal(simulate(t => 9.81 + .15 * Math.sin(t), 6000).count, 0);
});
test("pauses require a fresh walking rhythm", () => {
  const counter = new WalkingRhythmCounter();
  simulate(t => 9.81 + 2.8 * Math.sin(2 * Math.PI * t / 600), 3600, 20, counter);
  counter.sample(9.81, 6000);
  assert.equal(counter.walking, false);
  let added = 0;
  for (let t = 6020; t < 6600; t += 20) added += counter.sample(9.81 + 2.8 * Math.sin(2 * Math.PI * (t - 6000) / 600), t);
  assert.equal(added, 0);
});
test("invalid readings and different sensor sampling rates remain safe", () => {
  const counter = new WalkingRhythmCounter();
  assert.equal(counter.sample(NaN, 20), 0);
  assert.equal(counter.sample(12, Infinity), 0);
  for (const interval of [16, 33, 50]) {
    const { count } = simulate(t => 9.81 + 2.8 * Math.sin(2 * Math.PI * t / 600), 6000, interval);
    assert.ok(count >= 9 && count <= 10, `${interval}ms samples counted ${count}`);
  }
});
