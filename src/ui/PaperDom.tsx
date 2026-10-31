import React, { useEffect, useState } from 'react';
import { cancelPaperOrder, processPaperQuote, type PaperAccount, type PaperResult, type PaperSide } from '../domain/paper';
import { cancelPaperDom, flattenPaperDom, paperDomCapability, paperDomCellIntent, paperDomCenter, paperDomContextEntries, paperDomLadder, paperDomMarketIntent, paperDomMoveIntent, paperDomPnl, paperDomScrolled, movePaperDomOrder, paperDomPriceText, paperDomQuantity, reversePaperDom, submitPaperDomIntent, type PaperDomIntent, type PaperDomPnlMode } from '../domain/paper-dom';
import type { Instrument, Quote } from '../domain/types';

/**
 * DOM order ladder for the paper trading panel. Left side buys, right side sells; a plain click places a
 * limit at that row, Ctrl (or Cmd) and click places a stop, and right-click opens the entry menu for that price. With one-click
 * trading off, every action asks first. LV layout and wording; see src/domain/paper-dom.ts for the rules.
 */
export interface PaperDomProps {
  account: PaperAccount;
  instrument: Instrument;
  /** The host's newest quote for the instrument, when it has one newer than the account's. */
  quote?: Quote | null;
  /** Display-only live best bid and ask (with sizes). The ladder marks those rows; orders still execute on `quote`. */
  book?: Quote | null;
  /** Plain source of `book` (for example "IEX quote (one exchange; ...)"). */
  bookSource?: string | null;
  now: number;
  onAccountChange: (next: PaperAccount, expected: PaperAccount) => boolean | void;
  rows?: number;
  /** Centre the ladder on this price once per token (the DOM pane opened from the chart menu at the clicked price). */
  centerRequest?: { price: number; token: number } | null;
}
interface Pending { label: string; run: () => void; }

/** The newer of the account's retained quote and the host quote for this instrument. */
export function paperDomQuote(account: PaperAccount, instrument: Instrument, quote: Quote | null | undefined): Quote | null {
  const retained = account.quotes[instrument.id] ?? null;
  if (!quote || quote.instrumentId !== instrument.id) return retained;
  return !retained || quote.sequence > retained.sequence ? quote : retained;
}

