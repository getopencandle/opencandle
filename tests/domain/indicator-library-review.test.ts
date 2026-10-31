import { expect, it } from 'vitest';
import { createIndicatorLibrary, factoryIndicatorDefault, instanceDefaults, restoreIndicatorLibrary, saveIndicatorDefault, validateIndicatorDefault } from '../../src/ui/indicator-library';

it('rejects default-container accessors before reading or spreading them', () => {
  const ordinary = factoryIndicatorDefault('sma'); let reads = 0;
  const value = { ...ordinary, get inputs() { reads++; return ordinary.inputs; } };
  expect(() => validateIndicatorDefault('sma', value)).toThrow();
  expect(reads).toBe(0);
});

it('rejects library and default-map accessors without invoking them during restore', () => {
  let reads = 0;
  const library = { schemaVersion: 1, favorites: [], get defaults() { reads++; return {}; } };
  expect(() => restoreIndicatorLibrary(library)).toThrow(); expect(reads).toBe(0);
  const defaults = { get sma() { reads++; return factoryIndicatorDefault('sma'); } };
  expect(() => restoreIndicatorLibrary({ schemaVersion: 1, favorites: [], defaults })).toThrow(); expect(reads).toBe(0);
});

it('does not invoke JSON hooks while measuring malformed library values', () => {
  let hooks = 0;
  const malformed = { ...factoryIndicatorDefault('sma'), toJSON() { hooks++; return factoryIndicatorDefault('sma'); } };
  expect(() => restoreIndicatorLibrary({ schemaVersion: 1, favorites: [], defaults: { sma: malformed } })).toThrow();
  expect(hooks).toBe(0);
});

it('does not invoke extra serialization hooks on an otherwise valid favorites array', () => {
  let hooks = 0;
  const favorites = Object.assign(['sma'], { toJSON() { hooks++; return ['sma']; } });
  try { restoreIndicatorLibrary({ schemaVersion: 1, favorites, defaults: {} }); } catch { /* Rejecting non-JSON array properties is also valid. */ }
  expect(hooks).toBe(0);
});

it('persisted defaults retain independent inputs and every plot flag without copying ownership', () => {
  const library = createIndicatorLibrary(), draft = factoryIndicatorDefault('macd');
  draft.inputs.fast = 3; draft.inputs.slow = 5; draft.offset = -2; draft.visible = false;
  draft.plots.histogram = { visible: false, color: '#abcdef', width: 2, lineStyle: 'dotted', kind: 'area', priceScale: false, legend: false, dataWindow: false };
  const restored = restoreIndicatorLibrary(JSON.parse(JSON.stringify(saveIndicatorDefault(library, 'macd', draft))));
  draft.inputs.fast = 99; draft.plots.histogram.color = '#ffffff';
  const fresh = instanceDefaults(restored, 'macd');
  expect(fresh.inputs).toMatchObject({ fast: 3, slow: 5 }); expect(fresh.offset).toBe(-2); expect(fresh.visible).toBe(false);
  expect(fresh.plots.histogram).toEqual({ visible: false, color: '#abcdef', width: 2, lineStyle: 'dotted', kind: 'area', priceScale: false, legend: false, dataWindow: false });
  expect(Object.keys(fresh).sort()).toEqual(['inputs', 'offset', 'plots', 'presentation', 'visible']);
  expect(fresh.presentation).toEqual(draft.presentation);
  expect(library.defaults).toEqual({});
});
