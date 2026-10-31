import { submitPaperOrder, type PaperAccount, type PaperOrderType, type PaperSide } from './paper';
import { materializePaperTicket, previewPaperTicket, validatePaperTicketInput, type PaperPriceInput, type PaperQuantityInput, type PaperTicketContext, type PaperTicketInput } from './paper-ticket';

/**
 * Order presets for the chart Buy and Sell routes. The saved field list is our own choice: quantity and its
 * representation, order type, price representation and offset, validity (Day, GTC or a manual expiry), session switches and
 * the exit plan. The full reference checkbox catalog is unknown, so nothing here claims it.
 */
export const PAPER_PRESET_LIMITS = { presets: 50, nameCharacters: 64, bytes: 262144 } as const;
/** `gtc` (good till cancelled, no expiry) joins Day and manual expiry. Presets saved before it carry only the other two
 * kinds and restore byte for byte. */
export type PaperPresetValidity = { kind: 'day' } | { kind: 'gtc' } | { kind: 'manual-expiry'; expiresAt: number };
export interface PaperPresetInput {
  quantity: PaperQuantityInput; type: Exclude<PaperOrderType, 'trailing-stop'>; limit: PaperPriceInput | null; stop: PaperPriceInput | null;
  validity: PaperPresetValidity; entryOutsideRth: boolean; takeProfitOutsideRth: boolean; exits: PaperTicketInput['exits'];
}
/**
 * Saved-field choices. A preset always stores one complete, valid
 * order so the chart buttons and Shift+B/S stay deterministic; `fields` names the groups that replace the open ticket's values when
 * the preset is applied in the ticket. Order type is always applied. Absent means every group, so presets saved before this
 * feature keep their bytes and behaviour. The reference checkbox catalog is unresolved; these groups are LV's own.
 */
export type PaperPresetField = 'quantity' | 'prices' | 'validity' | 'session' | 'exits';
export const PAPER_PRESET_FIELDS: ReadonlyArray<{ id: PaperPresetField; label: string }> = [
  { id: 'quantity', label: 'Quantity' }, { id: 'prices', label: 'Limit and stop prices' }, { id: 'validity', label: 'Validity' }, { id: 'session', label: 'Extended hours' }, { id: 'exits', label: 'Take profit and stop loss' },
];
export interface PaperPreset { schemaVersion: 1; id: string; name: string; side: PaperSide; input: PaperPresetInput; fields?: PaperPresetField[]; }
export const paperPresetFields = (preset: Pick<PaperPreset, 'fields'>): PaperPresetField[] => preset.fields ? [...preset.fields] : PAPER_PRESET_FIELDS.map(row => row.id);
export interface AppliedPaperPreset { input: PaperTicketInput; notes: string[]; }

const SIDES = ['buy', 'sell'];
const TYPES = ['market', 'limit', 'stop', 'stop-limit'];
const typeWord = (type: string) => type === 'stop-limit' ? 'stop-limit' : type;

