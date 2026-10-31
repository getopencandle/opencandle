import type { Bar } from '../domain/types';
import { backtestStrategy, DEFAULT_STRATEGY_CONFIG, type StrategyConfig } from '../domain/strategy';
import { splitFillProposal, validateScriptProposalShape } from '../domain/strategy-script-orders';
import { boundedText, integer, ownRecord, reject } from './data';
import { REPORT_WORKER_LIMITS as LIMIT, type ReportSection, type ReportStart, type ReportUploadSection } from './types';

export const REPORT_SECTIONS: readonly ReportSection[] = ['bars', 'standardBars', 'barIds', 'proposals'];
/** Optional sections, uploaded after the required ones; an absent count is zero. 'magnifierBars' carries Bar Magnifier data. */
export const OPTIONAL_REPORT_SECTIONS: readonly ReportUploadSection[] = ['magnifierBars', 'fillProposals'];
export const ALL_REPORT_SECTIONS: readonly ReportUploadSection[] = [...REPORT_SECTIONS, ...OPTIONAL_REPORT_SECTIONS];
/** The declared row count of a section (optional sections default to zero). */
export const sectionCount = (counts: Partial<Record<ReportUploadSection, number>>, section: ReportUploadSection) => counts[section] ?? 0;
const configKeys = Object.keys(DEFAULT_STRATEGY_CONFIG);
export function exact(value: unknown, label: string, fields: readonly string[]) {
  ownRecord(value, label, fields);
  if (fields.some(field => !Object.hasOwn(value, field))) reject('REPORT_TRANSPORT_FIELDS', `${label} has missing fields.`);
}
export function finite(value: unknown, label: string, minimum = -1e100): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum || value > 1e100) reject('REPORT_TRANSPORT_NUMBER', `${label} is outside its finite bounds.`);
  return value as number;
}
export function validateReportStart(value: unknown): ReportStart {
  ownRecord(value, 'Report start', ['context', 'config', 'counts', 'chartType', 'formingBar', 'magnifierLabel']);
  if (['context', 'config', 'counts', 'chartType'].some(field => !Object.hasOwn(value, field))) reject('REPORT_TRANSPORT_FIELDS', 'Report start has missing fields.');
  const input = value as unknown as ReportStart;
  // Optional realtime and Bar Magnifier facts of the execution.
  if (Object.hasOwn(input, 'formingBar') && typeof input.formingBar !== 'boolean') reject('REPORT_TRANSPORT_FIELDS', 'The forming-bar flag must be true or false.');
  if (Object.hasOwn(input, 'magnifierLabel')) boundedText(input.magnifierLabel, 'Bar Magnifier source', 200);
  // defaultQuantity is optional; every other key stays mandatory.
  ownRecord(input.config, 'Strategy config', [...configKeys, 'defaultQuantity', 'orderDelayBars']);
  if (configKeys.some(field => !Object.hasOwn(input.config, field))) reject('REPORT_TRANSPORT_FIELDS', 'Strategy config has missing fields.');
  if (Object.hasOwn(input.config, 'defaultQuantity')) exact(input.config.defaultQuantity, 'Default order size', ['kind', 'value']);
  exact(input.config.commission, 'Strategy commission', ['kind', 'value']);
  const config = { ...input.config, chartType: input.chartType } as StrategyConfig;
  const checked = backtestStrategy({ bars: [], standardBars: [], signals: [], config });
  if (!checked.ok) reject('REPORT_CONFIG', checked.diagnostics.join(' '));
  exact(input.context, 'Report context', ['executionId', 'sourceLabel', 'currency', 'timezone']);
  boundedText(input.context.executionId, 'Execution identity', 32768);
  boundedText(input.context.sourceLabel, 'Source label', 4096);
  boundedText(input.context.timezone, 'Display timezone', 128);
  if (input.context.currency !== null && (typeof input.context.currency !== 'string' || !/^[A-Z]{3}$/.test(input.context.currency))) reject('REPORT_CURRENCY', 'Currency must be an explicit three-letter code or null.');
  try { new Intl.DateTimeFormat('en', { timeZone: input.context.timezone }); } catch { reject('REPORT_TIMEZONE', 'Invalid report timezone.'); }
  ownRecord(input.counts, 'Report section counts', ALL_REPORT_SECTIONS);
  if (REPORT_SECTIONS.some(section => !Object.hasOwn(input.counts, section))) reject('REPORT_TRANSPORT_FIELDS', 'Report section counts has missing fields.');
  for (const section of ALL_REPORT_SECTIONS) if (Object.hasOwn(input.counts, section)) integer(input.counts[section], `${section} count`, 0, section === 'proposals' || section === 'fillProposals' ? LIMIT.proposals : section === 'magnifierBars' ? LIMIT.magnifierBars : LIMIT.bars);
  if (sectionCount(input.counts, 'magnifierBars') && !config.barMagnifier) reject('REPORT_PREFIX', 'Bar Magnifier rows need the Bar Magnifier property.');
  // After-fill proposals need "Recalculate after order is filled".
  if (sectionCount(input.counts, 'fillProposals') && !config.calcOnOrderFills) reject('REPORT_PREFIX', 'After-fill proposals need the Recalculate after order is filled property.');
  if (input.counts.bars !== input.counts.barIds || input.counts.standardBars !== 0 && input.counts.standardBars !== input.counts.bars || config.chartType === 'heikin-ashi' && config.fillBasis === 'standard-ohlc' && input.counts.standardBars !== input.counts.bars) reject('REPORT_PREFIX', 'Every supplied execution section must describe the same exact prefix.');
  return { context: input.context, config: checked.config, counts: input.counts, chartType: input.chartType, ...(Object.hasOwn(input, 'formingBar') ? { formingBar: input.formingBar } : {}), ...(Object.hasOwn(input, 'magnifierLabel') ? { magnifierLabel: input.magnifierLabel } : {}) };
}
export function validateReportRow(section: ReportUploadSection, value: unknown): void {
  if (section === 'barIds') { boundedText(value, 'Bar identity', 512); return; }
  if (section === 'bars' || section === 'standardBars' || section === 'magnifierBars') {
    exact(value, 'Source bar', ['time', 'open', 'high', 'low', 'close', 'volume']); const bar = value as Bar;
    integer(bar.time, 'Source bar time', -62135596800, 253402300799);
    for (const field of ['open', 'high', 'low', 'close'] as const) finite(bar[field], field, Number.MIN_VALUE);
    finite(bar.volume, 'Volume', 0);
    if (bar.high < Math.max(bar.open, bar.close, bar.low) || bar.low > Math.min(bar.open, bar.close, bar.high)) reject('REPORT_BAR', 'Source OHLC relations are invalid.');
    return;
  }
  // An after-fill proposal is a proposal plus `fill`, the ordinal of its fill on the bar.
  if (section === 'fillProposals') { let split: ReturnType<typeof splitFillProposal>; try { split = splitFillProposal(value as Record<string, unknown>); } catch (cause) { reject('REPORT_PROPOSAL', cause instanceof Error ? cause.message : 'Invalid after-fill proposal.'); } validateReportRow('proposals', split!.proposal); return; }
  // Ctx.order options, ctx.exit and ctx.cancel proposals have their own exact shapes (strategy-script-orders.ts).
  const extended = !!value && typeof value === 'object' && (Object.hasOwn(value, 'options') || ['exit', 'cancel'].includes((value as Record<string, unknown>).side as string));
  if (!extended) exact(value, 'Virtual script proposal', ['sequence', 'side', 'quantity', 'event', 'virtual']);
  else ownRecord(value, 'Virtual script proposal', ['sequence', 'side', 'quantity', 'event', 'virtual', 'options', 'target', 'exit']);
  const proposal = value as Record<string, unknown>;
  integer(proposal.sequence, 'Proposal sequence', 1, Number.MAX_SAFE_INTEGER);
  if (!['buy', 'sell', ...(extended ? ['exit', 'cancel'] : [])].includes(proposal.side as string) || proposal.virtual !== true) reject('REPORT_PROPOSAL', 'Only explicitly virtual buy/sell proposals are supported.');
  if (proposal.side === 'buy' || proposal.side === 'sell') finite(proposal.quantity, 'Proposal quantity', Number.MIN_VALUE);
  if (extended) { try { validateScriptProposalShape(proposal); } catch (cause) { reject('REPORT_PROPOSAL', cause instanceof Error ? cause.message : 'Invalid virtual script proposal.'); } }
  exact(proposal.event, 'Proposal event', ['id', 'revision', 'time']);
  const event = proposal.event as Record<string, unknown>;
  boundedText(event.id, 'Proposal bar identity', 512); integer(event.time, 'Proposal bar time', -62135596800, 253402300799);
  if (event.revision !== 1) reject('REPORT_PROPOSAL_REVISION', 'The current script proposal adapter supports source revision one only.');
}
