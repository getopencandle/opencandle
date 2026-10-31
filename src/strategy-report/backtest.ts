import type { Bar } from '../domain/types';
import { backtestStrategy, type StrategyConfig, type StrategyFillContext, type StrategyPositionState, type StrategyResult } from '../domain/strategy';
import { fillAnswerKey, scriptOrdersAndFillAnswers, scriptOrdersToSignals } from '../domain/strategy-script-orders';
import type { StrategyReportJobInput } from './types';

/**
 * The one engine call behind a Strategy report. The report worker runs it on its sealed upload and the
 * chart's trade marks run it on the same job input (strategyReportJobInput), so both see the same fills.
 * With the Bar Magnifier on, uncovered bars keep the OHLC route ('available'); every-tick runs declare whether the last
 * bar is still forming.
 * With "Recalculate after order is filled" on, the engine's after-fill callback answers each fill with the
 * proposals the script's onFill hook made for it (`fillProposals`, keyed by bar and fill ordinal; none is an empty answer).
 * `trace` observes the actual position at each bar close and each recalculated fill (src/strategy-report/feedback.ts).
 */
export interface ReportBacktestTrace { position?: (state: Readonly<StrategyPositionState>) => void; fill?: (context: Readonly<StrategyFillContext>) => void }
export interface ReportBacktestInput {
  bars: readonly Bar[]; standardBars?: readonly Bar[]; barIds: readonly string[]; proposals: readonly Record<string, unknown>[];
  config: StrategyConfig; magnifierBars?: readonly Bar[]; magnifierLabel?: string; formingBar?: boolean;
  fillProposals?: readonly Record<string, unknown>[]; trace?: ReportBacktestTrace;
}
export function runReportBacktest(input: ReportBacktestInput): StrategyResult {
  const { bars, standardBars, barIds, config, trace } = input, magnifierBars = config.barMagnifier ? input.magnifierBars ?? [] : undefined;
  const fillRows = input.fillProposals ?? [];
  if (fillRows.length && !config.calcOnOrderFills) throw new Error('After-fill proposals need "Recalculate after order is filled".');
  const { signals, answers } = fillRows.length ? scriptOrdersAndFillAnswers(input.proposals, fillRows, bars, barIds) : { signals: scriptOrdersToSignals(input.proposals, bars, barIds), answers: null };
  const onFill = config.calcOnOrderFills ? (context: StrategyFillContext) => { trace?.fill?.(context); return answers?.get(fillAnswerKey(context.barIndex, context.ordinal)) ?? []; } : undefined;
  return backtestStrategy({ bars, standardBars, barIds, signals, config, ...(magnifierBars ? { magnifierBars, magnifierCoverage: 'available' as const, ...(input.magnifierLabel ? { magnifierLabel: input.magnifierLabel } : {}) } : {}), ...(config.calcOnEveryTick ? { everyTick: { formingBar: input.formingBar === true } } : {}), ...(onFill ? { onFill } : {}), ...(trace?.position ? { observePosition: trace.position } : {}) });
}
/** The engine result for a report job input (the chart's trade marks). Throws what the engine or adapter throws. */
export function runReportJob(job: StrategyReportJobInput, trace?: ReportBacktestTrace): StrategyResult {
  const { execution, config } = job;
  return runReportBacktest({ bars: execution.bars, standardBars: execution.standardBars, barIds: execution.barIds, proposals: execution.proposals, config, magnifierBars: execution.magnifierBars, magnifierLabel: execution.magnifierLabel, formingBar: execution.formingBar, ...(execution.fillProposals?.length ? { fillProposals: execution.fillProposals } : {}), ...(trace ? { trace } : {}) });
}