function plainRecord(value: unknown, keys: string[], label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== keys.length || Object.keys(value).some(key => !keys.includes(key))) throw new Error(`${label} has missing or unsupported fields.`);
  return value as Record<string, unknown>;
}
/** Builds the ticket input a preset describes, applying only what fits the order type. Pure and deterministic for a given clock. */
export function applyPaperPreset(preset: PaperPreset, side: PaperSide, now: number, base?: PaperTicketInput): AppliedPaperPreset {
  const full = applyFullPaperPreset(preset, side, now);
  if (!base || !preset.fields) return full;
  const chosen = new Set(preset.fields), input = { ...full.input }, notes = [...full.notes], kept: string[] = [];
  const needsLimit = input.type === 'limit' || input.type === 'stop-limit', needsStop = input.type === 'stop' || input.type === 'stop-limit';
  if (!chosen.has('quantity')) { input.quantity = structuredClone(base.quantity); kept.push('quantity'); }
  if (!chosen.has('prices')) {
    if (needsLimit && base.limit) input.limit = structuredClone(base.limit);
    if (needsStop && base.stop) input.stop = structuredClone(base.stop);
    kept.push('prices');
  }
  if (!chosen.has('validity')) { input.validity = base.validity.kind === 'retain-existing' ? { kind: 'day' } : structuredClone(base.validity); kept.push('validity'); }
  if (!chosen.has('exits')) { input.exits = base.exits ? structuredClone(base.exits) : null; kept.push('exits'); }
  if (!chosen.has('session')) { input.entryOutsideRth = base.entryOutsideRth && input.type === 'limit'; input.takeProfitOutsideRth = base.takeProfitOutsideRth && !!input.exits?.levels.some(level => level.takeProfit !== null); kept.push('extended hours'); }
  else if (input.takeProfitOutsideRth && !input.exits?.levels.some(level => level.takeProfit !== null)) input.takeProfitOutsideRth = false;
  if (kept.length) notes.push(`Kept from the ticket (not saved in this preset): ${kept.join(', ')}`);
  return { input, notes };
}
function applyFullPaperPreset(preset: PaperPreset, side: PaperSide, now: number): AppliedPaperPreset {
  const notes: string[] = [];
  const source = side === preset.side ? preset : mirrorPaperPreset(preset).preset;
  if (side !== preset.side) notes.push(...mirrorPaperPreset(preset).notes);
  const input = source.input, type = input.type;
  const needsLimit = type === 'limit' || type === 'stop-limit', needsStop = type === 'stop' || type === 'stop-limit';
  const word = (field: PaperPriceInput) => field.kind === 'side-ticks' ? 'offset' : 'price';
  if (input.limit && !needsLimit) notes.push(`Limit ${word(input.limit)} does not apply to a ${typeWord(type)} order`);
  if (input.stop && !needsStop) notes.push(`Stop ${word(input.stop)} does not apply to a ${typeWord(type)} order`);
  let entryOutsideRth = input.entryOutsideRth;
  if (entryOutsideRth && type !== 'limit') { entryOutsideRth = false; notes.push('Entry outside regular hours applies only to limit orders'); }
  let takeProfitOutsideRth = input.takeProfitOutsideRth;
  if (takeProfitOutsideRth && !input.exits?.levels.some(level => level.takeProfit !== null)) { takeProfitOutsideRth = false; notes.push('Take profit outside regular hours needs a take profit'); }
  let validity: PaperTicketInput['validity'] = { kind: 'day' };
  if (input.validity.kind === 'gtc') validity = { kind: 'gtc' };
  else if (input.validity.kind === 'manual-expiry') {
    if (input.validity.expiresAt > now) validity = { kind: 'manual-expiry', expiresAt: input.validity.expiresAt };
    else notes.push('The saved expiry has passed, so Day applies');
  }
  const ticket: PaperTicketInput = { schemaVersion: 1, side, type, quantity: structuredClone(input.quantity), limit: needsLimit && input.limit ? structuredClone(input.limit) : null, stop: needsStop && input.stop ? structuredClone(input.stop) : null, validity, entryOutsideRth, takeProfitOutsideRth, exits: input.exits ? structuredClone(input.exits) : null };
  return { input: ticket, notes };
}

const flipSigned = (value: string): string => { const text = value.trim(); if (/^[+-]?0*\.?0*$/.test(text) && Number(text) === 0) return text; return text.startsWith('-') ? text.slice(1) : text.startsWith('+') ? '-' + text.slice(1) : '-' + text; };
/** MIRROR: a buy preset used as a sell (or the reverse). Relative offsets reverse direction and use the opposite quote side. */
export function mirrorPaperPreset(preset: PaperPreset): { preset: PaperPreset; notes: string[] } {
  const notes: string[] = [`Mirrored from the ${preset.side} preset: relative offsets reverse direction from the ${preset.side === 'buy' ? 'bid' : 'ask'}`];
  const flip = (field: PaperPriceInput | null): PaperPriceInput | null => field && field.kind === 'side-ticks' ? { kind: 'side-ticks', value: flipSigned(field.value) } : field && structuredClone(field);
  let exits = preset.input.exits ? structuredClone(preset.input.exits) : null;
  if (exits?.levels.some(level => level.takeProfit?.kind === 'price' || level.stopLoss?.kind === 'price')) { exits = null; notes.push('Exit prices are absolute and do not carry to the opposite side, so the exits were left out'); }
  const input: PaperPresetInput = { ...structuredClone(preset.input), limit: flip(preset.input.limit), stop: flip(preset.input.stop), exits, takeProfitOutsideRth: exits ? preset.input.takeProfitOutsideRth : false };
  return { preset: { ...preset, side: preset.side === 'buy' ? 'sell' : 'buy', input }, notes };
}

