// Intraday US equity imports regrouped into 1D/1W/1M buckets by New York trading date
// (DST-aware New York midnight edges). SYNTHETIC bars only; no network.
import {describe,expect,it} from 'vitest';
import {aggregateInterval,DEFAULT_AGGREGATION_POLICY,effectiveAggregationPolicy,restoreAggregationPolicy,restoreIntervalDerivation} from '../../src/domain/intervals';
import {fixtureDataset} from '../../src/domain/fixtures';
import {usTradingDate} from '../../src/domain/us-market-hours';
import type {Bar,BarDataset} from '../../src/domain/types';

// Explicit UTC instants (no helper under test): EDT is UTC-4, EST is UTC-5.
const edt=(y:number,m:number,d:number,h:number,min=0)=>Date.UTC(y,m-1,d,h+4,min)/1000;
const est=(y:number,m:number,d:number,h:number,min=0)=>Date.UTC(y,m-1,d,h+5,min)/1000;
const bar=(time:number,close=10,volume=1):Bar=>({time,open:10,high:Math.max(10,close)+1,low:Math.min(10,close)-1,close,volume});
const span=(from:number,to:number,step:number)=>{const out:Bar[]=[];for(let t=from;t<to;t+=step)out.push(bar(t,10+(t/step)%3));return out;};
const starts=(bars:readonly {time:number}[])=>bars.map(row=>row.time);
const EXTENDED={...DEFAULT_AGGREGATION_POLICY,anchor:'us-equity-trading-day-extended' as const};
const nyMidnight=(y:number,m:number,d:number,offsetHours:number)=>Date.UTC(y,m-1,d,offsetHours)/1000;
function usImport(bars:Bar[],resolution='1m',exchange='NASDAQ'):BarDataset{
 const base=fixtureDataset('GME',1);
 return {...base,bars,resolution,instrument:{...base.instrument,id:exchange+':GME',exchange,timezone:'America/New_York'},provenance:{...base.provenance,providerId:'local-import',datasetId:'local-import:gme-'+resolution,fixture:true}};
}

