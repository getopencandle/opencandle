import {afterEach,expect,it} from 'vitest';
import {publishedSource,syntheticSession,unix} from '../fixtures/qualified-nyse-mtf-source';
import {alertFromView,applyView} from '../fixtures/nyse-mtf-alert-fixture';
import {NyseMtfAlertEvaluator,prepareNyseAlertBatch,qualifiedNyseAlertObservation,NyseAlertUnavailable,validateNyseAlertCalculation,planNysePeriodTimeframe} from '../../src/domain/nyse-mtf-alert-source';
import {captureIndicatorAlertSource,captureNyseIndicatorAlertSource,technicalSourceLabel} from '../../src/domain/technical-alerts';
import {planNyseDailyTimeframe} from '../../src/domain/indicator-resample';
import {dailyTimeframeAlertRefusal} from '../../src/ui/technical-alert-catalog';
import {TechnicalAlertObserver} from '../../src/ui/technical-alert-observer';
import {factoryIndicatorDefault} from '../../src/ui/indicator-library';
import type {BarDataset} from '../../src/domain/types';

// 1W and 1M own-timeframe indicator alerts on the producer-confirmed New York
// regular-session route. SYNTHETIC prices through the real provider; no network, no key.
const owned:{dispose():void}[]=[];
afterEach(()=>{for(const item of owned.splice(0).reverse())item.dispose();});
async function source(options:Parameters<typeof publishedSource>[0]){const result=await publishedSource(options);owned.push(result);return result;}
function engine(){const result=new NyseMtfAlertEvaluator();owned.push(result);return result;}
const settings=(interval:string,waitForClose=true)=>({id:'synthetic-period-sma',kind:'sma' as const,...factoryIndicatorDefault('sma'),inputs:{...factoryIndicatorDefault('sma').inputs,length:1,source:'close'},presentation:{...factoryIndicatorDefault('sma').presentation!,timeframe:{schemaVersion:1 as const,interval,waitForClose}}});
const frozen=(interval:'1D'|'1W'|'1M',wait=true)=>captureNyseIndicatorAlertSource(settings(interval,wait),'sma','standard','synthetic-period-snapshot');
const prepare=(dataset:BarDataset,interval:'1D'|'1W'|'1M',wait=true)=>prepareNyseAlertBatch(engine(),dataset,dataset.bars,'ordinary',[frozen(interval,wait)],'USD',new AbortController().signal);
// Good Friday 2024-03-29 is an NYSE holiday: Thursday 2024-03-28 closes both its week and March.
const holidayWeek=()=>[...syntheticSession('2024-03-27T13:30:00Z',26,100),...syntheticSession('2024-03-28T13:30:00Z',26,120)];
// Thursday 2024-02-29 is February's last session; its week continues on Friday 2024-03-01.
const leapMonth=()=>[...syntheticSession('2024-02-28T14:30:00Z',26,90),...syntheticSession('2024-02-29T14:30:00Z',26,95)];

it('stores a strict 1W or 1M declaration and refuses other intervals',()=>{
 expect(frozen('1W').calculation).toEqual({schemaVersion:1,interval:'1W',calendar:'nyse-regular',sampling:'observed-prefix',waitForClose:true});
 expect(frozen('1M',false).calculation.interval).toBe('1M');
 for(const interval of ['1W','1M'])expect(()=>validateNyseAlertCalculation({...frozen('1D').calculation,interval})).not.toThrow();
 for(const interval of ['2W','3M','1Y','240m'])expect(()=>validateNyseAlertCalculation({...frozen('1D').calculation,interval})).toThrow('Unsupported daily alert calculation policy.');
 expect(()=>captureNyseIndicatorAlertSource(settings('240m'),'sma','standard','x')).toThrow('1D, 1W or 1M');
 // The ordinary chart-timeframe capture still never takes an own-timeframe instance.
 expect(()=>captureIndicatorAlertSource(settings('1W'),'sma','standard','x')).toThrow('own 1W timeframe');
 expect(technicalSourceLabel(frozen('1W'))).toBe('SMA / sma (weekly, New York regular session, standard)');
 expect(technicalSourceLabel(frozen('1M'))).toBe('SMA / sma (monthly, New York regular session, standard)');
});

it('confirms a holiday-shortened week and its month on the last trading session close',async()=>{
 const p=await source({bars:holidayWeek(),now:unix('2024-03-28T20:00:00Z')}),view=p.regular();
 for(const interval of ['1W','1M'] as const){
  const sample=prepare(view,interval).samples[0].sample,observation=qualifiedNyseAlertObservation(sample);
  expect(sample.value).toBe(120);expect(observation.closed).toBe(true);expect(observation.barId).toBe(`nyse:${interval}:${unix('2024-03-27T13:30:00Z')}:ordinary`);
  expect(sample.informationStartTime).toBe(unix('2024-03-27T13:30:00Z'));expect(sample.informationEndTime).toBe(view.bars.at(-1)!.time);
 }
});

