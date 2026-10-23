import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import ts from "typescript";
const exports = {};
new Function("exports", ts.transpileModule(readFileSync(new URL("../app/coach-scroll.ts", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText)(exports);
test("new reply scrolls to its beginning rather than the conversation bottom", () => {
  const container = { scrollTop: 300, getBoundingClientRect: () => ({ top: 100 }) };
  const reply = { getBoundingClientRect: () => ({ top: 250 }) };
  exports.scrollToReplyStart(container, reply);
  assert.equal(container.scrollTop, 450);
});
test("reopening a conversation brings the latest reply back to its beginning", () => {
  const container = { scrollTop: 800, getBoundingClientRect: () => ({ top: 100 }) };
  const reply = { getBoundingClientRect: () => ({ top: -250 }) };
  exports.scrollToReplyStart(container, reply);
  assert.equal(container.scrollTop, 450);
});
test("short conversations cannot produce a negative scroll position", () => {
  const container = { scrollTop: 0, getBoundingClientRect: () => ({ top: 100 }) };
  exports.scrollToReplyStart(container, { getBoundingClientRect: () => ({ top: 98 }) });
  assert.equal(container.scrollTop, 0);
});
