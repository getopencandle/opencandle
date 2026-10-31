import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { IntervalDialog } from '../../src/ui/IntervalDialog';
import { createIntervalMenuState } from '../../src/domain/intervals';
import { fixtureDataset } from '../../src/domain/fixtures';

describe('interval static markup only, not desktop interaction evidence', () => {
  it('renders documented preset leaves, accessible custom/favorite/source controls and a clearly synthetic exact preview', () => {
    const current = fixtureDataset('GME', 10), state = createIntervalMenuState(), before = JSON.stringify(state); let calls = 0;
    const markup = renderToStaticMarkup(React.createElement(IntervalDialog, { current, datasets: [current], state, onApply: () => { calls++; }, onClose: () => {} }));
    expect(markup).toContain('Exact supplied data'); expect(markup).toContain('SYNTHETIC DEMO'); expect(markup).toContain('aria-label="Custom interval"'); expect(markup).toContain('aria-label="Favorite 1D"'); expect(markup).toContain('aria-label="Interval source"'); expect(markup).toContain('Loaded bars only'); expect(markup).toContain('Cancel'); expect(markup).toContain('Apply');
    expect(calls).toBe(0); expect(JSON.stringify(state)).toBe(before);
  });
  it('shows an explicit source request when a coarser interval is requested without consent to an original source', () => {
    const current = fixtureDataset('SPY', 10);
    const markup = renderToStaticMarkup(React.createElement(IntervalDialog, { current, datasets: [current], state: createIntervalMenuState(), initialTarget: '1W', onApply: () => {}, onClose: () => {} }));
    expect(markup).toContain('No exact interval source is loaded'); expect(markup).toContain('explicit UTC aggregation policy'); expect(markup).toContain('disabled="">Apply');
  });
  it('keeps unavailable resolution and mixed known/unknown source labels visible without a render exception', () => {
    const current = fixtureDataset('GME', 10), unknown = { ...fixtureDataset('GME', 10), resolution: 'user-supplied', provenance: { ...current.provenance, datasetId: 'unknown-resolution' } };
    expect(() => renderToStaticMarkup(React.createElement(IntervalDialog, { current, datasets: [current, unknown], state: createIntervalMenuState(), onApply: () => {}, onClose: () => {} }))).not.toThrow();
    const markup = renderToStaticMarkup(React.createElement(IntervalDialog, { current: unknown, datasets: [unknown], state: createIntervalMenuState(), onApply: () => {}, onClose: () => {} }));
    expect(markup).toContain('Requested interval:'); expect(markup).toContain('user-supplied'); expect(markup).toContain('role="alert"');
  });
});
