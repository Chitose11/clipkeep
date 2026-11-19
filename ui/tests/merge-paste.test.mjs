import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";

const mergeSource = readFileSync(new URL("../src/mergePaste.ts", import.meta.url), "utf8");
const app = readFileSync(new URL("../src/App.vue", import.meta.url), "utf8");
const compile = (source) => ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;

const mergeExports = {};
vm.runInNewContext(compile(mergeSource), { exports: mergeExports });
const { planMergePaste, MERGE_EMPTY, MERGE_MISSING, MERGE_NOT_TEXT } = mergeExports;
const plain = (value) => JSON.parse(JSON.stringify(value));

const text = (id) => ({ id, kind: "text" });
const image = (id) => ({ id, kind: "image" });

test("selection order is kept and is not the visual list order", () => {
  const clips = [text(1), text(2), text(3)];
  assert.deepEqual(plain(planMergePaste([3, 1], clips)), { ok: true, ids: [3, 1] });
  assert.deepEqual(plain(planMergePaste([2, 3, 1], clips)), { ok: true, ids: [2, 3, 1] });
});

test("a single text clip, including a color value stored as text, can be merged", () => {
  assert.deepEqual(plain(planMergePaste([7], [text(7)])), { ok: true, ids: [7] });
});

test("an empty selection is rejected", () => {
  assert.deepEqual(plain(planMergePaste([], [text(1)])), { ok: false, message: MERGE_EMPTY });
});

test("any image rejects the whole selection instead of pasting the text subset", () => {
  const clips = [text(1), image(2), text(3)];
  assert.deepEqual(plain(planMergePaste([1, 2, 3], clips)), { ok: false, message: MERGE_NOT_TEXT });
  assert.deepEqual(plain(planMergePaste([2], clips)), { ok: false, message: MERGE_NOT_TEXT });
  assert.deepEqual(plain(planMergePaste([2, 99], clips)), { ok: false, message: MERGE_NOT_TEXT });
});

test("a selected id that is no longer on screen is rejected", () => {
  assert.deepEqual(plain(planMergePaste([1, 99], [text(1)])), { ok: false, message: MERGE_MISSING });
});

function panel() {
  const script = app.match(/<script setup lang="ts">([\s\S]*?)<\/script>/)[1];
  const ast = ts.createSourceFile("App.ts", script, ts.ScriptTarget.Latest, true);
  const names = new Set(["onKey", "eventTargetElement", "pasteMerged"]);
  const source = ast.statements
    .filter((node) => ts.isFunctionDeclaration(node) && names.has(node.name?.text))
    .map((node) => node.getText(ast))
    .join("\n");
  assert.equal(source.match(/function /g).length, names.size);
  const calls = [];
  const context = vm.createContext({
    accessibilityGuide: { value: false },
    previewClip: { value: null },
    editing: { value: false },
    openSubmenu: { value: null },
    clipMenu: { open: false },
    groupMenu: { open: false },
    groupEditor: { open: false },
    groupPicker: { open: false },
    page: { value: "list" },
    clips: { value: [text(1), image(2), text(3)] },
    selected: { value: 0 },
    inMultiSelect: { value: false },
    multiSelect: { ids: [] },
    query: { value: "" },
    transferBusy: { value: false },
    transferGeneration: 0,
    searchEl: { value: null },
    document: { activeElement: null },
    planMergePaste,
    flash(message) { calls.push(["flash", message]); },
    paste(row) { calls.push(["paste", row?.id]); },
    copyOnly(row) { calls.push(["copy", row?.id]); },
    api: { async pasteMerged(ids) { calls.push(["api", Array.from(ids)]); } },
    async explainAccessibilityIfNeeded() { return false; },
    reportFocusError(error) { calls.push(["error", String(error)]); },
    closePreview() { calls.push(["closePreview"]); },
    savePreview() { calls.push(["savePreview"]); },
    clearMultiSelect() { calls.push(["clear"]); },
    hideWindow() { calls.push(["hide"]); },
    move() {},
    togglePreview() { calls.push(["preview"]); },
    cycleTab() {},
    togglePin() {},
    toggleFav() {},
    remove() {},
    nextTick(fn) { fn?.(); },
    HTMLInputElement: function HTMLInputElement() {},
    HTMLTextAreaElement: function HTMLTextAreaElement() {},
  });
  vm.runInContext(compile(source), context);
  const key = (event) => context.onKey({
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    preventDefault() { calls.push(["prevent"]); },
    ...event,
  });
  return { context, calls, key };
}

