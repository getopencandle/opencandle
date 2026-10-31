import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { appendScriptConsole, compileLVScript, describeCompilation, findScriptMatches, formatLVScript, replaceScriptMatches, SCRIPT_CONSOLE_LIMIT, scriptHistoryCommand, scriptHistoryState } from '../../src/ui/script-editor-commands';
import { createScriptLibrary, importScriptText, scriptManifest, selectedScript, SCRIPT_MANIFEST_FORMAT } from '../../src/ui/script-library';
import { initialScript, scriptExamples } from '../../src/ui/ScriptPanel';
import { ScriptLibraryPanel } from '../../src/ui/ScriptLibraryPanel';

const require = createRequire(import.meta.url);
const { ScriptJobs } = require('../../electron/script-jobs.cjs');
const bars = Array.from({ length: 3 }, (_, index) => ({ id: 'synthetic-compile-' + index, revision: 1, time: index + 1, open: 10, high: 11, low: 9, close: 10, volume: 1 }));
async function runtime(source: string) { const jobs = new ScriptJobs(); try { return await jobs.run({ requestId: 'synthetic-compile', source, bars }); } finally { jobs.close(); } }

describe('SCRIPT.EDITOR.COMPILE static diagnostics', () => {
  it('reports a missing bracket at its line and column without executing', () => {
    const result = compileLVScript("({\n  onBar(ctx) {\n    ctx.plot('x', 1\n  }\n})");
    expect(result.ok).toBe(false); expect(result.diagnostics).toEqual([{ offset: 40, line: 4, column: 3, severity: 'error', code: 'SYNTAX', message: 'Syntax error near "}".' }]);
    expect(describeCompilation(result)).toBe('Compilation failed: 1 error. Nothing was executed.');
  });
  it('rejects the runtime-banned async/module tokens at each position, including inside comments', () => {
    const result = compileLVScript('({\n  // await later\n  async onBar(ctx) {}\n})');
    expect(result.diagnostics.filter(row => row.code === 'UNSUPPORTED_SYNTAX').map(row => [row.line, row.column])).toEqual([[2, 6], [3, 3]]); expect(result.ok).toBe(false);
  });
  it('explains a trailing line comment that hides the appended closing parenthesis', () => {
    const result = compileLVScript('({ onBar(ctx) {} }) // done');
    expect(result.diagnostics[0]).toMatchObject({ line: 1, column: 28, code: 'SYNTAX' }); expect(result.diagnostics[0].message).toContain('line comment on the last line');
  });
  it('warns about unknown ctx members, Math.random and unavailable globals but still compiles', () => {
    const result = compileLVScript("({ onBar(ctx) { ctx.plot('c', ctx.close); const r = Math.random(); new Date(); } })");
    expect(result.ok).toBe(true); expect(result.diagnostics.map(row => [row.code, row.column])).toEqual([['UNKNOWN_API', 35], ['NONDETERMINISTIC', 53], ['UNAVAILABLE_GLOBAL', 72]]);
    expect(describeCompilation(result)).toBe('Compiled without errors (3 warnings). Nothing was executed.');
  });
  it('accepts every shipped example and rejects oversized or multi-statement sources', () => {
    for (const source of Object.values(scriptExamples)) expect(compileLVScript(source)).toEqual({ ok: true, diagnostics: [] });
    expect(compileLVScript('x'.repeat(65537)).diagnostics).toEqual([{ offset: 0, line: 1, column: 1, severity: 'error', code: 'SOURCE_LIMIT', message: 'Script source exceeds 64 KiB UTF-8.' }]);
    expect(compileLVScript('const a = 1; ({ onBar(ctx) {} })').ok).toBe(false);
    expect(compileLVScript('({ init(ctx) {} })').diagnostics.map(row => row.code)).toEqual(['MISSING_ONBAR']);
  });
  it('agrees with the actual restricted runtime on rejected and accepted sources', async () => {
    for (const source of ["({ onBar(ctx) { ctx.plot('x', 1 } })", '({ async onBar(ctx) {} })', '({ onBar(ctx) {} }) // tail']) { expect(compileLVScript(source).ok, source).toBe(false); const executed = await runtime(source); expect(executed.ok, source).toBe(false); }
    const valid = "({ onBar(ctx) { ctx.plot('Close', ctx.bar.close); } })"; expect(compileLVScript(valid).ok).toBe(true); expect((await runtime(valid)).ok).toBe(true);
  });
});

