import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import ts from "typescript";

// Run the actual component handlers/effects with controlled storage and deferred photo work.
// This keeps races deterministic without a camera, paid AI calls, or a browser dependency.
function harness(componentName = "ProPlaneCoach", initial = {}) {
  const data = new Map([
    ["flight-lab-v2-planes", JSON.stringify([{ id: 1, name: "Dart", preset: "dart" }, { id: 2, name: "Glider", preset: "glider" }])],
    ["flight-lab-v2-throws", "[]"], ["flight-lab-v2-active-plane-id", "1"],
  ]);
  for (const [key, value] of Object.entries(initial)) data.set(key, value);
  const listeners = new Map();
  const storage = { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value), removeItem: key => data.delete(key) };
  const window = { localStorage: storage, sessionStorage: storage, location: { pathname: "/pro" },
    setTimeout: fn => { queueMicrotask(fn); return 1; },
    addEventListener: (type, fn) => { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(fn); },
    removeEventListener: (type, fn) => listeners.get(type)?.delete(fn),
    dispatchEvent: event => { for (const fn of listeners.get(event.type) ?? []) fn(event); },
  };
  class CustomEvent { constructor(type, options = {}) { this.type = type; this.detail = options.detail; } }
  let slots = [], cursor = 0, pending = [], dirty = true, tree, model = "v40", inspectionResolve;
  const evidence = [];
  const react = {
    useState(initial) {
      const i = cursor++;
      if (!(i in slots)) slots[i] = typeof initial === "function" ? initial() : initial;
      return [slots[i], value => { const next = typeof value === "function" ? value(slots[i]) : value; if (!Object.is(next, slots[i])) { slots[i] = next; dirty = true; } }];
    },
    useRef(initial) { const i = cursor++; return slots[i] ??= { current: initial }; },
    useMemo(fn) { return fn(); },
    useEffect(fn, deps) {
      const i = cursor++, previous = slots[i];
      if (!previous || !deps || deps.some((dep, j) => !Object.is(dep, previous.deps[j]))) {
        slots[i] = { deps, cleanup: previous?.cleanup };
        pending.push(() => { slots[i].cleanup?.(); slots[i].cleanup = fn(); });
      }
    },
  };
  function compile(path, extra = "") {
    const exports = {};
    const source = ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8") + extra, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
    new Function("require", "exports", "window", "CustomEvent", "URL", source)(require, exports, window, CustomEvent, { createObjectURL: () => "blob:test-photo", revokeObjectURL() {} });
    return exports;
  }
  const actualStorage = compile("../app/storage-safety.ts");
  const actualAnalysis = compile("../app/pro/analysis-data.ts");
  function require(name) {
    if (name === "react") return react;
    if (name === "react/jsx-runtime") return { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) };
    if (name === "../storage-safety") return actualStorage;
    if (name === "./analysis-data") return actualAnalysis;
    if (name === "@/app/flight-lab-app") return { inspectPlanePhoto: () => new Promise(resolve => { inspectionResolve = resolve; }), detectObjects: async () => [] };
    if (name === "./model-version") return { useModelVersion: () => [model, value => { model = value; dirty = true; }], COACH_MODEL_NUMBER: { v40: "4.0", v39: "3.9" }, COACH_MODEL_OPTIONS: [{ model: "v40" }, { model: "v39" }] };
    if (name === "./pro-ai-context") return { currentPlaneId: () => Number(storage.getItem("flight-lab-v2-active-plane-id")) || null, readProAiContext: () => ({}), publishProAiContext: value => evidence.push(value) };
    if (name === "./evidence-label") return { evidenceLabel: () => "test evidence" };
    return {};
  }
  const Component = compile("../app/pro/pro-dashboard.tsx", "\nexport { ProPlaneCoach, ProPlaneHangar }; ")[componentName];
  function flush() {
    let count = 0;
    while (dirty || pending.length) {
      if (++count > 30) throw new Error("Effect loop");
      if (dirty) { dirty = false; cursor = 0; tree = Component({ level: "pro" }); }
      const effects = pending; pending = []; for (const effect of effects) effect();
    }
    return tree;
  }
  function all(node) { if (!node || typeof node !== "object") return []; if (Array.isArray(node)) return node.flatMap(item => all(item)); return [node, ...all(node.props?.children)]; }
  function text(node) { if (node == null || typeof node === "boolean") return ""; if (Array.isArray(node)) return node.map(text).join(""); return typeof node === "object" ? text(node.props?.children) : String(node); }
  flush();
  return { flush, data, storage, evidence, text: () => text(tree), all: () => all(tree),
    clickButton(name) { all(tree).find(node => node.type === "button" && text(node) === name).props.onClick(); flush(); },
    editBest(value) { all(tree).find(node => node.type === "input" && node.props.placeholder === "No measured throws yet").props.onChange({ target: { value } }); flush(); },
    changeModel(value) { model = value; dirty = true; flush(); },
    refresh() { window.dispatchEvent(new CustomEvent("flight-lab-planes-updated")); flush(); },
    photo() { all(tree).find(node => node.type === "input" && node.props.type === "file").props.onChange({ target: { files: [{ type: "image/png" }], value: "photo" } }); flush(); },
    analyze() { return all(tree).find(node => node.type === "button" && node.props.onClick?.name === "analyzePlane").props.onClick(); },
    finishInspection() { inspectionResolve({ recognizable: true, symmetry: 90, outline: 90, foldVisibility: 90 }); },
  };
}
test("logging a throw preserves unfinished photos for the same plane", () => {
  const app = harness(); app.photo();
  assert.match(app.text(), /1\/1/);
  app.data.set("flight-lab-v2-throws", JSON.stringify([{ id: 3, planeId: 1, distance: 25, createdAt: "now" }]));
  app.refresh();
  assert.match(app.text(), /1\/1/);
  assert.ok(app.all().some(node => node.type === "img" && node.props.src === "blob:test-photo"));
});
test("switching planes resets photos and current scan evidence", () => {
  const app = harness(); app.photo();
  app.data.set("flight-lab-v2-active-plane-id", "2"); app.refresh();
  assert.match(app.text(), /0\/1/);
  assert.equal(app.evidence.at(-1).plane, undefined);
});
for (const change of ["plane", "model", "photo"]) {
  test(`a scan finishing after a ${change} change cannot save or display the old result`, async () => {
    const app = harness(); app.photo();
    const pending = app.analyze(); app.flush();
    if (change === "plane") { app.data.set("flight-lab-v2-active-plane-id", "2"); app.refresh(); }
    if (change === "model") app.changeModel("v39");
    if (change === "photo") app.photo();
    app.finishInspection(); await pending; app.flush();
    assert.equal(app.data.get("flight-lab-pro-plane-reports-v1"), undefined);
    assert.doesNotMatch(app.text(), /Analysis complete|Scan selection changed/);
  });
}
test("a failed plane save does not add a plane or show a success notice", () => {
  const app = harness("ProPlaneHangar");
  const input = app.all().find(node => node.type === "input" && node.props.type !== "file");
  input.props.onChange({ target: { value: "New plane" } }); app.flush();
  const original = app.data.get("flight-lab-v2-planes");
  app.storage.setItem = () => { throw new Error("QuotaExceeded"); };
  app.all().find(node => node.type === "button" && node.props.className === "pro-command-button").props.onClick(); app.flush();
  assert.equal(app.data.get("flight-lab-v2-planes"), original);
  assert.match(app.text(), /Changes were not saved/);
  assert.doesNotMatch(app.text(), /New plane was saved/);
});

