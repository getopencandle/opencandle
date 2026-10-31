import React from 'react';
import type { ReportValue, StrategyReportSide } from '../domain/strategy-report';
import { STRATEGY_EVERY_TICK_POLICIES, STRATEGY_MAGNIFIER_POLICY_PREFIX, type StrategyConfig } from '../domain/strategy';
import type { StrategyReportSummary } from './types';

/**
 * The Performance Summary as one table with All, Long and Short columns, each amount beside its percent
 * form, in the row order of the reference Performance Summary (row names are LV wording). Every number is a value
 * the report worker already computed; nothing is recalculated here. A value a direction does not have reads "Unavailable".
 */
export const PERFORMANCE_SUMMARY_ROWS: readonly (readonly [label: string, amount: string, percent: string | null])[] = Object.freeze([
  ['Net profit (closed)', 'closedNet', 'closedReturn'], ['Gross profit', 'grossProfit', 'grossProfitPercent'], ['Gross loss', 'grossLoss', 'grossLossPercent'],
  ['Max run-up (close)', 'maxRunup', 'maxRunupPercent'], ['Max drawdown (close)', 'maxDrawdown', 'maxDrawdownPercent'], ['Buy and hold return', 'buyHoldPnl', 'buyHoldPercent'],
  ['Sharpe ratio (monthly)', 'sharpe', null], ['Sortino ratio (monthly)', 'sortino', null], ['Profit factor', 'profitFactor', null], ['Max units held', 'maxContracts', null],
  ['Open PnL', 'openNet', 'openNetPercent'], ['Commission paid', 'commission', null], ['Total closed trades', 'closedTrades', null], ['Total open trades', 'openTrades', null],
  ['Winning trades', 'winners', null], ['Losing trades', 'losers', null], ['Percent profitable', 'profitablePercent', null],
  ['Average trade', 'averagePnl', 'averagePnlPercent'], ['Average winning trade', 'averageProfit', 'averageProfitPercent'], ['Average losing trade', 'averageLoss', 'averageLossPercent'],
  ['Ratio average win / average loss', 'averageWinLoss', null], ['Largest winning trade', 'largestProfit', 'largestProfitPercent'], ['Largest losing trade', 'largestLoss', 'largestLossPercent'],
  ['Average bars in trades', 'averageBars', null], ['Average bars in winning trades', 'averageWinnerBars', null], ['Average bars in losing trades', 'averageLoserBars', null],
  ['Margin calls', 'marginCalls', null],
]);
const SIDES: readonly StrategyReportSide[] = ['all', 'long', 'short'];
const SIDE_LABELS: Record<StrategyReportSide, string> = { all: 'All', long: 'Long', short: 'Short' };
const number = (value: number, digits: number, fixed = false) => value.toLocaleString('en-US', { maximumFractionDigits: digits, ...(fixed ? { minimumFractionDigits: digits } : {}) }).replace(/^-(?=[0.,]*$)/, '');
/** One cell: the amount (with the currency when it is money) and, when the row has one, its percent form. */
export function performanceCell(amount: ReportValue | undefined, percent: ReportValue | undefined, currency: string | null): string {
  if (!amount || amount.value === null) return 'Unavailable';
  const unit = amount.unit === 'currency' ? currency ? ' ' + currency : '' : amount.unit === 'percent' ? '%' : '';
  const digits = amount.unit === 'count' ? 0 : amount.unit === 'ratio' ? 3 : 2;
  // Money and percents keep two decimals ("15.27 USD (0.00%)", not "(0%)").
  const main = number(amount.value, digits, amount.unit === 'currency' || amount.unit === 'percent') + unit;
  return percent && percent.value !== null ? `${main} (${number(percent.value, 2, true)}%)` : main;
}
export function PerformanceSummary({ summary }: { summary: StrategyReportSummary }) {
  const currency = summary.context.currency;
  return <table className="data-table" aria-label="Performance summary"><thead><tr><th>Performance summary</th>{SIDES.map(side => <th key={side}>{SIDE_LABELS[side]}</th>)}</tr></thead>
    <tbody>{PERFORMANCE_SUMMARY_ROWS.map(([label, amount, percent]) => <tr key={amount}><td>{label}</td>{SIDES.map(side => {
      const metrics = summary.metrics[side], value = metrics[amount] as ReportValue | undefined;
      return <td key={side} title={value ? value.reason ?? value.basis : undefined}>{performanceCell(value, percent ? metrics[percent] as ReportValue | undefined : undefined, currency)}</td>;
    })}</tr>)}</tbody></table>;
}

