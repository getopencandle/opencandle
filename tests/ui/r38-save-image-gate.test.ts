import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

// (1028 audit) pinned the live-data refusal on every chart image path.
// approved 2026-10-29: live chart screenshots allowed for personal use. Image save and copy no longer refuse live
// (`live:` / `fred:`) charts; the data exports (source CSV) keep the refusal.
const app = readFileSync('src/ui/App.tsx', 'utf8');
const copy = readFileSync('src/ui/chart-image-copy.ts', 'utf8');
// The refusal names FRED data when the source is a FRED series (exportNoticeFor).
const GATE = 'if(isLiveDatasetId(snapshot.input.source.datasetId))throw new Error(exportNoticeFor(snapshot.input.source.datasetId));';

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
  it('the data export keeps the live-data refusal', () => {
    expect(branch('source-csv')).toContain(GATE);
  });
});
