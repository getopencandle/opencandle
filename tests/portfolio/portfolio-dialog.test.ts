import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PortfolioDialog, fmtMoney, fmtPercent, formToInput } from '../../src/ui/PortfolioDialog';
import { activePortfolio, createPortfolioState } from '../../src/portfolio/portfolio';
import { DAY } from '../../src/portfolio/portfolio-performance';
import { D0, dataset, seeded } from './helpers';

const rows = [{ type: 'deposit', time: D0, amount: 1000 }, { type: 'buy', time: D0 + 3600, symbol: 'AAA', quantity: 10, price: 100 }, { type: 'deposit', time: D0 + 2 * DAY + 3600, amount: 1100 }];
const data = [dataset('AAA', [100, 110, 110, 121]), dataset('BMK', [50, 55, 55, 60.5], { assetClass: 'etf' })];
const render = (state: any, extra: any = {}) => renderToStaticMarkup(createElement(PortfolioDialog, { state, datasets: data, asOf: D0 + 3 * DAY, onChange: () => true, onClose: () => undefined, ...extra }));

describe('PortfolioDialog', () => {
  it('shows the empty state with a create action and no em dash', () => {
    const html = render(createPortfolioState());
    expect(html).toContain('No portfolio yet'); expect(html).toContain('Create portfolio'); expect(html).toContain('Virtual record keeping only');
    expect(html).not.toContain('—');
  });
  it('offers the virtual account import when paper accounts exist', () => {
    const html = render(createPortfolioState(), { paperAccounts: [{ id: 'a', name: 'Paper one' }] });
    expect(html).toContain('Import virtual account'); expect(html).toContain('Paper one');
  });
  it('renders the overview with values from the latest loaded close', () => {
    const { state } = seeded(rows), html = render(state);
    expect(html).toContain('Total value'); expect(html).toContain('$2,310.00'); expect(html).toContain('Main');
    expect(html).toContain('role="tablist"'); expect(html).not.toContain('—');
  });
  it('renders holdings, transactions and analytics tabs', () => {
    const { state } = seeded(rows);
    const holdings = render({ ...state, tab: 'holdings' });
    expect(holdings).toContain('AAA'); expect(holdings).toContain('$121.00'); expect(holdings).toContain('Show sold positions');
    const tx = render({ ...state, tab: 'transactions' });
    expect(tx).toContain('Deposit'); expect(tx).toContain('Buy'); expect(tx).toContain('2025-01-03'); expect(tx).toContain('Add transaction');
    const analytics = render({ ...state, tab: 'analytics' });
    expect(analytics).toContain('+15.50%'); expect(analytics).toContain('Time-weighted return'); expect(analytics).toContain('Allocation'); expect(analytics).toContain('role="img"');
    expect(analytics).toContain('Asset class'); expect(analytics).toContain('stock');
  });
  it('shows no price instead of zero when nothing is loaded', () => {
    const { state } = seeded(rows), html = render({ ...state, tab: 'holdings' }, { datasets: [] });
    expect(html).toContain('No price'); expect(html.match(/[$]0[.]00/g)).toHaveLength(1); // only the realized PnL cell, never a price or value
  });
  it('uses the LV Select, not a native select, for dropdowns', () => {
    const { state } = seeded(rows), html = render({ ...state, tab: 'analytics' });
    expect(html).not.toContain('<select'); expect(html).toContain('lv-select');
  });
  it('formats numbers and reads the add form', () => {
    expect(fmtMoney(null, 'USD')).toBe('Unavailable'); expect(fmtMoney(1234.5, 'USD')).toBe('$1,234.50'); expect(fmtPercent(15.5)).toBe('+15.50%'); expect(fmtPercent(-1)).toBe('-1.00%');
    const form = { type: 'buy' as const, date: '2026-01-31', symbol: 'aaa', quantity: '1,000', price: '2.5', amount: '', fee: '', note: '' };
    expect(formToInput(form)).toMatchObject({ ok: true, value: { quantity: 1000, price: 2.5, fee: undefined, time: Date.UTC(2026, 0, 31) / 1000 } });
    expect(formToInput({ ...form, date: '31/01/2026' })).toMatchObject({ ok: false });
    expect(formToInput({ ...form, price: 'abc' })).toMatchObject({ ok: false, error: 'Price must be a number.' });
    expect(activePortfolio(seeded([]).state)?.name).toBe('Main');
  });
});
