import {describe,it,expect} from 'vitest';
import {normalizeCompanyFacts} from '../../src/fundamentals/company-facts';
import {decimalPlaces,epsPairAgrees,mergeSplits,simpleFraction,vintageFactor,alpacaSplits} from '../../src/fundamentals/pit-splits';
import {buildPitCompany,computeFundamentalSeries,type PitCompany} from '../../src/fundamentals/pit-metrics';
import type {CorporateActionEvent} from '../../src/domain/chart-events';
import type {AdjustmentBasis,PitRequest,PitVersion} from '../../src/fundamentals/pit-types';
import {dailyBars,splitCompany,type RawCompany} from '../fixtures/fundamentals/pit-company';
import {aaplSplitFacts} from '../fixtures/fundamentals/aapl-2020-split';
// Company facts are SYNTHETIC except the Apple fixture (SEC public filing values, no prices). Bars are always synthetic.
const split=(exDate:string,newRate:number,oldRate:number):CorporateActionEvent=>({id:'split-'+exDate,kind:newRate>oldRate?'forward-split':'reverse-split',symbol:'SYN',exDate,recordDate:null,payableDate:null,processDate:null,oldRate,newRate});
const company=(raw:RawCompany|object,splitActions:CorporateActionEvent[]|null=null):PitCompany=>buildPitCompany({facts:normalizeCompanyFacts(raw),retrievedAt:'2026-11-02T00:00:00Z',splitActions});
const DAY={unit:'day' as const,multiplier:1,seconds:null};
const series=(c:PitCompany,bars:{time:number;open:number;close:number}[],adjustment:AdjustmentBasis,request:Partial<PitRequest>={})=>computeFundamentalSeries(c,{bars,interval:DAY,adjustment,currency:'USD'},{metric:'eps',period:'quarterly',display:'value',revisions:'first',...request});
const at=(list:PitVersion[],end:string)=>{const found=list.filter(v=>v.end===end);return found[found.length-1];};
const byDate=(bars:{date:string}[],values:(number|null)[])=>Object.fromEntries(bars.map((b,i)=>[b.date,values[i]]));
describe('split ratio arithmetic',()=>{
 it('finds the simplest fraction within 0.1%, with terms up to 100',()=>{
  expect(simpleFraction(2)).toEqual({p:2,q:1});
  expect(simpleFraction(18595651000/4648913000)).toEqual({p:4,q:1});   // restated shares are not exact multiples
  expect(simpleFraction(0.1)).toEqual({p:1,q:10});
  expect(simpleFraction(1/15)).toEqual({p:1,q:15});
  expect(simpleFraction(0.01)).toEqual({p:1,q:100});
  expect(simpleFraction(1.05)).toEqual({p:21,q:20});
  expect(simpleFraction(1.1)).toEqual({p:11,q:10});
  expect(simpleFraction(1.5007)).toEqual({p:3,q:2});
  expect(simpleFraction(1.003)).toBeNull();
  expect(simpleFraction(1)).toEqual({p:1,q:1});
 });
 it('counts decimals as reported',()=>{
  expect([decimalPlaces(2.97),decimalPlaces(3),decimalPlaces(0.645),decimalPlaces(-1.2),decimalPlaces(1e-7)]).toEqual([2,0,3,1,7]);
 });
 it('checks EPS pairs within both values\' rounding, scaled for reverse splits',()=>{
  expect(epsPairAgrees(11.89,2.97,4)).toBe(true);    // 2.9725 vs 2.97, tolerance 0.005 + 0.00125
  expect(epsPairAgrees(2.58,0.65,4)).toBe(true);     // 0.645 vs 0.65
  expect(epsPairAgrees(2.58,0.66,4)).toBe(false);
  // JSON drops trailing zeros: 1.00 arrives as 1 and keeps the pair's two-decimal precision.
  expect(epsPairAgrees(1.05,1,1.05)).toBe(true);expect(epsPairAgrees(1.05,1,1)).toBe(false);
  // 1-for-10: 0.12 / 0.1 = 1.2 vs 1.23. Tolerance 0.005 + 0.005 / 0.1 = 0.055; without the / k term it would be 0.01.
  expect(epsPairAgrees(0.12,1.23,0.1)).toBe(true);
  expect(epsPairAgrees(0.12,1.3,0.1)).toBe(false);
 });
 it('puts each vintage on the latest basis by its own filed date',()=>{
  const splits=[{p:2,q:1,k:2,effective:'2022-06-15',after:null,through:null,source:'alpaca' as const,confirmed:false},{p:1,q:10,k:0.1,effective:null,after:'2023-05-05',through:'2023-08-05',source:'restatement' as const,confirmed:false}];
  expect(vintageFactor(splits,'2022-05-05')).toBeCloseTo(0.2,12);
  expect(vintageFactor(splits,'2022-06-15')).toBeCloseTo(0.1,12);   // effective on the filed date: already new basis
  expect(vintageFactor(splits,'2023-05-05')).toBeCloseTo(0.1,12);
  expect(vintageFactor(splits,'2023-05-06')).toBe(1);
 });
 it('lets Alpaca win over a restatement split with another ratio in the same window',()=>{
  const inferred=[{p:2,q:1,k:2,effective:null,after:'2022-05-05',through:'2022-08-05',source:'restatement' as const,confirmed:false}];
  expect(mergeSplits(alpacaSplits([split('2022-06-15',3,1)]),inferred).map(s=>[s.source,s.k,s.confirmed])).toEqual([['alpaca',3,false]]);
  expect(mergeSplits(alpacaSplits([split('2022-06-15',2,1)]),inferred).map(s=>[s.source,s.k,s.confirmed,s.after,s.through])).toEqual([['alpaca',2,true,'2022-05-05','2022-08-05']]);
  expect(mergeSplits(alpacaSplits([split('2019-01-02',2,1)]),inferred).map(s=>s.source)).toEqual(['alpaca','restatement']);
 });
});
describe('restatement pairs',()=>{
 it('infer a 2-for-1 split and its window from share and EPS restatements',()=>{
  const c=company(splitCompany(2,1,1,100));
  expect(c.splits).toEqual([{p:2,q:1,k:2,effective:null,after:'2022-05-05',through:'2022-08-05',source:'restatement',confirmed:false}]);
  const annual=c.statementEvents('eps','annual','value','first').versions,quarterly=c.statementEvents('eps','quarterly','value','first').versions;
  expect(at(annual,'2021-12-31').value).toBe(2);      // 4 filed 2022-02-20, before the split
  expect(at(quarterly,'2022-03-31').value).toBe(0.5); // 1 filed 2022-05-05
  expect(at(quarterly,'2022-06-30').value).toBe(0.5); // filed on the new basis
  // Q4 2021 = FY - 9 months, each converted first: 4/2 - 3/2 = 0.5. TTM at Q2 2022 = 0.5 * 4.
  expect(at(quarterly,'2021-12-31').value).toBe(0.5);
  expect(at(c.statementEvents('eps','ttm','value','first').versions,'2022-06-30').value).toBe(2);
  expect(at(c.statementEvents('shares','ttm','value','first').versions,'2022-05-01').value).toBe(200);
 });
 it('infer a 1-for-10 reverse split, with the issuer rounding its restated EPS',()=>{
  const c=company(splitCompany(1,10,0.12,1000,1.23));
  expect(c.splits.map(s=>[s.p,s.q,s.after,s.through])).toEqual([[1,10,'2022-05-05','2022-08-05']]);
  expect(at(c.statementEvents('eps','quarterly','value','first').versions,'2022-03-31').value).toBeCloseTo(1.2,10);
  expect(at(c.statementEvents('shares','ttm','value','first').versions,'2022-05-01').value).toBe(100);
 });
 it('infer a 21-for-20 stock dividend',()=>{
  const c=company(splitCompany(21,20,1.05,2000));
  expect(c.splits.map(s=>[s.p,s.q,s.after,s.through])).toEqual([[21,20,'2022-05-05','2022-08-05']]);
  expect(at(c.statementEvents('eps','quarterly','value','first').versions,'2022-03-31').value).toBeCloseTo(1,10);
  expect(at(c.statementEvents('shares','ttm','value','first').versions,'2022-05-01').value).toBe(2100);
 });
 it('need an agreeing EPS pair: a share restatement alone is not a split',()=>{
  const raw=splitCompany(2,1,1,100);const eps=raw.facts['us-gaap'].EarningsPerShareDiluted.units['USD/shares'];
  for(const r of eps)if(r.filed>'2022-05-05')r.val*=2;   // EPS never restated
  expect(company(raw).splits).toEqual([]);
 });
});
describe('per-share values on chart bars',()=>{
 const flat=dailyBars('2022-04-01','2022-09-30',100);
 const gapped=dailyBars('2022-04-01','2022-09-30',date=>date<'2022-06-15'?100:50);
 it('Alpaca dates the split: raw bars switch basis exactly on the effective date',()=>{
  const c=company(splitCompany(2,1,1,100),[split('2022-06-15',2,1)]);
  expect(c.splits.map(s=>[s.source,s.confirmed,s.effective])).toEqual([['alpaca',true,'2022-06-15']]);
  const eps=byDate(flat,series(c,flat,'raw').values),shares=byDate(flat,series(c,flat,'raw',{metric:'shares',period:'ttm'}).values);
  expect([eps['2022-06-14'],eps['2022-06-15']]).toEqual([1,0.5]);
  expect([shares['2022-06-14'],shares['2022-06-15']]).toEqual([100,200]);
  expect(series(c,flat,'raw').notes).toEqual([]);
 });
 it('split-adjusted bars use latest-basis values directly',()=>{
  const c=company(splitCompany(2,1,1,100),[split('2022-06-15',2,1)]);
  const eps=byDate(flat,series(c,flat,'split-adjusted').values);
  expect([eps['2022-05-06'],eps['2022-06-14'],eps['2022-06-15']]).toEqual([0.5,0.5,0.5]);
 });
 it('without Alpaca, a price gap dates the split on raw bars',()=>{
  const s=series(company(splitCompany(2,1,1,100)),gapped,'raw'),eps=byDate(gapped,s.values);
  expect([eps['2022-06-14'],eps['2022-06-15']]).toEqual([1,0.5]);
  expect(s.notes).toEqual(['The 2-for-1 split took effect on 2022-06-15 (date inferred from a price gap).','Splits after 2024-02-20 are not known without Alpaca corporate actions.']);
 });
 it('without Alpaca or a price gap, raw bars inside the window are left empty',()=>{
  const s=series(company(splitCompany(2,1,1,100)),flat,'raw'),eps=byDate(flat,s.values),notes=byDate(flat,s.gapNotes as never);
  expect(eps['2022-05-05']).toBe(1);   // the window starts after the last old-basis filing
  expect(eps['2022-05-06']).toBeNull();
  expect(notes['2022-05-06']).toBe('A 2-for-1 split took effect between 2022-05-05 and 2022-08-05, on a date OpenCandle does not know, so per-share values here are left empty.');
  expect(eps['2022-08-05']).toBeNull();expect(eps['2022-08-08']).toBe(0.5);
 });
 it('unknown adjustment: price gaps decide, otherwise bars before the split are left empty',()=>{
  const c=company(splitCompany(2,1,1,100),[split('2022-06-15',2,1)]);
  expect(byDate(gapped,series(c,gapped,'unknown').values)['2022-06-14']).toBe(1);        // gap of 2 at the split: raw
  expect(byDate(flat,series(c,flat,'unknown').values)['2022-06-14']).toBe(0.5);           // no gap: split-adjusted
  const before=dailyBars('2022-04-01','2022-06-10',100),s=series(c,before,'unknown');     // the chart ends before the split
  expect(new Set(s.values.slice(30))).toEqual(new Set([null]));
  expect(s.gapNotes[40]).toBe('The price adjustment of this chart is unknown.');
 });
 it('a split after the latest filing is known only from Alpaca',()=>{
  const c=company(splitCompany(2,1,1,100),[split('2022-06-15',2,1),split('2024-06-03',3,1)]);
  const bars=dailyBars('2024-05-20','2024-06-10',30),raw=byDate(bars,series(c,bars,'raw').values),adj=byDate(bars,series(c,bars,'split-adjusted').values);
  expect(raw['2024-05-31']).toBeCloseTo(0.5,12);expect(raw['2024-06-03']).toBeCloseTo(0.5/3,12);
  expect(adj['2024-05-31']).toBeCloseTo(0.5/3,12);
 });
});
describe('Apple 4-for-1 split, 2020 (SEC public filing values, no prices)',()=>{
 const facts=()=>aaplSplitFacts();
 it('infers k = 4 with the window (2020-07-31, 2020-10-30]',()=>{
  expect(company(facts()).splits).toEqual([{p:4,q:1,k:4,effective:null,after:'2020-07-31',through:'2020-10-30',source:'restatement',confirmed:false}]);
 });
 it('puts first-filed values on the latest basis: 0.645 and 2.9725',()=>{
  const c=company(facts());
  expect(at(c.statementEvents('eps','quarterly','value','first').versions,'2020-06-27').value).toBeCloseTo(0.645,12);
  expect(at(c.statementEvents('eps','annual','value','first').versions,'2019-09-28').value).toBeCloseTo(2.9725,12);
  expect(at(c.statementEvents('eps','quarterly','value','latest').versions,'2020-06-27').value).toBe(0.65);
 });
 it('prefers the reported Q4 (0.73) over the derived one (0.74)',()=>{
  const q4=c4(facts());
  expect(q4.map(v=>[v.method,v.value])).toEqual([['reported',0.73]]);
  const raw=facts();raw.facts['us-gaap'].EarningsPerShareDiluted.units['USD/shares']=raw.facts['us-gaap'].EarningsPerShareDiluted.units['USD/shares'].filter(r=>!(r.start==='2020-06-28'));
  const derived=c4(raw);expect(derived.map(v=>v.method)).toEqual(['fy-less-9m']);expect(derived[0].value).toBeCloseTo(3.28-2.54,12);
  function c4(raw:object){return company(raw).statementEvents('eps','quarterly','value','first').versions.filter(v=>v.end==='2020-09-26');}
 });
 it('with an Alpaca split effective 2020-08-31, raw bars switch basis exactly on that date',()=>{
  const bars=dailyBars('2020-08-03','2020-10-29',100),c=company(facts(),[split('2020-08-31',4,1)]);
  const eps=byDate(bars,series(c,bars,'raw').values);
  expect(eps['2020-08-03']).toBe(2.58);expect(eps['2020-08-28']).toBe(2.58);expect(eps['2020-08-31']).toBeCloseTo(0.645,12);
 });
 it('without the Alpaca event, raw bars in the window are a gap',()=>{
  const bars=dailyBars('2020-08-03','2020-11-03',100),s=series(company(facts()),bars,'raw'),eps=byDate(bars,s.values);
  expect(eps['2020-08-31']).toBeNull();
  expect(s.gapNotes[bars.findIndex(b=>b.date==='2020-08-31')]).toBe('A 4-for-1 split took effect between 2020-07-31 and 2020-10-30, on a date OpenCandle does not know, so per-share values here are left empty.');
  expect(eps['2020-11-02']).toBe(0.73);
 });
});
