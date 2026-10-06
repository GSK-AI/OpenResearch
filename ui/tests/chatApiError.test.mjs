import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import * as bashCommand from "../src/bashCommand.ts";
import * as chatRendering from "../src/chatRendering.ts";
import * as orxCommand from "../src/orxCommand.ts";

const require = createRequire(import.meta.url);
const source = readFileSync(new URL("../src/components/ChatPanel.tsx", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
// Every other app module is a stub: its exports render nothing and return nothing.
const stub = new Proxy({}, { get: (_, name) => (name === "__esModule" ? false : () => null) });
const mocks = {
  "../paraglide/messages.js": { m: new Proxy({}, { get: (_, name) => () => String(name) }) },
  "../paraglide/runtime.js": { getLocale: () => "en" },
  "../i18n": { ltr: String, autoDir: String },
  "../bashCommand": bashCommand,
  "../chatRendering": chatRendering,
  "../orxCommand": orxCommand,
  // The real router package warns about a circular require under CommonJS.
  "@tanstack/react-router": { useNavigate: () => () => {} },
};
const exports = {};
new Function("require", "exports", compiled)(
  (name) => mocks[name] ?? (name.startsWith(".") ? stub : require(name)),
  exports,
);
const render = (parts) => renderToStaticMarkup(React.createElement(React.Fragment, null, exports.renderParts(parts, {})));

const bash = { id: "tool-1", type: "tool", tool: "Bash", state: { status: "completed", input: { command: "echo ready" } } };
const apiError = (state) => ({
  id: "api-error-1",
  type: "tool",
  tool: "api_error",
  state: { status: "error", error: "API Error: Connection to the API was lost (ENOTFOUND).", ...state },
});

// The visible label of every rendered tool row, in order.
const rowLabels = (html) => [...html.matchAll(/class="tool-line[^"]*">([^<]*)</g)].map((match) => match[1]);

test("a classified API error renders outside the preceding tool group with the localized label", () => {
  const html = render([bash, apiError({ title: "Temporary API error" })]);

  assert.deepEqual(rowLabels(html), ["activity_ran_command", "chat_panel_temporary_api_error"]);
  assert.doesNotMatch(html, /chat_panel_used_tools/);
});