describe('SCRIPT.EDITOR.FORMAT', () => {
  it('re-indents with two-space units and removes trailing spaces', () => {
    expect(formatLVScript("({\nonBar(ctx) {   \nctx.plot('a', 1);\n      }\n})")).toBe("({\n  onBar(ctx) {\n    ctx.plot('a', 1);\n  }\n})");
    for (const source of Object.values(scriptExamples)) expect(formatLVScript(source)).toBe(source);
  });
  it('leaves template-string content byte-identical and refuses syntax errors', () => {
    const source = "({\n  onBar(ctx) {\n    const t = `a   \n      b`;  \n  }\n})";
    expect(formatLVScript(source)).toBe("({\n  onBar(ctx) {\n    const t = `a   \n      b`;\n  }\n})");
    expect(() => formatLVScript('({ onBar(ctx) { ')).toThrow('Fix syntax errors before formatting. Nothing was changed.');
  });
});

describe('SCRIPT.EDITOR.FIND and REPLACE use the editor search engine', () => {
  const text = 'ctx.plot ctx.Plot plotX';
  it('finds case-insensitively by default and honors case and whole-word options without changing text', () => {
    expect(findScriptMatches(text, { search: 'plot' }).map(row => row.from)).toEqual([4, 13, 18]);
    expect(findScriptMatches(text, { search: 'plot', caseSensitive: true, wholeWord: true })).toEqual([{ from: 4, to: 8, line: 1, column: 5 }]);
    expect(findScriptMatches('a1\nb2 a3', { search: String.raw`[a-z]\d`, regexp: true }).map(row => [row.line, row.column])).toEqual([[1, 1], [2, 1], [2, 4]]);
    expect(() => findScriptMatches(text, { search: '(', regexp: true })).toThrow('valid search');
  });
  it('replaces the selected match then selects the next, or all matches, with regular-expression groups', () => {
    expect(replaceScriptMatches('foo foo foo', { search: 'foo', replace: 'bar' }, 'next', { anchor: 0, head: 3 })).toEqual({ source: 'bar foo foo', changed: true, selection: { anchor: 4, head: 7 } });
    expect(replaceScriptMatches('a1 b2 a3', { search: String.raw`([a-z])(\d)`, regexp: true, replace: '$2$1' }, 'all').source).toBe('1a 2b 3a');
    expect(replaceScriptMatches('Foo foo', { search: 'foo', caseSensitive: true, replace: 'x' }, 'all').source).toBe('Foo x');
    expect(replaceScriptMatches('abc', { search: 'z', replace: 'y' }, 'all')).toMatchObject({ source: 'abc', changed: false });
  });
});

describe('SCRIPT.EDITOR.UNDO and REDO are editor-document history only', () => {
  it('undoes and redoes buffer edits and reports when nothing remains', () => {
    let state = scriptHistoryState('({})'); state = state.update({ changes: { from: 2, insert: ' onBar(ctx) {} ' } }).state;
    const undone = scriptHistoryCommand(state, 'undo'); expect(undone).toMatchObject({ ran: true }); expect(undone.state.doc.toString()).toBe('({})');
    expect(scriptHistoryCommand(undone.state, 'undo').ran).toBe(false);
    const redone = scriptHistoryCommand(undone.state, 'redo'); expect(redone.state.doc.toString()).toBe('({ onBar(ctx) {} })'); expect(scriptHistoryCommand(redone.state, 'redo').ran).toBe(false);
  });
});

describe('SCRIPT.EDITOR.CONSOLE', () => {
  it('keeps the latest 200 plain-text entries with monotonic sequence numbers and strips control characters', () => {
    let entries = appendScriptConsole([], 'info', 'a\u0000b\u001b[31m<script>x</script>', new Date('2026-10-16T01:02:03.000Z'));
    expect(entries).toEqual([{ sequence: 1, time: '2026-10-16T01:02:03.000Z', level: 'info', message: 'a b [31m<script>x</script>' }]);
    for (let i = 0; i < 250; i++) entries = appendScriptConsole(entries, 'error', 'line ' + i + 'x'.repeat(2000));
    expect(entries).toHaveLength(SCRIPT_CONSOLE_LIMIT); expect(entries[0].sequence).toBe(52); expect(entries.at(-1)!.sequence).toBe(251); expect(entries.at(-1)!.message).toHaveLength(1000);
    expect(() => appendScriptConsole(entries, 'debug' as never, 'x')).toThrow('Unknown console level.');
  });
});

