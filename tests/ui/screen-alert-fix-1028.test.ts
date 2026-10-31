// SYNTHETIC data only; clipboard and DOM ports are injected.
import { expect, it, vi } from 'vitest';
import { copyPlainText } from '../../src/ui/text-clipboard';
import { screenerUpdatedLabel } from '../../src/domain/screener-quick';
import { indicatorChoiceLabel } from '../../src/ui/technical-alert-catalog';
import { alertLabelLayout, tradeButtonObstacles, type AlertChartLineRow } from '../../src/ui/AlertChartLines';
import { sendAlertWebhookTest } from '../../src/domain/alert-delivery';
import { fixtureDataset } from '../../src/domain/fixtures';
import { setup } from '../helpers/alert-dialog-harness';

it('#1 screener symbol lists copy through the execCommand helper, past the price-sized cap when asked', async () => {
  const appended: unknown[] = [];
  const area = { value: '', setAttribute: vi.fn(), style: {}, select: vi.fn() } as unknown as HTMLTextAreaElement;
  const env = { document: { createElement: () => area, body: { appendChild: (n: unknown) => appended.push(n), removeChild: vi.fn() }, execCommand: vi.fn(() => true) }, navigator: { clipboard: { writeText: vi.fn(() => Promise.reject(new Error('Write permission denied.'))) } } };
  const long = Array.from({ length: 200 }, (_, i) => `XNAS:S${i}`).join(',');
  expect((await copyPlainText(long, env)).ok).toBe(false);
  const copied = await copyPlainText(long, env, 100_000);
  expect(copied.ok).toBe(true); expect(area.value).toBe(long); expect(env.navigator.clipboard.writeText).not.toHaveBeenCalled();
});

it('#18 the screener Updated time follows the chart timezone', () => {
  expect(screenerUpdatedLabel(1_700_000_000, 'en-US', 'UTC')).toBe('Updated 22:13:20');
  expect(screenerUpdatedLabel(1_700_000_000, 'en-US', 'America/New_York')).toBe('Updated 17:13:20');
  expect(screenerUpdatedLabel(1_700_000_000, 'en-US', 'Not/AZone')).toMatch(/^Updated \d\d:\d\d:\d\d$/);
});

it('#8 indicator alert sources read like the legend, without plot or transform ids', () => {
  const bars = fixtureDataset('GME', 120).bars, inputs = { length: 14, source: 'close', smoothingType: 'SMA', smoothingLength: 14 };
  expect(indicatorChoiceLabel('rsi', 'rsi', inputs, bars)).toBe('RSI');
  expect(indicatorChoiceLabel('rsi', 'smooth', inputs, bars)).toBe('RSI-based MA');
  expect(indicatorChoiceLabel('rsi', 'smooth', inputs, bars, { ordinal: 2 })).toBe('RSI 2: RSI-based MA');
  expect(indicatorChoiceLabel('macd', 'signal', {}, bars)).toMatch(/^MACD: /);
  expect(indicatorChoiceLabel('rsi', 'rsi', inputs, bars, { heikinAshi: true })).toBe('RSI (Heikin Ashi)');
  for (const label of [indicatorChoiceLabel('rsi', 'smooth', inputs, bars), indicatorChoiceLabel('sma', 'sma', {}, bars)]) expect(label).not.toMatch(/standard|\bsmooth\b|\//);
});

it('#9 Cancel in a create flow closes the dialog; Cancel from the manager Create tab returns to the manager', () => {
  const ui = setup();
  ui.props.createRequest = {}; ui.settle();
  ui.change('Alert name', 'SYNTHETIC typed'); ui.callButton('Cancel');
  expect(ui.props.onClose).toHaveBeenCalledTimes(1); expect(ui.publish).not.toHaveBeenCalled();
  const manager = setup(); manager.callButton('Create alert'); manager.callButton('Cancel');
  expect(manager.props.onClose).not.toHaveBeenCalled(); expect(manager.text()).toContain('Alert edit cancelled.');
});

it('#17 an alert chip on a line through the quick-trade buttons starts right of them, on its own line', () => {
  const projection = { left: 100, top: 50, width: 800, height: 400, priceToY: (price: number) => 50 + (300 - price), yToPrice: (y: number) => 300 - (y - 50) };
  const root = { querySelectorAll: () => [{ getBoundingClientRect: () => ({ left: 108, top: 80, right: 308, bottom: 116 }) }] };
  const avoid = tradeButtonObstacles(projection, root);
  expect(avoid).toEqual([{ left: 8, top: 30, right: 208, bottom: 66 }]);
  const row = (id: string, price: number): AlertChartLineRow => ({ alertId: id, name: 'SYNTHETIC', slot: 'level', price, label: `${price} SYNTHETIC alert` });
  const spots = alertLabelLayout([row('under', 255), row('clear', 100)], projection, null, [], avoid);
  // Chips now sit at the price-axis end, clear of the left-hand buttons.
  expect(spots.get('under:level')!.dx).toBe(0); expect(spots.get('under:level')!.center).toBe(45); expect(spots.get('under:level')!.side).toBe('right'); expect(spots.get('under:level')!.rect.right).toBe(800 - 64);
  expect(spots.get('clear:level')!.dx).toBe(0);
  expect(tradeButtonObstacles(projection, null)).toEqual([]);
});

it('#18 a failed webhook test ends with one period', async () => {
  const hook = 'http://127.0.0.1:9000/hook';
  expect((await sendAlertWebhookTest({ post: async () => ({ delivered: false, status: 0, error: 'The webhook could not be reached.' }) }, hook, 'x')).text).toBe('Test failed: The webhook could not be reached.');
  expect((await sendAlertWebhookTest({ post: async () => { throw new Error('Timed out..'); } }, hook, 'x')).text).toBe('Test failed: Timed out.');
});
