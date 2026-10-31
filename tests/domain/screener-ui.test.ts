import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { ScreenerDialog } from '../../src/ui/ScreenerDialog';
import { requestHeatmapSourceOpen } from '../../src/ui/HeatmapDialog';
import { applyScreenerImportPreview, captureScreenerImportPreview, createScreenerSettings, exportScreenerScreens, renameScreenerScreen, screenerDatasetKey } from '../../src/domain/screener-state';
import { fixtureDataset } from '../../src/domain/fixtures';
import { calculateHeatmap, createHeatmapState } from '../../src/domain/heatmap';

describe('screener static rendering and import/source controllers, not executable GUI evidence', () => {
  it('keeps empty results distinct from a disappeared exact source', () => {
    const settings = createScreenerSettings(), dataset = fixtureDataset('ARBITRARY', 3);
    settings.universe.sourceChoices[dataset.instrument.id] = screenerDatasetKey(dataset);
    const markup = renderToStaticMarkup(React.createElement(ScreenerDialog, { datasets: [], settings, onChange: () => {}, onSelect: () => ({ ok: false }), onClose: () => {} }));
    expect(markup).toContain('1 without;'); /* Reworded empty state (names the loaded symbols and where to resolve). */ expect(markup).toContain('No confirmed matches in the loaded symbols. Some symbols have no data source yet; Source universe lists them.');
    /* The Data help drops the "final supplied snapshots" jargon. */expect(markup).toContain('Changes compare consecutive bars at each selected interval.'); expect(markup).not.toContain('completed bars');
    expect(markup).toContain('Source universe'); expect(markup).toContain('aria-label="More filter actions"'); expect(markup).not.toContain('Reset all filters'); expect(markup).toContain('role="tooltip"'); expect(markup).toContain('aria-describedby=');
  });
  it('shows provenance even if the only chosen metric is unavailable and does not render imported HTML', () => {
    const settings = createScreenerSettings(), dataset = fixtureDataset('ARBITRARY', 3);
    dataset.provenance.state = 'disconnected'; dataset.provenance.providerId = '<script>secret()</script>';
    // Provider/dataset ids are no longer shown; the Provider line is now
    // "Demo data" or the supplied provider name. So the hostile id must not appear at all, and the escaping check moves to the
    // provider name of a supplied (non-demo) source, which is what that line now renders.
    dataset.provenance.fixture = false; dataset.provenance.providerName = '<script>name()</script>';
    settings.columns = [{ id: 'unknown', metric: 'unprovided-fundamental', label: '<img src=x>' }]; settings.sort = { columnId: 'unknown', direction: 'asc' };
    const markup = renderToStaticMarkup(React.createElement(ScreenerDialog, { datasets: [dataset], settings, onChange: () => {}, onSelect: () => ({ ok: true }), onClose: () => {} }));
    expect(markup).toContain('disconnected'); expect(markup).toContain('SYNTHETIC'); expect(markup).toContain('&lt;script&gt;'); expect(markup).toContain('&lt;img src=x&gt;'); expect(markup).toContain('(unavailable)');
    expect(markup).toContain('&lt;script&gt;name()&lt;/script&gt;'); expect(markup).not.toContain('secret()');
    expect(markup).not.toContain('<script>'); expect(markup).not.toContain('<img src=x>');
  });
  it('does not crash rendering an invalid final timestamp before its diagnostic is shown', () => {
    const dataset = fixtureDataset('ARBITRARY', 3); dataset.bars[2].time = 1e300;
    const markup = renderToStaticMarkup(React.createElement(ScreenerDialog, { datasets: [dataset], settings: createScreenerSettings(), onChange: () => {}, onSelect: () => ({ ok: true }), onClose: () => {} }));
    expect(markup).toContain('Row time unavailable'); expect(markup).toContain('(invalid)');
  });
  it('rejects applying a preview to edited text or a changed library without mutating either', () => {
    const settings = createScreenerSettings(), text = exportScreenerScreens(settings, 'current'), preview = captureScreenerImportPreview(text, settings), before = JSON.stringify(settings);
    expect(() => applyScreenerImportPreview(settings, preview, text + ' ', 1800000000, () => 'new')).toThrow('changed after preview');
    const renamed = renameScreenerScreen(settings, settings.activeScreenId!, 1, 'Renamed', 1800000000);
    expect(() => applyScreenerImportPreview(renamed, preview, text, 1800000001, () => 'new')).toThrow('changed after preview');
    const applied = applyScreenerImportPreview(settings, preview, text, 1800000000, () => 'new');
    expect(applied.screens).toHaveLength(2); expect(applied.screens[1].id).toBe('new'); expect(JSON.stringify(settings)).toBe(before);
  });
  it('opens exactly the heatmap tile source only after a successful chart acknowledgement', () => {
    const dataset = fixtureDataset('ARBITRARY', 3), item = calculateHeatmap([dataset], createHeatmapState().settings).items[0], select = vi.fn(() => ({ ok: true }));
    expect(requestHeatmapSourceOpen(item, [dataset], select)).toEqual({ ok: true }); expect(select).toHaveBeenCalledWith(dataset);
    expect(requestHeatmapSourceOpen(item, [dataset], () => ({ ok: false, error: 'Linked chart source is missing.' }))).toEqual({ ok: false, error: 'Linked chart source is missing.' });
    expect(requestHeatmapSourceOpen(item, [dataset], () => {})).toMatchObject({ ok: false });
    expect(requestHeatmapSourceOpen(item, [dataset], () => { throw new Error('transaction rejected'); })).toEqual({ ok: false, error: 'transaction rejected' });
    select.mockClear(); expect(requestHeatmapSourceOpen(item, [], select).ok).toBe(false); expect(select).not.toHaveBeenCalled();
    expect(requestHeatmapSourceOpen(item, [dataset, structuredClone(dataset)], select).ok).toBe(false); expect(select).not.toHaveBeenCalled();
    const exchange = structuredClone(dataset); exchange.instrument.exchange = 'OTHER';
    const revision = structuredClone(dataset); revision.provenance.revision += '-correction';
    const session = structuredClone(dataset); session.provenance.session = 'extended';
    for (const changed of [exchange, revision, session]) expect(requestHeatmapSourceOpen(item, [changed], select).ok).toBe(false);
    expect(select).not.toHaveBeenCalled();
  });
});
