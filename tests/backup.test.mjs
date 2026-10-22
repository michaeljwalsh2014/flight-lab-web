import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import ts from "typescript";
function load(name) {
  const exports = {};
  const source = ts.transpileModule(readFileSync(new URL(`../app/pro/${name}.ts`, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function("exports", "require", source)(exports, dependency => load(dependency.replace("./", "")));
  return exports;
}
const exports = load("backup-data");
const { createBackup, parseBackup, planRestore } = exports;
const planesKey = "flight-lab-v2-planes", throwsKey = "flight-lab-v2-throws";
const storage = (values = {}) => ({ getItem: (key) => values[key] ?? null });
const backup = (data) => parseBackup(JSON.stringify({ format: "flight-lab-backup", version: 1, createdAt: "2026-10-06", data }));
const plane = { id: 1, name: "Dart", preset: "dart" };
const flight = { id: 2, planeId: 1, distance: 12, createdAt: "Just now" };
test("backup round trip retains images, conversations and model selection", () => {
  const values = { [planesKey]: JSON.stringify([{ ...plane, image: "data:image/png;base64,test" }]), [throwsKey]: JSON.stringify([flight]), "flight-lab-coach-model": "v38", "flight-lab-coach-conversation": JSON.stringify([{ role: "assistant", text: "Try a level throw" }]) };
  assert.deepEqual(parseBackup(JSON.stringify(createBackup(storage(values)))).data, values);
});
test("restore adds new records and retains local preferences", () => {
  const saved = backup({ [planesKey]: JSON.stringify([plane, { id: 3, name: "Glider" }]), [throwsKey]: JSON.stringify([flight]), "flight-lab-coach-model": "v40" });
  const writes = planRestore(saved, storage({ [planesKey]: JSON.stringify([plane]), "flight-lab-coach-model": "v39" }));
  assert.equal(JSON.parse(writes[planesKey]).length, 2);
  assert.equal(JSON.parse(writes[throwsKey])[0].planeId, 1);
  assert.equal(writes["flight-lab-coach-model"], undefined);
});
test("repeat restore does not duplicate planes or throws", () => {
  const data = { [planesKey]: JSON.stringify([plane]), [throwsKey]: JSON.stringify([flight]) };
  assert.deepEqual(planRestore(backup(data), storage(data)), {});
});
test("plane ID conflicts stop restore before any write", () => {
  assert.throws(() => planRestore(backup({ [planesKey]: JSON.stringify([{ ...plane, name: "Different plane" }]) }), storage({ [planesKey]: JSON.stringify([plane]) })), /different plane/);
});
test("orphan throws stop restore", () => {
  assert.throws(() => planRestore(backup({ [throwsKey]: JSON.stringify([flight]) }), storage()), /matching plane/);
});
test("invalid files, foreign keys, malformed records and duplicate IDs fail", () => {
  assert.throws(() => parseBackup("{}"));
  assert.throws(() => backup({ unrelated: "value" }));
  assert.throws(() => backup({ [planesKey]: "{}" }));
  assert.throws(() => backup({ [throwsKey]: JSON.stringify([{ ...flight, distance: -1 }]) }));
  assert.throws(() => backup({ [planesKey]: JSON.stringify([plane, plane]) }));
  assert.throws(() => backup({ [throwsKey]: JSON.stringify([{ ...flight, createdAt: {} }]) }));
  assert.throws(() => backup({ [planesKey]: JSON.stringify([{ ...plane, image: {} }]) }));
  assert.throws(() => backup({ "flight-lab-coach-conversation": JSON.stringify([{ role: "assistant", text: {} }]) }));
});
test("existing saved reports win conflicts while new reports are added", () => {
  const key = "flight-lab-pro-plane-reports-v1";
  const writes = planRestore(backup({ [key]: JSON.stringify({ 1: { headline: "old" }, 2: { headline: "new" } }) }), storage({ [key]: JSON.stringify({ 1: { headline: "current" } }) }));
  assert.deepEqual(JSON.parse(writes[key]), { 1: { headline: "current" }, 2: { headline: "new" } });
});

test("storage quota failure rolls back partial writes", () => {
  const values = new Map([[planesKey, JSON.stringify([plane])]]);
  const before = new Map(values);
  let writes = 0;
  const store = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => { if (++writes === 2) throw new Error("Quota exceeded"); values.set(key, value); }, removeItem: (key) => values.delete(key) };
  const saved = backup({ [planesKey]: JSON.stringify([plane, { id: 3, name: "Glider" }]), [throwsKey]: JSON.stringify([flight]) });
  assert.throws(() => exports.applyRestore(saved, store), /previous records were kept/);
  assert.deepEqual(values, before);
});

test("backup includes measurement, device layout and onboarding preferences without changing v1 format", () => {
  const values = { "flight-lab-pro-measure-age-range": "adult", "flight-lab-pro-device-layout": "ipad", "flight-lab-pro-welcome-v1": "done" };
  const saved = parseBackup(JSON.stringify(createBackup(storage(values))));
  assert.equal(saved.version, 1);
  assert.deepEqual(saved.data, values);
  assert.deepEqual(planRestore(saved, storage()), values);
  assert.deepEqual(planRestore(saved, storage(values)), {});
  assert.equal(planRestore(saved, storage({ "flight-lab-pro-device-layout": "iphone" }))["flight-lab-pro-device-layout"], undefined);
});
test("nested malformed reports and Coach evidence fail validation before restore", () => {
  for (const report of [null, [], { confidence: "high" }, { evidence: [17] }, { signals: { symmetry: -1 } }, { vision: { uncertainties: {} } }, { history: { count: 1, average: "12", best: 12 } }, { planeId: 2 }]) {
    assert.throws(() => backup({ "flight-lab-pro-plane-reports-v1": JSON.stringify({ 1: report }) }), /scan report/);
  }
  for (const context of [{ flight: [] }, { plane: { score: 101 } }, { videoInspection: { releaseStrength: "extreme" } }, { coachMemory: [{}] }]) {
    assert.throws(() => backup({ "flight-lab-pro-ai-context-v3": JSON.stringify(context) }), /Coach analysis/);
  }
  assert.throws(() => backup({ "flight-lab-pro-device-layout": "desktop" }), /preference/);
});
test("legacy reports and unknown report metadata survive validation unchanged", () => {
  const data = { "flight-lab-pro-plane-reports-v1": JSON.stringify({ 1: { headline: "Old report", extraMetadata: { keep: true } } }), "flight-lab-coach-model": "v37" };
  assert.deepEqual(backup(data).data, data);
});
