import { describe, expect, it } from 'vitest';
import { createPaperAccount, processPaperQuote } from '../../src/domain/paper';
import { PAPER_PRESET_LIMITS, applyPaperPreset, deletePaperPreset, mirrorPaperPreset, placePaperPreset, presetSummary, savePaperPreset, validatePaperPreset, validatePaperPresets, type PaperPreset, type PaperPresetInput } from '../../src/domain/paper-presets';
import type { Instrument, Quote } from '../../src/domain/types';

const instrument: Instrument = { id: 'T:P', symbol: 'P', name: 'Synthetic preset test', exchange: 'SYNTHETIC', currency: 'USD', assetClass: 'stock', timezone: 'UTC', tickSize: 0.01, lotSize: 1 };
const quote: Quote = { instrumentId: instrument.id, bid: 99.98, ask: 100.02, eventTime: 1, receivedAt: 1, availableAt: 1, sequence: 1, session: 'regular', fixture: true };
const NOW = 1;
const limitInput = (overrides: Partial<PaperPresetInput> = {}): PaperPresetInput => ({ quantity: { kind: 'units', value: '10' }, type: 'limit', limit: { kind: 'side-ticks', value: '-2' }, stop: null, validity: { kind: 'day' }, entryOutsideRth: false, takeProfitOutsideRth: false, exits: null, ...overrides });
const preset = (overrides: Partial<PaperPreset> = {}): PaperPreset => ({ schemaVersion: 1, id: 'p1', name: 'Pullback', side: 'buy', input: limitInput(), ...overrides });
const context = (account = processPaperQuote(createPaperAccount({ now: 0 }), quote, NOW).account) => ({ account, instrument, quote, quoteSource: { key: 'src', state: 'ready' as const }, now: NOW });

describe('CREATE and validation', () => {
  it('accepts a well formed preset and refuses unknown or missing fields', () => {
    expect(validatePaperPreset(preset())).toEqual(preset());
    expect(() => validatePaperPreset({ ...preset(), extra: 1 })).toThrow();
    expect(() => validatePaperPreset(preset({ name: '' }))).toThrow();
    expect(() => validatePaperPreset(preset({ name: 'x'.repeat(65) }))).toThrow();
    expect(() => validatePaperPreset(preset({ side: 'hold' as never }))).toThrow();
    expect(() => validatePaperPreset(preset({ input: limitInput({ limit: null }) }))).toThrow(/limit/i);
    expect(() => validatePaperPreset(preset({ input: limitInput({ quantity: { kind: 'units', value: '-1' } }) }))).toThrow();
  });
  it('limits a book to 50 presets with unique names regardless of case', () => {
    expect(PAPER_PRESET_LIMITS.presets).toBe(50);
    expect(() => validatePaperPresets([preset(), preset({ id: 'p2', name: 'PULLBACK' })])).toThrow(/unique|already/i);
    expect(() => validatePaperPresets([preset(), preset({ name: 'Other' })])).toThrow(/identity|unique/i);
    const many = Array.from({ length: 51 }, (_, index) => preset({ id: `p${index}`, name: `Preset ${index}` }));
    expect(() => validatePaperPresets(many)).toThrow(/50/);
  });
  it('resolves relative offsets from the ask for a buy and the bid for a sell', () => {
    const buy = applyPaperPreset(preset(), 'buy', NOW);
    expect(buy.input.limit).toEqual({ kind: 'side-ticks', value: '-2' });
    const placed = placePaperPreset(preset(), 'buy', context(), { commandId: 'c1' });
    expect(placed.ok && placed.account.orders[0]).toMatchObject({ side: 'buy', type: 'limit', limitPrice: 100 });         // ask 100.02 - 2 ticks
    const sold = placePaperPreset(preset({ side: 'sell', input: limitInput({ limit: { kind: 'side-ticks', value: '3' } }) }), 'sell', context(), { commandId: 'c2' });
    expect(sold.ok && sold.account.orders[0]).toMatchObject({ side: 'sell', type: 'limit', limitPrice: 100.01 });          // bid 99.98 + 3 ticks
  });
});

