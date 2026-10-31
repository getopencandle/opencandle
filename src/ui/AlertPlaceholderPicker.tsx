import React, { useRef, useState } from 'react';
import { ALERT_MESSAGE_LIMIT, ALERT_MESSAGE_PLACEHOLDER_CATALOG, type AlertPlaceholderInfo } from '../domain/alert-message';

/**
 * "Insert placeholder" for the alert message box. Choosing a placeholder types it at the caret (or over
 * the selection) and puts the caret after it. The plot group lists the selected script's own plots by number and title
 * when they are known; otherwise the generic {{plot_0}} and {{plot("Title")}} forms. Layout and wording.
 */
export interface AlertPlaceholderPickerProps { textareaId: string; value: string; onChange: (value: string) => void; plotTitles?: readonly string[]; disabled?: boolean; }
const quoted = (title: string) => !/["{}\r\n]/.test(title) && title.length > 0 && title.length <= 200;
export function alertPlaceholderOptions(plotTitles?: readonly string[]): AlertPlaceholderInfo[] {
  const rows = ALERT_MESSAGE_PLACEHOLDER_CATALOG.filter(row => row.group !== 'Plots' || !plotTitles?.length);
  if (!plotTitles?.length) return [...rows];
  const plots = plotTitles.slice(0, 64).flatMap((title, index): AlertPlaceholderInfo[] => [{ token: `{{plot_${index}}}`, group: 'Plots', help: title }, ...(quoted(title) ? [{ token: `{{plot("${title}")}}`, group: 'Plots' as const, help: `${title}, by title` }] : [])]);
  const at = rows.findIndex(row => row.group === 'Strategy');
  return [...rows.slice(0, at), ...plots, ...rows.slice(at)];
}
/** The message after typing `token` over [start, end), or null when it would exceed the saved-message limit. */
export function insertAlertPlaceholder(value: string, token: string, start: number, end: number): { value: string; caret: number } | null {
  const from = Math.max(0, Math.min(start, end, value.length)), to = Math.max(from, Math.min(Math.max(start, end), value.length));
  const next = value.slice(0, from) + token + value.slice(to);
  return next.length > ALERT_MESSAGE_LIMIT ? null : { value: next, caret: from + token.length };
}
const textarea = (id: string) => typeof document !== 'undefined' && typeof document.getElementById === 'function' ? document.getElementById(id) as HTMLTextAreaElement | null : null;
export function AlertPlaceholderPicker({ textareaId, value, onChange, plotTitles, disabled }: AlertPlaceholderPickerProps) {
  const [open, setOpen] = useState(false), [notice, setNotice] = useState(''), toggle = useRef<HTMLButtonElement>(null);
  const options = alertPlaceholderOptions(plotTitles), groups = [...new Set(options.map(row => row.group))];
  const close = (focus: boolean) => { setOpen(false); if (focus) toggle.current?.focus(); };
  const choose = (token: string) => {
    const area = textarea(textareaId);
    const start = area?.selectionStart ?? value.length, end = area?.selectionEnd ?? value.length;
    const inserted = insertAlertPlaceholder(value, token, start, end);
    if (!inserted) { setNotice(`The message is limited to ${ALERT_MESSAGE_LIMIT} characters. The placeholder was not inserted.`); close(true); return; }
    setNotice(''); onChange(inserted.value); setOpen(false);
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => { const target = textarea(textareaId); if (!target) return; target.focus(); target.setSelectionRange(inserted.caret, inserted.caret); });
  };
  return <div className="alert-placeholder-picker" style={{ position: 'relative' }}>
    <button type="button" ref={toggle} aria-haspopup="menu" aria-expanded={open} aria-controls={open ? textareaId + '-placeholders' : undefined} disabled={disabled} onClick={() => setOpen(current => !current)}>Insert placeholder</button>
    {notice && <small role="status">{notice}</small>}
    {open && <div id={textareaId + '-placeholders'} role="menu" aria-label="Message placeholders" className="alert-placeholder-menu" style={{ maxHeight: 260, overflow: 'auto', border: '1px solid #4a5a75', borderRadius: 4, padding: 4, marginTop: 4 }}
      onKeyDown={event => {
        if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(true); return; }
        if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
        event.preventDefault(); event.stopPropagation();
        const items = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')], at = items.indexOf(document.activeElement as HTMLButtonElement);
        items[(at + (event.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length]?.focus();
      }}>
      {groups.map(group => <div key={group} role="group" aria-label={group}><strong style={{ display: 'block', fontSize: 11, margin: '4px 0 2px' }}>{group}</strong>
        {options.filter(row => row.group === group).map(row => <button key={row.token} type="button" role="menuitem" title={row.help} style={{ display: 'flex', gap: 8, width: '100%', textAlign: 'left' }} onClick={() => choose(row.token)}><code>{row.token}</code><small>{row.help}</small></button>)}
      </div>)}
    </div>}
  </div>;
}