/** Throws a plain message for any malformed preset; the result is a detached copy. */
export function validatePaperPreset(value: unknown): PaperPreset {
  const hasFields = !!value && typeof value === 'object' && Object.prototype.hasOwnProperty.call(value, 'fields');
  const row = plainRecord(value, hasFields ? ['schemaVersion', 'id', 'name', 'side', 'input', 'fields'] : ['schemaVersion', 'id', 'name', 'side', 'input'], 'Preset');
  if (hasFields) {
    const known = PAPER_PRESET_FIELDS.map(item => item.id) as string[], fields = row.fields;
    if (!Array.isArray(fields) || !fields.length || fields.length >= known.length || fields.some(item => !known.includes(item as string)) || new Set(fields).size !== fields.length) throw new Error('Preset saved fields must list some, but not all, of the known field groups.');
  }
  if (row.schemaVersion !== 1 || typeof row.id !== 'string' || !row.id || row.id.length > 128 || ['__proto__', 'constructor', 'prototype'].includes(row.id)) throw new Error('Preset identity is invalid.');
  if (typeof row.name !== 'string' || !row.name.trim() || row.name.length > PAPER_PRESET_LIMITS.nameCharacters) throw new Error('Preset names need 1 to 64 characters.');
  if (!SIDES.includes(row.side as string)) throw new Error('Preset side must be buy or sell.');
  const input = plainRecord(row.input, ['quantity', 'type', 'limit', 'stop', 'validity', 'entryOutsideRth', 'takeProfitOutsideRth', 'exits'], 'Preset fields');
  if (!TYPES.includes(input.type as string)) throw new Error('Preset order type is not supported.');
  if (new TextEncoder().encode(JSON.stringify(value)).byteLength > PAPER_PRESET_LIMITS.bytes) throw new Error('A preset is limited to 256 KiB.');
  const validity = input.validity as { kind?: unknown; expiresAt?: unknown } | null;
  if (!validity || typeof validity !== 'object' || Array.isArray(validity) || (validity.kind !== 'day' && validity.kind !== 'gtc' && validity.kind !== 'manual-expiry') || (validity.kind !== 'manual-expiry' ? Object.keys(validity).length !== 1 : Object.keys(validity).length !== 2 || !Number.isSafeInteger(validity.expiresAt) || (validity.expiresAt as number) < 0)) throw new Error('Preset validity must be Day, GTC or a manual expiry.');
  const type = input.type as string;
  if ((type === 'limit' || type === 'stop-limit') && !input.limit) throw new Error('This preset type needs a limit price or offset.');
  if ((type === 'stop' || type === 'stop-limit') && !input.stop) throw new Error('This preset type needs a stop price or offset.');
  // The ticket validator owns the field grammar. Build the strict ticket form with every saved value kept.
  validatePaperTicketInput({ schemaVersion: 1, side: row.side, type, quantity: input.quantity, limit: type === 'limit' || type === 'stop-limit' ? input.limit : null, stop: type === 'stop' || type === 'stop-limit' ? input.stop : null, validity: { kind: 'day' }, entryOutsideRth: input.entryOutsideRth, takeProfitOutsideRth: input.takeProfitOutsideRth, exits: input.exits });
  for (const key of ['limit', 'stop'] as const) if (input[key]) validatePaperTicketInput({ schemaVersion: 1, side: row.side, type: key === 'limit' ? 'limit' : 'stop', quantity: { kind: 'units', value: '1' }, limit: key === 'limit' ? input.limit : null, stop: key === 'stop' ? input.stop : null, validity: { kind: 'day' }, entryOutsideRth: false, takeProfitOutsideRth: false, exits: null });
  return structuredClone(value) as PaperPreset;
}
export function validatePaperPresets(value: unknown): PaperPreset[] {
  if (!Array.isArray(value)) throw new Error('Presets must be a list.');
  if (value.length > PAPER_PRESET_LIMITS.presets) throw new Error('At most 50 presets are kept.');
  const ids = new Set<string>(), names = new Set<string>();
  return value.map(item => {
    const preset = validatePaperPreset(item), key = preset.name.trim().toLowerCase();
    if (ids.has(preset.id)) throw new Error('Preset identities must be unique.');
    if (names.has(key)) throw new Error('Preset names must be unique.');
    ids.add(preset.id); names.add(key); return preset;
  });
}

