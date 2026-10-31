import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { PAPER_POLICIES, createPaperAccount, paperAvailableFunds, paperSummary, processPaperQuote, restorePaperAccount, submitPaperOrder } from '../../src/domain/paper';
import { PAPER_BOOK_QUARANTINE_NOTICE, createBookAccount, guardPaperState, paperStorageBytes, restorePaperState, restorePaperStateSafe, serializePaperState, setBookPresets, type PaperState } from '../../src/domain/paper-book';
import { materializePaperTicket, previewPaperTicket, validatePaperTicketRecord, type PaperTicketInput } from '../../src/domain/paper-ticket';
import { lastImportedQuote } from '../../src/domain/paper-quote';
import { placePaperPreset } from '../../src/domain/paper-presets';
import { createInitialWorkspace } from '../../src/ui/workspace-state';
import { prepareWorkspaceJSON } from '../../src/ui/workspace-json';
import { prepareWorkspaceReplacement } from '../../src/ui/workspace-transfer';
import type { BarDataset, Instrument } from '../../src/domain/types';

const require = createRequire(import.meta.url), { saveInput } = require('../../electron/validation.cjs');
// Earlier ticket-quote key list, copied literally from the built bundle dist/assets/index-B-dwiyII.js (sha256 659ed9a4b45233afa7358811e9157b8a8e0a49c980f77f2e6a408e1be8e122d5),
// function j5, which the previous package runs on order.ticket.quote for every persisted order. A key outside this list makes it refuse the whole paper account.
const PRE_LANE_TICKET_QUOTE_KEYS = ['instrumentId', 'bid', 'ask', 'bidSize', 'askSize', 'session', 'fixture', 'eventTime', 'receivedAt', 'availableAt', 'sequence'];
const BUNDLE = 'dist/assets/index-B-dwiyII.js', BUNDLE_SHA = '659ed9a4b45233afa7358811e9157b8a8e0a49c980f77f2e6a408e1be8e122d5';
const previousPackageAcceptsQuote = (quote: Record<string, unknown>) => !Object.keys(quote).some(key => !PRE_LANE_TICKET_QUOTE_KEYS.includes(key));

const instrument: Instrument = { id: 'LOCAL:R2', symbol: 'R2', name: 'Imported round two file', exchange: 'LOCAL', currency: 'USD', assetClass: 'stock', timezone: 'UTC', tickSize: 0.01, lotSize: 1 };
const daily: BarDataset = { instrument, bars: [{ time: 1577836800, open: 120, high: 125, low: 119, close: 123.45, volume: 5 }], resolution: '1D', provenance: { providerId: 'local-import', providerName: 'Local file', datasetId: 'local:R2', fixture: false, coverage: 'one bar', asOf: 1577836800, delaySeconds: null, adjustment: 'unknown', session: 'unknown', timezone: 'UTC', state: 'ready', license: 'User-supplied', revision: '1', notes: [] } };
const NOW = 1_800_000_000;
const marketInput: PaperTicketInput = { schemaVersion: 1, side: 'buy', type: 'market', quantity: { kind: 'units', value: '3' }, limit: null, stop: null, validity: { kind: 'day' }, entryOutsideRth: false, takeProfitOutsideRth: false, exits: null };
const ticketContext = (account = createPaperAccount({ now: NOW })) => ({ account, instrument, quote: lastImportedQuote(daily, NOW), quoteSource: { key: 'local:R2', state: 'ready' as const }, now: NOW });