async function flush() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

test("plain Enter, Shift+Enter and digit shortcuts still paste one row", () => {
  const p = panel();
  p.context.inMultiSelect.value = true;
  p.context.multiSelect.ids = [3, 1];
  p.key({ key: "Enter" });
  p.key({ key: "Enter", shiftKey: true });
  p.key({ key: "1", ctrlKey: true });
  assert.deepEqual(p.calls, [
    ["paste", 1],
    ["prevent"],
    ["copy", 1],
    ["prevent"],
    ["paste", 1],
    ["prevent"],
  ]);
});

test("Ctrl or Cmd+Enter merges in selection order and does not paste the focused row", async () => {
  for (const modifier of [{ ctrlKey: true }, { metaKey: true }]) {
    const p = panel();
    p.context.inMultiSelect.value = true;
    p.context.multiSelect.ids = [3, 1];
    p.key({ key: "Enter", ...modifier });
    await flush();
    assert.deepEqual(p.calls.filter((call) => call[0] === "api"), [["api", [3, 1]]]);
    assert.equal(p.calls.some((call) => call[0] === "paste"), false);
    assert.equal(p.context.transferBusy.value, false);
  }
});

test("Ctrl+Enter without a multi-selection still pastes the focused row", () => {
  const p = panel();
  p.key({ key: "Enter", ctrlKey: true });
  assert.deepEqual(p.calls.filter((call) => call[0] !== "prevent"), [["paste", 1]]);
});

test("preview editing keeps Ctrl+Enter as save", () => {
  const p = panel();
  p.context.previewClip.value = { kind: "text" };
  p.context.editing.value = true;
  p.context.inMultiSelect.value = true;
  p.context.multiSelect.ids = [3, 1];
  p.key({ key: "Enter", ctrlKey: true });
  assert.deepEqual(p.calls.filter((call) => call[0] !== "prevent"), [["savePreview"]]);
});

test("Enter on the merge bar does not also paste the focused row", () => {
  const p = panel();
  p.context.inMultiSelect.value = true;
  p.context.multiSelect.ids = [3, 1];
  const button = { closest: (selector) => (selector === ".multi-bar" ? button : null) };
  p.key({ key: "Enter", target: button });
  assert.deepEqual(p.calls, []);
});

test("merge paste reports images, missing rows and empty selections without calling the backend", async () => {
  const mixed = panel();
  mixed.context.multiSelect.ids = [1, 2];
  await mixed.context.pasteMerged();
  assert.deepEqual(mixed.calls, [["flash", MERGE_NOT_TEXT]]);

  const missing = panel();
  missing.context.multiSelect.ids = [1, 99];
  await missing.context.pasteMerged();
  assert.deepEqual(missing.calls, [["flash", MERGE_MISSING]]);

  const empty = panel();
  await empty.context.pasteMerged();
  assert.deepEqual(empty.calls, [["flash", MERGE_EMPTY]]);
});

test("a failed merge paste surfaces the backend error", async () => {
  const p = panel();
  p.context.multiSelect.ids = [3, 1];
  p.context.api.pasteMerged = async () => {
    throw new Error("原输入框已失去焦点，内容已复制，请手动粘贴");
  };
  await p.context.pasteMerged();
  assert.equal(p.calls.some((call) => call[0] === "error" && String(call[1]).includes("内容已复制")), true);
  assert.equal(p.context.transferBusy.value, false);
});

test("the list template keeps click-to-paste and adds merge paste on the selection bar", () => {
  assert.match(app, /clearMultiSelect\(\);\s*paste\(c\);/);
  assert.match(app, /else if \(e\.key === "Enter"\) e\.shiftKey \? copyOnly\(current\) : paste\(current\)/);
  assert.match(app, /e\.key === "Enter" && !e\.shiftKey && ctrl && inMultiSelect\.value\) pasteMerged\(\)/);
  assert.match(app, /class="multi-bar-paste"/);
  assert.match(app, /await api\.pasteMerged\(plan\.ids\)/);
});