export function PaperDom(props: PaperDomProps) {
  const { account, instrument, now } = props;
  const quote = paperDomQuote(account, instrument, props.quote);
  const identity = `${account.id}|${account.runId}|${instrument.id}`;
  const requested = props.centerRequest && Number.isFinite(props.centerRequest.price) && props.centerRequest.price > 0 ? props.centerRequest : null;
  const [center, setCenterState] = useState<{ identity: string; price: number; token?: number } | null>(null);
  /** Every centre the ladder takes records the request it already honoured, so a later request (new token) moves it once. */
  const setCenter = (next: { identity: string; price: number }) => setCenterState({ ...next, token: requested?.token });
  const [quantityText, setQuantityText] = useState(String(instrument.lotSize >= 1 ? instrument.lotSize : 1));
  const [pnlMode, setPnlMode] = useState<PaperDomPnlMode>('money');
  const [pending, setPending] = useState<Pending | null>(null);
  const [menu, setMenu] = useState<number | null>(null);
  const [message, setMessage] = useState('');
  /** The side and ids of the orders being dragged to another row (drag modify). */
  const [drag, setDrag] = useState<{ side: PaperSide; ids: string[]; from: number } | null>(null);
  const automatic = paperDomCenter(account, instrument, quote);
  // The centre is taken once per account/instrument and then stays put until Recenter.
  const pendingRequest = requested && center?.token !== requested.token ? paperDomScrolled(requested.price, 0, instrument) : null;
  useEffect(() => { if (pendingRequest !== null) setCenter({ identity, price: pendingRequest }); else if (automatic !== null && center?.identity !== identity) setCenter({ identity, price: automatic }); }, [identity, automatic === null, requested?.token]);
  const centerPrice = pendingRequest ?? (center?.identity === identity ? center.price : automatic);
  const shown = props.book && props.book.instrumentId === instrument.id ? props.book : quote;
  const capability = paperDomCapability(shown);
  const quantity = paperDomQuantity(quantityText, instrument);
  const pnl = paperDomPnl(quote && account.quotes[instrument.id] !== quote ? { ...account, quotes: { ...account.quotes, [instrument.id]: quote } } : account, instrument, pnlMode);
  const position = account.positions[instrument.id];

  /** Brings the account up to the host quote first, so a click executes against the price on screen. */
  const current = (): PaperAccount => {
    if (!props.quote || props.quote !== quote || account.quotes[instrument.id]?.sequence === quote.sequence) return account;
    const result = processPaperQuote(account, quote, actionTime, account.runId, instrument);
    return result.ok ? result.account : account;
  };
  const commit = (act: (base: PaperAccount) => PaperResult, done: string) => {
    setPending(null); setMenu(null);
    const base = current(), result = act(base);
    if (!result.ok) { setMessage(result.diagnostics.map(row => row.message).join(' ') || 'The virtual account refused this action.'); return; }
    setMessage(props.onAccountChange(result.account, account) === false ? 'The virtual account changed before this action completed. Try again.' : done);
  };
  const guarded = (label: string, run: () => void, always = false) => { if (account.settings.oneClick && !always) run(); else { setMenu(null); setPending({ label, run }); } };
  const actionTime = Math.max(now, account.clock, props.quote && props.quote === quote ? props.quote.availableAt : 0);
  const place = (intent: PaperDomIntent) => guarded(intent.label, () => commit(base => submitPaperDomIntent(base, intent, actionTime), `${intent.label}: sent.`), intent.marketable && intent.request.type !== 'market');
  const cell = (side: PaperSide, price: number, stop: boolean) => {
    if (!quantity.ok) { setMessage(quantity.message); return; }
    const intent = paperDomCellIntent({ instrument, side, price, quantity: quantity.quantity, stop, quote, now: actionTime });
    if (!intent.ok) { setMessage(intent.message); return; }
    place(intent.intent);
  };
  const market = (side: PaperSide) => { if (!quantity.ok) { setMessage(quantity.message); return; } place(paperDomMarketIntent(instrument, side, quantity.quantity, actionTime)); };
  const moveTo = (ids: string[], price: number) => {
    setDrag(null);
    const moves = ids.map(id => paperDomMoveIntent(account, instrument, id, price, quote));
    const refused = moves.find(row => !row.ok);
    if (refused && !refused.ok) { setMessage(refused.message); return; }
    const ok = moves.filter((row): row is Extract<typeof row, { ok: true }> => row.ok);
    const label = ok.length === 1 ? ok[0].label : `Move ${ok.length} orders to ${paperDomPriceText(price, instrument.tickSize)}`;
    guarded(label, () => commit(base => { let next = base; for (const move of ok) { const result = movePaperDomOrder(next, move, actionTime); if (!result.ok) return result; next = result.account; } return { ok: true, account: next, diagnostics: [] }; }, `${label}: done.`), ok.some(row => row.marketable));
  };
  const cancelIds = (ids: string[], label: string) => commit(base => { let next = base; for (const id of ids) { const result = cancelPaperOrder(next, id, actionTime); if (!result.ok) return result; next = result.account; } return { ok: true, account: next, diagnostics: [] }; }, label);

  if (centerPrice === null) return (
    <div className="lv-paper-dom" aria-label="Order ladder">
      <p className="lv-paper-dock-empty">{capability.label}</p>
    </div>
  );
  const ladder = paperDomLadder(account, instrument, shown, centerPrice, props.rows);
  const side = (button: PaperSide, price: number) => ({
    onClick: (event: React.MouseEvent) => cell(button, price, event.ctrlKey || event.metaKey),
    onContextMenu: (event: React.MouseEvent) => { event.preventDefault(); setMenu(price); },
    onDragOver: (event: React.DragEvent) => { if (drag && drag.side === button && drag.from !== price) event.preventDefault(); },
    onDrop: (event: React.DragEvent) => { if (!drag || drag.side !== button) return; event.preventDefault(); if (drag.from !== price) moveTo(drag.ids, price); else setDrag(null); },
  });
  /** A cell holding own orders can be dragged to another row of the same side to move them. */
  const grab = (button: PaperSide, price: number, ids: string[]) => ids.length === 0 ? {} : {
    draggable: true, title: 'Drag to another row to move these orders',
    onDragStart: (event: React.DragEvent) => { event.dataTransfer?.setData('text/plain', `${button} ${price}`); setDrag({ side: button, ids, from: price }); },
    onDragEnd: () => setDrag(null),
  };
  // The wheel scrolls the fixed ladder three ticks per notch; Recenter brings it back to the price.
  const wheel = (event: React.WheelEvent) => { if (event.deltaY === 0 || centerPrice === null) return; setCenter({ identity, price: paperDomScrolled(centerPrice, event.deltaY > 0 ? -3 : 3, instrument) }); };
  return (
    <div className="lv-paper-dom" aria-label={`Order ladder for ${instrument.symbol}`}>
      <style>{`.lv-paper-dom{display:flex;flex-direction:column;gap:6px;position:relative}.lv-paper-dom .dom-confirm{position:absolute;top:0;left:0;right:0;z-index:5;padding:4px 6px;background:#1e222d;border:1px solid #787b86;border-radius:4px;align-items:center}.lv-paper-dom .dom-bar{display:flex;flex-wrap:wrap;gap:6px 10px;align-items:center}.lv-paper-dom .dom-bar input{width:80px}.lv-paper-dom table td{padding:1px 6px;text-align:center}.lv-paper-dom table td.buy-cell,.lv-paper-dom table td.sell-cell{padding:0;white-space:nowrap}.lv-paper-dom table td button{display:inline-block;box-sizing:border-box;width:100%;min-width:56px;height:100%;min-height:17px;line-height:17px;border:0;background:transparent;color:inherit;cursor:pointer;padding:0 4px}.lv-paper-dom table td button:first-child:not(:last-child){width:calc(100% - 20px)}.lv-paper-dom table td button[aria-label^=Cancel]{width:18px;min-width:0}.lv-paper-dom td.buy-cell button:hover{background:color-mix(in srgb,var(--lv-trade-buy) 25%,transparent)}.lv-paper-dom td.sell-cell button:hover{background:color-mix(in srgb,var(--lv-trade-sell) 25%,transparent)}.lv-paper-dom tr.bid td.price{box-shadow:inset 3px 0 var(--lv-trade-buy)}.lv-paper-dom tr.ask td.price{box-shadow:inset -3px 0 var(--lv-trade-sell)}.lv-paper-dom tr.average td.price{font-weight:700;text-decoration:underline}.lv-paper-dom .dom-menu{display:flex;flex-wrap:wrap;gap:4px}.lv-paper-dom .dom-note{opacity:.75;margin:0}.lv-paper-dom td.buy-cell button[draggable=true]{color:var(--lv-trade-buy);font-weight:600;cursor:grab}.lv-paper-dom td.sell-cell button[draggable=true]{color:var(--lv-trade-sell);font-weight:600;cursor:grab}`}</style>
      <div className="dom-bar">
        <label>Quantity <input aria-label="Ladder quantity" inputMode="decimal" value={quantityText} onChange={event => setQuantityText(event.target.value)} aria-invalid={!quantity.ok}/></label>
        <button type="button" className="buy" onClick={() => market('buy')}>Buy Mkt</button>
        <button type="button" className="sell" onClick={() => market('sell')}>Sell Mkt</button>
        <button type="button" onClick={() => { if (automatic !== null) setCenter({ identity, price: automatic }); }} title="Centre the ladder on the current price">Recenter</button>
        <span aria-label="Position P&amp;L">{position ? `${position.quantity > 0 ? 'Long' : 'Short'} ${Math.abs(position.quantity)}: ` : ''}<strong title={pnl.reason ?? undefined}>{pnl.text}</strong></span>
        <label>P&amp;L in <select aria-label="Ladder P&amp;L unit" value={pnlMode} onChange={event => setPnlMode(event.target.value as PaperDomPnlMode)}><option value="money">{account.settings.currency}</option><option value="ticks">Ticks</option><option value="percent">Percent</option></select></label>
        <button type="button" disabled={!position} onClick={() => guarded(`Flatten ${instrument.symbol}`, () => commit(base => flattenPaperDom(base, instrument, actionTime), `Close order sent for ${instrument.symbol}.`))}>Flatten</button>
        <button type="button" disabled={!position} onClick={() => guarded(`Reverse ${instrument.symbol} position`, () => commit(base => reversePaperDom(base, instrument, actionTime), `${instrument.symbol} position reversed.`))}>Reverse</button>
        <button type="button" onClick={() => commit(base => cancelPaperDom(base, instrument, 'buy', actionTime), 'Working buy orders cancelled.')}>Cancel buys</button>
        <button type="button" onClick={() => commit(base => cancelPaperDom(base, instrument, 'sell', actionTime), 'Working sell orders cancelled.')}>Cancel sells</button>
        <button type="button" onClick={() => commit(base => cancelPaperDom(base, instrument, undefined, actionTime), `All working ${instrument.symbol} orders cancelled.`)}>Cancel all</button>
      </div>
      <p className="dom-note">{capability.label}{shown !== quote && props.bookSource ? ` Best bid and ask: ${props.bookSource}. Virtual orders fill at the virtual feed price.` : ''} Click a row to place a limit, Ctrl and click for a stop, right-click for more. Drag your orders to another row to move them; scroll to move the ladder.</p>
      {pending && <div role="alertdialog" aria-label="Confirm virtual order" className="dom-menu dom-confirm"><span>{pending.label}?</span><button type="button" className="primary" onClick={pending.run}>Place</button><button type="button" onClick={() => setPending(null)}>Cancel</button></div>}
      {menu !== null && quantity.ok && <div role="menu" aria-label={`Orders at ${paperDomPriceText(menu, instrument.tickSize)}`} className="dom-menu">
        {paperDomContextEntries(instrument, menu, quote, quantity.quantity, actionTime).map(entry => <button key={entry.id} type="button" role="menuitem" disabled={entry.disabled !== null} title={entry.disabled ?? undefined} onClick={() => entry.kind === 'market' ? market(entry.side) : cell(entry.side, menu, entry.kind === 'stop')}>{entry.label}</button>)}
        <button type="button" role="menuitem" onClick={() => setMenu(null)}>Close menu</button>
      </div>}
      {ladder.above > 0 && <p className="dom-note">{ladder.above} working order{ladder.above === 1 ? '' : 's'} above the ladder</p>}
      <table aria-label="Price ladder" onWheel={wheel}>
        <thead><tr><th scope="col">Buy</th><th scope="col">Bid size</th><th scope="col">Price</th><th scope="col">Ask size</th><th scope="col">Sell</th></tr></thead>
        <tbody>{ladder.levels.map(level => {
          const buys = level.orders.filter(row => row.side === 'buy').map(row => row.id), sells = level.orders.filter(row => row.side === 'sell').map(row => row.id);
          return <tr key={level.priceText} className={[level.bid ? 'bid' : '', level.ask ? 'ask' : '', level.average ? 'average' : ''].filter(Boolean).join(' ') || undefined}>
            <td className="buy-cell"><button type="button" aria-label={`Buy at ${level.priceText}`} {...side('buy', level.price)} {...grab('buy', level.price, buys)}>{level.buyQuantity || ''}</button>{buys.length > 0 && <button type="button" aria-label={`Cancel buy orders at ${level.priceText}`} onClick={() => cancelIds(buys, `Buy orders at ${level.priceText} cancelled.`)}>×</button>}</td>
            <td className="buy-cell"><button type="button" aria-label={`Buy at ${level.priceText} (bid size)`} {...side('buy', level.price)}>{level.bidSize ?? ''}</button></td>
            <td className="price" onContextMenu={event => { event.preventDefault(); setMenu(level.price); }}>{level.priceText}{level.bid ? ' bid' : ''}{level.ask ? ' ask' : ''}</td>
            <td className="sell-cell"><button type="button" aria-label={`Sell at ${level.priceText} (ask size)`} {...side('sell', level.price)}>{level.askSize ?? ''}</button></td>
            <td className="sell-cell"><button type="button" aria-label={`Sell at ${level.priceText}`} {...side('sell', level.price)} {...grab('sell', level.price, sells)}>{level.sellQuantity || ''}</button>{sells.length > 0 && <button type="button" aria-label={`Cancel sell orders at ${level.priceText}`} onClick={() => cancelIds(sells, `Sell orders at ${level.priceText} cancelled.`)}>×</button>}</td>
          </tr>;
        })}</tbody>
      </table>
      {ladder.below > 0 && <p className="dom-note">{ladder.below} working order{ladder.below === 1 ? '' : 's'} below the ladder</p>}
      <p role="status" aria-live="polite">{message}</p>
    </div>
  );
}
