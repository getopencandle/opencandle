// The floating Bar Replay control bar (icon buttons with tooltips, start-point menu, speed menu, step back,
// replay account badge). Static markup through react-dom/server plus direct calls of the pure menu components; not
// interface evidence. SYNTHETIC rows.
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { ReplayIntervalList, ReplayPanel, ReplaySpeedList, ReplayStartPointList, replayDateSubmit, type ReplayPanelProps } from '../../src/ui/ReplayPanel';
import { REPLAY_SPEEDS_LV, openReplay, selectReplayStart } from '../../src/domain/replay-session';
import { fixtureDataset } from '../../src/domain/fixtures';

const chart = fixtureDataset('BAR', 30);
const participant = { cellId: 'c1', instrumentId: chart.instrument.id, symbol: 'BAR', interval: '1D', chartType: 'candles', datasetId: chart.provenance.datasetId, revision: '1' };
const selecting = openReplay({ participants: [participant], activeCellId: 'c1', sessionId: 'bar' });
const active = selectReplayStart(selecting, chart, chart.bars[9].time, '1D');
const noop = () => {};
function props(extra: Partial<ReplayPanelProps> = {}): ReplayPanelProps {
  return { session: active, saved: null, intervalMenu: { auto: { id: '1D', reason: 'Auto uses the chart interval.' }, options: [{ id: '1h', label: '1h', family: 'intraday', available: false, reason: 'Intraday steps need actual minute (or finer) data for every chart.' }, { id: '1D', label: '1D', family: 'daily', available: true, reason: null }] }, multiChart: false, atEnd: false, unsupportedReason: null, clockLabel: '2024-01-15', onSelectStart: noop, onTogglePlay: noop, onStep: noop, onSpeed: noop, onInterval: noop, onScope: noop, onRealtime: noop, onClose: noop, onContinue: noop, onStepBack: noop, canStepBack: true, onStartPoint: noop, ...extra };
}
const render = (extra: Partial<ReplayPanelProps> = {}) => renderToStaticMarkup(React.createElement(ReplayPanel, props(extra)));
const tag = (html: string, label: string) => html.match(new RegExp(`<button[^>]*aria-label="${label}"[^>]*>`))?.[0] ?? '';
const inner = (html: string, label: string) => html.match(new RegExp(`<button[^>]*aria-label="${label}"[^>]*>([\\s\\S]*?)</button>`))?.[1] ?? '';
function walk(node: any, out: any[] = []): any[] { if (Array.isArray(node)) node.forEach(child => walk(child, out)); else if (node?.props) { out.push(node); walk(node.props.children, out); } return out; }

describe(' floating control bar', () => {
  it('is a floating toolbar over the chart, not a full-width strip', () => {
    const html = render();
    expect(html).toMatch(/class="lv-replay-dock"/); expect(html).toMatch(/<div[^>]*class="lv-replay-panel lv-replay-floating"[^>]*role="toolbar"/);
    expect(html).toContain('aria-label="Bar replay"');
  });
  it('transport controls are icon buttons with tooltips and no visible text', () => {
    const html = render();
    for (const [label, title] of [['Select bar', 'Select bar'], ['Step back', 'Step back (Shift+Left)'], ['Play', 'Play (Shift+Down)'], ['Forward', 'Forward (Shift+Right)'], ['Jump to real time', 'Jump to real time'], ['Close replay', 'Close replay']]) {
      expect(tag(html, label), label).toContain(`title="${title}"`);
      expect(inner(html, label), label).toMatch(/^<svg[^>]*data-lv-icon="replay-[a-z-]+"[^>]*>[\s\S]*<\/svg>$/);
    }
    expect(inner(render({ session: { ...active, playing: true } }), 'Pause')).toContain('data-lv-icon="replay-pause"');
  });
  it('the replay shortcuts are announced on their buttons; no other shortcut is claimed (adds Shift+Left)', () => {
    const html = render();
    expect(tag(html, 'Play')).toContain('aria-keyshortcuts="Shift+ArrowDown"'); expect(tag(html, 'Forward')).toContain('aria-keyshortcuts="Shift+ArrowRight"');
    expect(html.match(/aria-keyshortcuts=/g)).toHaveLength(3);
    expect(tag(html, 'Step back')).toContain('aria-keyshortcuts="Shift+ArrowLeft"');
  });
  it('Step back follows canStepBack and the active phase', () => {
    expect(tag(render(), 'Step back')).not.toContain('disabled');
    expect(tag(render({ canStepBack: false }), 'Step back')).toContain('disabled=""');
    expect(tag(render({ session: selecting }), 'Step back')).toContain('disabled=""');
  });
  it('speed is a menu button showing the current speed, not a native select', () => {
    const html = render({ session: { ...active, stepsPerSecond: 2 } });
    expect(html).not.toMatch(/<select[^>]*aria-label="Replay speed"/);
    expect(tag(html, 'Replay speed')).toContain('aria-haspopup="menu"'); expect(tag(html, 'Replay speed')).toContain('title="Replay speed (steps per second)"');
    expect(inner(html, 'Replay speed')).toContain('2x');
    expect(tag(render({ session: null, saved: null }), 'Replay speed')).toContain('disabled=""');
  });
  it('the start-point menu button sits next to Select bar and opens Select date, First available date and Random bar', () => {
    const html = render();
    expect(tag(html, 'Start point')).toContain('aria-haspopup="menu"'); expect(tag(html, 'Start point')).toContain('title="Choose where the replay starts"');
    expect(tag(render({ onStartPoint: undefined }), 'Start point')).toBe('');
    expect(tag(render({ unsupportedReason: 'Renko charts are not available in Bar Replay. Switch to a time-based chart type to replay.' }), 'Start point')).toContain('disabled=""');
  });
  it('the replay interval is a menu button like speed, showing the current choice, not a native select', () => {
    const html = render();
    expect(html).not.toContain('<select'); expect(html).not.toContain('<option');
    expect(tag(html, 'Replay interval')).toContain('aria-haspopup="menu"'); expect(tag(html, 'Replay interval')).toContain('title="Update interval"');
    expect(inner(html, 'Replay interval')).toBe('Auto (1D)');
    expect(inner(render({ session: { ...active, intervalChoice: '1D' } }), 'Replay interval')).toBe('1D');
    expect(tag(render({ session: null, saved: null }), 'Replay interval')).toContain('disabled=""');
  });
  it('the replay account is an unmistakable badge that opens replay trading', () => {
    const html = render({ account: { equity: '1,234.50', currency: 'USD' }, onTrading: noop });
    expect(tag(html, 'Replay account')).toContain('separate replay account'); expect(inner(html, 'Replay account')).toContain('Replay account');
    expect(inner(html, 'Replay account')).toContain('1,234.50 USD');
    expect(html).not.toContain('<span class="lv-replay-isolation">');
    // While the start bar is chosen the account button keeps its place (disabled, no equity), so picking the bar never moves Play.
    const choosing = render({ session: selecting, account: { equity: '1.00', currency: 'USD' }, onTrading: noop });
    expect(tag(choosing, 'Replay account')).toContain('disabled=""'); expect(inner(choosing, 'Replay account')).not.toContain('1.00 USD');
  });
});

