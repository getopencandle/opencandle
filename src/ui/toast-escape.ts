/**
 * Escape dismisses the newest visible toast (the status toast or a virtual trading notice) when focus is not in
 * a dialog, a menu or a text field and no modal dialog is open. Each toast host registers what it shows; one document listener
 * picks the newest. Other Escape handlers run first: an Escape they already handled (defaultPrevented) is left alone.
 */
interface ToastEntry { readonly shownAt: number; readonly dismiss: () => void }
const entries = new Map<object, ToastEntry>();
let installed = false;

const FOCUS_OWNERS = 'input,textarea,select,[contenteditable=""],[contenteditable="true"],[role="dialog"],[role="alertdialog"],[role="menu"],[role="listbox"],dialog';
const visible = (node: Element) => (node as HTMLElement).getClientRects?.().length > 0;

/** Whether this keydown may dismiss a toast. Exported for tests. */
export function toastEscapeAllowed(event: KeyboardEvent, doc: Document = document): boolean {
  if (event.key !== 'Escape' || event.defaultPrevented || event.isComposing || event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) return false;
  for (const node of [event.target, doc.activeElement] as unknown[]) if (node && node !== doc.body && typeof (node as Element).closest === 'function' && (node as Element).closest(FOCUS_OWNERS)) return false;
  for (const modal of Array.from(doc.querySelectorAll('[aria-modal="true"]'))) if (visible(modal)) return false;
  return true;
}

/** Show a toast for Escape purposes; the returned function forgets it (call it when the toast leaves). */
export function registerToast(owner: object, dismiss: () => void, shownAt: number = performance.now()): () => void {
  const entry = { shownAt, dismiss };
  entries.set(owner, entry);
  install();
  return () => { if (entries.get(owner) === entry) entries.delete(owner); };
}

/** Dismiss the newest registered toast. Returns false when none is shown. */
export function dismissNewestToast(): boolean {
  let newest: [object, ToastEntry] | null = null;
  for (const row of entries) if (!newest || row[1].shownAt >= newest[1].shownAt) newest = row;
  if (!newest) return false;
  entries.delete(newest[0]);
  newest[1].dismiss();
  return true;
}

function install() {
  if (installed || typeof document === 'undefined' || typeof document.addEventListener !== 'function') return;
  installed = true;
  document.addEventListener('keydown', event => { if (entries.size && toastEscapeAllowed(event) && dismissNewestToast()) event.preventDefault(); });
}
