import { expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { createInitialWorkspace } from '../../src/ui/workspace-state';
import { prepareWorkspaceJSON } from '../../src/ui/workspace-json';
import { prepareWorkspaceReplacement } from '../../src/ui/workspace-transfer';
import { createPaperAccount, processPaperQuote, submitPaperOrder } from '../../src/domain/paper';
import { createBookAccount, restorePaperState, serializePaperState, setBookPresets, type PaperState } from '../../src/domain/paper-book';
import { fixtureInstrument } from '../../src/domain/fixtures';

// PAPERX previous-package test: the workspace loaders in the tree today do not know `paperBook`. A workspace saved after this lane
// must still load through them (retained as a future field), and a workspace saved before it must restore its account byte-identically.
const require = createRequire(import.meta.url), { saveInput } = require('../../electron/validation.cjs');
const instrument = fixtureInstrument('GME');
const encode = (data: unknown) => JSON.stringify({ schemaVersion: 1, data });
function withFill() {
  const account = processPaperQuote(createPaperAccount({ initialBalance: 1000, commission: { kind: 'fixed', value: 1 } }), { instrumentId: instrument.id, bid: 9.98, ask: 10.02, sequence: 1, eventTime: 1, receivedAt: 1, availableAt: 1, fixture: true, session: 'unknown' }, 1).account;
  const result = submitPaperOrder(account, { instrument, side: 'buy', type: 'market', quantity: 10 }, 1); expect(result.ok).toBe(true); return result.account;
}
const workspace = (extra: Record<string, unknown> = {}, paper = withFill()) => prepareWorkspaceJSON({ ...createInitialWorkspace(), paper, alerts: [], ...extra } as never) as Record<string, unknown>;

it('a workspace saved before the lane restores its account byte-identically and writes no paperBook', () => {
  const data = workspace(), before = JSON.stringify(data.paper);
  const next = prepareWorkspaceReplacement(encode(data));
  expect(JSON.stringify(next.paper)).toBe(before);
  expect(Object.hasOwn(next.data, 'paperBook')).toBe(false);
  const state = restorePaperState(next.data.paper, (next.data as Record<string, unknown>).paperBook);
  expect(state.book).toBeNull();
  expect(JSON.stringify(serializePaperState(state).paper)).toBe(before);
  expect(next.paper.cash).toBe(898.8);
});
it('a workspace saved after the lane loads through the loaders that do not know paperBook and keeps it', () => {
  let state: PaperState = { paper: withFill(), book: null };
  const created = createBookAccount(state, { name: 'Second', initialBalance: 2500 }, 5, () => 'second-account'); if (!created.ok) throw new Error(created.message);
  state = setBookPresets(created.state, [{ schemaVersion: 1, id: 'p1', name: 'Quick buy', side: 'buy', input: { quantity: { kind: 'units', value: '1' }, type: 'market', limit: null, stop: null, validity: { kind: 'day' }, entryOutsideRth: false, takeProfitOutsideRth: false, exits: null } }]);
  const saved = serializePaperState(state), data = workspace({ paperBook: saved.paperBook }, saved.paper);
  const next = prepareWorkspaceReplacement(encode(data));
  expect(next.paper.fills).toEqual(state.paper.fills);
  expect((next.data as Record<string, unknown>).paperBook).toEqual(saved.paperBook);
  expect(() => saveInput({ schemaVersion: 1, expectedRevision: 4, data: next.data })).not.toThrow();
  const restored = restorePaperState(next.data.paper, (next.data as Record<string, unknown>).paperBook);
  expect(restored.book!.inactive.map(row => row.name)).toEqual(['Second']);
  expect(restored.book!.presets!.map(row => row.name)).toEqual(['Quick buy']);
  expect(JSON.stringify(restored.paper)).toBe(JSON.stringify(state.paper));
});
it('an unchanged older-build edit of paper leaves the book usable', () => {
  const created = createBookAccount({ paper: withFill(), book: null }, { name: 'Second' }, 5, () => 'second-account'); if (!created.ok) throw new Error(created.message);
  const saved = serializePaperState(created.state);
  const edited = submitPaperOrder(saved.paper, { instrument, side: 'buy', type: 'market', quantity: 1 }, 2);
  const next = prepareWorkspaceReplacement(encode(workspace({ paperBook: saved.paperBook }, edited.account)));
  const restored = restorePaperState(next.data.paper, (next.data as Record<string, unknown>).paperBook);
  expect(restored.paper.fills).toHaveLength(edited.account.fills.length);
  expect(restored.book!.inactive).toHaveLength(1);
});
