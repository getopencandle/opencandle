import React, { useMemo, useRef, useState } from 'react';
import type { PaperAccount, PaperSide } from '../domain/paper';
import { BROKER_DURATIONS, blankBrokerDraft, brokerTicketInfo, type BrokerTicketInfoPosition, brokerTabWord, placeBrokerTicket, reviewBrokerTicket, type BrokerDuration, type BrokerExitMode, type BrokerTab, type BrokerTicketDraft, type BrokerTrailMode } from '../domain/paper-broker-ticket';
import type { PaperQuoteSource } from '../domain/paper-ticket';
import type { Instrument, Quote } from '../domain/types';
import { liveQuoteFresh, liveQuoteSourceLabel, type LiveQuote } from '../domain/live-quotes';
import './paper-order-ticket.css';
import { openPaperDomPane, PAPER_DOM_PANE_NO_HOST } from './paper-dom-pane';
import { chartDateTimeInputValue, chartZoneName, formatChartDateTime, parseChartDateTimeInput, type ChartClockHours } from './chart-time-text';

/**
 * Broker-style order ticket for the modal that Buy, Sell, Shift+B and Shift+S open when no preset decides the order. Market, Limit,
 * Stop, Stop limit and Trailing tabs, a Buy/Sell toggle that shows each side's quote, quantity (or money at risk), optional take profit and
 * stop loss (price, ticks, percent or money) with Take profit outside regular hours, Day, GTC or GTD time in force, and a plain
 * review of cost and risk. It places virtual orders only; the full account panel stays on the Paper trading rail item.
 */
export interface PaperOrderTicketProps {
  account: PaperAccount;
  instrument: Instrument;
  quote: Quote | null;
  quoteSource: PaperQuoteSource | null;
  now: number;
  side: PaperSide;
  /** Units typed in the chart's quantity box, if any. */
  quantity?: string;
  /** Entry price the ticket opens with (for example a clicked chart price) and which tab it belongs to. */
  price?: string;
  tab?: BrokerTab;
  /** The Extended hours box starts ticked (limit tab only). The host decides: ETH chart outside regular hours. */
  extendedHoursDefault?: boolean;
  /** Replaces the account. Returns false when the host refuses it. */
  onAccountChange: (next: PaperAccount, expected: PaperAccount) => boolean | void;
  /** Called after an order was placed, with the sentence to show. */
  onDone: (message: string) => void;
  /** The live best bid and ask of the instrument (display only; virtual orders fill at the virtual feed price). */
  book?: LiveQuote | null;
  /** The chart timezone (chartTimeZone) and hour cycle for the GTD picker and the quote time. */
  timezone?: string;
  timeHours?: ChartClockHours;
}
/** "Live bid 20.01 x 300, ask 20.03 x 100" with its source, or null without a live quote.
 * A quote older than LIVE_QUOTE_STALE_MS (5 minutes after it arrived) is not shown, the same rule as the
 * watchlist, the DOM and the price scale. */
export function ticketBookText(book: LiveQuote | null | undefined, digits: number, nowMs: number = Date.now(), zone = 'UTC', hours: ChartClockHours = '24'): { text: string; title: string } | null {
  if (!liveQuoteFresh(book, nowMs) || book.bid === null && book.ask === null) return null;
  const side = (word: string, price: number | null, size: number | null) => price === null ? `${word} none` : `${word} ${price.toFixed(digits)}${size !== null ? ` x ${size}` : ''}`;
  // The shared formatter returns String(seconds) for a non-finite time, so that case is worded here.
  const time = Number.isFinite(book.time) ? formatChartDateTime(book.time, zone, { hours, seconds: true }) : 'unknown';
  return { text: `Live ${side('bid', book.bid, book.bidSize)}, ${side('ask', book.ask, book.askSize)}`, title: `${liveQuoteSourceLabel(book)}. Quote time ${time}. Virtual orders fill at the virtual feed price, not at this quote.` };
}

