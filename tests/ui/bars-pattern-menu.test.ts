import { describe, expect, it } from 'vitest';
import { chartMenuEntries } from '../../src/ui/ChartContextMenu';

// Synthetic menu snapshots: only the parts the menu reads.
const snap = (type: string, ids = ['d1']) => ({ entity: { kind: 'drawing', ids }, controller: { drawingManager: { list: () => ids.map(id => ({ id, type, locked: false, visible: true })) } } }) as never;
const actions = { 'drawing-settings': () => true, 'drawing-mirror': () => true, 'drawing-flip': () => true, 'drawing-remove': () => true } as never;

describe('Bars pattern Mirror and Flip in the drawing menu', () => {
  it('offers Mirror and Flip for a single Bars pattern only', () => {
    const labels = (s: never) => chartMenuEntries(s, actions).map(row => row.label);
    expect(labels(snap('lvbarspattern'))).toEqual(expect.arrayContaining(['Mirror', 'Flip']));
    expect(labels(snap('LineToolTrendLine'))).not.toContain('Mirror');
    expect(labels(snap('lvbarspattern', ['a', 'b']))).not.toContain('Flip');
  });
});
