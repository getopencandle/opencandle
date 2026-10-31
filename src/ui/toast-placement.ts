/** The status toast ("Chart layout changed.") sits centered near the top of the chart area, where a chart cell's
 * virtual trading controls (Sell, spread, Qty, Buy) live. With 2 columns the right cell's controls sat right under the toast.
 * The toast now moves down below any trading controls it would cover. Placement. */
export interface ToastBox { readonly left: number; readonly top: number; readonly right: number; readonly bottom: number; }
/** Gap kept between the toast and the controls it clears. */
export const TOAST_CLEARANCE = 6;

const overlaps = (a: ToastBox, b: ToastBox, gap: number) => a.left < b.right + gap && b.left < a.right + gap && a.top < b.bottom + gap && b.top < a.bottom + gap;

/** Downward shift in px that keeps `toast` off every obstacle; 0 when nothing is covered. Never moves the toast past `limit`
 * (the viewport bottom): if no clear spot fits, the toast keeps its place. */
export function toastShift(toast: ToastBox, obstacles: readonly ToastBox[], limit: number, gap = TOAST_CLEARANCE): number {
  const height = toast.bottom - toast.top;
  let shift = 0;
  for (let pass = 0; pass <= obstacles.length; pass++) {
    const box = { left: toast.left, right: toast.right, top: toast.top + shift, bottom: toast.bottom + shift };
    const hit = obstacles.filter(item => item.right > item.left && item.bottom > item.top && overlaps(box, item, gap));
    if (!hit.length) return shift;
    shift = Math.max(...hit.map(item => item.bottom + gap - toast.top));
    if (toast.top + shift + height > limit) return 0;
  }
  return 0;
}

/** Selector of the controls the toast must not cover. */
export const TOAST_OBSTACLES = '.lv-trade-buttons';
const PLACE_MS = 1500;

/** Ref callback for the toast text node (keyed by message, so it runs once per toast). It shifts the fixed statusbar through
 * --lv-toast-shift and keeps re-checking for a short while, since a layout change mounts the new cells' controls after the
 * message renders. Hook-free on purpose (App's hook-faked tests). */
export function placeToast(node: HTMLElement | null): void {
  if (!node || typeof window === 'undefined' || typeof node.closest !== 'function') return;
  const bar = node.closest('.statusbar') as HTMLElement | null;
  if (!bar || typeof bar.getBoundingClientRect !== 'function') return;
  const started = performance.now();
  let last = Number.NaN;
  const place = () => {
    if (!node.isConnected) return;
    try {
      const current = Number.parseFloat(bar.style.getPropertyValue('--lv-toast-shift')) || 0;
      const rect = bar.getBoundingClientRect();
      const base = { left: rect.left, right: rect.right, top: rect.top - current, bottom: rect.bottom - current };
      const obstacles = node.textContent && rect.width > 0 ? Array.from(document.querySelectorAll<HTMLElement>(TOAST_OBSTACLES)).flatMap(item => Array.from(item.getClientRects()).map(box => ({ left: box.left, top: box.top, right: box.right, bottom: box.bottom }))) : [];
      const shift = Math.round(toastShift(base, obstacles, window.innerHeight));
      if (shift !== last) { last = shift; if (shift) bar.style.setProperty('--lv-toast-shift', shift + 'px'); else bar.style.removeProperty('--lv-toast-shift'); }
    } catch { /* placement is cosmetic */ }
    if (performance.now() - started < PLACE_MS) requestAnimationFrame(place);
  };
  place();
}