describe('B1: basis never reaches a saved ticket quote', () => {
  it('the literal fixture matches the pre-lane bundle it was copied from (when that bundle is on disk)', () => {
    if (!existsSync(BUNDLE) || createHash('sha256').update(readFileSync(BUNDLE)).digest('hex') !== BUNDLE_SHA) return;
    const text = readFileSync(BUNDLE, 'utf8'), start = text.indexOf('function j5('), list = /\[((?:`[A-Za-z]+`,?)+)\]\.includes/.exec(text.slice(start, start + 600))![1];
    expect(list.split(',').map(item => item.replaceAll('`', ''))).toEqual(PRE_LANE_TICKET_QUOTE_KEYS);
  });
  it('a ticket order placed on a last imported price saves a quote the previous package accepts', () => {
    const context = ticketContext(), preview = previewPaperTicket(marketInput, context); if (!preview.ok) throw new Error(preview.diagnostics[0].message);
    const request = materializePaperTicket(preview.value, marketInput, context); if (!request.ok) throw new Error(request.diagnostics[0].message);
    const seeded = processPaperQuote(context.account, context.quote!, NOW).account;
    const placed = submitPaperOrder(seeded, request.value, NOW); expect(placed.ok).toBe(true);
    const order = placed.account.orders[0]; expect(order.status).toBe('filled');
    expect(Object.hasOwn(order.ticket!.quote!, 'basis')).toBe(false);
    expect(previousPackageAcceptsQuote(order.ticket!.quote as never)).toBe(true);
    expect(restorePaperAccount(JSON.parse(JSON.stringify(placed.account))).orders).toHaveLength(1);
    // the runtime copy keeps its label for the live surfaces
    expect(placed.account.quotes[instrument.id]).toMatchObject({ basis: 'last-imported-bar' });
  });
  it('a preset or one-click order does the same, and the whole save passes the previous package key check', () => {
    const preset = { schemaVersion: 1 as const, id: 'p', name: 'Quick', side: 'buy' as const, input: { quantity: { kind: 'units' as const, value: '2' }, type: 'market' as const, limit: null, stop: null, validity: { kind: 'day' as const }, entryOutsideRth: false, takeProfitOutsideRth: false, exits: null } };
    const context = ticketContext(), account = processPaperQuote(context.account, context.quote!, NOW).account;
    const placed = placePaperPreset(preset, 'buy', { ...context, account }, { commandId: 'c1' }); if (!placed.ok) throw new Error(placed.message);
    for (const order of placed.account.orders) if (order.ticket?.quote) expect(previousPackageAcceptsQuote(order.ticket.quote as never)).toBe(true);
    const workspace = prepareWorkspaceJSON({ ...createInitialWorkspace(), paper: placed.account, alerts: [] } as never) as Record<string, unknown>;
    const saved = JSON.parse(JSON.stringify(workspace)).paper;
    for (const order of saved.orders) if (order.ticket?.quote) expect(previousPackageAcceptsQuote(order.ticket.quote)).toBe(true);
    expect(() => saveInput({ schemaVersion: 1, expectedRevision: 1, data: workspace })).not.toThrow();
  });
  it('the record validator still refuses a basis key, so none can be written by mistake', () => {
    const context = ticketContext(), preview = previewPaperTicket(marketInput, context); if (!preview.ok) throw new Error('x');
    const request = materializePaperTicket(preview.value, marketInput, context); if (!request.ok) throw new Error('x');
    const record = request.value.ticket!;
    expect(() => validatePaperTicketRecord(record)).not.toThrow();
    expect(() => validatePaperTicketRecord({ ...record, quote: { ...record.quote, basis: 'last-imported-bar' } })).toThrow();
  });
});

describe('F2: the policy text matches the unknown-session behaviour', () => {
  it('no longer says unknown coverage cannot prove an executable session, and states the new rule', () => {
    const text = PAPER_POLICIES.join(' ');
    expect(text).not.toContain('All/unknown real-feed');
    expect(text).toContain('A last imported price from a source that declares no session fills regular-session-only orders, as synthetic data does. Orders that opt into extended hours wait for a declared session.');
    expect(text).not.toMatch(/[–—]/);
  });
});

describe('F5: the storage cap covers every whole-state change', () => {
  const base = (): PaperState => ({ paper: createPaperAccount({ now: 0 }), book: null });
  const preset = { schemaVersion: 1 as const, id: 'p1', name: 'Quick', side: 'buy' as const, input: { quantity: { kind: 'units' as const, value: '1' }, type: 'market' as const, limit: null, stop: null, validity: { kind: 'day' as const }, entryOutsideRth: false, takeProfitOutsideRth: false, exits: null } };
  it('refuses saving presets or switching state past the cap, and lets a shrink through', () => {
    const state = base(), grown = setBookPresets(state, [preset]), bytes = paperStorageBytes(state);
    expect(guardPaperState(state, grown)).toEqual({ ok: true });
    expect(guardPaperState(state, grown, bytes)).toEqual({ ok: false, message: 'Virtual account storage is full. Delete an account or reset history.' });
    expect(guardPaperState(grown, state, 10)).toEqual({ ok: true });
    const two = createBookAccount(state, { name: 'Second' }, 1); if (!two.ok) throw new Error(two.message);
    expect(guardPaperState(state, two.state, bytes)).toMatchObject({ ok: false });
  });
});