it('a month can close while its week is still developing, and wait-for-close holds the week',async()=>{
 const p=await source({bars:leapMonth(),now:unix('2024-02-29T21:00:00Z')}),view=p.regular();
 const month=prepare(view,'1M').samples[0].sample;expect(month.value).toBe(95);expect(qualifiedNyseAlertObservation(month).closed).toBe(true);
 let failure:unknown;try{prepare(view,'1W');}catch(error){failure=error;}
 expect(failure).toBeInstanceOf(NyseAlertUnavailable);expect((failure as NyseAlertUnavailable).state).toBe('pending');expect((failure as Error).message).toBe("Weekly alerts are waiting for the observed close of the week's last trading session.");
 const developing=prepare(view,'1W',false).samples[0].sample;expect(developing.value).toBe(95);expect(qualifiedNyseAlertObservation(developing).closed).toBe(false);
});

it('a later loaded week never confirms an earlier week whose last session is missing',()=>{
 const thursday=syntheticSession('2024-03-07T14:30:00Z',26,100),friday=syntheticSession('2024-03-08T14:30:00Z',26,105),monday=syntheticSession('2024-03-11T13:30:00Z',26,110);
 const daily=(rows:typeof thursday)=>{const planned=planNyseDailyTimeframe(rows,'15m',{completeRows:rows.length,coveredFrom:-Infinity,closedThrough:unix('2024-03-11T20:00:00Z')});if(!planned.ok)throw Error(planned.message);return planned.plan;};
 const gap=planNysePeriodTimeframe(daily([...thursday,...monday]),'1W');
 expect(gap.buckets.map(row=>[row.first,row.last])).toEqual([[0,25],[26,51]]);expect(gap.confirmedAt).toEqual([null,null]);expect(gap.bars.map(row=>row.close)).toEqual([100,110]);
 const full=planNysePeriodTimeframe(daily([...thursday,...friday,...monday]),'1W');
 expect(full.confirmedAt).toEqual([51,null]);expect(full.developing).toBe(true);expect(full.bars[0]).toMatchObject({open:98,high:108,low:96,close:105,volume:520});
 const month=planNysePeriodTimeframe(daily([...thursday,...friday,...monday]),'1M');expect(month.buckets).toHaveLength(1);expect(month.confirmedAt).toEqual([null]);
});

it('fires a once-per-bar-close weekly alert through the chart observer with the period calculation version',async()=>{
 const p=await source({bars:holidayWeek(),now:unix('2024-03-28T20:00:00Z')}),observer=new TechnicalAlertObserver(()=>'synthetic-period-observer',()=>Promise.resolve());owned.push(observer);
 const dataset=p.regular(),view=await observer.observe({dataset,bars:dataset.bars,chartId:'synthetic-chart',replay:null,assumeReplayCompletion:false,selectedSource:frozen('1W'),alerts:[]},unix('2024-03-28T20:00:05Z'));
 expect(view.selectedEvent?.value).toBe(120);expect(view.selectedEvent?.barClosed).toBe(true);expect(view.selectedEvent?.observation?.completion).toBe('observed-closed');
 expect(view.selectedContext?.binding.calculationVersion).toBe('lv-nyse-period-1');expect(view.selectedContext?.binding.completionPolicy).toBe('nyse-session-observation');
 expect(view.selectedContext?.description).toBe("Week's last session close confirmed by the current producer observation.");
 expect(applyView(alertFromView(view,{level:110}),view).history).toHaveLength(1);
});

it('keeps the 1D calculation version and names the interval in 1W/1M refusals',()=>{
 const chart={getExecutionIdentity:()=>'ordinary'} as never,crypto={instrument:{id:'X',symbol:'X',name:'X',exchange:'COINBASE',currency:'USD',assetClass:'crypto',tickSize:0.01,lotSize:1,timezone:'UTC'},bars:[],resolution:'15m',provenance:{state:'ready'}} as unknown as BarDataset;
 expect(dailyTimeframeAlertRefusal(chart,crypto,[],'1W')).toBe("A 1W indicator timeframe alert uses the New York regular session, so it is available for US stocks and ETFs only. Set this indicator's timeframe to Chart to create an alert.");
 const unconfirmed={...crypto,instrument:{...crypto.instrument,exchange:'US',assetClass:'stock',timezone:'America/New_York'},provenance:{state:'ready',datasetId:'synthetic:X'}} as unknown as BarDataset;
 expect(dailyTimeframeAlertRefusal(chart,unconfirmed,[],'1M')).toMatch(/a 1M indicator timeframe alert cannot tell when each month is complete/);
 expect(dailyTimeframeAlertRefusal(chart,unconfirmed,[])).toMatch(/a 1D indicator timeframe alert cannot tell when each day is complete/);
});