describe(' bar menus', () => {
  it('the start-point list calls back with each kind; Select date shows a UTC date form', () => {
    const onStartPoint = vi.fn(), onDate = vi.fn(), tree = ReplayStartPointList({ onStartPoint, onDate });
    const items = walk(tree).filter(node => node.props.role === 'menuitem');
    expect(items.map(node => node.props.children)).toEqual(['Select date', 'First available date', 'Random bar']);
    items[0].props.onClick(); expect(onDate).toHaveBeenCalledOnce(); expect(onStartPoint).not.toHaveBeenCalled();
    items[1].props.onClick(); items[2].props.onClick();
    expect(onStartPoint.mock.calls).toEqual([[{ kind: 'first' }], [{ kind: 'random' }]]);
  });
  it('the date form converts a UTC date and time, and refuses an invalid entry with a message', () => {
    const onStartPoint = vi.fn();
    expect(replayDateSubmit('2024-01-05T12:00', onStartPoint)).toBeNull();
    expect(onStartPoint).toHaveBeenCalledWith({ kind: 'date', time: Date.UTC(2024, 0, 5, 12) / 1000 });
    expect(replayDateSubmit('2024-02-30T00:00', vi.fn())).toBe('That date or time does not exist.');
    expect(replayDateSubmit('', vi.fn())).toBe('Choose a valid UTC date and time.');
    const refused = replayDateSubmit('2024-01-05T12:00', () => { throw new Error('The chosen date is outside the loaded history.'); });
    expect(refused).toBe('The chosen date is outside the loaded history.');
  });
  it('the interval list: Auto first, unavailable entries aria-disabled with the reason as tooltip, labels without the reason', () => {
    const onInterval = vi.fn(), menu = props().intervalMenu;
    const items = walk(ReplayIntervalList({ menu, value: '1D', onInterval })).filter(node => node.props.role === 'menuitemradio');
    expect(items.map(node => node.props.children)).toEqual(['Auto (1D)', '1h', '1D']);
    expect(items.map(node => node.props['aria-disabled'])).toEqual([false, true, false]);
    expect(items.map(node => node.props['aria-checked'])).toEqual([false, false, true]);
    expect(items[1].props.title).toBe('Intraday steps need actual minute (or finer) data for every chart.'); expect(items[0].props.title).toBe('Auto uses the chart interval.');
    items[1].props.onClick(); expect(onInterval).not.toHaveBeenCalled();
    items[0].props.onClick(); items[2].props.onClick(); expect(onInterval.mock.calls).toEqual([['auto'], ['1D']]);
    const none = walk(ReplayIntervalList({ menu: { auto: { id: null, reason: 'No chart participates in replay.' }, options: [] }, value: 'auto', onInterval })).filter(node => node.props.role === 'menuitemradio');
    expect(none.map(node => [node.props.children, node.props['aria-disabled']])).toEqual([['Auto (unavailable)', true]]);
  });
  it('the speed list offers the speed catalog as radio items with the current one checked', () => {
    const onSpeed = vi.fn(), items = walk(ReplaySpeedList({ value: 3, onSpeed })).filter(node => node.props.role === 'menuitemradio');
    expect(items.map(node => node.props.children)).toEqual(REPLAY_SPEEDS_LV.map(speed => `${speed}x`));
    expect(items.map(node => node.props['aria-checked'])).toEqual(REPLAY_SPEEDS_LV.map(speed => speed === 3));
    items[items.length - 1].props.onClick(); expect(onSpeed).toHaveBeenCalledWith(10);
  });
});
