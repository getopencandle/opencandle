import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

// (1028 audit) pinned the live-data refusal on every chart image path.
// approved 2026-10-29: live chart screenshots allowed for personal use. Image save and copy no longer refuse live
// (`live:` / `fred:`) charts. Owner decision 2026-10-31: the data exports (source CSV) allow them too, with the terms line.
const app = readFileSync('src/ui/App.tsx', 'utf8');
const copy = readFileSync('src/ui/chart-image-copy.ts', 'utf8');
// The former refusal line, which no export path may carry any more.
const GATE = 'if(isLiveDatasetId(snapshot.input.source.datasetId))throw new Error(';

function branch(action: string): string {
  const start = app.indexOf(`if(action==='${action}'){`);
  expect(start, action).toBeGreaterThan(-1);
  const end = app.indexOf('\n   }', start);
  expect(end, action).toBeGreaterThan(start);
  return app.slice(start, end);
}

describe(' (images lifted 2026-10-29)', () => {
  it('approved 2026-10-29: live chart screenshots allowed for personal use (chart menu Save chart image)', () => {
    const save = branch('png-save');
    expect(save).not.toContain(GATE);
    expect(save).toContain('exportChartImage(');
    expect(save).toContain('window.lv.exportChart(');
  });
  it('approved 2026-10-29: live chart screenshots allowed for personal use (toolbar Download, Copy, snapshot menu)', () => {
    const exportImage = app.slice(app.indexOf('async function exportImage(){'), app.indexOf('chart.exportChartImage(', app.indexOf('async function exportImage(){')));
    expect(exportImage).not.toContain('isLiveDatasetId(');
    expect(copy).not.toContain('isLiveDatasetId(');
    expect(app).not.toMatch(/<SnapshotMenu[^>]*blocked=/);
  });
  it('the data exports allow live and FRED sources and state the provider terms after saving', () => {
    const csv = branch('source-csv');
    expect(csv).not.toContain(GATE);
    expect(csv).toContain("chartCsvSavedMessage('Selected chart source bars exported locally',snapshot.input.source,captured)");
    expect(branch('indicators-xlsx')).toContain('notes=[...(termsLabel!==null?[personalUseNote(termsLabel)]:[]),');
    const bars = app.slice(app.indexOf('async function exportBars(){'), app.indexOf('const state=current.current', app.indexOf('async function exportBars(){')));
    expect(bars).not.toContain('isLiveDatasetId(');
    expect(app).toContain("chartCsvSavedMessage('Chart data saved',input.source,captured)");
    expect(app).not.toMatch(/exportNoticeFor|EXPORT_NOTICE/);
  });
});