const money = (value: number) => value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const TABS: Array<{ id: BrokerTab; label: string }> = [{ id: 'market', label: 'Market' }, { id: 'limit', label: 'Limit' }, { id: 'stop', label: 'Stop' }, { id: 'stop-limit', label: 'Stop limit' }, { id: 'trailing-stop', label: 'Trailing' }];
const EXIT_MODES: Array<{ id: BrokerExitMode; label: (currency: string) => string; word: string }> = [
  { id: 'price', label: () => 'Price', word: 'price' }, { id: 'ticks', label: () => 'Ticks', word: 'ticks' }, { id: 'percent', label: () => '%', word: 'percent' }, { id: 'money', label: currency => `Money (${currency})`, word: 'money' },
];
const exitWord = (mode: BrokerExitMode | undefined) => EXIT_MODES.find(row => row.id === (mode ?? 'price'))!.word;
/** The price a Limit, Stop or Stop limit tab opens with, from the current quote.
 * A limit starts on its own side of the spread (buy at the bid, sell at the ask), so it rests instead of filling at once; a stop
 * starts at the price it would trigger from (buy at the ask, sell at the bid). Market and Trailing have no price. */
export function ticketPrefillPrice(tab: BrokerTab, side: PaperSide, quote: Pick<Quote, 'bid' | 'ask'> | null, digits: number): string {
  if (!quote || tab === 'market' || tab === 'trailing-stop') return '';
  const value = tab === 'limit' ? (side === 'buy' ? quote.bid : quote.ask) : (side === 'buy' ? quote.ask : quote.bid);
  return Number.isFinite(value) && value > 0 ? value.toFixed(digits) : '';
}

