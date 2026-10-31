// One shared, plain display form for source revisions in the UI. Exports keep the exact value.
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { describeSourceRevision, parseCsv } from '../../src/domain/data';
import { alertObservationRevisionLabel, createAlertObservationSession, observeAlertSnapshot } from '../../src/domain/alert-observation';
import { aggregateInterval } from '../../src/domain/intervals';
import { ScreenerDialog } from '../../src/ui/ScreenerDialog';
import { createScreenerSettings } from '../../src/domain/screener-state';
import { fixtureDataset } from '../../src/domain/fixtures';
import type { BarDataset } from '../../src/domain/types';

const NOW = Date.UTC(2026, 9, 14, 10) / 1000, DAY = 86400, T0 = Date.UTC(2024, 0, 1) / 1000;
const csv = 'time,open,high,low,close,volume\n' + Array.from({ length: 5 }, (_, i) => [T0 + i * DAY, 10 + i, 12 + i, 9 + i, 11 + i, 100 + i].join(',')).join('\n') + '\n';
const local = (): BarDataset => parseCsv(csv, undefined, { resolution: '1D' }).dataset!;
const legacy = (): BarDataset => { const d = local(); return { ...d, provenance: { ...d.provenance, revision: '1' } }; };
const src = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

describe('DRR-3 source revision display', () => {
  it('formats the three tracked shapes and leaves anything else as a plain revision', () => {
    expect(describeSourceRevision('local-v1:73426a29eb39b367', 'local:X')).toBe('File version 73426a29');
    expect(describeSourceRevision('1', 'local:X')).toBe('Not tracked (imported before version tracking)');
    expect(describeSourceRevision('utc-v1:0123456789abcdef', 'lv-aggregate:x')).toBe('Derived version 01234567');
    expect(describeSourceRevision('1', 'lv-synthetic:GME')).toBe('Revision 1');
    expect(describeSourceRevision('1')).toBe('Revision 1');
    expect(describeSourceRevision('local-v1:short', 'local:X')).toBe('Revision local-v1:short');
    for (const value of ['local-v1:73426a29eb39b367', '1', 'utc-v1:0123456789abcdef']) expect(describeSourceRevision(value, 'local:X')).not.toMatch(/—|local-v1|utc-v1|local:/);
  });
  it('DRR-8: empty, missing or non-string values read as unknown; other values are capped at 24 characters', () => {
    for (const value of ['', undefined, null, 7, {}] as unknown[]) expect(describeSourceRevision(value as string, 'local:X')).toBe('Revision unknown');
    expect(describeSourceRevision('x'.repeat(24))).toBe(`Revision ${'x'.repeat(24)}`);
    expect(describeSourceRevision('y'.repeat(25))).toBe(`Revision ${'y'.repeat(24)}…`);
    expect(describeSourceRevision('local-v1:' + 'A'.repeat(16), 'local:X')).toBe(`Revision local-v1:${'A'.repeat(15)}…`);
  });
  it('derived interval datasets read as derived versions', () => {
    const result = aggregateInterval(local(), '1W');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(describeSourceRevision(result.dataset.provenance.revision, result.dataset.provenance.datasetId)).toMatch(/^Derived version [0-9a-f]{8}$/);
  });
  it('the screener source cell shows the friendly form, not the raw token', () => {
    const render = (dataset: BarDataset) => renderToStaticMarkup(React.createElement(ScreenerDialog, { datasets: [dataset], settings: createScreenerSettings(), onChange: () => {}, onSelect: () => ({ ok: true }), onClose: () => {} }));
    const current = local(), short = current.provenance.revision.slice(9, 17);
    const markup = render(current);
    expect(markup).toContain(`File version ${short}`); expect(markup).not.toContain('local-v1:');
    expect(render(legacy())).toContain('Not tracked (imported before version tracking)');
    expect(render(fixtureDataset('GME', 3))).toContain('Revision 1');
  });
  it('alert history labels use the observation source, for both binding versions', () => {
    for (const version of [1, 2] as const) {
      for (const [dataset, expected] of [[local(), /^File version [0-9a-f]{8}$/], [legacy(), /^Not tracked \(imported before version tracking\)$/]] as const) {
        const session = createAlertObservationSession(dataset, { sessionId: `s${version}`, mode: 'ordinary', startedAt: NOW - 10, version, chartId: version === 2 ? 'c1' : undefined });
        const sample = version === 2 ? { value: dataset.bars.at(-1)!.close, source: session.binding.source, informationBars: dataset.bars.length, informationEndIndex: dataset.bars.length - 1, informationEndTime: dataset.bars.at(-1)!.time, operands: { left: { value: dataset.bars.at(-1)!.close, unit: 'price', basis: 'close', label: 'Close' } }, informationStartTime: dataset.bars[0].time } : undefined;
        const observation = observeAlertSnapshot(session, { dataset, observedAt: NOW, sample }).event?.observation;
        expect(observation, `version ${version}`).toBeDefined();
        expect(alertObservationRevisionLabel(observation!)).toMatch(expected);
      }
    }
    const fixture = fixtureDataset('GME', 3);
    const observation = observeAlertSnapshot(createAlertObservationSession(fixture, { sessionId: 'f', mode: 'ordinary', startedAt: NOW - 10 }), { dataset: fixture, observedAt: NOW }).event!.observation!;
    expect(alertObservationRevisionLabel(observation)).toBe('Revision 1');
    expect(alertObservationRevisionLabel({ ...observation, binding: { ...observation.binding, datasetKey: 'not json' } })).toBe('Revision 1');
  });
  it('UI sites use the shared formatter; exports keep the exact value', () => {
    const alertDialog = src('src/ui/AlertDialog.tsx'), screener = src('src/ui/ScreenerDialog.tsx');
    expect(alertDialog).not.toContain('alertObservationRevisionLabel(item.observation)'); expect(alertDialog).not.toContain('Revision: {item.observation.sourceRevision}'); // History shows time, alert, value and message; the internal data revision stays in the CSV export only.
    expect(screener).toContain('describeSourceRevision(dataset.provenance.revision, dataset.provenance.datasetId)'); expect(screener).not.toContain('Revision {dataset.provenance.revision}');
    expect(src('src/domain/alert-history-export.ts')).toContain("source?.sourceRevision ?? ''");
    // extracted the unchanged 20-column source metadata into the shared CSV preflight helper; keep the exact revision/fixture assertion on its actual implementation.
    expect(src('src/chart/chart-csv-source.ts')).toContain('source.revision,source.fixture');
    expect(src('src/domain/screener-state.ts')).toContain('dataset.provenance.coverage, dataset.provenance.revision, dataset.resolution');
  });
});
