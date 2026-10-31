import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';

// (known limits): the projection line of a working
// market order, the live quote of a relayed order ticket, the ticket's stale bid and ask, and editable per-bar state colors.
// The React hooks run on a small controlled store so the real component callbacks execute without a DOM.
// SYNTHETIC instruments and bars only, virtual money only, no key and no network.
const hooks = vi.hoisted(() => ({ cells: [] as unknown[], cursor: 0, effects: [] as Array<() => unknown> }));
vi.mock('react', async original => {
  const actual = await original<typeof import('react')>();
  const stub = {
    ...actual,startTransition:(fn:()=>void)=>fn() /* App commits range picks as transitions */,useDeferredValue:(value:any)=>value /* App defers the range-button inputs; the hook-cell mock has no React dispatcher */,
    useState: (initial: unknown) => { const index = hooks.cursor++; if (!(index in hooks.cells)) hooks.cells[index] = typeof initial === 'function' ? (initial as () => unknown)() : initial; return [hooks.cells[index], (value: unknown) => { hooks.cells[index] = typeof value === 'function' ? (value as (old: unknown) => unknown)(hooks.cells[index]) : value; }]; },
    useRef: (initial: unknown) => { const index = hooks.cursor++; if (!(index in hooks.cells)) hooks.cells[index] = { current: initial }; return hooks.cells[index]; },
    useEffect: (effect: () => unknown) => { hooks.cursor++; hooks.effects.push(effect); },
  };
  return { ...stub, default: stub };
});
const { createPaperAccount, submitPaperOrder } = await import('../../src/domain/paper');
const { feedPaperBars } = await import('../../src/domain/paper-bar-feed');
const { PaperChartLines, paperChartLines, paperMarketProjectionPrice, PAPER_MARKET_PROJECTION_TITLE } = await import('../../src/ui/PaperChartLines');
const { ticketBookText } = await import('../../src/ui/PaperOrderTicket');
const { relayedFeedSymbol, relayedFeedInput, relayedInstrumentFedElsewhere, relayedTicketQuote } = await import('../../src/ui/paper-relay-quote');
const { defaultChartSettingsDocument } = await import('../../src/chart/chart-settings-document');
const { findRow, factoryAppearance, factoryPriceScale } = await import('../../src/chart/chart-settings-bindings');
const { calculateIndicator } = await import('../../src/domain/indicators');
const { renderIndicatorPresentation } = await import('../../src/chart/indicator-presentation');
const { defaultIndicatorPresentation, validateIndicatorPresentation, pointPaletteColors } = await import('../../src/chart/indicator-settings');
const { indicatorColorOpacity } = await import('../../src/chart/indicator-opacity');
const { catalogDefinition } = await import('../../src/domain/indicator-catalog');
const { CHOP_ZONE_COLORS } = await import('../../src/domain/indicators-ext/r29-catalog');
type Props = Parameters<typeof PaperChartLines>[0];