describe('MIRROR', () => {
  it('flips the offset sign and the quote side when a buy preset is used as a sell', () => {
    const mirrored = mirrorPaperPreset(preset());
    expect(mirrored.preset.side).toBe('sell');
    expect(mirrored.preset.input.limit).toEqual({ kind: 'side-ticks', value: '2' });
    expect(mirrorPaperPreset(mirrored.preset).preset.input.limit).toEqual({ kind: 'side-ticks', value: '-2' });
    const applied = applyPaperPreset(preset(), 'sell', NOW);
    expect(applied.input.side).toBe('sell'); expect(applied.input.limit).toEqual({ kind: 'side-ticks', value: '2' });
    const sold = placePaperPreset(preset(), 'sell', context(), { commandId: 'c3' });
    expect(sold.ok && sold.account.orders[0]).toMatchObject({ side: 'sell', limitPrice: 100 });                           // bid 99.98 + 2 ticks
  });
  it('keeps zero and absolute prices, and drops absolute exit prices that cannot cross sides', () => {
    expect(mirrorPaperPreset(preset({ input: limitInput({ limit: { kind: 'side-ticks', value: '0' } }) })).preset.input.limit).toEqual({ kind: 'side-ticks', value: '0' });
    expect(mirrorPaperPreset(preset({ input: limitInput({ limit: { kind: 'price', value: '99' } }) })).preset.input.limit).toEqual({ kind: 'price', value: '99' });
    const withExits = preset({ input: limitInput({ exits: { mode: 'single', levels: [{ id: 'a', quantity: '10', takeProfit: { kind: 'price', value: '110' }, stopLoss: { kind: 'ticks', value: '50' } }] } }) });
    const result = mirrorPaperPreset(withExits);
    expect(result.preset.input.exits).toBeNull();
    expect(result.notes.join(' ')).toMatch(/exit/i);
    const relative = preset({ input: limitInput({ exits: { mode: 'single', levels: [{ id: 'a', quantity: '10', takeProfit: { kind: 'ticks', value: '100' }, stopLoss: { kind: 'ticks', value: '50' } }] } }) });
    expect(mirrorPaperPreset(relative).preset.input.exits).toEqual(relative.input.exits);
  });
});

describe('TICKET applicability', () => {
  it('lists each inapplicable saved field with its reason', () => {
    const odd = preset({ input: limitInput({ type: 'market', limit: { kind: 'side-ticks', value: '-2' }, stop: { kind: 'side-ticks', value: '4' }, entryOutsideRth: true, takeProfitOutsideRth: true }) });
    const applied = applyPaperPreset(odd, 'buy', NOW);
    expect(applied.input.limit).toBeNull(); expect(applied.input.stop).toBeNull();
    expect(applied.input.entryOutsideRth).toBe(false); expect(applied.input.takeProfitOutsideRth).toBe(false);
    expect(applied.notes).toEqual(expect.arrayContaining([
      'Limit offset does not apply to a market order',
      'Stop offset does not apply to a market order',
      'Entry outside regular hours applies only to limit orders',
      'Take profit outside regular hours needs a take profit',
    ]));
  });
  it('replaces a passed manual expiry with Day and says so', () => {
    const old = preset({ input: limitInput({ validity: { kind: 'manual-expiry', expiresAt: 5 } }) });
    const stale = applyPaperPreset(old, 'buy', 10);
    expect(stale.input.validity).toEqual({ kind: 'day' });
    expect(stale.notes).toContain('The saved expiry has passed, so Day applies');
    const fresh = applyPaperPreset(preset({ input: limitInput({ validity: { kind: 'manual-expiry', expiresAt: 5000 } }) }), 'buy', 10);
    expect(fresh.input.validity).toEqual({ kind: 'manual-expiry', expiresAt: 5000 }); expect(fresh.notes).toEqual([]);
  });
  it('describes a preset without internal identifiers', () => {
    const text = presetSummary(preset());
    expect(text).toBe('Buy limit, 10 units, 2 ticks below the ask, Day');
    expect(presetSummary(preset({ side: 'sell', input: limitInput({ limit: { kind: 'side-ticks', value: '3' } }) }))).toBe('Sell limit, 10 units, 3 ticks above the bid, Day');
    expect(presetSummary(preset({ input: limitInput({ type: 'market', limit: null }) }))).toBe('Buy market, 10 units, Day');
  });
});

describe('EDIT and DELETE', () => {
  it('saving an existing name asks first, then replaces it and keeps the preset id', () => {
    const first = savePaperPreset([], { name: 'Pullback', side: 'buy', input: limitInput() }, { idFactory: () => 'id-1' });
    expect(first).toMatchObject({ ok: true, replaced: false }); if (!first.ok) throw new Error('x');
    expect(first.presets).toHaveLength(1); expect(first.presets[0].id).toBe('id-1');
    const draft = { name: 'pullback', side: 'sell' as const, input: limitInput({ quantity: { kind: 'units', value: '3' } }) };
    const asked = savePaperPreset(first.presets, draft, { idFactory: () => 'id-2' });
    expect(asked).toEqual({ ok: false, needsConfirmation: true, message: 'Replace the preset Pullback?' });
    const replaced = savePaperPreset(first.presets, draft, { idFactory: () => 'id-2', replace: true });
    expect(replaced).toMatchObject({ ok: true, replaced: true }); if (!replaced.ok) throw new Error('x');
    expect(replaced.presets).toHaveLength(1);
    expect(replaced.presets[0]).toMatchObject({ id: 'id-1', name: 'pullback', side: 'sell' });
    expect(replaced.presets[0].input.quantity).toEqual({ kind: 'units', value: '3' });
  });
  it('refuses a 51st preset', () => {
    let presets: PaperPreset[] = [];
    for (let index = 0; index < 50; index++) { const saved = savePaperPreset(presets, { name: `P${index}`, side: 'buy', input: limitInput() }, { idFactory: () => `id${index}` }); if (!saved.ok) throw new Error('x'); presets = saved.presets; }
    expect(savePaperPreset(presets, { name: 'P50', side: 'buy', input: limitInput() }, { idFactory: () => 'id50' })).toMatchObject({ ok: false });
  });
  it('DELETE falls back to no selection when the selected preset goes', () => {
    const list = [preset(), preset({ id: 'p2', name: 'Other' })];
    expect(deletePaperPreset(list, 'p1', 'p1')).toEqual({ presets: [list[1]], selectedId: null });
    expect(deletePaperPreset(list, 'p2', 'p1')).toEqual({ presets: [list[0]], selectedId: 'p1' });
    expect(deletePaperPreset(list, 'missing', 'p1')).toEqual({ presets: list, selectedId: 'p1' });
  });
});