export interface SavePaperPresetDraft { name: string; side: PaperSide; input: PaperPresetInput; fields?: PaperPresetField[]; }
export type SavePaperPresetResult = { ok: true; presets: PaperPreset[]; id: string; replaced: boolean } | { ok: false; needsConfirmation?: true; message: string };
/** CREATE and EDIT: an existing name (case-insensitive) is replaced only after confirmation and keeps its identity. */
export function savePaperPreset(presets: PaperPreset[], draft: SavePaperPresetDraft, options: { replace?: boolean; idFactory?: () => string } = {}): SavePaperPresetResult {
  const name = draft.name.trim(), existing = presets.find(row => row.name.trim().toLowerCase() === name.toLowerCase());
  if (existing && !options.replace) return { ok: false, needsConfirmation: true, message: `Replace the preset ${existing.name}?` };
  if (!existing && presets.length >= PAPER_PRESET_LIMITS.presets) return { ok: false, message: 'At most 50 presets are kept. Delete one first.' };
  let next: PaperPreset;
  const fields = draft.fields ? PAPER_PRESET_FIELDS.map(row => row.id).filter(id => draft.fields!.includes(id)) : null;
  if (fields && !fields.length) return { ok: false, message: 'Choose at least one field to save.' };
  const partial = fields && fields.length < PAPER_PRESET_FIELDS.length ? { fields } : {};
  try { next = validatePaperPreset({ schemaVersion: 1, id: existing?.id ?? (options.idFactory ?? defaultId)(), name, side: draft.side, input: draft.input, ...partial }); }
  catch (error) { return { ok: false, message: error instanceof Error ? error.message : String(error) }; }
  return { ok: true, presets: existing ? presets.map(row => row === existing ? next : row) : [...presets, next], id: next.id, replaced: Boolean(existing) };
}
const defaultId = () => `preset-${globalThis.crypto.randomUUID()}`;
/** DELETE: deleting the selected preset leaves nothing selected. */
export function deletePaperPreset(presets: PaperPreset[], id: string, selectedId: string | null): { presets: PaperPreset[]; selectedId: string | null } {
  if (!presets.some(row => row.id === id)) return { presets, selectedId };
  return { presets: presets.filter(row => row.id !== id), selectedId: selectedId === id ? null : selectedId };
}

