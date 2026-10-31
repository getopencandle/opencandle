import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { HeatmapDialog } from '../../src/ui/HeatmapDialog';
import { createHeatmapState } from '../../src/domain/heatmap';
import { fixtureDataset } from '../../src/domain/fixtures';

describe('heatmap static markup only, not executable UI evidence', () => {
  it('renders no market tiles when the supplied universe is empty', () => {
    const markup = renderToStaticMarkup(React.createElement(HeatmapDialog, { datasets: [], state: createHeatmapState(), onChange: () => {}, onSelect: () => {}, onClose: () => {} }));
    expect(markup).toContain('No symbols match'); expect(markup).toContain('aria-label="Heatmap size"'); expect(markup).toContain('>Apply</button>'); expect(markup).toContain('>Cancel</button>');
  });
  it('labels actual supplied fixture tiles and exposes source selection when IDs overlap', () => {
    const first = fixtureDataset('ARBITRARY', 3), second = structuredClone(first); second.provenance.providerId = 'another';
    const markup = renderToStaticMarkup(React.createElement(HeatmapDialog, { datasets: [first, second], state: createHeatmapState(), onChange: () => {}, onSelect: () => {}, onClose: () => {} }));
    expect(markup).toContain('Ambiguous datasets'); expect(markup).toContain('Heatmap source for SYNTHETIC:ARBITRARY');
    const one = renderToStaticMarkup(React.createElement(HeatmapDialog, { datasets: [first], state: createHeatmapState(), onChange: () => {}, onSelect: () => {}, onClose: () => {} }));
    expect(one).toContain('ARBITRARY'); expect(one).toContain('Demo'); expect(one).not.toContain('—');
  });
  it('does not describe final loaded prices as information available at the selected historical moment', () => {
    const state = createHeatmapState(); state.settings.knowledgeCutoff = 0;
    const markup = renderToStaticMarkup(React.createElement(HeatmapDialog, { datasets: [], state, onChange: () => {}, onSelect: () => {}, onClose: () => {} }));
    expect(markup).toContain('Heatmap event-time cutoff'); expect(markup).toContain('final loaded bars'); expect(markup).toContain('historical moment is unverified'); expect(markup).not.toContain('Known by Unix second');
  });
});
