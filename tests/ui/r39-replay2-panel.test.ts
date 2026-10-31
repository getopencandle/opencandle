// The replay bar's speed menu, update interval, Step back hotkey and Jump to real time while choosing a new start.
// Static markup through react-dom/server plus direct calls of the pure menu components; not interface evidence. SYNTHETIC rows.
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { ReplayPanel, ReplaySpeedList, type ReplayPanelProps } from '../../src/ui/ReplayPanel';
import { beginReplayStartSelection, openReplay, selectReplayStart } from '../../src/domain/replay-session';
import { fixtureDataset } from '../../src/domain/fixtures';

const chart = fixtureDataset('RPB', 30);
const participant = { cellId: 'c1', instrumentId: chart.instrument.id, symbol: 'RPB', interval: '1D', chartType: 'candles', datasetId: chart.provenance.datasetId, revision: chart.provenance.revision };
const selecting = openReplay({ participants: [participant], activeCellId: 'c1', sessionId: 'rpb' });
const active = selectReplayStart(selecting, chart, chart.bars[9].time, '1D');
const noop = () => {};
function props(extra: Partial<ReplayPanelProps> = {}): ReplayPanelProps {
  return { session: active, saved: null, intervalMenu: { auto: { id: '1D', reason: null }, options: [{ id: '1D', label: '1D', family: 'daily', available: true, reason: null }] }, multiChart: false, atEnd: false, unsupportedReason: null, clockLabel: '2024-01-15', onSelectStart: noop, onTogglePlay: noop, onStep: noop, onSpeed: noop, onInterval: noop, onScope: noop, onRealtime: noop, onClose: noop, onContinue: noop, onStepBack: noop, canStepBack: true, onStartPoint: noop, ...extra } as ReplayPanelProps;
}
const render = (extra: Partial<ReplayPanelProps> = {}) => renderToStaticMarkup(React.createElement(ReplayPanel, props(extra)));
const tag = (html: string, label: string) => html.match(new RegExp(`<button[^>]*aria-label="${label}"[^>]*>`))?.[0] ?? '';
const inner = (html: string, label: string) => html.match(new RegExp(`<button[^>]*aria-label="${label}"[^>]*>([\\s\\S]*?)</button>`))?.[1] ?? '';
function walk(node: any, out: any[] = []): any[] { if (Array.isArray(node)) node.forEach(child => walk(child, out)); else if (node?.props) { out.push(node); walk(node.props.children, out); } return out; }

describe(' replay bar', () => {
  it('the speed menu lists 0.1x to 10x with the current speed checked', () => {
    const onSpeed = vi.fn(), items = walk(ReplaySpeedList({ value: 0.3, onSpeed })).filter(node => node.props.role === 'menuitemradio');
    expect(items.map(node => node.props.children)).toEqual(['0.1x', '0.3x', '0.5x', '1x', '3x', '5x', '7x', '10x']);
    expect(items.map(node => node.props['aria-checked'])).toEqual([false, true, false, false, false, false, false, false]);
    items[0].props.onClick(); expect(onSpeed).toHaveBeenCalledWith(0.1);
    expect(inner(render({ session: { ...active, stepsPerSecond: 0.1 } }), 'Replay speed')).toBe('0.1x');
  });
  it('the replay interval button is titled Update interval, as in the reference app', () => {
    expect(tag(render(), 'Replay interval')).toContain('title="Update interval"');
  });
  it('Step back announces Shift+Left beside Shift+Down and Shift+Right', () => {
    const html = render();
    expect(tag(html, 'Step back')).toContain('title="Step back (Shift+Left)"');
    expect(tag(html, 'Step back')).toContain('aria-keyshortcuts="Shift+ArrowLeft"');
    expect(html.match(/aria-keyshortcuts=/g)).toHaveLength(3);
  });
  it('Jump to real time stays available while choosing a new start bar of a running replay', () => {
    expect(tag(render({ session: beginReplayStartSelection(active) }), 'Jump to real time')).not.toContain('disabled');
    expect(tag(render({ session: selecting }), 'Jump to real time')).toContain('disabled=""');
    expect(tag(render(), 'Jump to real time')).not.toContain('disabled');
  });
});
