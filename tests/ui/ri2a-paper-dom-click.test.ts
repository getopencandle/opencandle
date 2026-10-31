import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// The ladder cell buttons fill the row, so a normal click on a row reaches the handler.
describe('DOM ladder cell buttons', () => {
  const dom = readFileSync('src/ui/PaperDom.tsx', 'utf8'), dock = readFileSync('src/ui/PaperTradingDock.tsx', 'utf8');
  it('are not collapsed to a 2 px strip', () => {
    expect(dom).toMatch(/table td button\{[^}]*height:100%;min-height:17px;line-height:17px/);
    expect(dom).toContain('display:inline-block');
  });
  it('keep drag-to-move and wheel scrolling', () => {
    expect(dom).toContain('draggable: true');
    expect(dom).toContain('onWheel={wheel}');
  });
  it('inline Modify focuses its first field and Side cells share one style', () => {
    expect(dock).toContain('aria-label="Modify quantity" autoFocus');
    expect(dock).toContain('lv-paper-side ${cell');
    expect(dock).toContain("'is-sell'");
  });
});
