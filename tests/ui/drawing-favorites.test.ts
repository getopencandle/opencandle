import { expect, it, vi } from 'vitest';
import { drawingTypes } from '@luxalgo/vela';
import { restoreDrawingFavorites } from '../../src/ui/drawing-favorites';
import { createInitialWorkspace } from '../../src/ui/workspace-state';
import { restoreWorkspace } from '../../src/ui/workspace-validation';
import { prepareWorkspaceData, prepareWorkspaceReplacement } from '../../src/ui/workspace-transfer';
import { prepareWorkspaceJSON } from '../../src/ui/workspace-json';
import { createPaperAccount } from '../../src/domain/paper';

// Small schema and transfer-boundary cases. B owns independent live host,
// toolbar and chart-history cases. No file, renderer or GUI is opened here.
const complete = (): Record<string, unknown> => ({ ...createInitialWorkspace(), paper: createPaperAccount(), alerts: [] });
const encode = (data: unknown) => JSON.stringify({ schemaVersion: 1, data });

it.each([[], ['trendline'], ['ray', 'trendline']].map(initial => ({ initial })))('DRAW.FAVORITES.ADMISSION: retains literal order and detaches admitted $initial', ({ initial }) => {
  const frozen = Object.freeze([...initial]), restored = restoreDrawingFavorites(frozen);
  expect(restored).toEqual(initial); expect(restored).not.toBe(frozen);
  restored.push('hline'); expect(frozen).toEqual(initial);
});

it('DRAW.FAVORITES.ADMISSION: accepts the complete current catalog without a hard-coded tool count', () => {
  const catalog = drawingTypes().map(item => String(item.type));
  expect(new Set(catalog).size).toBe(catalog.length); expect(catalog).toContain('trendline'); expect(catalog).toContain('ray');
  expect(restoreDrawingFavorites(catalog)).toEqual(catalog);
  expect(() => restoreDrawingFavorites([...catalog, 'future-synthetic-tool'])).toThrow(/favorite/i);
});

it.each([
  { label: 'undefined', value: undefined }, { label: 'null', value: null },
  { label: 'object', value: {} }, { label: 'string', value: 'trendline' }, { label: 'number', value: 1 },
  { label: 'blank ID', value: [''] }, { label: 'whitespace ID', value: [' trendline'] },
  { label: 'case-folded ID', value: ['TRENDLINE'] }, { label: 'unknown future ID', value: ['future-synthetic-tool'] },
  { label: 'duplicate ID', value: ['ray', 'ray'] }, { label: 'null element', value: [null] },
  { label: 'number element', value: [1] }, { label: 'nested element', value: [['ray']] },
  { label: 'cursor', value: ['cursor'] }, { label: 'measure', value: ['measure'] },
  { label: 'eraser', value: ['eraser'] }, { label: 'short alias', value: ['short'] },
])('DRAW.FAVORITES.ADMISSION: refuses $label without coercion or silent normalization', ({ value }) => {
  const before = structuredClone(value); expect(() => restoreDrawingFavorites(value)).toThrow(/favorite/i); expect(value).toEqual(before);
});

it('DRAW.FAVORITES.ADMISSION: rejects sparse, decorated, hidden and foreign-prototype arrays', () => {
  const sparse = new Array<string>(1), decorated = ['ray'], hidden = ['ray'], foreign = ['ray'], symbolic = ['ray'];
  Object.defineProperty(decorated, 'extra', { value: 'trendline', enumerable: true });
  Object.defineProperty(hidden, '0', { value: 'ray', enumerable: false });
  Object.setPrototypeOf(foreign, Object.create(Array.prototype));
  Object.defineProperty(symbolic, Symbol('SYNTHETIC metadata'), { value: 1 });
  for (const value of [sparse, decorated, hidden, foreign, symbolic]) expect(() => restoreDrawingFavorites(value)).toThrow(/favorite/i);
});

it('DRAW.FAVORITES.ADMISSION: refuses array accessors and coercion objects without invoking them', () => {
  const getter = vi.fn(() => 'ray'), convert = vi.fn(() => 'ray'), accessor = new Array<string>(1);
  Object.defineProperty(accessor, '0', { get: getter, enumerable: true });
  expect(() => restoreDrawingFavorites(accessor)).toThrow(/favorite/i);
  expect(() => restoreDrawingFavorites([{ toString: convert }])).toThrow(/favorite/i);
  expect(getter).not.toHaveBeenCalled(); expect(convert).not.toHaveBeenCalled();
});

it('DRAW.FAVORITES.RECOVERY: initial and reset factory values are fresh empty global lists', () => {
  const first = createInitialWorkspace(), second = createInitialWorkspace();
  expect(first.drawingFavorites).toEqual([]); expect(second.drawingFavorites).toEqual([]); expect(first.drawingFavorites).not.toBe(second.drawingFavorites);
  first.drawingFavorites.push('ray'); expect(second.drawingFavorites).toEqual([]); expect(createInitialWorkspace().drawingFavorites).toEqual([]);
  expect(Object.values(second.grid!.cells).every(cell => !Object.hasOwn(cell, 'drawingFavorites'))).toBe(true);
});

