// Source-level checks. SYNTHETIC data only.
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { reseedLevelText } from '../../src/ui/AlertDialog';

it('#6 a source change reseeds the level at the price tick or at 2 decimals for an indicator', () => {
  expect(reseedLevelText(49.1912, 0.01, true)).toBe('49.19');
  expect(reseedLevelText(57.82341, 0.01, false)).toBe('57.82');
  expect(reseedLevelText(1.234567, 0.0001, true)).toBe('1.2346');
  const dialog = readFileSync('src/ui/AlertDialog.tsx', 'utf8');
  expect(dialog).toContain("reached the selected condition.`, kind: 'crossing', value:");
});
it('#7 fib alert sources read "<name>: any level", with no raw level list', () => {
  const catalog = readFileSync('src/ui/technical-alert-catalog.ts', 'utf8');
  expect(catalog).not.toContain('active level crossing, ${describeAlertLevels');
  expect(catalog.match(/: any level`/g)?.length).toBe(3);
});
it('#5 a replay closed with X is not remembered, and "replay ended" needs a running replay', () => {
  const app = readFileSync('src/ui/App.tsx', 'utf8');
  expect(app).toContain('setReplayPanelHidden(true);setReplaySaved(null);}');
  expect(app).toContain("const replayRan=!!(replayLeft||expectedReplay);");
});
