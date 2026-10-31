// Bar Replay panel markup through react-dom/server (static markup, not interface evidence).
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ReplayIntervalList, ReplayPanel, ReplayScissors, replayClockText, replayIntervalLabel, type ReplayPanelProps } from '../../src/ui/ReplayPanel';
import { openReplay, selectReplayStart } from '../../src/domain/replay-session';
import { fixtureDataset } from '../../src/domain/fixtures';

const chart = fixtureDataset('PANEL', 30);
const participant = { cellId: 'c1', instrumentId: chart.instrument.id, symbol: 'PANEL', interval: '1D', chartType: 'candles', datasetId: chart.provenance.datasetId, revision: '1' };
const selecting = openReplay({ participants: [participant], activeCellId: 'c1', sessionId: 'ui' });
const active = selectReplayStart(selecting, chart, chart.bars[9].time, '1D');
const noop = () => {};
function props0(extra: Partial<ReplayPanelProps> = {}): ReplayPanelProps {
  return { session: active, saved: null, intervalMenu: { auto: { id: '1D', reason: 'Auto uses the chart interval.' }, options: [{ id: '1h', label: '1h', family: 'intraday', available: false, reason: 'Intraday steps need actual minute (or finer) data for every chart.' }, { id: '1D', label: '1D', family: 'daily', available: true, reason: null }] }, multiChart: true, atEnd: false, unsupportedReason: null, clockLabel: '2024-01-15', onSelectStart: noop, onTogglePlay: noop, onStep: noop, onSpeed: noop, onInterval: noop, onScope: noop, onRealtime: noop, onClose: noop, onContinue: noop, ...extra };
}
function render(extra: Partial<ReplayPanelProps>) { return renderToStaticMarkup(React.createElement(ReplayPanel, props0(extra))); }

describe('RPST Bar Replay panel', () => {
  it('active session: select bar, play, forward, speed, interval menu with Auto and disabled reasons, scope, jump to real time, close', () => {
    const html = render({});
    expect(html).toContain('role="toolbar"'); expect(html).toContain('aria-label="Bar replay"');
    for (const label of ['Select bar', 'Play', 'Forward', 'Replay speed', 'Replay interval', 'Jump to real time', 'Close replay']) expect(html).toContain(`aria-label="${label}"`);
    expect(html).toContain('Auto (1D)');
    // The interval control is a menu; 1h stays listed but disabled, with its reason as the item tooltip.
    const menu = renderToStaticMarkup(React.createElement(ReplayIntervalList, { menu: props0().intervalMenu, value: 'auto', onInterval: noop }));
    expect(menu).toContain('Auto (1D)'); expect(menu).toMatch(/<button[^>]*role="menuitemradio"[^>]*aria-disabled="true"[^>]*title="Intraday steps need actual minute[^"]*"[^>]*data-interval="1h"[^>]*>1h<\/button>/);
    expect(html).toContain('Current chart'); expect(html).toContain('All charts');
    // The panel shows the last revealed bar's date itself (crosshair format, chart timezone, no timezone id).
    expect(html).toContain(`data-replay-clock="date">${replayClockText(active.clock!, 'UTC', '1D').replace(/'/g, '&#x27;')}<`); expect(html).not.toMatch(/\((?:UTC|America\/[A-Za-z_]+)\)/); expect(html).toContain('separate replay account');
    expect(html).not.toMatch(/—/);
  });
  it('selecting-start shows the scissors hint and disables playback controls', () => {
    const html = render({ session: selecting });
    expect(html).toContain('Click a bar to start'); expect(html).toMatch(/aria-label="Play"[^>]*disabled=""|disabled=""[^>]*aria-label="Play"/);
  });
  it('playing shows Pause; at the end of history Play and Forward are disabled', () => {
    expect(render({ session: { ...active, playing: true } })).toContain('aria-label="Pause"');
    const end = render({ atEnd: true }); expect(end).toMatch(/aria-label="Forward"[^>]*disabled=""|disabled=""[^>]*aria-label="Forward"/);
  });
  it('no session: Continue session appears only with a remembered session; unsupported charts show the refusal', () => {
    const saved = { schemaVersion: 1 as const, sessionId: 'ui', scope: 'current' as const, activeCellId: 'c1', participants: [{ cellId: 'c1', instrumentId: chart.instrument.id, symbol: 'PANEL', interval: '1D', datasetId: chart.provenance.datasetId, revision: '1' }], intervalChoice: 'auto', clock: chart.bars[9].time + 86400, stepsPerSecond: 1, savedAt: 1 };
    expect(render({ session: null, saved })).toContain('Continue session');
    expect(render({ session: null, saved: null })).not.toContain('Continue session');
    const refused = render({ session: null, unsupportedReason: 'Renko charts are not available in Bar Replay. Switch to a time-based chart type to replay.' });
    expect(refused).toContain('role="alert"'); expect(refused).toContain('Renko charts are not available');
  });
  it('single chart layouts hide the scope switch; the scissors overlay marks the candidate', () => {
    expect(render({ multiChart: false })).not.toContain('All charts');
    const line = renderToStaticMarkup(React.createElement(ReplayScissors, { x: 120, valid: true, label: '2024-01-15' }));
    expect(line).toContain('lv-replay-scissors'); expect(line).toContain('left:120px'); expect(line).toContain('2024-01-15');
    expect(renderToStaticMarkup(React.createElement(ReplayScissors, { x: 5, valid: false, label: 'Choose a bar inside the loaded history.' }))).toContain('invalid');
  });
  it('FIX-RI7: one reserved layout from start selection to play, a date that follows the clock, toolbar interval names, no jargon', () => {
    const choosing = render({ session: selecting, liveNote: 'note' }), playing = render({ liveNote: 'note' });
    const controls = (html: string) => [...html.matchAll(/aria-label="([^"]+)"/g)].map(match => match[1]).filter(label => label !== 'Play' && label !== 'Pause');
    expect(controls(choosing)).toEqual(controls(playing));
    expect(choosing).toContain('data-replay-clock="hint"'); expect(playing).toContain('data-replay-clock="date"');
    for (const html of [choosing, playing]) { expect(html).not.toContain('Frozen live history'); expect(html).not.toContain('America/'); }
    const next = { ...active, clock: active.clock! + 86400 };
    expect(render({ session: next })).toContain(replayClockText(next.clock, 'UTC', '1D').replace(/'/g, '&#x27;'));
    expect(replayClockText(active.clock!, 'UTC', '1D')).not.toBe(replayClockText(next.clock, 'UTC', '1D'));
    // A 4h bar reads its open time: the 08:00 bar closes at 12:00 and shows 08:00.
    expect(replayClockText(Date.UTC(2026, 9, 15, 12) / 1000, 'UTC', '240m')).toContain('08:00');
    const menu = { auto: { id: '240m', reason: 'Auto uses the chart interval.' }, options: [{ id: '240m', label: '240m', family: 'intraday' as const, available: true, reason: null }] };
    expect(replayIntervalLabel(menu, 'auto')).toBe('Auto (4h)'); expect(replayIntervalLabel(menu, '240m')).toBe('4h');
  });
});