const instrument = { id: 'SYNTHETIC:R30', symbol: 'R30', name: 'Synthetic chart lines', exchange: 'SYNTHETIC', currency: 'USD', assetClass: 'stock', tickSize: 0.01, lotSize: 1, timezone: 'UTC' } as const;
const fed = (account = createPaperAccount(), time = 60, price = 100) => feedPaperBars(account, { bars: [{ time, open: price, high: price, low: price, close: price, volume: 1 }], instrument, provenance: { fixture: false, session: 'regular' }, live: false }).account;
/** A market order placed 10 minutes after the last quote: the quote is stale, so the order keeps working. */
function withPendingMarket(side: 'buy' | 'sell' = 'buy') {
  const placed = submitPaperOrder(fed(), { instrument, side, type: 'market', quantity: 3 } as never, 660);
  expect(placed.ok).toBe(true);
  expect(placed.account.orders.find(order => order.id === placed.orderId)?.status).toBe('working');
  return { account: placed.account, orderId: placed.orderId! };
}
const projection = { left: 0, top: 0, width: 600, height: 300, priceToY: (price: number) => (110 - price) * 10, yToPrice: (y: number) => 110 - y / 10 };
type Node = { type: unknown; props: Record<string, unknown> & { children?: unknown } };
function find(node: unknown, test: (node: Node) => boolean): Node | null {
  if (!node || typeof node !== 'object') return null;
  if (Array.isArray(node)) { for (const child of node) { const hit = find(child, test); if (hit) return hit; } return null; }
  const element = node as Node; if (element.props && test(element)) return element;
  if (typeof element.type === 'function' && element.props) return find((element.type as (props: unknown) => unknown)(element.props), test);
  return element.props ? find(element.props.children, test) : null;
}
function mount(overrides: Partial<Props>) {
  const calls = { cancel: [] as string[], notice: [] as string[] };
  const props: Props = { account: withPendingMarket().account, instrument, visible: true, projection: () => projection, onModifyOrder: () => true, onCancelOrder: id => { calls.cancel.push(id); }, onClosePosition: () => {}, onNotice: message => { calls.notice.push(message); }, ...overrides };
  let current = props;
  const render = () => { hooks.cursor = 0; hooks.effects = []; PaperChartLines(current); for (const effect of hooks.effects.splice(0)) { try { effect(); } catch { /* absent DOM ports */ } } hooks.cursor = 0; hooks.effects = []; return PaperChartLines(current); };
  render();
  const update = (next: Partial<Props>) => { current = { ...current, ...next }; return render(); };
  return { calls, render, update };
}
const marketLine = (tree: unknown) => find(tree, node => typeof node.props.className === 'string' && (node.props.className as string).split(' ').includes('market'));
const cancelButton = (tree: unknown) => find(tree, node => node.type === 'button' && String(node.props['aria-label'] ?? '').startsWith('Cancel Buy market'));
beforeEach(() => { hooks.cells = []; hooks.cursor = 0; hooks.effects = []; });