describe('F6: a damaged paperBook never blocks the load', () => {
  const good = () => { const account = createPaperAccount({ now: 0, initialBalance: 777 }); const created = createBookAccount({ paper: account, book: null }, { name: 'Second' }, 1, () => 'second'); if (!created.ok) throw new Error('x'); return serializePaperState(created.state); };
  it.each([
    ['an unsupported key', (book: any) => ({ ...book, extra: 1 })],
    ['a wrong version', (book: any) => ({ ...book, schemaVersion: 9 })],
    ['an inactive account with a forged cash value', (book: any) => ({ ...book, inactive: [{ ...book.inactive[0], cash: 12345 }] })],
    ['a non-object', () => 'garbage'],
    ['an array', () => []],
  ])('quarantines a book with %s, keeps the active account byte-identical and shows a notice', (_name, damage) => {
    const saved = JSON.parse(JSON.stringify(good())), damaged = damage(saved.paperBook), before = JSON.stringify(saved.paper);
    expect(() => restorePaperState(saved.paper, damaged)).toThrow();
    const result = restorePaperStateSafe(saved.paper, damaged);
    expect(JSON.stringify(result.paper)).toBe(before);
    expect(result.book).toBeNull();
    expect(result.quarantined!.raw).toEqual(damaged);
    expect(result.quarantined!.reason.length).toBeGreaterThan(0);
    expect(result.notice).toBe(PAPER_BOOK_QUARANTINE_NOTICE);
  });
  it('an undamaged or absent book passes through with no notice, and a damaged paper still fails as before', () => {
    const saved = JSON.parse(JSON.stringify(good()));
    expect(restorePaperStateSafe(saved.paper, saved.paperBook)).toMatchObject({ quarantined: null, notice: null, book: { inactive: [{ name: 'Second' }] } });
    expect(restorePaperStateSafe(saved.paper, undefined)).toMatchObject({ book: null, quarantined: null, notice: null });
    expect(() => restorePaperStateSafe({ ...saved.paper, cash: 1 }, saved.paperBook)).toThrow();
  });
  it('the set-aside raw value rides along as a future field through the loaders that exist today', () => {
    const saved = JSON.parse(JSON.stringify(good())), damaged = { ...saved.paperBook, extra: 1 };
    const data = prepareWorkspaceJSON({ ...createInitialWorkspace(), paper: restorePaperAccount(saved.paper), alerts: [], paperBookQuarantine: damaged } as never) as Record<string, unknown>;
    const next = prepareWorkspaceReplacement(JSON.stringify({ schemaVersion: 1, data }));
    expect((next.data as Record<string, unknown>).paperBookQuarantine).toEqual(damaged);
    expect(JSON.stringify(next.paper)).toBe(JSON.stringify(saved.paper));
  });
});

describe('PAPER.MANAGER.AVAILABLE: an Available funds figure that is not levered', () => {
  it('is max(0, equity - account margin - orders margin) and buying power is that times leverage', () => {
    expect(paperAvailableFunds({ equity: 99988, marginUsed: 4997.5, reservedMargin: 2252 })).toBe(92738.5);   // reviewer oracle at leverage 4; buying power would be 370954
    expect(paperAvailableFunds({ equity: 100, marginUsed: 90, reservedMargin: 30 })).toBe(0);
    expect(paperAvailableFunds({ equity: null, marginUsed: 1, reservedMargin: 0 })).toBeNull();
    expect(paperAvailableFunds({ equity: 5, marginUsed: null, reservedMargin: 0 })).toBeNull();
    expect(paperAvailableFunds({ equity: 5, marginUsed: 1, reservedMargin: null })).toBeNull();
  });
  it('leverage 4: 100 long at mark 10 gives available 99749 and buying power 398996', () => {
    const quote = { instrumentId: instrument.id, bid: 9.99, ask: 10.01, eventTime: 10, receivedAt: 10, availableAt: 10, sequence: 1, session: 'regular' as const, fixture: true };
    let account = processPaperQuote(createPaperAccount({ now: 0, leverage: 4 }), quote, 10).account;
    account = submitPaperOrder(account, { instrument, side: 'buy', type: 'market', quantity: 100 }, 10).account;
    account = processPaperQuote(account, { ...quote, bid: 10, ask: 10.02, sequence: 2 }, 10).account;
    const summary = paperSummary(account, 10);
    expect(summary).toMatchObject({ equity: 99999, marginUsed: 250, reservedMargin: 0, buyingPower: 398996 });
    expect(paperAvailableFunds(summary)).toBe(99749);
  });
});
