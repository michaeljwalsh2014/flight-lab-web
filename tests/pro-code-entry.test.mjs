import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
const require = createRequire(import.meta.url);
const source = ts.transpileModule(readFileSync(new URL("../app/pricing/pro-code-entry.tsx", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const component = {};
new Function("require", "exports", source)(require, component);
test("a refreshed locked page renders the code field and submit disabled before hydration", () => {
 const html = renderToStaticMarkup(React.createElement(component.default, { hasPro: false, initialRetryAt: Date.now() + 86400000 }));
 assert.match(html, /<input[^>]*id="pro-access-code"[^>]*disabled=""/);
 assert.match(html, /<button[^>]*disabled=""[^>]*>Unlock Pro/);
 assert.match(html, /Code entry is temporarily unavailable/);
 assert.doesNotMatch(html, /Two incorrect attempts|24 hours|30 days|attempts remaining/);
});
test("entry stays disabled until the server status is confirmed, including status failures", () => {
 const html = renderToStaticMarkup(React.createElement(component.default, { hasPro: false, initialStatusUnavailable: true }));
 assert.match(html, /<input[^>]*disabled=""/);
 assert.match(html, /Code entry could not be checked/);
 assert.match(html, /Enter code/);
});
