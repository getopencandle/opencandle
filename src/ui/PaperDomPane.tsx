import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { PAPER_NOTICE, type PaperAccount } from '../domain/paper';
import type { Instrument, Quote } from '../domain/types';
import { FloatingPanel, type FloatingPoint } from './FloatingPanel';
import { paperDomPaneState } from './paper-dom-pane';
import { PaperDom } from './PaperDom';

/**
 * The paper DOM in its own floating pane. It is the same PaperDom ladder as the
 * trading panel's DOM tab (click to place, drag own orders to move them, wheel to scroll), in a non-blocking panel that is
 * dragged by its header and closed with Escape or the close button. The trading panel renders it (see paper-dom-pane.ts).
 * LV layout and wording.
 */
export const PAPER_DOM_PANE_WIDTH = 460;
export interface PaperDomPaneProps {
  account: PaperAccount;
  instrument: Instrument;
  quote?: Quote | null;
  book?: Quote | null;
  bookSource?: string | null;
  now: number;
  onAccountChange: (next: PaperAccount, expected: PaperAccount) => boolean | void;
  /** Why trading is refused on this symbol (derived symbols); the pane then shows it instead of the ladder. */
  tradingRefusal?: string | null;
  replay?: boolean;
  center?: { price: number; token: number } | null;
  onClose: () => void;
  /** Saved spot to open at, and the drag-end report. Absent: the session placement (below). */
  initialAt?: FloatingPoint;
  onMove?: (point: FloatingPoint) => void;
  /** Test seam: where the pane is portalled (document.body by default). */
  host?: Element | null;
}
export function paperDomPaneTitle(instrument: Pick<Instrument, 'symbol'>, replay = false): string { return `${replay ? 'Replay DOM' : 'DOM'}: ${instrument.symbol}`; }

/**
 * The workspace owner (App) saves whether the pane is open and where it was dragged. The trading
 * dock renders the pane without knowing about the workspace, so App registers the saved spot and the save callbacks here.
 * `onOpenChange(false)` is reported only when the pane closed (the route store says closed when it unmounts); a pane that
 * unmounts because its dock went away stays open in the store and in the workspace.
 */
export interface PaperDomPanePlacement { at?: FloatingPoint | null; onMove?: (point: FloatingPoint) => void; onOpenChange?: (open: boolean) => void }
let placement: PaperDomPanePlacement | null = null;
export function setPaperDomPanePlacement(next: PaperDomPanePlacement | null): void { placement = next; }
export function paperDomPanePlacement(): PaperDomPanePlacement | null { return placement; }

export function PaperDomPane(props: PaperDomPaneProps) {
  const title = paperDomPaneTitle(props.instrument, props.replay);
  useEffect(() => { placement?.onOpenChange?.(true); return () => { if (!paperDomPaneState().open) placement?.onOpenChange?.(false); }; }, []);
  const initialAt = props.initialAt ?? placement?.at ?? undefined;
  const onMove = (point: FloatingPoint) => { if (props.onMove) props.onMove(point); else placement?.onMove?.(point); };
  const body = (
    <FloatingPanel title={title} onClose={props.onClose} width={PAPER_DOM_PANE_WIDTH} initialAt={initialAt} onMove={onMove}>
      <div className="lv-paper-dom-pane" data-lv-dom-pane="true">
        <style>{`.lv-paper-dom-pane{padding:0 12px 10px;font-size:12px;color:var(--lv-text-primary)}.lv-paper-dom-pane .badge{display:inline-block;margin:0 0 6px;padding:0 6px;border:1px solid currentColor;border-radius:3px;font-size:10px;opacity:.8}.lv-paper-dom-pane .buy,.lv-paper-dom-pane .sell{padding:3px 10px;border:0;border-radius:var(--lv-radius-plate,6px);color:var(--lv-on-trade);font-weight:600;cursor:pointer}.lv-paper-dom-pane .buy{background:var(--lv-trade-buy)}.lv-paper-dom-pane .sell{background:var(--lv-trade-sell)}.lv-paper-dom-pane table{border-collapse:collapse;width:100%}.lv-paper-dom-pane th,.lv-paper-dom-pane td{border-bottom:1px solid var(--lv-border)}`}</style>
        <span className="badge" title={PAPER_NOTICE}>Virtual money: {props.account.name}</span>
        {props.tradingRefusal
          ? <p className="paper-notice" role="status">{props.tradingRefusal}</p>
          : <PaperDom account={props.account} instrument={props.instrument} quote={props.quote ?? null} book={props.book ?? null} bookSource={props.bookSource ?? null} now={props.now} onAccountChange={props.onAccountChange} centerRequest={props.center ?? null}/>}
      </div>
    </FloatingPanel>
  );
  const host = props.host !== undefined ? props.host : typeof document === 'undefined' ? null : document.body;
  return host ? createPortal(body, host) : body;
}