describe('projection line of a working market order', () => {
  it('draws a working market order at the last price, else at the quote side it fills on, only when the setting is on', () => {
    const { account, orderId } = withPendingMarket();
    expect(paperChartLines(account, instrument).some(line => line.kind === 'market')).toBe(false);
    expect(paperChartLines(account, instrument, { projectMarketOrders: false, lastPrice: 101 }).some(line => line.kind === 'market')).toBe(false);
    const [line] = paperChartLines(account, instrument, { projectMarketOrders: true, lastPrice: 101.25 }).filter(row => row.kind === 'market');
    expect(line).toMatchObject({ id: `market:${orderId}`, kind: 'market', side: 'buy', price: 101.25, quantity: 3, orderId, label: 'Buy market 3 at 101.25 (last price)' });
    const quote = account.quotes[instrument.id];
    expect(paperMarketProjectionPrice({ side: 'buy', instrument }, account, null)).toBe(quote.ask);
    expect(paperMarketProjectionPrice({ side: 'sell', instrument }, account, Number.NaN)).toBe(quote.bid);
    expect(paperMarketProjectionPrice({ side: 'buy', instrument }, createPaperAccount(), null)).toBeNull();
  });
  it('renders a dotted, non-movable line with the projection title and cancels the order from the line (one-click on)', () => {
    const { account, orderId } = withPendingMarket();
    const ui = mount({ account, projectMarketOrders: true, lastPrice: 102, confirmActions: false });
    const tree = ui.render(), line = marketLine(tree)!;
    expect(line).not.toBeNull();
    expect(line.props['data-price']).toBe(102);
    const handle = find(line, node => node.type === 'span' && typeof node.props.title === 'string')!;
    expect(handle.props.title).toBe(PAPER_MARKET_PROJECTION_TITLE);
    expect(handle.props.role).toBeUndefined();
    (cancelButton(tree)!.props.onClick as () => void)();
    expect(ui.calls.cancel).toEqual([orderId]);
    expect(String(tree && JSON.stringify(find(tree, node => node.type === 'style')?.props.children))).toContain('.lv-paper-line.market{border-top-style:dotted}');
  });
  it('with one-click off, asks first and still cancels after the last price moved', () => {
    const { account, orderId } = withPendingMarket();
    const ui = mount({ account, projectMarketOrders: true, lastPrice: 102, confirmActions: true });
    (cancelButton(ui.render())!.props.onClick as () => void)();
    expect(ui.calls.cancel).toEqual([]);
    const tree = ui.update({ lastPrice: 102.5 });
    const box = find(tree, node => node.props.role === 'group' && node.props['aria-label'] === 'Confirm virtual order change')!;
    expect(JSON.stringify(box.props.children)).toContain('Cancel Buy market 3 at 102.50?');
    (find(box, node => node.type === 'button' && node.props.className === 'primary')!.props.onClick as () => void)();
    expect(ui.calls.cancel).toEqual([orderId]);
    expect(ui.calls.notice).toEqual([]);
  });
  it('is hidden with the setting off and once the order fills', () => {
    const { account } = withPendingMarket();
    expect(marketLine(mount({ account, lastPrice: 102 }).render())).toBeNull();
    const filled = fed(account, 720, 100);
    expect(filled.orders.every(order => order.status !== 'working')).toBe(true);
    expect(paperChartLines(filled, instrument, { projectMarketOrders: true, lastPrice: 100 }).some(line => line.kind === 'market')).toBe(false);
  });
  it('Chart settings > Trading > Project order for market orders is a live row, and App passes it with the last price', () => {
    const sources = { appearance: factoryAppearance(), document: defaultChartSettingsDocument(), documentConnected: true, priceScale: factoryPriceScale(), ratio: 0.5, style: 'candles', typeSettings: null, timezone: 'UTC', exchangeTimezone: null, scaleMode: { scale: 'linear', invert: false, auto: true } } as never;
    expect(findRow('trading', sources, 'trading.marketProjectOrderVisibility')!.availability).toEqual({ state: 'live' });
    const app = readFileSync(new URL('../../src/ui/App.tsx', import.meta.url), 'utf8');
    // The chart reads the live-previewed settings (shownSettings) while Chart settings is open; they equal the saved ones otherwise.
    expect(app).toContain('projectMarketOrders={shownSettings.trading.projectMarketOrders} lastPrice={last?.close??null}');
  });
});