export function PaperOrderTicket(props: PaperOrderTicketProps) {
  const { account, instrument, quote } = props, zone = props.timezone ?? 'UTC', hours = props.timeHours ?? '24';
  const digits = (String(instrument.tickSize).split('.')[1] ?? '').length;
  // `prefilled` is true while the price fields still hold the ticketPrefillPrice values (a side or tab change then refreshes them).
  const [prefilled, setPrefilled] = useState(() => !props.price);
  const [draft, setDraft] = useState<BrokerTicketDraft>(() => {
    const tab = props.tab ?? 'market', auto = ticketPrefillPrice(tab, props.side, quote, digits);
    return { ...blankBrokerDraft(props.side), ...(props.quantity ? { quantity: props.quantity } : {}), ...(props.tab ? { tab: props.tab } : {}), price: props.price ? props.price : auto, ...(tab === 'stop-limit' ? { limitPrice: ticketPrefillPrice('limit', props.side, quote, digits) } : {}), extendedHours: props.extendedHoursDefault === true };
  });
  /** Tab or side changes: fill empty or still-prefilled price fields from the quote. */
  const refill = (tab: BrokerTab, side: PaperSide): Partial<BrokerTicketDraft> => {
    const keep = !prefilled && draft.price.trim() !== '' && tab !== 'market' && tab !== 'trailing-stop';
    return { price: keep ? draft.price : ticketPrefillPrice(tab, side, quote, digits), ...(tab === 'stop-limit' && (prefilled || !(draft.limitPrice ?? '').trim()) ? { limitPrice: ticketPrefillPrice('limit', side, quote, digits) } : {}) };
  };
  const [message, setMessage] = useState('');
  // A marketable limit (buy at or above the ask, sell at or below the bid) stays a limit, as at a real broker, and
  // asks first because it fills at once (the DOM's marketable-limit rule). It is never turned into a stop.
  const [confirming, setConfirming] = useState(false);
  const commandId = useRef<string | null>(null);
  const change = (changes: Partial<BrokerTicketDraft>) => { commandId.current = null; setMessage(''); setConfirming(false); setDraft(current => ({ ...current, ...changes })); };
  const context = { account, instrument, quote, quoteSource: props.quoteSource, now: props.now };
  // The GTD picker is chart wall-clock time; the zone is part of the memo so a timezone change reads it again.
  const readExpiry = (value: string) => parseChartDateTimeInput(value, zone);
  const review = useMemo(() => quote ? reviewBrokerTicket(draft, context, readExpiry) : { ok: false as const, message: 'No quote is available, so this ticket cannot be priced.' }, [draft, account, instrument, quote, props.quoteSource, props.now, zone]);
  const sideWord = draft.side === 'buy' ? 'Buy' : 'Sell', units = review.ok ? review.quantity : draft.sizing === 'units' ? draft.quantity || '0' : '?';
  const limitValue = draft.tab === 'limit' ? Number(draft.price) : NaN;
  const marketable = !!quote && draft.tab === 'limit' && draft.price.trim() !== '' && Number.isFinite(limitValue) && (draft.side === 'buy' ? limitValue >= quote.ask : limitValue <= quote.bid);
  const submit = () => {
    if (!review.ok) { setMessage(review.message); return; }
    if (marketable && !confirming) { setConfirming(true); return; }
    setConfirming(false);
    commandId.current ??= `ticket-${globalThis.crypto.randomUUID()}`;
    const placed = placeBrokerTicket(draft, context, commandId.current, readExpiry);
    if (!placed.ok) { setMessage(placed.message); return; }
    if (props.onAccountChange(placed.account, account) === false) { setMessage('The virtual account changed before the order was placed. Review the ticket and try again.'); return; }
    props.onDone(placed.message);
  };
  const price = (value: number | undefined) => value === undefined ? '' : value.toFixed(digits);
  const book = ticketBookText(props.book, digits, Date.now(), zone, hours);
  // Estimates at the shown quote (see brokerTicketInfo for the formulas).
  const info = review.ok ? brokerTicketInfo(review, draft.side, context) : null, held = account.positions[instrument.id];
  const heldInfo: BrokerTicketInfoPosition | null = held ? { side: held.quantity > 0 ? 'Long' : 'Short', quantity: Math.abs(held.quantity), average: held.averagePrice } : null;
  const positionText = (row: BrokerTicketInfoPosition) => row.side === 'Flat' ? 'Flat' : `${row.side} ${row.quantity} at ${price(row.average ?? undefined)}`;
  const trailing = draft.tab === 'trailing-stop', hasTakeProfit = draft.takeProfit.trim() !== '';
  const chooseDuration = (duration: BrokerDuration) => change({ duration, ...(duration === 'gtd' && !draft.expiresAt ? { expiresAt: chartDateTimeInputValue(props.now + 86400, zone) } : {}) });
  const exitRow = (leg: 'takeProfit' | 'stopLoss', name: string) => {
    const modeKey = leg === 'takeProfit' ? 'takeProfitMode' : 'stopLossMode', mode = draft[modeKey] ?? 'price';
    return <label>{name}<span style={{ display: 'flex', gap: 4 }}><select aria-label={`${name} as`} value={mode} onChange={event => change({ [modeKey]: event.target.value as BrokerExitMode })}>{EXIT_MODES.map(row => <option key={row.id} value={row.id}>{row.label(instrument.currency)}</option>)}</select><input inputMode="decimal" aria-label={`${name} ${exitWord(mode)}`} value={draft[leg]} placeholder="Optional" onChange={event => change({ [leg]: event.target.value })} /></span></label>;
  };
  const priceInput = (label: string, key: 'price' | 'limitPrice') => <label>{label}<input inputMode="decimal" aria-label={label} value={draft[key] ?? ''} placeholder={price(draft.side === 'buy' ? quote?.ask : quote?.bid)} onChange={event => { setPrefilled(false); change({ [key]: event.target.value }); }} /></label>;
  return (
    <form className="lv-order-ticket" aria-label={`Order ticket for ${instrument.symbol}`} onSubmit={event => { event.preventDefault(); submit(); }}>
      <div className="toggle" role="group" aria-label="Side">
        <button type="button" className="sell" aria-pressed={draft.side === 'sell'} onClick={() => change({ side: 'sell', ...refill(draft.tab, 'sell') })}>{`Sell ${price(quote?.bid)}`.trim()}</button>
        <button type="button" className="buy" aria-pressed={draft.side === 'buy'} onClick={() => change({ side: 'buy', ...refill(draft.tab, 'buy') })}>{`Buy ${price(quote?.ask)}`.trim()}</button>
      </div>
      {book && <p className="lv-ticket-book" role="note" title={book.title}>{book.text}</p>}
      {/* The order ladder for this symbol in its own pane. */}
      <button type="button" className="lv-ticket-dom" title="Open the order ladder (DOM) in its own floating pane" onClick={() => { if (!openPaperDomPane('ticket')) setMessage(PAPER_DOM_PANE_NO_HOST); }}>Open DOM pane</button>
      <div className="tabs" role="tablist" aria-label="Order type">
        {TABS.map(tab => <button key={tab.id} type="button" role="tab" aria-selected={draft.tab === tab.id} onClick={() => { const next = refill(tab.id, draft.side), kept = !prefilled && next.price === draft.price; setPrefilled(!kept && next.price !== ''); change({ tab: tab.id, ...next, ...(tab.id === 'trailing-stop' ? { sizing: 'units' as const } : {}) }); }}>{tab.label}</button>)}
      </div>
      {draft.tab === 'limit' && priceInput('Limit price', 'price')}
      {(draft.tab === 'stop' || draft.tab === 'stop-limit') && priceInput('Stop price', 'price')}
      {draft.tab === 'stop-limit' && priceInput('Limit price', 'limitPrice')}
      {trailing && <label>Trail by<select aria-label="Trail by" value={draft.trailMode ?? 'price'} onChange={event => change({ trailMode: event.target.value as BrokerTrailMode })}><option value="price">{`Price distance (${instrument.currency})`}</option><option value="percent">Percent of best price</option></select></label>}
      {trailing && <label>Trail amount<input inputMode="decimal" aria-label="Trail amount" value={draft.trailAmount ?? ''} placeholder={draft.trailMode === 'percent' ? 'For example 1.5' : instrument.tickSize.toFixed(digits)} onChange={event => change({ trailAmount: event.target.value })} /></label>}
      {trailing && <p className="lv-ticket-book" role="note">The stop follows the best price and sends a market order when reached. Good till cancelled.</p>}
      {draft.tab === 'limit' && <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" aria-label="Extended hours" checked={draft.extendedHours === true} onChange={event => change({ extendedHours: event.target.checked })} />Extended hours (may also fill 04:00-09:30 and 16:00-20:00 New York time)</label>}
      {draft.sizing === 'units' || trailing
        ? <label>Quantity<input inputMode="decimal" aria-label="Order quantity" value={draft.quantity} onChange={event => change({ quantity: event.target.value })} /></label>
        : <label>Money to risk<input inputMode="decimal" aria-label="Money to risk" value={draft.riskMoney} onChange={event => change({ riskMoney: event.target.value })} /></label>}
      {!trailing && <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" aria-label="Size by money at risk" checked={draft.sizing === 'risk'} onChange={event => change({ sizing: event.target.checked ? 'risk' : 'units' })} />Size by money at risk (needs a stop loss)</label>}
      {!trailing && <><label>Duration<select aria-label="Duration" value={draft.duration ?? 'day'} onChange={event => chooseDuration(event.target.value as BrokerDuration)}>{BROKER_DURATIONS.map(row => <option key={row.id} value={row.id} disabled={row.unavailable !== undefined}>{row.label}</option>)}</select></label>
      {draft.duration === 'gtd' && <label>{`Good till (${chartZoneName(zone)})`}<input type="datetime-local" aria-label="Expiry date and time" value={draft.expiresAt ?? ''} onChange={event => change({ expiresAt: event.target.value })} /></label>}
      <div className="row">
        {exitRow('takeProfit', 'Take profit')}
        {exitRow('stopLoss', 'Stop loss')}
      </div>
      {/* The version-2 session rule (paper-bracket-runtime): only the take-profit child may fill outside 09:30-16:00; the stop loss stays regular hours. */}
      <label style={{ display: 'flex', gap: 6, alignItems: 'center' }} title={hasTakeProfit ? 'The take profit may also fill 04:00-09:30 and 16:00-20:00 New York time. The stop loss stays regular hours.' : 'Enter a take profit first.'}><input type="checkbox" aria-label="Take profit outside regular hours" disabled={!hasTakeProfit} checked={hasTakeProfit && draft.takeProfitOutsideRth === true} onChange={event => change({ takeProfitOutsideRth: event.target.checked })} />{hasTakeProfit ? 'Take profit outside regular hours' : 'Take profit outside regular hours (needs a take profit)'}</label></>}
      <div className="review" role="status" aria-live="polite">
        {review.ok
          ? <>{`Estimated cost ${money(review.notional)} ${instrument.currency} at ${price(review.entry)}.`}{review.takeProfitPrice !== null && <>{` Take profit at ${price(review.takeProfitPrice)}.`}</>}{review.stopLossPrice !== null && <>{` Stop loss at ${price(review.stopLossPrice)}.`}</>}{review.risk !== null && <>{` Risk ${money(review.risk)}.`}</>}{review.reward !== null && <>{` Reward ${money(review.reward)}.`}</>}{review.ratio !== null && <>{` Reward to risk ${review.ratio}.`}</>}{review.expiresAt !== null && <>{` Expires ${formatChartDateTime(review.expiresAt, zone, { hours })}.`}</>}{draft.duration === 'gtc' && <>{' Good till cancelled: no expiry.'}</>}</>
          : review.message}
        {message && <div role="alert">{message}</div>}
      </div>
      {info && <dl className="lv-ticket-info" aria-label="Order info">
        <dt>Trade value</dt><dd>{`${money(info.tradeValue)} ${info.currency}`}</dd>
        <dt>Leverage</dt><dd>{`${info.leverage}x`}</dd>
        <dt>Margin</dt><dd title="The part of the order that adds exposure, times the entry price, divided by leverage.">{`${money(info.margin)} ${info.currency}`}</dd>
        <dt>Commission</dt><dd title="Estimated with the account commission model for this one fill.">{`${money(info.commission)} ${info.currency}`}</dd>
        <dt>Tick value</dt><dd title={`One tick (${instrument.tickSize}) of price movement on the whole order.`}>{`${info.tickValue.toLocaleString('en-US', { maximumFractionDigits: 8 })} ${instrument.currency}`}</dd>
      </dl>}
      {(info || held) && <dl className="lv-ticket-info" aria-label="Position info">
        <dt>Position now</dt><dd>{positionText(info ? info.current : heldInfo!)}</dd>
        {info && <><dt>After fill</dt><dd>{positionText(info.after)}</dd></>}
      </dl>}
      <div className="lv-ticket-foot">
      {confirming && marketable && quote && <div className="lv-ticket-confirm" role="alert">{`This ${sideWord.toLowerCase()} limit at ${draft.price.trim()} is ${draft.side === 'buy' ? `at or above the ask ${price(quote.ask)}` : `at or below the bid ${price(quote.bid)}`}, so it fills now at the current quote. Place it anyway?`}<button type="button" onClick={() => setConfirming(false)}>Cancel</button></div>}
      <button type="submit" className={`go ${draft.side}`} disabled={!review.ok}>{`${confirming && marketable ? 'Confirm: ' : ''}${sideWord} ${units} ${brokerTabWord(draft.tab)}`}</button>
    
      </div>
    </form>
  );
}