describe('SCRIPT.EDITOR.IMPORT / EXPORT single-script text and manifest', () => {
  const library = () => createScriptLibrary(initialScript);
  it('exports only the document fields and imports the manifest under a fresh identity without history', () => {
    const file = { name: 'Synthetic band', kind: 'indicator' as const, pane: 'price' as const, source: scriptExamples['SMA 20'] };
    const text = scriptManifest(file, '2026-10-16T00:00:00Z'), manifest = JSON.parse(text);
    expect(Object.keys(manifest)).toEqual(['format', 'schemaVersion', 'name', 'kind', 'pane', 'language', 'sourceBytes', 'exportedAt', 'source']);
    expect(manifest).toMatchObject({ format: SCRIPT_MANIFEST_FORMAT, schemaVersion: 1, name: 'Synthetic band', sourceBytes: new TextEncoder().encode(file.source).byteLength, exportedAt: '2026-10-16T00:00:00.000Z' });
    const imported = importScriptText(library(), text, () => 'fresh-id'); expect(imported.kind).toBe('manifest');
    expect(selectedScript(imported.library)).toMatchObject({ id: 'fresh-id', name: 'Synthetic band', kind: 'indicator', source: file.source, history: [] }); expect(imported.library.documents).toHaveLength(2);
  });
  it('imports plain LVScript text, inferring a strategy from ctx.order, and validates encoding and size', () => {
    const strategy = importScriptText(library(), scriptExamples['Moving average cross strategy'], () => 'plain-id');
    expect(strategy.kind).toBe('source'); expect(selectedScript(strategy.library)).toMatchObject({ id: 'plain-id', name: 'Imported script', kind: 'strategy', pane: 'price' });
    expect(() => importScriptText(library(), '({ onBar(ctx) { ctx.plot("�", 1); } })', () => 'x')).toThrow('undecodable');
    expect(() => importScriptText(library(), '({ onBar(ctx) { /* ' + '界'.repeat(22000) + ' */ } })', () => 'x')).toThrow('64 KiB');
    expect(() => importScriptText(library(), '   ', () => 'x')).toThrow('Paste or choose');
    const whole = importScriptText(library(), JSON.stringify(library()), () => 'lib-' + Math.random().toString(36).slice(2)); expect(whole.kind).toBe('library');
  });
});

describe('script editor command surface renders', () => {
  it('shows compile/format/find/replace/undo/redo commands, the console region and single-script export', () => {
    const markup = renderToStaticMarkup(React.createElement(ScriptLibraryPanel, { open: true, onClose: () => {}, chart: null, bars: [], fixture: true, identity: 'synthetic', library: createScriptLibrary(initialScript), onChange: () => {}, bindings: [], onBindingsChange: () => {} }));
    for (const label of ['>Compile<', '>Format<', '>Find<', '>Replace<', '>Undo<', '>Redo<', 'role="log"', '>Export current script<', '>New indicator<', '>New strategy<']) expect(markup, label).toContain(label);
  });
});

describe('SCRIPT.EDITOR.RENAME keeps references and diagnostics', () => {
  it('changes only the name: identity, history, recents, attached snapshots and source diagnostics are retained', async () => {
    const { draftScript, saveScript, bindScript } = await import('../../src/ui/script-library');
    const source = "({ onBar(ctx) { ctx.plot('c', ctx.close); } })";
    let library = saveScript(createScriptLibrary({ ...initialScript, source }), initialScript.id, '2026-10-16T00:00:00.000Z');
    const binding = bindScript(selectedScript(library), 'synthetic-binding'), before = compileLVScript(selectedScript(library).source);
    library = draftScript(library, initialScript.id, { name: 'Renamed synthetic script' });
    const file = selectedScript(library);
    expect(file).toMatchObject({ id: initialScript.id, name: 'Renamed synthetic script', source }); expect(file.history.map(row => row.name)).toEqual([initialScript.name]);
    expect(library.recentIds).toEqual([initialScript.id]); expect(binding).toMatchObject({ documentId: initialScript.id, name: initialScript.name, version: 1 });
    expect(compileLVScript(file.source)).toEqual(before); expect(before.diagnostics.map(row => row.code)).toEqual(['UNKNOWN_API']);
    expect(() => draftScript(library, initialScript.id, { name: '   ' })).toThrow('Invalid script name.');
  });
});
