// The Keyboard shortcuts reference, a read-only list (no rebinding). The rows are
// generated from the key classifiers (keyboard-shortcuts.ts). Layout and wording are our own choice.
import React from 'react';
import { Modal } from './Modal';
import { SHORTCUT_GROUPS, keyboardShortcutRows, type ShortcutRow } from './keyboard-shortcuts';

export function KeyboardShortcutsDialog({ onClose, rows = keyboardShortcutRows() }: { onClose: () => void; rows?: ShortcutRow[] }) {
  return <Modal title="Keyboard shortcuts" onClose={onClose} wide>
    <div className="lv-shortcuts" style={{ maxHeight: '60vh', overflowY: 'auto' }}>
      {SHORTCUT_GROUPS.filter(group => rows.some(row => row.group === group)).map(group => <section key={group} aria-label={group}>
        <h3 style={{ margin: '12px 0 6px', fontSize: 13 }}>{group}</h3>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}><tbody>
          {rows.filter(row => row.group === group).map(row => <tr key={row.action}>
            <td style={{ padding: '3px 0' }}>{row.action}</td>
            <td style={{ padding: '3px 0', textAlign: 'right', whiteSpace: 'nowrap' }}>{row.keys.map((key, index) => <React.Fragment key={key}>{index ? ', ' : ''}<kbd>{key}</kbd></React.Fragment>)}</td>
          </tr>)}
        </tbody></table>
      </section>)}
      <p style={{ color: 'var(--lv-text-secondary)', marginTop: 12 }}>Shortcuts work when no text field, menu or dialog has focus; the Watchlist keys work while the watchlist has focus. They cannot be changed.</p>
    </div>
    <div className="dialog-actions"><button type="button" onClick={onClose}>Close</button></div>
  </Modal>;
}