describe('New York trading-day aggregation of intraday US equity imports',()=>{
 it('the policy gains the trading-day anchor only for an intraday source and a day, week or month target',()=>{
  const nyse={...fixtureDataset('GME',1).instrument,exchange:'NYSE'};
  expect(effectiveAggregationPolicy(DEFAULT_AGGREGATION_POLICY,nyse,'1D')).toEqual(DEFAULT_AGGREGATION_POLICY);
  expect(effectiveAggregationPolicy(DEFAULT_AGGREGATION_POLICY,nyse,'1D','1m')).toEqual({...DEFAULT_AGGREGATION_POLICY,anchor:'us-equity-trading-day'});
  expect(effectiveAggregationPolicy(DEFAULT_AGGREGATION_POLICY,nyse,'1W','60m').anchor).toBe('us-equity-trading-day');
  expect(effectiveAggregationPolicy(DEFAULT_AGGREGATION_POLICY,nyse,'1M','5m').anchor).toBe('us-equity-trading-day');
  expect(effectiveAggregationPolicy(DEFAULT_AGGREGATION_POLICY,nyse,'1W','1D')).toEqual(DEFAULT_AGGREGATION_POLICY);
  expect(effectiveAggregationPolicy(DEFAULT_AGGREGATION_POLICY,nyse,'60m','1m').anchor).toBe('us-equity-session');
  expect(effectiveAggregationPolicy(DEFAULT_AGGREGATION_POLICY,fixtureDataset('GME',1).instrument,'1D','1m')).toEqual(DEFAULT_AGGREGATION_POLICY);
  expect(()=>restoreAggregationPolicy({...DEFAULT_AGGREGATION_POLICY,anchor:'exchange-guess'})).toThrow(/Unknown aggregation anchor/);
 });
 it('winter (EST): 04:00-20:00 New York minutes make one daily bar, edged at New York midnight, from the regular session by default; UTC would split at 19:00',()=>{
  const minutes=span(est(2026,11,20,4),est(2026,11,20,20),60),source=usImport(minutes);
  const built=aggregateInterval(source,'1D');
  expect(starts(built.dataset.bars)).toEqual([Date.UTC(2026,10,20,5)/1000]);
  expect(built.derivation!.buckets[0]).toMatchObject({start:Date.UTC(2026,10,20,5)/1000,end:Date.UTC(2026,10,21,5)/1000,observedBars:390,sourceFirstTime:est(2026,11,20,9,30),sourceLastTime:est(2026,11,20,15,59),clockCoverage:'partial-clock'});
  expect(built.dataset.bars[0].volume).toBe(390);expect(built.dataset.bars[0].close).toBe(minutes.find(row=>row.time===est(2026,11,20,15,59))!.close);
  // The extended-hours option folds all 960 minutes into the same trading day, stamped at the same New York midnight.
  const extended=aggregateInterval(source,'1D',EXTENDED);
  expect(starts(extended.dataset.bars)).toEqual([Date.UTC(2026,10,20,5)/1000]);
  expect(extended.derivation!.buckets[0]).toMatchObject({start:est(2026,11,19,20),end:est(2026,11,20,20),observedBars:960});
  expect(extended.dataset.bars[0].volume).toBe(960);expect(extended.dataset.bars[0].close).toBe(minutes.at(-1)!.close);
  expect(restoreIntervalDerivation(JSON.parse(JSON.stringify(extended.derivation!)),extended.dataset).buckets).toHaveLength(1);
  expect(built.dataset.provenance.providerName).toMatch(/^OpenCandle New York trading-day aggregation/);
  expect(restoreIntervalDerivation(JSON.parse(JSON.stringify(built.derivation!)),built.dataset).buckets).toHaveLength(1);
  // The explicit UTC calendar (crypto or unmarked instruments) still splits the same minutes at 00:00 UTC.
  const utc=aggregateInterval({...source,instrument:fixtureDataset('GME',1).instrument},'1D');
  expect(starts(utc.dataset.bars)).toEqual([Date.UTC(2026,10,20)/1000,Date.UTC(2026,10,21)/1000]);
 });
 it('summer (EDT): the daily bar opens at 04:00 UTC; consecutive dates stay distinct',()=>{
  const bars=[...span(edt(2026,7,15,9,30),edt(2026,7,15,16),300),...span(edt(2026,7,16,9,30),edt(2026,7,16,16),300)];
  const built=aggregateInterval(usImport(bars,'5m'),'1D');
  expect(starts(built.dataset.bars)).toEqual([Date.UTC(2026,6,15,4)/1000,Date.UTC(2026,6,16,4)/1000]);
  expect(built.derivation!.buckets.map(row=>row.observedBars)).toEqual([78,78]);
 });
 it('weeks and months across the autumn clock change start at New York midnight on each side',()=>{
  const bars=[...span(edt(2026,10,30,9,30),edt(2026,10,30,16),3600/2),...span(est(2026,11,2,9,30),est(2026,11,2,16),3600/2)];
  const week=aggregateInterval(usImport(bars,'30m'),'1W');
  expect(starts(week.dataset.bars)).toEqual([Date.UTC(2026,9,26,4)/1000,Date.UTC(2026,10,2,5)/1000]);
  expect(week.derivation!.buckets[0].end).toBe(Date.UTC(2026,10,2,5)/1000);
  const month=aggregateInterval(usImport(bars,'30m'),'1M');
  // 2026-11-01 00:00 New York is still EDT (the change is at 02:00), so November opens at 04:00 UTC.
  expect(starts(month.dataset.bars)).toEqual([Date.UTC(2026,9,1,4)/1000,Date.UTC(2026,10,1,4)/1000]);
  expect(restoreIntervalDerivation(JSON.parse(JSON.stringify(month.derivation!)),month.dataset).buckets).toHaveLength(2);
 });
 it('a winter Friday after-hours tail never creates a Saturday bar (extended option); alone it has no regular-session daily bar',()=>{
  const friday=span(est(2026,12,4,16),est(2026,12,4,20),60),built=aggregateInterval(usImport(friday),'1D',EXTENDED);
  expect(built.dataset.bars).toHaveLength(1);expect(new Date(built.dataset.bars[0].time*1000).getUTCDay()).toBe(5);
  expect(()=>aggregateInterval(usImport(friday),'1D')).toThrow(/no regular-session bars/);
 });
 it('date-labelled daily imports keep their UTC calendar weeks (no re-dating)',()=>{
  const days=[Date.UTC(2026,9,26),Date.UTC(2026,9,27),Date.UTC(2026,10,2)].map(ms=>bar(ms/1000));
  const week=aggregateInterval(usImport(days,'1D'),'1W');
  expect(week.derivation!.policy).toEqual(DEFAULT_AGGREGATION_POLICY);
  expect(starts(week.dataset.bars)).toEqual([Date.UTC(2026,9,26)/1000,Date.UTC(2026,10,2)/1000]);
 });
 it('a tampered derivation that moves a bucket edge back to UTC midnight is refused',()=>{
  const built=aggregateInterval(usImport(span(est(2026,11,20,9,30),est(2026,11,20,16),60)),'1D');
  const bad=JSON.parse(JSON.stringify(built.derivation!));bad.buckets[0].start=Date.UTC(2026,10,20)/1000;bad.buckets[0].end=Date.UTC(2026,10,21)/1000;
  expect(()=>restoreIntervalDerivation(bad)).toThrow(/disagree with its interval policy/);
 });
});

