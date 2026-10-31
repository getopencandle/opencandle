/**
 * The paper DOM (price ladder) as its own floating pane, besides the DOM tab of
 * the trading panel. One session-wide route store: the order tickets, the trading panel and the chart menu ask it to open;
 * the trading panel (which holds the account, the virtual quote and the display book) is the host that renders the pane.
 * The entry points, the pane wording and the "open at the clicked price" rule are our own choice; no reference layout is claimed.
 * The open state is session only (not saved in the workspace document).
 */
export type PaperDomPaneOrigin = 'ticket' | 'panel' | 'chart-menu';
export interface PaperDomPaneState {
  open: boolean;
  origin: PaperDomPaneOrigin | null;
  /** Price the ladder should centre on when the pane opens (the chart menu's clicked price); null keeps the ladder's own centre. */
  center: { price: number; token: number } | null;
}
export const PAPER_DOM_PANE_CLOSED: PaperDomPaneState = Object.freeze({ open: false, origin: null, center: null });
export const PAPER_DOM_PANE_NO_HOST = 'Open the trading panel once to use the DOM pane.';

type Listener = (state: PaperDomPaneState) => void;
let state: PaperDomPaneState = PAPER_DOM_PANE_CLOSED, token = 0;
const hosts = new Set<Listener>();
const publish = (next: PaperDomPaneState) => { state = next; for (const listener of [...hosts]) listener(next); };

export function paperDomPaneState(): PaperDomPaneState { return state; }
/** The pane host subscribes; the return value unsubscribes. */
export function subscribePaperDomPane(listener: Listener): () => void { hosts.add(listener); return () => { hosts.delete(listener); }; }
/** True while a host can render the pane. */
export function paperDomPaneHosted(): boolean { return hosts.size > 0; }
/**
 * Opens (or re-targets) the pane. A finite `price` re-centres the ladder there; any other value keeps the ladder's centre.
 * Returns false, with nothing changed, when no host is mounted.
 */
export function openPaperDomPane(origin: PaperDomPaneOrigin, price?: number | null): boolean {
  if (!hosts.size) return false;
  publish({ open: true, origin, center: typeof price === 'number' && Number.isFinite(price) ? { price, token: ++token } : state.open ? state.center : null });
  return true;
}
export function closePaperDomPane(): void { if (state.open) publish(PAPER_DOM_PANE_CLOSED); }
/** Test seam: forget the session state and hosts. */
export function resetPaperDomPaneForTests(): void { state = PAPER_DOM_PANE_CLOSED; token = 0; hosts.clear(); }
