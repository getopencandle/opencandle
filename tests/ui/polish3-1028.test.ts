import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Adding a strategy reveals the docked tester; the DOM confirm bar overlays instead of shifting rows.
describe('POLISH3', () => {
  const app = readFileSync('src/ui/App.tsx', 'utf8'), dom = readFileSync('src/ui/PaperDom.tsx', 'utf8');
  it('addBuiltinStrategy opens the docked Strategy tester only when not already showing', () => {
    const body = app.slice(app.indexOf('function addBuiltinStrategy('));
    expect(body.slice(0, 1200)).toMatch(/if\(strategyDocked\)changeBottomPanel\(view=>view\.open&&view\.tab==='strategy'\?view:openBottomTab\(view,'strategy'\)\)/);
  });
  it('the confirm bar is absolutely positioned over the pane', () => {
    expect(dom).toMatch(/\.dom-confirm\{position:absolute;top:0/);
    expect(dom).toContain('.lv-paper-dom{display:flex;flex-direction:column;gap:6px;position:relative}');
    expect(dom).toContain('className="dom-menu dom-confirm"');
  });
});