describe('EXITS.PRESET', () => {
  it('saves and restores a four level exit plan exactly', () => {
    const levels = [1, 2, 3, 4].map(n => ({ id: `level-${n}`, quantity: '2', takeProfit: { kind: 'ticks' as const, value: String(n * 10) }, stopLoss: { kind: 'price-percent' as const, value: String(n) } }));
    const withExits = preset({ input: limitInput({ quantity: { kind: 'units', value: '8' }, exits: { mode: 'multiple', levels } }) });
    expect(validatePaperPreset(JSON.parse(JSON.stringify(withExits)))).toEqual(withExits);
    expect(applyPaperPreset(withExits, 'buy', NOW).input.exits).toEqual({ mode: 'multiple', levels });
    const placed = placePaperPreset(withExits, 'buy', context(), { commandId: 'c4' });
    expect(placed.ok && placed.account.orders[0].exits?.levels).toHaveLength(4);
  });
});

describe('placing', () => {
  it('a duplicate command identity places one order', () => {
    const first = placePaperPreset(preset(), 'buy', context(), { commandId: 'same' });
    if (!first.ok) throw new Error(first.message);
    const second = placePaperPreset(preset(), 'buy', context(first.account), { commandId: 'same' });
    expect(second.ok && second.account.orders).toHaveLength(1);
  });
  it('reports an engine rejection without creating an order', () => {
    const big = preset({ input: limitInput({ type: 'market', limit: null, quantity: { kind: 'units', value: '100000000' } }) });
    const result = placePaperPreset(big, 'buy', context(), { commandId: 'c9' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/not submitted|reject|buying power/i);
  });
  it('without a quote the market route reports why', () => {
    const noQuote = { ...context(createPaperAccount({ now: 0 })), quote: null, quoteSource: null };
    const result = placePaperPreset(preset({ input: limitInput({ type: 'market', limit: null }) }), 'buy', noQuote, { commandId: 'c10' });
    expect(result.ok).toBe(false);
  });
});

describe('CONTEXT placement at the clicked price', () => {
  it('places a limit at the exact clicked price text for the preset side and quantity', () => {
    const buy = placePaperPreset(preset(), 'buy', context(), { commandId: 'k1', limitPriceText: '99.5' });
    expect(buy.ok && buy.account.orders[0]).toMatchObject({ side: 'buy', type: 'limit', limitPrice: 99.5, quantity: 10, status: 'working' });
    const sell = placePaperPreset(preset({ side: 'sell' }), 'sell', context(), { commandId: 'k2', limitPriceText: '100.5' });
    expect(sell.ok && sell.account.orders[0]).toMatchObject({ side: 'sell', type: 'limit', limitPrice: 100.5, quantity: 10, status: 'working' });
  });
  it('replaces a market or stop preset type with the clicked limit and never rounds the price', () => {
    const market = preset({ input: limitInput({ type: 'market', limit: null }) });
    const placed = placePaperPreset(market, 'buy', context(), { commandId: 'k3', limitPriceText: '99' });
    expect(placed.ok && placed.account.orders[0]).toMatchObject({ type: 'limit', limitPrice: 99 });
    const off = placePaperPreset(preset(), 'buy', context(), { commandId: 'k4', limitPriceText: '99.505' });
    expect(off.ok).toBe(false); if (!off.ok) expect(off.message).toMatch(/tick/i);
  });
  it('a clicked price through the market fills at the executable side, never at the click', () => {
    const through = placePaperPreset(preset(), 'buy', context(), { commandId: 'k5', limitPriceText: '101' });
    expect(through.ok && through.account.orders[0]).toMatchObject({ status: 'filled', averageFillPrice: 100.02 });
  });
});
