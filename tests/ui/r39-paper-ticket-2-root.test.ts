import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

// ROOT section: src/ui/App.tsx passes the chart timezone to the paper dock and the Buy/Sell ticket.
describe('ROOT: App passes the chart timezone to the dock and the ticket', () => {
  const app = readFileSync('src/ui/App.tsx', 'utf8');
  it('as plain string props, so the element reuse cache rebuilds on a zone change', () => {
    const dockAt = app.indexOf('<PaperTradingDock '), ticketAt = app.indexOf('<PaperOrderTicket ');
    expect(app.slice(dockAt, app.indexOf('/>', dockAt))).toContain('timezone={shownTimeZone} timeHours={shownTimeHours}');
    expect(app.slice(ticketAt, app.indexOf('/>', ticketAt))).toContain('timezone={shownTimeZone} timeHours={shownTimeHours}');
  });
});
