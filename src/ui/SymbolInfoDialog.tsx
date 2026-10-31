// The Symbol info card. The menu entry "Symbol info…" opens it.
// The card's layout and field labels are our own choice (src/domain/symbol-info.ts).
import React from 'react';
import { Modal } from './Modal';
import { symbolInfoRows } from '../domain/symbol-info';
import { displayExchange } from '../domain/fixtures';
import type { AlpacaAsset } from '../domain/alpaca-live';
import type { BarDataset } from '../domain/types';

export const SYMBOL_INFO_LABEL = 'Symbol info…';
export function SymbolInfoDialog({ dataset, asset, onClose }: { dataset: BarDataset; asset?: AlpacaAsset | null; onClose: () => void }) {
  const rows = asset === undefined ? symbolInfoRows(dataset) : symbolInfoRows(dataset, asset);
  return <Modal title="Symbol info" onClose={onClose}>
    <dl className="lv-symbol-info">
      {rows.map(row => <React.Fragment key={row.id}><dt>{row.label}</dt><dd data-symbol-info={row.id}>{row.id==='exchange'?displayExchange(row.value):row.value}</dd></React.Fragment>)}
    </dl>
    <div className="lv-symbol-info-actions"><button type="button" onClick={onClose}>Close</button></div>
  </Modal>;
}
