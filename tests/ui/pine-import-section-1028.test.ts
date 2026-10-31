import { describe, expect, it } from 'vitest';
import React from 'react';
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { PineImportSection, openPineImport } from '../../src/ui/PineImportSection';
import { createScriptLibrary, selectedScript } from '../../src/ui/script-library';
import { initialScript } from '../../src/ui/ScriptPanel';
import { importPineScript } from '../../src/domain/pine-import';

// The script editor's "Import Pine script" section and the action that opens a translation as a new local
// LVScript document. SYNTHETIC Pine text written for this test only.
describe('PINE-IMPORT1 script editor entry point', () => {
  it('renders the paste box, the translate action and no report before translating', () => {
    const html = renderToStaticMarkup(React.createElement(PineImportSection, { onOpen: () => undefined }));
    expect(html).toContain('<summary>Import Pine script</summary>');
    expect(html).toContain('aria-label="Pine script source"');
    expect(html).toContain('Translate Pine script');
    expect(html).not.toContain('Open as new LVScript script');
    expect(html).not.toMatch(/—/);
  });
  it('opens a translated indicator or strategy as a new selected, unsaved local document', () => {
    const library = createScriptLibrary(initialScript);
    const indicator = importPineScript('//@version=5\nindicator("Pine RSI")\nplot(ta.rsi(close, 14), "RSI")');
    const next = openPineImport(library, indicator, () => 'pine-import-doc-1');
    const doc = selectedScript(next);
    expect(doc).toMatchObject({ id: 'pine-import-doc-1', name: 'Pine RSI', kind: 'indicator', pane: 'new', source: indicator.source, history: [] });
    expect(next.documents.length).toBe(library.documents.length + 1);
    const strategy = importPineScript('//@version=5\nstrategy("Pine strat", overlay=true)\nif close > open\n    strategy.entry("L", strategy.long)');
    expect(selectedScript(openPineImport(next, strategy, () => 'pine-import-doc-2'))).toMatchObject({ kind: 'strategy', pane: 'price' });
  });
  it('refuses a failed translation instead of adding an empty document', () => {
    const failed = importPineScript('//@version=5\nlibrary("Lib")');
    expect(() => openPineImport(createScriptLibrary(initialScript), failed, () => 'x')).toThrow(/could not be translated/);
  });
  it('is wired into the script editor next to the local import and export controls', () => {
    const panel = readFileSync('src/ui/ScriptLibraryPanel.tsx', 'utf8');
    expect(panel).toContain("import {PineImportSection,openPineImport} from './PineImportSection';");
    expect(panel).toMatch(/Import pasted scripts<\/button><\/details><PineImportSection disabled=\{busy\} onOpen=\{result=>act\(\(\)=>\{const next=openPineImport\(flush\(\),result/);
  });
});
