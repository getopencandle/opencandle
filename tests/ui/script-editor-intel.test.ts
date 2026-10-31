import { describe, expect, it } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { EditorState } from '@codemirror/state';
import { CompletionContext } from '@codemirror/autocomplete';
import { LVSCRIPT_CONTEXT_MEMBERS, LVSCRIPT_TA_FUNCTIONS, compileLVScript } from '../../src/ui/script-editor-commands';
import { LVSCRIPT_CONTEXT_DOCS, LVSCRIPT_TA_DOCS, SCRIPT_PALETTE_COMMANDS, SCRIPT_SNIPPETS, minimapRows, minimapViewport, paletteResults, paletteScore, scriptApiDoc, scriptCompletionNames, scriptCompletionSource, scriptCompletionTarget, scriptPathAt } from '../../src/ui/script-editor-intel';
import { ScriptEditorPalette } from '../../src/ui/ScriptEditorPalette';

describe('SCRIPT.EDITOR.INTEL API reference', () => {
  it('documents every ctx member and ctx.ta function the compiler accepts, and nothing else', () => {
    expect(Object.keys(LVSCRIPT_CONTEXT_DOCS).sort()).toEqual([...LVSCRIPT_CONTEXT_MEMBERS].sort());
    expect(Object.keys(LVSCRIPT_TA_DOCS).sort()).toEqual([...LVSCRIPT_TA_FUNCTIONS].sort());
  });
  it('resolves dotted paths and rejects names LVScript does not define', () => {
    expect(scriptApiDoc('ctx.ta.rsi')?.signature).toBe('ctx.ta.rsi(key, value, length)');
    expect(scriptApiDoc('ctx.plot')?.signature).toBe('ctx.plot(title, valueOrNull, colorOrOptions?)');
    expect(scriptApiDoc('onBar')?.summary).toContain('Required');
    expect(scriptApiDoc('ctx.ta.nope')).toBeNull(); expect(scriptApiDoc('ctx.nope')).toBeNull(); expect(scriptApiDoc('ctx.plot.extra')).toBeNull();
  });
  it('finds the API path under the pointer', () => {
    const text = "ctx.ta.rsi('a', ctx.bar.close, 14)";
    expect(scriptPathAt(text, 8)).toEqual({ path: 'ctx.ta.rsi', from: 7, to: 10 });
    expect(scriptPathAt(text, 21)).toEqual({ path: 'ctx.bar', from: 20, to: 23 });expect(scriptPathAt(text, 17)).toEqual({ path: 'ctx', from: 16, to: 19 });
    expect(scriptPathAt('const x = 1', 7)).toBeNull(); expect(scriptPathAt(text, 999)).toBeNull();
  });
});

describe('SCRIPT.EDITOR.AUTOCOMPLETE', () => {
  it('classifies what is being typed', () => {
    expect(scriptCompletionTarget('  ctx.ta.r')).toEqual({ target: 'ta', prefix: 'r' });
    expect(scriptCompletionTarget('ctx.')).toEqual({ target: 'ctx', prefix: '' });
    expect(scriptCompletionTarget('  onB')).toEqual({ target: 'definition', prefix: 'onB' });
    expect(scriptCompletionTarget('const x = foo')).toBeNull();
  });
  it('filters by prefix without case sensitivity, and offers definition keys only once typing has begun', () => {
    expect(scriptCompletionNames('ta', 'cross')).toEqual(['crossover', 'crossunder', 'cross']);
    expect(scriptCompletionNames('ctx', 'PLOT')).toEqual(['plot', 'plotshape', 'plotchar', 'plotarrow']); // Ctx.plotarrow added
    expect(scriptCompletionNames('definition', '')).toEqual([]); expect(scriptCompletionNames('definition', 'on')).toEqual(['onBar', 'onFill']);
  });
  it('produces a CodeMirror result anchored at the prefix', () => {
    const text = "({ onBar(ctx) { ctx.ta.rs", state = EditorState.create({ doc: text });
    const result = scriptCompletionSource(new CompletionContext(state, text.length, false)) as { from: number; options: { label: string; info: string }[] };
    expect(result.from).toBe(text.length - 2); expect(result.options.map(row => row.label)).toEqual(['rsi']); expect(result.options[0].info).toContain('Relative strength');
    expect(scriptCompletionSource(new CompletionContext(EditorState.create({ doc: 'const a = 1' }), 11, false))).toBeNull();
  });
});