function priceText(field: PaperPriceInput, side: PaperSide): string {
  if (field.kind === 'price') return `at ${field.value}`;
  const amount = Number(field.value), quote = side === 'buy' ? 'ask' : 'bid';
  if (amount === 0) return `at the ${quote}`;
  const ticks = Math.abs(amount);
  return `${ticks} tick${ticks === 1 ? '' : 's'} ${amount < 0 ? 'below' : 'above'} the ${quote}`;
}
/** Wording for the chart button tooltip. No identifiers; original text. */
export function presetSummary(preset: PaperPreset): string {
  const input = preset.input, quantity = input.quantity;
  const size = quantity.kind === 'units' ? `${quantity.value} units` : quantity.kind === 'notional' ? `${quantity.value} ${quantity.currency}` : quantity.kind === 'balance-percent' ? `${quantity.value}% of balance` : quantity.kind === 'risk-money' ? `risk ${quantity.value} ${quantity.currency}` : `risk ${quantity.value}% of balance`;
  const parts = [`${preset.side === 'buy' ? 'Buy' : 'Sell'} ${typeWord(input.type)}`, size];
  const stop = (input.type === 'stop' || input.type === 'stop-limit') && input.stop ? input.stop : null, limit = (input.type === 'limit' || input.type === 'stop-limit') && input.limit ? input.limit : null;
  if (stop) parts.push(`stop ${priceText(stop, preset.side)}`);
  if (limit) parts.push(input.type === 'stop-limit' ? `limit ${priceText(limit, preset.side)}` : priceText(limit, preset.side));
  parts.push(input.validity.kind === 'day' ? 'Day' : input.validity.kind === 'gtc' ? 'GTC' : `expires ${new Date(input.validity.expiresAt * 1000).toISOString().replace(/\.000Z$/, 'Z')}`);
  if (input.exits) parts.push(`${input.exits.levels.length} exit level${input.exits.levels.length === 1 ? '' : 's'}`);
  if (preset.fields) parts.push(`in the ticket applies ${preset.fields.map(id => PAPER_PRESET_FIELDS.find(row => row.id === id)!.label.toLowerCase()).join(', ')}`);
  return parts.join(', ');
}
/** The preset a ticket draft would save as. GTC saves as GTC. Retained existing validity cannot be saved, so it becomes Day. */
export function presetInputFromTicket(input: PaperTicketInput): PaperPresetInput {
  return { quantity: structuredClone(input.quantity), type: input.type, limit: input.limit && structuredClone(input.limit), stop: input.stop && structuredClone(input.stop), validity: input.validity.kind === 'manual-expiry' ? { kind: 'manual-expiry', expiresAt: input.validity.expiresAt } : input.validity.kind === 'gtc' ? { kind: 'gtc' } : { kind: 'day' }, entryOutsideRth: input.entryOutsideRth, takeProfitOutsideRth: input.takeProfitOutsideRth, exits: input.exits && structuredClone(input.exits) };
}

export type PlacePaperPresetResult = { ok: true; account: PaperAccount; orderId: string; notes: string[] } | { ok: false; message: string; notes: string[] };
/**
 * One-click placement of a preset on the active account. Mirrors the ticket path (preview, materialize, engine) and refuses without
 * changing anything when the engine would reject the order, so a rejected attempt never leaves a rejected row behind.
 */
export function placePaperPreset(preset: PaperPreset, side: PaperSide, context: PaperTicketContext, options: { commandId: string; limitPriceText?: string; stopPriceText?: string }): PlacePaperPresetResult {
  if (options.limitPriceText !== undefined && options.stopPriceText !== undefined) return { ok: false, message: 'A clicked price places either a limit or a stop, not both.', notes: [] };
  let applied: AppliedPaperPreset;
  try { applied = applyPaperPreset(preset, side, context.now); } catch (error) { return { ok: false, message: error instanceof Error ? error.message : String(error), notes: [] }; }
  let input = applied.input;
  if (options.limitPriceText !== undefined) input = { ...input, type: 'limit', limit: { kind: 'price', value: options.limitPriceText }, stop: null, entryOutsideRth: input.entryOutsideRth };
  // A stop anchored to the clicked level. Entry outside regular hours applies to limits only.
  if (options.stopPriceText !== undefined) input = { ...input, type: 'stop', stop: { kind: 'price', value: options.stopPriceText }, limit: null, entryOutsideRth: false };
  const preview = previewPaperTicket(input, context);
  if (!preview.ok) return { ok: false, message: preview.diagnostics.map(row => row.message).join(' '), notes: applied.notes };
  const built = materializePaperTicket(preview.value, input, context);
  if (!built.ok) return { ok: false, message: built.diagnostics.map(row => row.message).join(' '), notes: applied.notes };
  const result = submitPaperOrder(context.account, { ...built.value, commandId: options.commandId }, context.now);
  if (!result.ok) return { ok: false, message: result.diagnostics.map(row => row.message).join(' '), notes: applied.notes };
  const order = result.orderId ? result.account.orders.find(row => row.id === result.orderId) : undefined;
  if (!order) return { ok: false, message: 'The virtual order was not created.', notes: applied.notes };
  if (order.status === 'rejected') return { ok: false, message: `Not submitted. The virtual engine would reject this order now: ${order.rejectionReason ?? 'rejected'} No virtual order was created.`, notes: applied.notes };
  return { ok: true, account: result.account, orderId: order.id, notes: applied.notes };
}
