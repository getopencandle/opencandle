import React, { useEffect, useRef, useState } from 'react';
import { parseIntervalEntry } from '../domain/intervals';
import { previewChartInterval } from '../chart/range-interval';

/** How long a refused interval's message stays before the prompt closes itself. */
export const INTERVAL_ENTRY_ERROR_MS = 1800;

/** The small prompt a typed digit opens on the chart: type an interval (5, 1h, 2D, 3M, or a range interval such as 100R, which
 * selects the Range chart type with that size), Enter switches, Escape closes. A refused interval shows its reason briefly and
 * the prompt then closes; a press anywhere outside the prompt closes it at once and still reaches what was pressed. */
export function IntervalEntry({ seed, current, onSubmit, onClose, errorMs = INTERVAL_ENTRY_ERROR_MS }: {
  seed: string; current: string;
  /** `settled`: a switch queued behind a background save; the prompt stays open until it ends and shows a refusal. */
  onSubmit: (text: string) => { ok: boolean; message: string | null; settled?: Promise<{ ok: boolean; message: string | null }> };
  onClose: () => void;
  errorMs?: number;
}) {
  const [text, setText] = useState(seed), [error, setError] = useState('');
  const form = useRef<HTMLFormElement | null>(null), close = useRef(onClose);
  close.current = onClose;
  const parsed = text.trim() ? previewChartInterval(text, parseIntervalEntry) : null;
  useEffect(() => {
    const doc = form.current?.ownerDocument;
    if (!doc) return;
    const outside = (event: Event) => { if (!form.current?.contains(event.target as Node)) close.current(); };
    doc.addEventListener('pointerdown', outside, true);
    return () => doc.removeEventListener('pointerdown', outside, true);
  }, []);
  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(() => close.current(), errorMs);
    return () => clearTimeout(timer);
  }, [error, errorMs]);
  // A second digit typed fast (60) can land before the input has focus; the page's capture route then swallowed it and
  // reopened the prompt with that digit as an ignored seed. While the prompt is open, a plain typing key that is not headed for the
  // input is taken here (window capture runs first), appended to the field, and focus moves into the input.
  useEffect(() => {
    const win = form.current?.ownerDocument?.defaultView;
    if (!win?.addEventListener) return;
    const typed = (event: KeyboardEvent) => {
      const input = form.current?.querySelector?.('input');
      if (!input || event.target === input || event.ctrlKey || event.metaKey || event.altKey || event.isComposing || event.repeat) return;
      if (!/^[0-9a-zA-Z]$/.test(event.key)) return;
      if ((event.target as Element | null)?.closest?.('input,textarea,select,[contenteditable="true"],[role=dialog]')) return;
      event.preventDefault(); event.stopImmediatePropagation();
      setText(previous => (previous + event.key).slice(0, 40)); setError('');
      input.focus?.({ preventScroll: true });
    };
    win.addEventListener('keydown', typed, true);
    return () => win.removeEventListener('keydown', typed, true);
  }, []);
  // Hooks after the existing ones, so their order is unchanged: a queued switch keeps the prompt open.
  const [waiting, setWaiting] = useState(false), mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (waiting) return;
    const result = onSubmit(text);
    if (!result.ok) { setError(result.message ?? 'The interval could not be applied.'); return; }
    if (!result.settled) { onClose(); return; }
    setWaiting(true);
    void result.settled.then(done => { if (!mounted.current) return; setWaiting(false); if (done.ok) close.current(); else setError(done.message ?? 'The interval could not be applied.'); },
      () => { if (mounted.current) { setWaiting(false); setError('The interval could not be applied.'); } });
  }
  return <form ref={form} className="lv-interval-entry" role="group" aria-label="Change interval" onSubmit={submit}
    style={{ position: 'fixed', top: 52, left: 120, zIndex: 95, padding: 8, background: 'var(--panel, #1e222d)', border: '1px solid var(--border, #434651)', borderRadius: 6 }}>
    {/* The caption sits on its own line above the input so it is never cut. */}
    <label style={{ display: 'block', fontSize: 11 }}><span style={{ display: 'block', whiteSpace: 'nowrap', marginBottom: 4 }}>{`Change interval (now ${current})`}</span>
      <input style={{ display: 'block', minWidth: 160, boxSizing: 'border-box' }} aria-label="Interval" autoFocus maxLength={40} value={text} onChange={event => { setText(event.target.value); setError(''); }}
        onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onClose(); } }}
        onFocus={event => event.currentTarget.setSelectionRange?.(event.currentTarget.value.length, event.currentTarget.value.length)}/>
    </label>
    <div aria-live="polite" style={{ fontSize: 11, minHeight: 14 }}>{error ? <span role="alert">{error}</span> : waiting ? 'Switching once the save finishes' : parsed?.ok ? parsed.label : ''}</div>
  </form>;
}
