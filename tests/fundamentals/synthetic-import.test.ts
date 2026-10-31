import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FundamentalsDialog, type FundamentalsDialogProps } from '../../src/ui/FundamentalsDialog';
import { normalizeCompanyFacts, restoreFactsDocument, type FactsDocument, type FactsSource } from '../../src/fundamentals/company-facts';
import { buildStatement } from '../../src/fundamentals/statements';
import { createFundamentalsPreferences, type FundamentalsPreferences } from '../../src/fundamentals/preferences';

// Actual dialog handlers with controlled hooks, effect cleanup and state-write counting.
// These are not native input, rendering, IPC/provider or packaged-executable checks.
const hooks = vi.hoisted(() => ({ cells: [] as unknown[], cursor: 0, writes: 0, cleanupCalls: 0,
  pending: [] as Array<() => void>, cleanups: new Map<number, () => void>() }));
vi.mock('react', async () => {
  const actual = await vi.importActual<typeof import('react')>('react');
  return { ...actual,
    useState: (initial: unknown) => {
      const index = hooks.cursor++;
      if (!(index in hooks.cells)) hooks.cells[index] = typeof initial === 'function' ? initial() : initial;
      return [hooks.cells[index], (next: unknown) => { hooks.writes++; hooks.cells[index] = typeof next === 'function' ? next(hooks.cells[index]) : next; }];
    },
    useRef: (initial: unknown) => { const index = hooks.cursor++; if (!(index in hooks.cells)) hooks.cells[index] = { current: initial }; return hooks.cells[index]; },
    useMemo: (factory: () => unknown) => { hooks.cursor++; return factory(); },
    useEffect: (effect: () => void | (() => void), deps?: readonly unknown[]) => {
      const index = hooks.cursor++, previous = hooks.cells[index] as { deps?: readonly unknown[] } | undefined;
      if (previous && deps && previous.deps && deps.length === previous.deps.length && deps.every((value, i) => Object.is(value, previous.deps![i]))) return;
      hooks.cells[index] = { deps };
      hooks.pending.push(() => {
        const old = hooks.cleanups.get(index); if (old) { hooks.cleanupCalls++; old(); }
        const cleanup = effect(); if (cleanup) hooks.cleanups.set(index, cleanup); else hooks.cleanups.delete(index);
      });
    },
  };
});
type Element = { type: unknown; props: Record<string, unknown> };
function element(value: unknown): value is Element { return !!value && typeof value === 'object' && 'props' in value && !!value.props && typeof value.props === 'object' && 'type' in value; }
function content(value: unknown): string { return typeof value === 'string' || typeof value === 'number' ? String(value) : Array.isArray(value) ? value.map(content).join('') : element(value) ? content(value.props.children) : ''; }
function find(value: unknown, predicate: (node: Element) => boolean): Element | null {
  if (Array.isArray(value)) { for (const child of value) { const found = find(child, predicate); if (found) return found; } return null; }
  if (!element(value)) return null; return predicate(value) ? value : find(value.props.children, predicate);
}
function callback(node: Element, name: string): (...args: unknown[]) => unknown {
  const fn = node.props[name]; if (typeof fn !== 'function') throw new Error(`Missing handler ${name}`);
  return (...args) => fn(...args);
}
function unmount(): void { for (const cleanup of hooks.cleanups.values()) { hooks.cleanupCalls++; cleanup(); } hooks.cleanups.clear(); }
function mount(patch: Partial<FundamentalsDialogProps> = {}) {
  let props: FundamentalsDialogProps;
  const publish = vi.fn((documents: FactsDocument[]) => { const result = patch.onChange?.(documents); if (result !== false) props.documents = documents; return result; });
  const preferences = vi.fn((next: FundamentalsPreferences) => { const result = patch.onPreferencesChange?.(next); if (result !== false) props.preferences = next; return result; });
  const close = vi.fn(() => patch.onClose?.());
  props = { symbol: 'LVDEMO', documents: [], preferences: createFundamentalsPreferences(), market: { exchange: 'SYNTHETIC', symbol: 'LVDEMO', synthetic: true }, now: () => new Date('2026-10-15T12:00:00Z'), ...patch, onChange: publish, onPreferencesChange: preferences, onClose: close };
  const render = () => { hooks.cursor = 0; const tree = FundamentalsDialog(props); const effects = hooks.pending.splice(0); effects.forEach(effect => effect()); return tree; };
  const node = (label: string): Element => {
    const tree = render(); let found = find(tree, item => item.props['aria-label'] === label || item.type === 'button' && content(item) === label);
    if (!found) { const labelled = find(tree, item => item.type === 'label' && content(item) === label); if (labelled) found = find(labelled.props.children, item => item.type === 'input'); }
    if (!found) throw new Error(`Missing control ${label}`); return found;
  };
  render();
  return { props, publish, preferences, closed: close, render, node,
    click: (label: string) => callback(node(label), 'onClick')(),
    change: (label: string, value: string) => callback(node(label), 'onChange')({ target: { value }, currentTarget: { value } }),
    check: (checked: boolean) => callback(node('Mark import as demo data'), 'onChange')({ target: { checked }, currentTarget: { checked } }),
    close: () => callback(render(), 'onClose')(), // Actual Modal close/Escape callback supplied by FundamentalsDialog.
    error: () => content(find(render(), item => item.props.role === 'alert')),
    text: () => content(render()),
  };
}
type UI = ReturnType<typeof mount>;
function deferred<T = unknown>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }
const flush = async () => { await new Promise<void>(resolve => setTimeout(resolve, 0)); };
function rawFacts(entityName = 'INDEPENDENT SYNTHETIC TEST COMPANY') {
  const observation = (val: number) => ({ start: '2023-01-01', end: '2023-12-31', filed: '2024-02-20', fy: 2023, fp: 'FY', form: '10-K', accn: 'SYNTHETIC-2023', val });
  return { cik: 424242, entityName, facts: { 'us-gaap': {
    Revenues: { label: 'Revenue', units: { USD: [observation(1000)] } },
    CostOfRevenue: { label: 'Cost', units: { USD: [observation(600)] } },
    GrossProfit: { label: 'Gross profit', units: { USD: [observation(400)] } },
    NetIncomeLoss: { label: 'Net income', units: { USD: [observation(100)] } },
  } } };
}
const json = () => JSON.stringify(rawFacts());
const secUrl = 'https://data.sec.gov/api/xbrl/companyfacts/CIK0000424242.json';
function document(kind: FactsSource['kind'] = 'synthetic', id = 'existing'): FactsDocument {
  return { id, facts: normalizeCompanyFacts(rawFacts()), source: { kind, label: kind === 'synthetic' ? 'SYNTHETIC DEMO saved fixture' : kind === 'local-import' ? 'Unverified user file' : 'SEC EDGAR companyfacts', retrievedAt: '2026-10-15T00:00:00Z', sourceUrl: kind === 'sec-public' ? secUrl : null, sha256: kind === 'sec-public' ? 'a'.repeat(64) : null } };
}
const fileOK = (text = json()) => ({ ok: true, value: { format: 'json', text } });
const failed = () => ({ ok: false, error: { code: 'cancelled', message: 'Native request cancelled.' } });
const secOK = () => ({ ok: true, value: { cik: '0000424242', data: rawFacts(), provenance: { retrievedAt: '2026-10-15T00:00:00Z', sourceUrl: secUrl, sha256: 'a'.repeat(64) } } });
function bridge() {
  const lv = { importData: vi.fn((_request: unknown): Promise<unknown> => Promise.resolve(fileOK())), fetchSecCompanyFacts: vi.fn((_request: unknown): Promise<unknown> => Promise.resolve(secOK())), cancelSecRequest: vi.fn((_request: unknown) => Promise.resolve({ ok: true })), exportData: vi.fn((_request: { text: string; suggestedName: string; format: string }) => Promise.resolve({ ok: true, value: null })) };
  vi.stubGlobal('window', { lv }); return lv;
}
function expectImported(ui: UI, kind: 'synthetic' | 'local-import') {
  expect(ui.publish).toHaveBeenCalledTimes(1);
  const imported = ui.props.documents.at(-1)!;
  expect(imported.source).toMatchObject({ kind, sourceUrl: null, sha256: null });
  expect(imported.id).toMatch(kind === 'synthetic' ? /^synthetic-facts:/ : /^local-facts:/);
  expect(imported.source.label).toBe(kind === 'synthetic' ? 'Demo companyfacts' : 'User-supplied companyfacts JSON; source unverified');
  expect(imported.facts.concepts.find(item => item.tag === 'Revenues')!.observations[0].value).toBe(1000);
  expect(ui.preferences).not.toHaveBeenCalled();
  return imported;
}
beforeEach(() => { hooks.cells = []; hooks.cursor = 0; hooks.writes = 0; hooks.cleanupCalls = 0; hooks.pending = []; hooks.cleanups.clear(); vi.stubGlobal('window', {}); });
afterEach(() => { unmount(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('FUND.SYNTHETIC.IMPORT.KIND and REQUEST_KIND', () => {
  it.each([false, true])('pasted JSON uses explicitly checked=%s with no automatic link', checked => {
    const ui = mount(); expect(ui.node('Mark import as demo data').props.checked).toBe(false);
    ui.check(checked); ui.change('Companyfacts JSON', json()); ui.click('Import pasted JSON');
    const imported = expectImported(ui, checked ? 'synthetic' : 'local-import');
    expect(ui.node('Fundamentals document').props.value).toBe(imported.id);
    expect(ui.node('Companyfacts JSON').props.value).toBe('');
  });
  it.each([false, true])('native JSON captures checked=%s and ignores retained checkbox changes while busy', async checked => {
    const lv = bridge(), pending = deferred(); lv.importData.mockReturnValue(pending.promise);
    const ui = mount(); const oldCheckbox = callback(ui.node('Mark import as demo data'), 'onChange');
    ui.check(checked); ui.click('Import JSON file'); const before = hooks.writes;
    expect(ui.node('Mark import as demo data').props.disabled).toBe(true);
    oldCheckbox({ target: { checked: !checked }, currentTarget: { checked: !checked } });
    expect(hooks.writes).toBe(before); expect(ui.node('Mark import as demo data').props.checked).toBe(checked);
    pending.resolve(fileOK()); await flush(); expectImported(ui, checked ? 'synthetic' : 'local-import');
    expect(lv.importData).toHaveBeenCalledWith({ kind: 'fundamentals' });
  });
  it('toggling import mode never relabels the selected saved document', () => {
    const saved = document('local-import'), before = JSON.stringify(saved), ui = mount({ documents: [saved] });
    ui.check(true); expect(ui.props.documents[0]).toBe(saved); expect(JSON.stringify(saved)).toBe(before);
    expect(ui.publish).not.toHaveBeenCalled(); expect(ui.node('Fundamentals document').props.value).toBe('existing');
  });
});

describe('FUND.SYNTHETIC.IMPORT.CANCEL', () => {
  it.each([
    ['cancel', 'success'], ['cancel', 'failure'], ['close', 'success'], ['close', 'failure'], ['footer', 'success'], ['footer', 'failure'], ['unmount', 'success'], ['unmount', 'failure'],
  ] as const)('%s retires a native %s before any late publication or state writes', async (action, result) => {
    const lv = bridge(), pending = deferred(); lv.importData.mockReturnValue(pending.promise);
    const ui = mount(); ui.check(true); ui.change('Companyfacts JSON', 'draft retained'); ui.click('Import JSON file');
    if (action === 'cancel') ui.click('Cancel request'); else if (action === 'close') ui.close(); else if (action === 'footer') ui.click('Close'); else unmount();
    const writes = hooks.writes;
    if (action === 'close' || action === 'footer') { expect(ui.closed).toHaveBeenCalledTimes(1); expect(hooks.cleanupCalls).toBe(0); }
    if (action === 'unmount') expect(hooks.cleanupCalls).toBeGreaterThan(0);
    pending.resolve(result === 'success' ? fileOK() : failed()); await flush();
    expect(hooks.writes).toBe(writes); expect(ui.publish).not.toHaveBeenCalled(); expect(ui.preferences).not.toHaveBeenCalled();
    if (action === 'cancel') { expect(ui.node('Companyfacts JSON').props.value).toBe('draft retained'); expect(ui.node('Mark import as demo data').props.checked).toBe(true); }
  });
  it.each(['success', 'failure'] as const)('an older %s response cannot clear the newer request or change its kind', async result => {
    const lv = bridge(), first = deferred(), second = deferred(); lv.importData.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const ui = mount(); ui.check(true); ui.click('Import JSON file'); ui.click('Cancel request'); ui.check(false); ui.click('Import JSON file');
    const before = hooks.writes; first.resolve(result === 'success' ? fileOK() : failed()); await flush();
    expect(hooks.writes).toBe(before); expect(ui.publish).not.toHaveBeenCalled(); expect(ui.node('Mark import as demo data').props.disabled).toBe(true);
    expect(ui.node('Mark import as demo data').props.checked).toBe(false);
    second.resolve(fileOK()); await flush(); expectImported(ui, 'local-import');
  });
  it('retained import, fetch and checkbox entry handlers cannot act after close', () => {
    const lv = bridge(), ui = mount(); ui.change('SEC company CIK', '424242'); ui.change('Companyfacts JSON', json());
    const paste = callback(ui.node('Import pasted JSON'), 'onClick'), native = callback(ui.node('Import JSON file'), 'onClick');
    const fetch = callback(ui.node('Fetch public SEC facts'), 'onClick'), toggle = callback(ui.node('Mark import as demo data'), 'onChange');
    ui.close(); const before = hooks.writes; paste(); native(); fetch(); toggle({ target: { checked: true }, currentTarget: { checked: true } });
    expect(hooks.writes).toBe(before); expect(ui.publish).not.toHaveBeenCalled(); expect(lv.importData).not.toHaveBeenCalled(); expect(lv.fetchSecCompanyFacts).not.toHaveBeenCalled();
  });
  it('a retained Cancel from a completed request cannot mutate idle state', async () => {
    const lv = bridge(), pending = deferred(); lv.importData.mockReturnValue(pending.promise);
    const ui = mount(); ui.click('Import JSON file'); const cancel = callback(ui.node('Cancel request'), 'onClick');
    pending.resolve(fileOK()); await flush(); const before = hooks.writes; cancel();
    expect(hooks.writes).toBe(before); expect(ui.publish).toHaveBeenCalledTimes(1);
  });
});

describe('FUND.SYNTHETIC.IMPORT.INVALID and reentrant publication', () => {
  it.each(['{bad', '{"facts":{},"cik":0,"entityName":"invalid"}'])('retains malformed input and prior selection, then accepts corrected retry: %s', input => {
    const ui = mount({ documents: [document()] }); ui.check(true); ui.change('Companyfacts JSON', input); ui.click('Import pasted JSON');
    expect(ui.publish).not.toHaveBeenCalled(); expect(ui.error()).not.toBe(''); expect(ui.node('Companyfacts JSON').props.value).toBe(input);
    expect(ui.node('Fundamentals document').props.value).toBe('existing'); expect(ui.node('Mark import as demo data').props.checked).toBe(true);
    ui.change('Companyfacts JSON', json()); ui.click('Import pasted JSON'); expectImported(ui, 'synthetic');
  });
  it.each(['false', 'throw'] as const)('publication %s retains draft/selection and allows a later retry', mode => {
    let reject = true; const ui = mount({ documents: [document()], onChange: () => { if (reject) { if (mode === 'throw') throw new Error('Independent host rejection'); return false; } return true; } });
    ui.check(true); ui.change('Companyfacts JSON', json()); ui.click('Import pasted JSON');
    expect(ui.error()).not.toBe(''); expect(ui.props.documents).toHaveLength(1); expect(ui.node('Fundamentals document').props.value).toBe('existing');
    expect(ui.node('Companyfacts JSON').props.value).toBe(json()); expect(ui.node('Mark import as demo data').props.checked).toBe(true); expect(ui.preferences).not.toHaveBeenCalled();
    reject = false; ui.click('Import pasted JSON'); expect(ui.publish).toHaveBeenCalledTimes(2); expect(ui.props.documents).toHaveLength(2); expect(ui.error()).toBe('');
  });
  it('retains the existing 20 MiB cap before parsing oversized pasted JSON', () => {
    const ui = mount(); ui.check(true); ui.change('Companyfacts JSON', 'x'.repeat(20 * 1024 * 1024 + 1));
    const parse = vi.spyOn(JSON, 'parse'); ui.click('Import pasted JSON');
    expect(parse).not.toHaveBeenCalled(); expect(ui.error()).toContain('20 MiB'); expect(ui.publish).not.toHaveBeenCalled();
  });
  it.each([
    ['cancel', 'accepted'], ['cancel', 'false'], ['cancel', 'throw'], ['close', 'accepted'], ['close', 'false'], ['close', 'throw'],
  ] as const)('native publication %s then %s has no retired follow-up writes or false rollback', async (action, result) => {
    const lv = bridge(), pending = deferred(); lv.importData.mockReturnValue(pending.promise);
    let ui!: UI, afterRetirement = -1;
    ui = mount({ onChange: () => { if (action === 'cancel') ui.click('Cancel request'); else ui.close(); afterRetirement = hooks.writes; if (result === 'throw') throw new Error('Retired host rejection'); return result === 'accepted'; } });
    ui.check(true); ui.change('Companyfacts JSON', 'prior draft'); ui.click('Import JSON file'); pending.resolve(fileOK()); await flush();
    expect(afterRetirement).toBeGreaterThanOrEqual(0); expect(hooks.writes).toBe(afterRetirement); expect(ui.publish).toHaveBeenCalledTimes(1);
    expect(ui.props.documents).toHaveLength(result === 'accepted' ? 1 : 0); expect(ui.preferences).not.toHaveBeenCalled();
    expect(ui.error()).toBe(''); expect(ui.node('Companyfacts JSON').props.value).toBe('prior draft');
  });
  it.each(['accepted', 'false', 'throw'] as const)('paste publication closes then returns %s without late writes', result => {
    let ui!: UI, afterRetirement = -1;
    ui = mount({ onChange: () => { ui.close(); afterRetirement = hooks.writes; if (result === 'throw') throw new Error('Retired host rejection'); return result === 'accepted'; } });
    ui.check(true); ui.change('Companyfacts JSON', json()); ui.click('Import pasted JSON');
    expect(hooks.writes).toBe(afterRetirement); expect(ui.publish).toHaveBeenCalledTimes(1); expect(ui.props.documents).toHaveLength(result === 'accepted' ? 1 : 0);
    expect(ui.node('Companyfacts JSON').props.value).toBe(json()); expect(ui.error()).toBe('');
  });
});

describe('FUND.SYNTHETIC.IMPORT.SEC', () => {
  it('checked local mode never relabels a valid public SEC response', async () => {
    const lv = bridge(), ui = mount(); ui.check(true); ui.change('SEC company CIK', '424242'); ui.click('Fetch public SEC facts'); await flush();
    expect(lv.fetchSecCompanyFacts).toHaveBeenCalledTimes(1); expect(lv.importData).not.toHaveBeenCalled();
    expect(ui.props.documents[0]).toMatchObject({ id: 'sec:0000424242', source: { kind: 'sec-public', sourceUrl: secUrl, sha256: 'a'.repeat(64) } });
    expect(ui.text()).toContain('SEC companyfacts values are independent of chart prices.'); expect(ui.preferences).not.toHaveBeenCalled();
    expect(ui.text()).toContain('Values are SEC as-reported standard tags for the exact period');
  });
  it('keeps the existing response CIK mismatch refusal', async () => {
    const lv = bridge(), response = secOK(); response.value.cik = '0000000001'; lv.fetchSecCompanyFacts.mockResolvedValue(response);
    const ui = mount(); ui.check(true); ui.change('SEC company CIK', '424242'); ui.click('Fetch public SEC facts'); await flush();
    expect(ui.publish).not.toHaveBeenCalled(); expect(ui.error()).toContain('did not match');
  });
  it('SEC cancellation invokes the request handle and retires a late success', async () => {
    const lv = bridge(), pending = deferred(); lv.fetchSecCompanyFacts.mockReturnValue(pending.promise);
    const ui = mount(); ui.check(true); ui.change('SEC company CIK', '424242'); ui.click('Fetch public SEC facts');
    const request = lv.fetchSecCompanyFacts.mock.calls[0][0] as { requestId: string };
    ui.click('Cancel request'); const before = hooks.writes; pending.resolve(secOK()); await flush();
    expect(lv.cancelSecRequest).toHaveBeenCalledWith({ requestId: request.requestId }); expect(hooks.writes).toBe(before); expect(ui.publish).not.toHaveBeenCalled();
  });
});

describe('FUND.SYNTHETIC.IMPORT.COPY and LINK', () => {
  it.each(['Income statement', 'Balance sheet', 'Cash flow', 'Statistics', 'Reported facts'])('restored synthetic data stays disclosed on %s with default import mode off', tab => {
    const ui = mount({ documents: [restoreFactsDocument(document())] }); ui.click(tab);
    expect(ui.node('Mark import as demo data').props.checked).toBe(false);
    expect(ui.text()).toContain('Demo data: invented company facts for offline testing. These are not issuer filings or actual company values.');
    expect(ui.text()).not.toContain('Values below are filing data');
    expect(ui.text()).not.toContain('Values are SEC as-reported standard tags');
    if (tab !== 'Reported facts') { expect(ui.text()).toContain('Values are invented demo facts for offline testing'); expect(ui.text()).toContain('Annual means a 300-400 day reported period'); }
  });
  it('unverified local data never claims actual filing values', () => {
    const ui = mount({ documents: [document('local-import')] });
    expect(ui.text()).toContain('User-supplied companyfacts; source and filing claims have not been verified. These values are independent of chart prices.');
    expect(ui.text()).not.toContain('Values below are filing data');
    expect(ui.text()).not.toContain('Values are SEC as-reported standard tags');
    expect(ui.text()).toContain('Values are user-supplied companyfacts whose source and filing claims have not been verified.');
    expect(ui.text()).toContain('Annual means a 300-400 day reported period');
  });
  it.each([true, false])('explicit same-kind synthetic=%s links once; import selection does not change link kind', synthetic => {
    const ui = mount({ documents: [document(synthetic ? 'synthetic' : 'local-import')], market: { exchange: synthetic ? 'SYNTHETIC' : 'TESTEX', symbol: 'LVDEMO', synthetic } });
    ui.check(!synthetic); expect(ui.preferences).not.toHaveBeenCalled(); ui.click('Use for LVDEMO');
    expect(ui.preferences).toHaveBeenCalledTimes(1); expect(ui.props.preferences!.links).toEqual([{ ...ui.props.market, documentId: 'existing' }]);
    ui.click('Unlink from LVDEMO'); expect(ui.props.preferences!.links).toEqual([]);
  });
  it.each([true, false])('direct invocation of a mismatched disabled link is refused for synthetic chart=%s', synthetic => {
    const ui = mount({ documents: [document(synthetic ? 'local-import' : 'synthetic')], market: { exchange: synthetic ? 'SYNTHETIC' : 'TESTEX', symbol: 'LVDEMO', synthetic } });
    const button = ui.node('Use for LVDEMO'); expect(button.props.disabled).toBe(true); callback(button, 'onClick')();
    expect(ui.preferences).not.toHaveBeenCalled(); expect(ui.props.preferences!.links).toEqual([]);
  });
  it.each(['opposite kind', 'removed', 'new selection', 'new market'] as const)('retained formerly valid link refuses a %s before preference publication', change => {
    const ui = mount({ documents: [document()] }), retained = callback(ui.node('Use for LVDEMO'), 'onClick');
    if (change === 'opposite kind') ui.props.documents = [document('local-import')];
    else if (change === 'removed') ui.props.documents = [];
    else if (change === 'new selection') { ui.props.documents = [document(), document('synthetic', 'second')]; ui.change('Fundamentals document', 'second'); }
    else ui.props.market = { exchange: 'SYNTHETIC', symbol: 'OTHER', synthetic: true };
    ui.render(); retained(); expect(ui.preferences).not.toHaveBeenCalled(); expect(ui.props.preferences!.links).toEqual([]);
  });
  it('retained link handler is inert after close without relying on passive cleanup', () => {
    const ui = mount({ documents: [document()] }), retained = callback(ui.node('Use for LVDEMO'), 'onClick');
    ui.close(); const before = hooks.writes; retained(); expect(ui.preferences).not.toHaveBeenCalled(); expect(hooks.writes).toBe(before);
  });
  it.each(['accepted', 'false', 'throw'] as const)('link publication closes then returns %s without retired local writes', result => {
    let ui!: UI, afterRetirement = -1;
    ui = mount({ documents: [document()], onPreferencesChange: () => { ui.close(); afterRetirement = hooks.writes; if (result === 'throw') throw new Error('Retired link rejection'); return result === 'accepted'; } });
    ui.click('Use for LVDEMO'); expect(ui.preferences).toHaveBeenCalledTimes(1); expect(hooks.writes).toBe(afterRetirement);
    expect(ui.props.preferences!.links).toHaveLength(result === 'accepted' ? 1 : 0); expect(ui.error()).toBe('');
  });
  it('accepted link publication may change selection without an older follow-up overwriting it', () => {
    let ui!: UI, afterSelection = -1;
    ui = mount({ documents: [document(), document('synthetic', 'second')], onPreferencesChange: () => { ui.change('Fundamentals document', 'second'); afterSelection = hooks.writes; return true; } });
    ui.click('Use for LVDEMO'); expect(hooks.writes).toBe(afterSelection); expect(ui.preferences).toHaveBeenCalledTimes(1);
    expect(ui.props.preferences!.links[0].documentId).toBe('existing'); expect(ui.node('Fundamentals document').props.value).toBe('second');
  });
  it.each(['accepted', 'false', 'throw'] as const)('removal closes during %s publication without late selection or link-prune writes', result => {
    let ui!: UI, afterRetirement = -1;
    const preferences = createFundamentalsPreferences(); preferences.links = [{ exchange: 'SYNTHETIC', symbol: 'LVDEMO', synthetic: true, documentId: 'existing' }];
    ui = mount({ documents: [document()], preferences, onChange: () => { ui.close(); afterRetirement = hooks.writes; if (result === 'throw') throw new Error('Retired removal rejection'); return result === 'accepted'; } });
    ui.click('Remove saved data'); expect(hooks.writes).toBe(afterRetirement); expect(ui.publish).toHaveBeenCalledTimes(1);
    expect(ui.props.documents).toHaveLength(result === 'accepted' ? 0 : 1); expect(ui.preferences).not.toHaveBeenCalled();
  });
});

describe('FUND.SYNTHETIC.IMPORT.EXPORT', () => {
  it.each(['synthetic', 'local-import', 'sec-public'] as const)('both CSV paths use the saved %s kind, not the import checkbox', async kind => {
    const lv = bridge(), ui = mount({ documents: [document(kind)] }); ui.check(kind !== 'synthetic');
    ui.click('Export statement CSV'); await flush(); ui.click('Reported facts'); ui.change('Reported fundamental field', 'us-gaap:Revenues'); ui.click('Export selected facts CSV'); await flush();
    expect(lv.exportData).toHaveBeenCalledTimes(2);
    for (const [request] of lv.exportData.mock.calls) {
      expect(request.text.split('\r\n')[0]).toContain('"source_kind"'); expect(request.text).toContain('"' + kind + '"');
      expect(request.suggestedName.startsWith('OpenCandle-SYNTHETIC')).toBe(kind === 'synthetic'); expect(request.format).toBe('csv');
    }
    expect(lv.exportData.mock.calls[1][0].text).toContain('"1000"');
  });
  it('synthetic fact export retains formula escaping and plain negative numbers', async () => {
    const lv = bridge(), raw = rawFacts('=SUM(1,2)'); raw.facts['us-gaap'].Revenues.units.USD[0].val = -1000;
    const saved = document(); saved.facts = normalizeCompanyFacts(raw); const ui = mount({ documents: [saved] });
    ui.click('Reported facts'); ui.change('Reported fundamental field', 'us-gaap:Revenues'); ui.click('Export selected facts CSV'); await flush();
    const csv = lv.exportData.mock.calls[0][0].text; expect(csv).toContain('"\'=SUM(1,2)"'); expect(csv).toContain('"-1000"'); expect(csv).not.toContain('"\'-1000"');
  });
});

describe('FUND.SYNTHETIC.IMPORT.EXAMPLE', () => {
  it('the shipped example is tiny, explicitly invented and has independent annual and ratio expectations', () => {
    const bytes = readFileSync(new URL('../../examples/companyfacts-LVDEMO-synthetic.json', import.meta.url)); expect(bytes.byteLength).toBeLessThanOrEqual(10000);
    const facts = normalizeCompanyFacts(JSON.parse(bytes.toString('utf8'))); expect(facts.cik).toBe('0000424242'); expect(facts.entityName).toBe('LV SYNTHETIC DEMO COMPANY');
    const income = buildStatement(facts, { statement: 'income', basis: 'FY', currency: 'USD', asOf: '2024-12-31', revisions: 'latest', columns: 4 });
    expect(income.columns).toEqual(['2023-12-31']);
    for (const [id, expected] of [['revenue', 1000], ['cost_of_revenue', 600], ['gross_profit', 400], ['net_income', 100]] as const) expect(income.rows.find(row => row.id === id)!.cells[0].value).toBe(expected);
    const statistics = buildStatement(facts, { statement: 'statistics', basis: 'FY', currency: 'USD', asOf: '2024-12-31', revisions: 'latest', columns: 4 });
    expect(statistics.rows.find(row => row.id === 'gross_margin')!.cells[0].value).toBe(40);
    expect(statistics.rows.find(row => row.id === 'net_margin')!.cells[0].value).toBe(10);
  });
  it.each([true, false])('the actual example enters through visible paste handlers with checked=%s and no filename inference', checked => {
    const sample = readFileSync(new URL('../../examples/companyfacts-LVDEMO-synthetic.json', import.meta.url), 'utf8'), ui = mount();
    ui.check(checked); ui.change('Companyfacts JSON', sample); ui.click('Import pasted JSON');
    expect(ui.publish).toHaveBeenCalledTimes(1); expect(ui.props.documents[0].source.kind).toBe(checked ? 'synthetic' : 'local-import');
    expect(ui.props.documents[0].facts.entityName).toBe('LV SYNTHETIC DEMO COMPANY'); expect(ui.preferences).not.toHaveBeenCalled();
  });
});