describe('reference-FACTS Q3: US equity trading day (regular-session 1D by default, extended-hours option)',()=>{
 it('usTradingDate: Sunday 20:00 and Friday 20:00 trade for Monday; pre-market and after-hours keep their date',()=>{
  expect(usTradingDate(est(2026,11,22,20))).toBe('2026-11-23'); // Sunday evening
  expect(usTradingDate(est(2026,11,22,19,59))).toBe('2026-11-23'); // a weekend date moves forward
  expect(usTradingDate(est(2026,11,23,3,59))).toBe('2026-11-23'); // Monday overnight before 04:00
  expect(usTradingDate(est(2026,11,23,4))).toBe('2026-11-23'); expect(usTradingDate(est(2026,11,23,19,59))).toBe('2026-11-23');
  expect(usTradingDate(est(2026,11,23,20))).toBe('2026-11-24');
  expect(usTradingDate(est(2026,12,4,20))).toBe('2026-12-07'); // Friday 20:00
  expect(usTradingDate(edt(2026,7,15,20,30))).toBe('2026-07-16');
 });
 it('usTradingDate: a holiday-eve evening skips the holiday; a half day rolls at 17:00',()=>{
  expect(usTradingDate(est(2026,11,25,19,59))).toBe('2026-11-25'); // Wednesday after-hours before Thanksgiving
  expect(usTradingDate(est(2026,11,25,20))).toBe('2026-11-27'); // 2026-11-26 is closed
  expect(usTradingDate(est(2026,11,27,16,59))).toBe('2026-11-27'); // early close: after-hours ends 17:00
  expect(usTradingDate(est(2026,11,27,17))).toBe('2026-11-30');
  expect(usTradingDate(edt(2026,7,2,20))).toBe('2026-07-06'); // 2026-07-03 observed Independence Day, then the weekend
 });
 it('Sunday evening to Monday: the overnight bars join Monday under the extended option and are left out by default',()=>{
  const sunday=span(est(2026,11,22,20),est(2026,11,22,21),1800),monday=span(est(2026,11,23,9,30),est(2026,11,23,10,30),1800),source=usImport([...sunday,...monday],'30m');
  const extended=aggregateInterval(source,'1D',EXTENDED);
  expect(starts(extended.dataset.bars)).toEqual([nyMidnight(2026,11,23,5)]);
  expect(extended.derivation!.buckets[0]).toMatchObject({start:est(2026,11,20,20),end:est(2026,11,23,20),observedBars:4,sourceFirstTime:est(2026,11,22,20)});
  expect(extended.dataset.provenance.providerName).toMatch(/^OpenCandle New York trading-day aggregation \(extended hours\)/);
  expect(restoreIntervalDerivation(JSON.parse(JSON.stringify(extended.derivation!)),extended.dataset).buckets).toHaveLength(1);
  const regular=aggregateInterval(source,'1D');
  expect(starts(regular.dataset.bars)).toEqual([nyMidnight(2026,11,23,5)]);
  expect(regular.derivation!.buckets[0]).toMatchObject({sourceFirstIndex:2,sourceLastIndex:3,observedBars:2,sourceFirstTime:est(2026,11,23,9,30)});
  expect(restoreIntervalDerivation(JSON.parse(JSON.stringify(regular.derivation!)),regular.dataset).buckets).toHaveLength(1);
 });
 it('holiday eve and half day: Wednesday 20:00 goes to Friday, Friday from 17:00 to Monday; the default 1D keeps the half-day regular session',()=>{
  const rows=[...span(est(2026,11,25,15),est(2026,11,25,21),1800),...span(est(2026,11,27,9,30),est(2026,11,27,17,30),1800),...span(est(2026,11,30,9,30),est(2026,11,30,10),1800)];
  const source=usImport(rows,'30m'),extended=aggregateInterval(source,'1D',EXTENDED);
  expect(starts(extended.dataset.bars)).toEqual([nyMidnight(2026,11,25,5),nyMidnight(2026,11,27,5),nyMidnight(2026,11,30,5)]);
  // Wednesday 15:00-19:30 (10 bars); Friday window from Wednesday 20:00: 2 overnight bars and 09:30-16:30 (15); Monday: Friday 17:00 and Monday 09:30.
  expect(extended.derivation!.buckets.map(row=>[row.start,row.end,row.observedBars])).toEqual([[est(2026,11,24,20),est(2026,11,25,20),10],[est(2026,11,25,20),est(2026,11,27,17),17],[est(2026,11,27,17),est(2026,11,30,20),2]]);
  expect(restoreIntervalDerivation(JSON.parse(JSON.stringify(extended.derivation!)),extended.dataset).buckets).toHaveLength(3);
  const regular=aggregateInterval(source,'1D');
  expect(starts(regular.dataset.bars)).toEqual([nyMidnight(2026,11,25,5),nyMidnight(2026,11,27,5),nyMidnight(2026,11,30,5)]);
  // Regular: Wednesday 15:00 and 15:30; Friday 09:30-12:30 (the 13:00 early close ends it); Monday 09:30.
  expect(regular.derivation!.buckets.map(row=>[row.observedBars,row.sourceLastTime])).toEqual([[2,est(2026,11,25,15,30)],[7,est(2026,11,27,12,30)],[1,est(2026,11,30,9,30)]]);
  expect(regular.dataset.bars[1].close).toBe(rows.find(row=>row.time===est(2026,11,27,12,30))!.close);
 });
 it('RTH only: pre-market and after-hours bars never change the daily OHLCV; a weekly lineage with gaps restores, a tampered one is refused',()=>{
  const day=(d:number)=>[bar(est(2026,11,d,8),50,7),bar(est(2026,11,d,9,30),12,1),bar(est(2026,11,d,15),11,1),bar(est(2026,11,d,17),2,9)];
  const source=usImport([...day(16),...day(17)],'30m');
  const daily=aggregateInterval(source,'1D');
  expect(daily.dataset.bars.map(row=>[row.open,row.high,row.low,row.close,row.volume])).toEqual([[10,13,9,11,2],[10,13,9,11,2]]);
  expect(daily.dataset.provenance.providerName).toMatch(/^OpenCandle New York trading-day aggregation \(regular session\)/);
  expect(daily.dataset.provenance.coverage).toContain('regular-session rows of 8 supplied');
  const week=aggregateInterval(source,'1W');
  expect(week.derivation!.buckets[0]).toMatchObject({sourceFirstIndex:1,sourceLastIndex:6,observedBars:4});
  expect(week.dataset.bars[0].volume).toBe(4);
  expect(restoreIntervalDerivation(JSON.parse(JSON.stringify(week.derivation!)),week.dataset).buckets).toHaveLength(1);
  const bad=JSON.parse(JSON.stringify(week.derivation!));bad.buckets[0].sourceFirstIndex=0;bad.buckets[0].sourceFirstTime=est(2026,11,16,8);
  expect(()=>restoreIntervalDerivation(bad)).toThrow(/cover each source row/);
  const extended=aggregateInterval(source,'1D',EXTENDED);
  expect(extended.dataset.bars.map(row=>[row.high,row.low,row.close,row.volume])).toEqual([[51,1,2,18],[51,1,2,18]]);
 });
 it('the extended-hours option applies only where the trading-day anchor would; daily imports keep their dates',()=>{
  const nyse={...fixtureDataset('GME',1).instrument,exchange:'NYSE'};
  expect(effectiveAggregationPolicy(EXTENDED,nyse,'1D','1m').anchor).toBe('us-equity-trading-day-extended');
  expect(effectiveAggregationPolicy(EXTENDED,nyse,'60m','1m').anchor).toBe('us-equity-session');
  expect(effectiveAggregationPolicy(EXTENDED,nyse,'1W','1D')).toEqual(DEFAULT_AGGREGATION_POLICY);
  expect(effectiveAggregationPolicy(EXTENDED,fixtureDataset('GME',1).instrument,'1D','1m')).toEqual(DEFAULT_AGGREGATION_POLICY);
  expect(restoreAggregationPolicy(EXTENDED)).toEqual(EXTENDED);
  const days=[Date.UTC(2026,9,26),Date.UTC(2026,9,27)].map(ms=>bar(ms/1000));
  expect(starts(aggregateInterval(usImport(days,'1D'),'1W',EXTENDED).dataset.bars)).toEqual([Date.UTC(2026,9,26)/1000]);
 });
});
