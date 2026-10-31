import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

// ROOT section: src/ui/App.tsx passes the chart timezone to the Paper trading dialog too.
describe('ROOT: App passes the chart timezone to the Paper trading dialog', () => {
  const app = readFileSync('src/ui/App.tsx', 'utf8');
  it('as plain string props on the PaperPanel element', () => {
    const at = app.indexOf('<PaperPanel ');
    expect(at).toBeGreaterThan(0);
    expect(app.slice(at, app.indexOf('/>', at))).toContain('timezone={shownTimeZone} timeHours={shownTimeHours}');
  });
});
