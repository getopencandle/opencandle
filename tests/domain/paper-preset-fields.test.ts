import { describe, expect, it } from 'vitest';
import { applyPaperPreset, PAPER_PRESET_FIELDS, paperPresetFields, presetSummary, savePaperPreset, validatePaperPreset, type PaperPreset, type PaperPresetInput } from '../../src/domain/paper-presets';
import type { PaperTicketInput } from '../../src/domain/paper-ticket';

// Synthetic values only.
const NOW = 1;
const input = (overrides: Partial<PaperPresetInput> = {}): PaperPresetInput => ({ quantity: { kind: 'units', value: '10' }, type: 'limit', limit: { kind: 'side-ticks', value: '-2' }, stop: null, validity: { kind: 'day' }, entryOutsideRth: false, takeProfitOutsideRth: false, exits: { mode: 'multiple', levels: [{ id: 'l1', quantity: '10', takeProfit: { kind: 'ticks', value: '20' }, stopLoss: { kind: 'ticks', value: '10' } }] }, ...overrides });
const preset = (overrides: Partial<PaperPreset> = {}): PaperPreset => ({ schemaVersion: 1, id: 'p1', name: 'Pullback', side: 'buy', input: input(), ...overrides });
const ticket: PaperTicketInput = { schemaVersion: 1, side: 'buy', type: 'market', quantity: { kind: 'units', value: '3' }, limit: { kind: 'price', value: '98.50' }, stop: null, validity: { kind: 'manual-expiry', expiresAt: 999999 }, entryOutsideRth: true, takeProfitOutsideRth: false, exits: null };

describe('saved-field choices', () => {
  it('a full choice saves exactly as before (no fields key), a partial choice records the groups in catalog order', () => {
    const all = savePaperPreset([], { name: 'All', side: 'buy', input: input(), fields: PAPER_PRESET_FIELDS.map(row => row.id) }, { idFactory: () => 'a' });
    expect(all.ok && 'fields' in all.presets[0]).toBe(false);
    const some = savePaperPreset([], { name: 'Exits only', side: 'buy', input: input(), fields: ['exits', 'quantity'] }, { idFactory: () => 'b' });
    expect(some.ok && some.presets[0].fields).toEqual(['quantity', 'exits']);
    expect(savePaperPreset([], { name: 'None', side: 'buy', input: input(), fields: [] })).toEqual({ ok: false, message: 'Choose at least one field to save.' });
  });
  it('validation accepts known partial lists and refuses empty, complete, unknown or repeated lists', () => {
    expect(validatePaperPreset(preset({ fields: ['exits'] })).fields).toEqual(['exits']);
    for (const fields of [[], PAPER_PRESET_FIELDS.map(row => row.id), ['colour'], ['exits', 'exits']]) expect(() => validatePaperPreset(preset({ fields: fields as never }))).toThrow(/saved fields/);
    expect(paperPresetFields(preset())).toHaveLength(PAPER_PRESET_FIELDS.length);
  });
  it('in the ticket, groups that were not saved keep the ticket values; the type always applies', () => {
    const applied = applyPaperPreset(preset({ fields: ['exits'] }), 'buy', NOW, ticket);
    expect(applied.input.type).toBe('limit');
    expect(applied.input.quantity).toEqual({ kind: 'units', value: '3' });
    expect(applied.input.limit).toEqual({ kind: 'price', value: '98.50' });
    expect(applied.input.validity).toEqual({ kind: 'manual-expiry', expiresAt: 999999 });
    expect(applied.input.entryOutsideRth).toBe(true);
    expect(applied.input.exits?.levels).toHaveLength(1);
    expect(applied.notes.at(-1)).toBe('Kept from the ticket (not saved in this preset): quantity, prices, validity, extended hours');
  });
  it('without a ticket (chart buttons) and for full presets the whole saved order applies', () => {
    const partial = preset({ fields: ['exits'] });
    expect(applyPaperPreset(partial, 'buy', NOW).input.quantity).toEqual({ kind: 'units', value: '10' });
    expect(applyPaperPreset(preset(), 'buy', NOW, ticket).input.quantity).toEqual({ kind: 'units', value: '10' });
    expect(presetSummary(partial)).toContain('in the ticket applies take profit and stop loss');
  });
});
