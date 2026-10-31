import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const app = readFileSync('src/ui/App.tsx', 'utf8');
describe('App wiring for lanes E, F, G and C2 (source level)', () => {
  it('lane F: other symbols are fed from background 1m series', () => {
    expect(app).toContain('paperBackgroundInputs(');
    expect(app).toContain('feedPaperSymbols(');
  });
  it('lane E: order ticket dialog, chart quantity box, exit drag handlers', () => {
    expect(app).toContain("dialog==='order'");
    expect(app).toContain('onQuantity={setChartQty}');
    expect(app).toContain('onModifyExit=');
    expect(app).toContain('onAttachExit=');
  });
  it('lane G: docked Alerts panel, background feeds, alert lines, Edit deep link', () => {
    expect(app).toContain('<AlertsDock');
    expect(app).toContain('<BackgroundAlertFeeds');
    expect(app).toContain('<AlertChartLines');
    expect(app).toContain('onEdit={openAlertEdit}');
    expect(app).not.toContain("onSelect:()=>setDialog('alerts')");
  });
  it('lane C2: template and visibility context handlers exist', () => {
    expect(app).toContain("'drawing-template':contextHandler('drawing-template')");
    expect(app).toContain("'drawing-visibility':contextHandler('drawing-visibility')");
  });
});
