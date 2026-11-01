import {describe,expect,it} from 'vitest';
import {assertIndicatorBatchBudget,clearIndicatorBudgetCache,defaultIndicatorPresentation,indicatorCreationInputs,INDICATOR_BATCH_OUTPUT_LIMIT,INDICATOR_BATCH_WORK_LIMIT,INDICATOR_OUTPUT_LIMIT,INDICATOR_WORK_LIMIT,type IndicatorInstanceSettings} from '../../src/chart/indicator-settings';
import type {IndicatorId} from '../../src/domain/indicators';

const study=(kind:IndicatorId,i:number):IndicatorInstanceSettings=>({id:'s'+i,kind,inputs:indicatorCreationInputs(kind) as never,plots:{},offset:0,visible:true,presentation:defaultIndicatorPresentation(kind)});
// The set that failed on example data at 1h (17,280 bars): five signal studies, then ORB.
const SIGNALS:IndicatorId[]=['bbbreach','dicross','macddiv','rsifs','sessionvwap','orb'] as IndicatorId[];
// A normal mixed chart of 20 studies: the signal set plus everyday built-ins (some twice).
const MIXED:IndicatorId[]=[...SIGNALS,'volume','sma','ema','rsi','macd','bb','vwap','stochastic','atr','obv','relvolume','ema','sma','rsi'] as IndicatorId[];

describe('indicator batch budget',()=>{
 it('admits the signal set and 20 mixed studies on 20,000 bars',()=>{
  clearIndicatorBudgetCache();
  expect(()=>assertIndicatorBatchBudget(SIGNALS.map(study),17280)).not.toThrow();
  expect(MIXED).toHaveLength(20);
  const admitted=assertIndicatorBatchBudget(MIXED.map(study),20000);
  // Above the single-study caps, which used to cap the whole chart.
  expect(admitted.numericSlots).toBeGreaterThan(INDICATOR_OUTPUT_LIMIT);expect(admitted.operations).toBeGreaterThan(INDICATOR_WORK_LIMIT);
  expect(admitted.numericSlots).toBeLessThanOrEqual(INDICATOR_BATCH_OUTPUT_LIMIT);expect(admitted.operations).toBeLessThanOrEqual(INDICATOR_BATCH_WORK_LIMIT);
 });
 it('still refuses one study above the single-study limits and a runaway batch',()=>{
  clearIndicatorBudgetCache();
  // One Session VWAP (nine plots) on 100,000 bars: one study over the single-study slot cap, even alone in the batch.
  expect(()=>assertIndicatorBatchBudget([study('sessionvwap' as IndicatorId,0)],100000)).toThrow(new RegExp(`/${INDICATOR_OUTPUT_LIMIT} numeric slots`));
  expect(()=>assertIndicatorBatchBudget(Array.from({length:80},(_,i)=>study('bb',i)),50000)).toThrow(new RegExp(`/${INDICATOR_BATCH_OUTPUT_LIMIT} numeric slots|/${INDICATOR_BATCH_WORK_LIMIT} estimated operations`));
 });
});
