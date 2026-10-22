import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import ts from "typescript";
function load(path, window) {
  const exports = {};
  const source = ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function("exports", "window", "CustomEvent", source)(exports, window, class { constructor(type, options) { this.type = type; this.detail = options.detail; } });
  return exports;
}
function storage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return { data, getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value), removeItem: key => data.delete(key) };
}
const { readRecords, writeAtomically } = load("../app/storage-safety.ts");
test("malformed saved records are rejected without replacing any bytes", () => {
  for (const value of ["broken", "{}", '[{"id":1}]', '[{"id":null,"name":"Dart"}]']) {
    const saved = storage({ "flight-lab-v2-planes": value });
    assert.throws(() => readRecords(saved, "flight-lab-v2-planes"));
    assert.equal(saved.getItem("flight-lab-v2-planes"), value);
  }
});
test("failed multi-record save restores earlier writes and leaves failed record untouched", () => {
  const saved = storage({ planes: "original planes", throws: "original throws" });
  const setItem = saved.setItem;
  saved.setItem = (key, value) => { if (key === "throws") throw new Error("QuotaExceeded"); setItem(key, value); };
  assert.throws(() => writeAtomically(saved, { planes: "new planes", throws: "new throws" }), /previous records were kept/);
  assert.equal(saved.getItem("planes"), "original planes");
  assert.equal(saved.getItem("throws"), "original throws");
});
test("failed initial save rolls back only new records, leaving unrelated data intact", () => {
  const saved = storage({ coach: "history" });
  const setItem = saved.setItem;
  saved.setItem = (key, value) => { if (key === "throws") throw new Error("QuotaExceeded"); setItem(key, value); };
  assert.throws(() => writeAtomically(saved, { planes: "new", throws: "new" }));
  assert.equal(saved.getItem("planes"), null);
  assert.equal(saved.getItem("coach"), "history");
});
test("unavailable reads prevent writes and failed recovery is explicitly reported", () => {
  let writes = 0;
  assert.throws(() => writeAtomically({ getItem() { throw new Error("blocked"); }, setItem() { writes++; } }, { planes: "new" }));
  assert.equal(writes, 0);
  const saved = storage({ planes: "original" });
  saved.setItem = (key, value) => { if (++writes > 1) throw new Error("blocked"); saved.data.set(key, value); };
  assert.throws(() => writeAtomically(saved, { planes: "new", throws: "new" }), /recovery could not finish/);
});
function evidenceWindow() {
  return { localStorage: storage({ "flight-lab-v2-planes": '[{"id":1,"name":"A"},{"id":2,"name":"B"}]', "flight-lab-v2-active-plane-id": "1" }), sessionStorage: storage(), dispatchEvent() {} };
}
test("switching planes filters scan, video, and feedback evidence without deleting saved records", () => {
  const win = evidenceWindow();
  const api = load("../app/pro/pro-ai-context.ts", win);
  api.publishProAiContext({ plane: { planeId: 1 }, flight: { planeId: 1 }, videoInspection: { planeId: 1 }, coachMemory: [{ planeId: 1 }, { planeId: 2 }] });
  const original = win.sessionStorage.getItem("flight-lab-pro-ai-context-v3");
  win.localStorage.setItem("flight-lab-v2-active-plane-id", "2");
  assert.equal(api.readProAiContext().plane, undefined);
  assert.equal(api.readProAiContext().flight, undefined);
  assert.equal(api.readProAiContext().videoInspection, null);
  assert.deepEqual(api.readProAiContext().coachMemory, [{ planeId: 2 }]);
  assert.equal(win.sessionStorage.getItem("flight-lab-pro-ai-context-v3"), original);
});
test("legacy videos without plane attribution cannot influence another plane", () => {
  const api = load("../app/pro/pro-ai-context.ts", evidenceWindow());
  const legacy = { flight: { confidence: 90 }, videoInspection: { releaseStrength: "strong" } };
  assert.equal(api.contextForPlane(legacy, 1).flight, undefined);
  assert.equal(api.contextForPlane(legacy, null).videoInspection, null);
});
test("invalidating a report removes it from current evidence and storage failure keeps the new session usable", () => {
  const win = evidenceWindow();
  const api = load("../app/pro/pro-ai-context.ts", win);
  api.publishProAiContext({ plane: { planeId: 1 } });
  api.publishProAiContext({ plane: undefined });
  assert.equal(api.readProAiContext().plane, undefined);
  win.sessionStorage.setItem = () => { throw new Error("QuotaExceeded"); };
  api.publishProAiContext({ videoInspection: { planeId: 1, summary: "current" } });
  assert.equal(api.readProAiContext().videoInspection.summary, "current");
});
test("unreadable session evidence is preserved while new evidence stays usable", () => {
  const win = evidenceWindow();
  win.sessionStorage.setItem("flight-lab-pro-ai-context-v3", "broken");
  const api = load("../app/pro/pro-ai-context.ts", win);
  api.publishProAiContext({ plane: { planeId: 1 } });
  assert.equal(api.readProAiContext().plane.planeId, 1);
  assert.equal(win.sessionStorage.getItem("flight-lab-pro-ai-context-v3"), "broken");
});