/** The recalculation and fill-route facts of a report, read from its configuration and recorded policies. */
export function reportModeLines(config: StrategyConfig, policies: readonly string[]): string[] {
  const lines = [config.processOrdersOnClose ? 'Orders: processed at the signal bar close.' : 'Orders: market orders fill at the next bar open.'];
  if (!config.calcOnEveryTick) lines.push('Recalculation: once per bar, at its close.');
  else lines.push(policies.includes(STRATEGY_EVERY_TICK_POLICIES.forming) ? 'Recalculation: on every tick. The last bar is the still-forming realtime bar, so this report repaints until it closes.' : 'Recalculation: on every tick. No forming realtime bar was in this run, so every bar calculated once, at its close.');
  lines.push(config.calcOnOrderFills ? 'Recalculate after order is filled: on.' : 'Recalculate after order is filled: off.');
  if (!config.barMagnifier) lines.push('Bar Magnifier: off. Intrabar fills use the open, high, low and close route of each bar.');
  else lines.push(policies.find(line => line.startsWith('Bar Magnifier coverage:')) ?? (policies.some(line => line.startsWith(STRATEGY_MAGNIFIER_POLICY_PREFIX)) ? 'Bar Magnifier: on, with every bar covered by lower-timeframe bars.' : 'Bar Magnifier: on.'));
  return lines;
}
/** The read-only properties of the report on screen (the reference Properties tab), next to the editable draft. */
export function ReportProperties({ summary, firstTime, lastTime, timezone }: { summary: StrategyReportSummary; firstTime: number | null; lastTime: number | null; timezone: string }) {
  const config = summary.config, when = (time: number | null) => time === null ? 'none' : new Intl.DateTimeFormat('en-US', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(time * 1000);
  const size = config.defaultQuantity ? `${number(config.defaultQuantity.value, 8)} ${config.defaultQuantity.kind === 'contracts' ? 'units' : config.defaultQuantity.kind === 'cash' ? 'cash' : '% of equity'}` : 'each proposal supplies its units';
  const commission = config.commission.kind === 'percent' ? `${config.commission.value}% of order value` : config.commission.kind === 'per-unit' ? `${config.commission.value} per unit` : `${config.commission.value} per order`;
  const rows: [string, string][] = [
    ['Date range', `${when(firstTime)} to ${when(lastTime)} (${summary.counts.bars} bars)`], ['Initial capital', number(config.initialCapital, 2) + (summary.context.currency ? ' ' + summary.context.currency : '')],
    // The currency every amount of this report is shown in.
    ['Account currency', summary.context.currency ?? 'not stated by the symbol'],
    ['Default order size', size], ['Pyramiding', String(config.pyramiding)], ['Commission', commission], ['Slippage', `${config.slippageTicks} ticks of ${config.tickSize}`],
    ['Limit verification', `${config.limitVerifyTicks} ticks`], ['Margin long / short', `${config.marginLongPercent}% / ${config.marginShortPercent}%`], ['Fill prices', config.fillBasis === 'standard-ohlc' ? 'standard OHLC' : 'chart prices'],
    // Shown only when set, so reports without a delay keep their rows.
    ...(config.orderDelayBars ? [['Order execution delay', `${config.orderDelayBars} bar${config.orderDelayBars === 1 ? '' : 's'}`] as [string, string]] : []),
  ];
  return <section aria-label="Report properties"><h3>Applied to this report</h3><table className="data-table"><tbody>{rows.map(([label, text]) => <tr key={label}><td>{label}</td><td>{text}</td></tr>)}</tbody></table>
    <ul className="help">{reportModeLines(config, summary.policies).map(line => <li key={line}>{line}</li>)}</ul></section>;
}