describe('SCRIPT.EDITOR.SQUIGGLES source', () => {
  it('the squiggle source flags an unknown ctx.ta function at its name and still passes a clean script', () => {
    const bad = "({ onBar(ctx) { ctx.ta.bogus('k', 1); } })", result = compileLVScript(bad);
    expect(result.diagnostics.map(row => [row.code, row.offset, bad.slice(row.offset, row.offset + 5)])).toEqual([['UNKNOWN_API', 23, 'bogus']]);
    expect(compileLVScript("({ onBar(ctx) { ctx.plot('x', ctx.bar.close, '#fff'); } })").diagnostics).toEqual([]);
  });
});

describe('SCRIPT.EDITOR.MINIMAP model', () => {
  it('folds long documents into bounded rows and marks the worst severity', () => {
    const text = Array.from({ length: 300 }, (_, i) => '  '.repeat(i % 3) + 'x'.repeat(i % 50)).join('\n');
    const rows = minimapRows(text, 100, new Map([[10, 'warning'], [11, 'error']]));
    expect(rows).toHaveLength(100); expect(rows[3].severity).toBe('error'); expect(rows[50].severity).toBeNull();
    expect(rows.every(row => row.density >= 0 && row.density <= 1 && row.indent <= 24)).toBe(true);
    expect(minimapRows('a\nb', 100)).toHaveLength(2); expect(minimapRows('', 100)).toHaveLength(1);
  });
  it('clamps the viewport thumb inside the track', () => {
    expect(minimapViewport(0, 100, 1000)).toEqual({ top: 0, height: 0.1 });
    expect(minimapViewport(5000, 100, 1000).top).toBeCloseTo(0.9); expect(minimapViewport(0, 500, 0)).toEqual({ top: 0, height: 1 });
  });
});

describe('SCRIPT.EDITOR.PALETTE', () => {
  it('ranks subsequence matches, keeps catalog order when the query is empty and drops non-matches', () => {
    expect(paletteResults('', 10)).toHaveLength(SCRIPT_PALETTE_COMMANDS.length);
    expect(paletteScore('zzz', 'Compile script')).toBeNull();
    const top = paletteResults('fmt', 10)[0]; expect(top.kind === 'command' && top.command.action).toBe('format');
    const find = paletteResults('find', 10).map(row => row.kind === 'command' ? row.command.action : ''); expect(find[0]).toBe('find'); expect(find).toContain('replace');
  });
  it('treats :N as a bounded go-to-line', () => {
    expect(paletteResults(':42', 100)).toEqual([{ kind: 'line', line: 42 }]); expect(paletteResults(': 500', 100)).toEqual([{ kind: 'line', line: 100 }]); expect(paletteResults(':0', 100)).toEqual([{ kind: 'line', line: 1 }]);
  });
  it('every snippet is valid ctx text and every snippet command has one', () => {
    for (const row of SCRIPT_PALETTE_COMMANDS.filter(command => command.action.startsWith('snippet:'))) expect(SCRIPT_SNIPPETS[row.action]).toMatch(/^(const \w+ = )?ctx\./);
    for (const text of Object.values(SCRIPT_SNIPPETS)) expect(compileLVScript('({ onBar(ctx) { ' + text + ' } })').diagnostics.filter(row => row.code === 'UNKNOWN_API' || row.severity === 'error')).toEqual([]);
  });
  it('renders an accessible combobox and listbox', () => {
    const html = renderToStaticMarkup(React.createElement(ScriptEditorPalette, { lineCount: 20, onRun: () => undefined, onClose: () => undefined }));
    expect(html).toContain('role="combobox"'); expect(html).toContain('role="listbox"'); expect(html).toContain('Go to line'); expect(html).toContain('aria-selected="true"');
  });
});