test("an unchanged scan still completes and saves its report", async () => {
  const app = harness(); app.changeModel("v39"); app.photo();
  const pending = app.analyze(); app.flush();
  await Promise.resolve();
  app.finishInspection(); await pending; app.flush();
  const reports = JSON.parse(app.data.get("flight-lab-pro-plane-reports-v1"));
  assert.equal(reports["1"].planeId, 1);
  assert.match(app.text(), /Analysis complete/);
});

const reportsKey = "flight-lab-pro-plane-reports-v1";
const testsKey = "flight-lab-pro-coach-tests-v1";
async function completeScan(app) {
  app.changeModel("v39"); app.photo(); const pending = app.analyze(); app.flush();
  await Promise.resolve(); app.finishInspection(); await pending; app.flush();
  return JSON.parse(app.data.get(reportsKey))["1"];
}
test("a saved report reopens after reload without using new photos or claiming fresh evidence", async () => {
  const app = harness(); const report = await completeScan(app);
  const fresh = harness("ProPlaneCoach", { [reportsKey]: JSON.stringify({ 1: report }) });
  fresh.photo(); fresh.clickButton("View last saved report");
  assert.match(fresh.text(), /Saved report/);
  assert.match(fresh.text(), /historical analysis/);
  assert.equal(fresh.evidence.at(-1).plane, undefined);
  assert.ok(!fresh.all().some(node => node.props?.className === "pro-report-photos"));
  fresh.data.set("flight-lab-v2-active-plane-id", "2"); fresh.refresh();
  assert.doesNotMatch(fresh.text(), /historical analysis/);
  fresh.clickButton("View last saved report");
  assert.match(fresh.text(), /No saved report for this plane/);
});
test("legacy report without a timestamp remains readable and malformed reports remain untouched", async () => {
  const app = harness(); const report = await completeScan(app);
  delete report.savedAt; delete report.history; delete report.baselineFeet; delete report.baselineSource;
  app.data.set(reportsKey, JSON.stringify({ 1: report })); app.clickButton("View last saved report");
  assert.match(app.text(), /Date not recorded/);
  assert.match(app.text(), /Older estimate/);
  const malformed = JSON.stringify({ 1: { ...report, vision: { uncertainties: 3 } } });
  app.data.set(reportsKey, malformed); app.clickButton("View last saved report");
  assert.match(app.text(), /Saved reports could not be read/);
  assert.equal(app.data.get(reportsKey), malformed);
});
test("feedback persists, avoids duplicate clicks, and restores its selection", async () => {
  const app = harness(); const report = await completeScan(app);
  app.clickButton("Better"); app.clickButton("Better");
  const feedback = JSON.parse(app.data.get(testsKey));
  assert.equal(feedback.length, 1); assert.equal(feedback[0].recommendationId, report.recommendationId);
  assert.equal(app.evidence.at(-1).coachMemory[0].result, "better");
  const fresh = harness("ProPlaneCoach", { [reportsKey]: app.data.get(reportsKey), [testsKey]: app.data.get(testsKey) });
  fresh.clickButton("View last saved report");
  assert.match(fresh.text(), /Saved: better/);
  fresh.clickButton("Worse");
  assert.equal(JSON.parse(fresh.data.get(testsKey)).length, 2);
  assert.equal(fresh.evidence.at(-1).coachMemory.at(-1).result, "worse");
});
test("feedback save failures and corrupt feedback cannot report success or replace history", async () => {
  const app = harness(); await completeScan(app);
  const write = app.storage.setItem;
  app.storage.setItem = () => { throw new Error("quota"); };
  app.clickButton("Better");
  assert.match(app.text(), /could not be saved/); assert.doesNotMatch(app.text(), /Saved: better/);
  app.storage.setItem = write; app.data.set(testsKey, "broken"); app.clickButton("Worse");
  assert.equal(app.data.get(testsKey), "broken"); assert.match(app.text(), /has been preserved/);
});
test("entered best overrides saved best in the estimate without changing saved throws", async () => {
  const throws = JSON.stringify([{ id: 5, planeId: 1, distance: 40, createdAt: "now" }]);
  const app = harness("ProPlaneCoach", { "flight-lab-v2-throws": throws });
  app.editBest("20"); app.refresh();
  const report = await completeScan(app);
  assert.equal(report.baselineFeet, 20); assert.equal(report.baselineSource, "entered");
  assert.equal(report.history.best, 40);
  assert.equal(app.data.get("flight-lab-v2-throws"), throws);
  assert.match(app.text(), /20.0 ft user-entered baseline/);
  app.clickButton("Use saved best");
  const saved = await completeScan(app); assert.equal(saved.baselineFeet, 40); assert.equal(saved.baselineSource, "saved");
});
test("missing or cleared best is labeled uncalibrated; invalid values do not start analysis", async () => {
  const app = harness(); const report = await completeScan(app);
  assert.equal(report.baselineSource, "none"); assert.match(app.text(), /Uncalibrated illustration/);
  app.editBest("-5"); await app.analyze(); app.flush();
  assert.match(app.text(), /between 0.1 and 1,000/);
  assert.equal(JSON.parse(app.data.get(reportsKey))["1"].savedAt, report.savedAt);
});