it('DRAW.FAVORITES.RECOVERY: absent legacy values initialize empty independently of nonempty caller defaults', () => {
  const defaults = createInitialWorkspace(); defaults.drawingFavorites = ['ray', 'trendline'];
  const legacy: Record<string, unknown> = { ...defaults }; delete legacy.drawingFavorites;
  const inputBefore = JSON.stringify(legacy), defaultsBefore = JSON.stringify(defaults), first = restoreWorkspace(legacy, defaults), second = restoreWorkspace(legacy, defaults);
  expect(first.drawingFavorites).toEqual([]); expect(second.drawingFavorites).toEqual([]); expect(first.drawingFavorites).not.toBe(second.drawingFavorites);
  expect(first.drawingFavorites).not.toBe(defaults.drawingFavorites); expect(JSON.stringify(legacy)).toBe(inputBefore); expect(JSON.stringify(defaults)).toBe(defaultsBefore);
});

it('DRAW.FAVORITES.RECOVERY: restores exact ordered global values without inheriting the current default list', () => {
  const defaults = createInitialWorkspace(); defaults.drawingFavorites = ['hline'];
  const input = { ...defaults, drawingFavorites: ['ray', 'trendline'], futureToolbarNote: { version: 2 } }, before = JSON.stringify(input);
  const restored = restoreWorkspace(input, defaults);
  expect(restored.drawingFavorites).toEqual(['ray', 'trendline']); expect(restored.drawingFavorites).not.toBe(input.drawingFavorites);
  expect(restored.futureToolbarNote).toEqual({ version: 2 }); expect(defaults.drawingFavorites).toEqual(['hline']); expect(JSON.stringify(input)).toBe(before);
});

it.each([undefined, null, ['ray', 'ray'], ['future-synthetic-tool']].map(value => ({ value })))('DRAW.FAVORITES.RECOVERY: explicit invalid saved value $value is not legacy absence', ({ value }) => {
  const defaults = createInitialWorkspace(), input = { ...defaults, drawingFavorites: value };
  expect(Object.hasOwn(input, 'drawingFavorites')).toBe(true); expect(() => restoreWorkspace(input, defaults)).toThrow(/favorite/i);
  expect(defaults.drawingFavorites).toEqual([]); expect(input.drawingFavorites).toBe(value);
});

it.each(['accessor', 'hidden'] as const)('DRAW.FAVORITES.RECOVERY: refuses an explicit %s property before spreading input', kind => {
  const defaults = createInitialWorkspace(), input: Record<string, unknown> = { ...defaults }, getter = vi.fn(() => ['ray']);
  Object.defineProperty(input, 'drawingFavorites', kind === 'accessor' ? { get: getter, enumerable: true } : { value: ['ray'], enumerable: false });
  expect(() => restoreWorkspace(input, defaults)).toThrow(/favorite/i); expect(getter).not.toHaveBeenCalled(); expect(defaults.drawingFavorites).toEqual([]);
});

it('DRAW.FAVORITES.TRANSFER: exact ordered values survive prepared export, preview and re-export without source mutation', () => {
  const data = complete(); data.drawingFavorites = ['ray', 'trendline']; const before = encode(data), preview = prepareWorkspaceReplacement(before);
  expect(preview.workspace.drawingFavorites).toEqual(['ray', 'trendline']); expect(preview.data.drawingFavorites).toEqual(['ray', 'trendline']);
  expect(preview.workspace.drawingFavorites).not.toBe(data.drawingFavorites); expect(preview.summary).toContain('2 favorite drawing tools.'); expect(preview.migrations).toEqual([]);
  expect(prepareWorkspaceReplacement(encode(prepareWorkspaceJSON(preview.data))).data.drawingFavorites).toEqual(['ray', 'trendline']); expect(encode(data)).toBe(before);
});

it('DRAW.FAVORITES.TRANSFER: absent field has one explicit migration and never inherits current favorites', () => {
  const data = complete(); delete data.drawingFavorites; const before = encode(data), preview = prepareWorkspaceReplacement(before);
  expect(preview.workspace.drawingFavorites).toEqual([]); expect(preview.data.drawingFavorites).toEqual([]);
  expect(preview.migrations).toEqual(['Legacy export: initialized drawingFavorites using documented local defaults.']); expect(preview.summary).toContain('0 favorite drawing tools.');
  expect(Object.hasOwn(data, 'drawingFavorites')).toBe(false); expect(encode(data)).toBe(before);
});

it.each([null, ['ray', 'ray'], ['future-synthetic-tool']].map(value => ({ value })))('DRAW.FAVORITES.TRANSFER: invalid JSON value $value refuses the whole candidate without rewriting its input', ({ value }) => {
  const data = complete(); data.drawingFavorites = value; const text = encode(data);
  expect(() => prepareWorkspaceReplacement(text)).toThrow(/favorite/i); expect(encode(data)).toBe(text); expect(data.drawingFavorites).toBe(value);
});

it('DRAW.FAVORITES.TRANSFER: raw complete-data boundary distinguishes explicit undefined from an absent JSON key', () => {
  const data = complete(); data.drawingFavorites = undefined;
  expect(() => prepareWorkspaceData(data)).toThrow(/favorite/i); expect(Object.hasOwn(data, 'drawingFavorites')).toBe(true); expect(data.drawingFavorites).toBeUndefined();
});