describe('a relayed order ticket follows the live quote in the main window', () => {
  const gme = { id: 'US:GME', symbol: 'GME', name: 'GME (Alpaca, US equity)', exchange: 'US', currency: 'USD', assetClass: 'stock', tickSize: 0.01, lotSize: 1, timezone: 'America/New_York' } as const;
  const T = Date.UTC(2026, 9, 21, 15, 0, 0) / 1000;
  const snapshot = { instrumentId: 'US:GME', bid: 20, ask: 20.02, eventTime: T, receivedAt: T, availableAt: T, sequence: 1, session: 'regular', fixture: true } as never;
  const series = (time: number, price: number) => ({ instrument: gme, bars: [{ time, open: price, high: price, low: price, close: price, volume: 10 }], provenance: { fixture: true, session: 'regular', providerId: 'alpaca-stub', datasetId: 'live:alpaca-stub:GME:1m' } }) as never;
  it('opens a series only for Alpaca US equities that no other feed keeps', () => {
    expect(relayedFeedSymbol(gme)).toBe('GME');
    expect(relayedFeedSymbol({ id: 'GME.WS', symbol: 'GME.WS' })).toBeNull();
    expect(relayedFeedSymbol({ id: 'coinbase:BTC-USD', symbol: 'BTC-USD' })).toBeNull();
    const account = createPaperAccount();
    expect(relayedInstrumentFedElsewhere(account, 'US:SPY', 'US:GME')).toBe(false);
    expect(relayedInstrumentFedElsewhere(account, 'US:GME', 'US:GME')).toBe(true);
    const working = submitPaperOrder(account, { instrument: gme, side: 'buy', type: 'limit', limitPrice: 10, quantity: 1 } as never, T);
    expect(working.ok).toBe(true);
    expect(relayedInstrumentFedElsewhere(working.account, 'US:SPY', 'US:GME')).toBe(true);
    expect(relayedFeedInput(working.account, 'US:SPY', gme, series(T, 20))).toBeNull();
    expect(relayedFeedInput(account, 'US:SPY', gme, null)).toBeNull();
    expect(relayedFeedInput(account, 'US:SPY', gme, series(T, 20))).toMatchObject({ instrument: gme, live: true, resolution: '1m' });
  });
  it('prices on the snapshot only until the main window holds a quote at least as new, which then passes the quote-age rule', () => {
    const seed = { instrument: gme, quote: snapshot, now: T };
    const account = createPaperAccount();
    expect(relayedTicketQuote(account, seed)).toBe(snapshot);
    const input = relayedFeedInput(account, 'US:SPY', gme, series(T + 600, 21))!;
    const step = feedPaperBars(account, input);
    expect(step.ok).toBe(true);
    const live = relayedTicketQuote(step.account, seed)!;
    expect(live).toBe(step.account.quotes['US:GME']);
    expect(live.bid).toBeLessThan(21); expect(live.ask).toBeGreaterThan(21); // the feed's synthetic spread around the 21 close
    // The snapshot is 10 minutes older than the account clock; the live quote is within the 60 s quote age.
    expect(step.account.clock - (snapshot as { availableAt: number }).availableAt).toBeGreaterThan(step.account.settings.maxQuoteAgeSeconds);
    expect(step.account.clock - live.availableAt).toBeLessThanOrEqual(step.account.settings.maxQuoteAgeSeconds);
    const placed = submitPaperOrder(step.account, { instrument: gme, side: 'buy', type: 'market', quantity: 1 } as never, step.account.clock);
    expect(placed.ok).toBe(true);
    expect(placed.account.orders.find(order => order.id === placed.orderId)?.status).toBe('filled');
    // A held quote older than the snapshot does not replace it.
    expect(relayedTicketQuote(step.account, { instrument: gme, quote: { ...(snapshot as object), availableAt: T + 9999, eventTime: T + 9999 } as never, now: T })).not.toBe(live);
  });
  it('App opens the relayed series, feeds the paper account, and gives the ticket that quote and the live bid and ask', () => {
    const app = readFileSync(new URL('../../src/ui/App.tsx', import.meta.url), 'utf8');
    // merge with: the live bid and ask reach the ticket through LiveBookBinding (store), not a book= prop.
    // LiveBookBinding is keyed on the cursor seed (tab|price) so a new seed remounts the ticket.
    expect(app).toContain('<LiveBookBinding key={(orderSeed.tab??\'\')+\'|\'+(orderSeed.price??\'\')} instrumentId={orderSeed.relay?relayQuoteInstrument:chartQuoteInstrument} mode="ticket">{reuse(\'dialog:order-ticket\',<PaperOrderTicket ');
    expect(app).toContain('quote={orderSeed.relay?relayedTicketQuote(activeAccount,orderSeed.relay):virtualActionQuote} quoteSource=');
    expect(app).toContain('const relayQuoteInstrument=relaySymbol?relaySeed!.instrument.id:null;');
    expect(app).toContain('useEffect(()=>relayQuoteInstrument?liveQuotes.subscribe(relayQuoteInstrument,()=>{}):undefined,[relayQuoteInstrument]);');
    expect(app).not.toContain('useLiveQuote(');
    expect(app).toContain('handle=provider.open(relayOwnFeed,PAPER_FINE_RESOLUTION)');
    expect(app).toMatch(/relayedFeedInput\(account,dataset\.instrument\.id,relaySeed\.instrument,relaySeries\);if\(!input\)return;\r?\n?\s*const step=feedPaperBars\(account,input\);if\(step\.account!==account&&acceptPaper\(step\.account,account\)/);
    expect(app).not.toContain('book={orderSeed.relay?null:chartLiveQuote}');
    expect(app).not.toContain('instrumentId={orderSeed.relay?null:chartQuoteInstrument}');
  });
});

describe('the ticket hides a stale live bid and ask', () => {
  it('shows the live line for a fresh quote and nothing once it is older than 5 minutes', () => {
    const now = Date.UTC(2026, 9, 21, 15, 0, 0);
    const book = { instrumentId: 'US:GME', symbol: 'GME', providerId: 'alpaca-stub', feed: 'iex', synthetic: true, bid: 20.01, ask: 20.03, bidSize: 3, askSize: 5, time: now / 1000, receivedAt: now } as never;
    expect(ticketBookText(book, 2, now + 60_000)?.text).toBe('Live bid 20.01 x 3, ask 20.03 x 5');
    expect(ticketBookText(book, 2, now + 5 * 60_000)).not.toBeNull();
    expect(ticketBookText(book, 2, now + 5 * 60_000 + 1)).toBeNull();
    expect(ticketBookText(book, 2, now + 60 * 60_000)).toBeNull();
  });
});

describe('per-bar state colors are editable (Woodies CCI, Chop zone)', () => {
  const D0 = 19700 * 86400;
  const bars = [10, 11, 11, 10.9].map((close, i) => ({ time: D0 + i * 86400, open: close, high: close + 1, low: close - 1, close, volume: 100 }));
  it('every palette kind names each state for the Style tab', () => {
    for (const kind of ['woodiescci', 'chopzone']) { const palette = catalogDefinition(kind)!.pointPalette!; expect(palette.labels, kind).toHaveLength(palette.colors.length); }
    expect(catalogDefinition('woodiescci')!.pointPalette!.labels).toEqual(['Uptrend', 'Downtrend']);
  });
  it('saves one supported color per state and refuses other shapes', () => {
    const base = defaultIndicatorPresentation('chopzone'), colors = [...CHOP_ZONE_COLORS];
    colors[4] = '#123456';
    expect(() => validateIndicatorPresentation('chopzone', { ...base, pointPalette: colors })).not.toThrow();
    expect(() => validateIndicatorPresentation('chopzone', { ...base, pointPalette: colors.slice(1) })).toThrow(/one supported color for each of the 9 states/);
    expect(() => validateIndicatorPresentation('chopzone', { ...base, pointPalette: [...colors.slice(1), 'not a color'] })).toThrow(/9 states/);
    expect(() => validateIndicatorPresentation('rsi', { ...defaultIndicatorPresentation('rsi'), pointPalette: ['#123456'] })).toThrow(/state palette/);
    expect(pointPaletteColors('chopzone', base)).toEqual(CHOP_ZONE_COLORS);
    expect(pointPaletteColors('chopzone', { ...base, pointPalette: colors })).toEqual(colors);
  });
  it('the chart draws the edited colors at the plot opacity', () => {
    const inputs = { emaLength: 1, rangeLength: 2 }, result = calculateIndicator('chopzone', bars, inputs), colors = [...CHOP_ZONE_COLORS];
    colors[0] = '#010203'; colors[8] = '#a0b0c0';
    const shown = renderIndicatorPresentation({ id: 'c1', kind: 'chopzone', inputs, plots: {}, offset: 0, visible: true, presentation: { ...defaultIndicatorPresentation('chopzone'), pointPalette: colors } }, result, bars, { resolution: '1D' });
    const zone = shown.output.series![0] as { points: Array<{ color?: string }> };
    expect(zone.points.slice(1).map(point => point.color)).toEqual([indicatorColorOpacity('#010203', 100), indicatorColorOpacity(CHOP_ZONE_COLORS[4], 100), indicatorColorOpacity('#a0b0c0', 100)]);
  });
  it('the Style tab shows one color row per state and a way back to the default colors', () => {
    const dialog = readFileSync(new URL('../../src/ui/IndicatorDialog.tsx', import.meta.url), 'utf8');
    expect(dialog).toContain('<legend>Bar colors</legend>');
    expect(dialog).toContain("label={'Bar color: '+name}");
    expect(dialog).toContain('pointPalette:colors.map((value,at)=>at===index?color:value)');
    expect(dialog).toContain('Use the default bar colors');
  });
});
