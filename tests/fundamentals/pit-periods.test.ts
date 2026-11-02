import {describe,it,expect} from 'vitest';
import {normalizeCompanyFacts} from '../../src/fundamentals/company-facts';
import {addDays} from '../../src/fundamentals/statements';
import {span} from '../../src/fundamentals/pit-periods';
import {buildPitCompany,computeFundamentalSeries,type PitCompany} from '../../src/fundamentals/pit-metrics';
import type {PitPeriod,PitDisplay,PitRevisions,PitMetricKey,PitVersion} from '../../src/fundamentals/pit-types';
import {CIK,ENTITY,accnFor,dailyBars,factsOf,flatYears,syntheticCompany,ytdOf,quarterOf,type QuarterValues,type RawCompany,type RawFact} from '../fixtures/fundamentals/pit-company';
// All facts and bars are SYNTHETIC (see the fixture). Expected values are worked out by hand in the comments.
const REV='RevenueFromContractWithCustomerExcludingAssessedTax';
const company=(raw:RawCompany,extra:{classTickers?:string[]}={}):PitCompany=>buildPitCompany({facts:normalizeCompanyFacts(raw),retrievedAt:'2026-11-02T00:00:00Z',splitActions:[],...extra});
const events=(c:PitCompany,metric:PitMetricKey,period:PitPeriod,display:PitDisplay='value',revisions:PitRevisions='first')=>c.statementEvents(metric,period,display,revisions).versions;
/** The newest version for a period end (what bars show once everything for that period is public). */
const at=(list:PitVersion[],end:string)=>{const found=list.filter(v=>v.end===end);if(!found.length)throw new Error('No value for '+end+' in '+[...new Set(list.map(v=>v.end))].join(','));return found[found.length-1];};
const q=(revenue:number,eps:number,ocf:number,extra:Partial<QuarterValues>={}):QuarterValues=>({revenue,netIncome:revenue/10,eps,ocf,capex:ocf/3,dilutedShares:100,...extra});
const base=()=>syntheticCompany({
 2021:[q(1000,0.5,100),q(1100,0.6,120),q(1200,0.7,130),q(1300,0.8,160)],
 2022:[q(1400,0.9,170),q(1500,1.0,180),q(1600,1.1,190),q(1700,1.2,200)],
 2023:[q(1800,1.3,210),q(1900,1.4,220),q(2000,1.5,230),q(2100,1.6,240)],
});
describe('standalone quarters from start and end dates',()=>{
 it('derives quarterly cash flow from year-to-date facts (YTD less prior YTD; full year less 9 months for Q4)',()=>{
  const ocf=events(company(base()),'ocf','quarterly');
  // OCF 2021 is reported as YTD only: 100, 220, 350, 510.
  expect(at(ocf,'2021-03-31')).toMatchObject({value:100,method:'reported',start:'2021-01-01'});
  expect(at(ocf,'2021-06-30')).toMatchObject({value:120,method:'ytd-diff',start:'2021-04-01'});
  expect(at(ocf,'2021-09-30')).toMatchObject({value:130,method:'ytd-diff',start:'2021-07-01'});
  expect(at(ocf,'2021-12-31')).toMatchObject({value:160,method:'fy-less-9m',start:'2021-10-01',form:'10-K',filed:'2022-02-20'});
 });
 it('derives Q4 diluted EPS as full year less 9 months when no Q4 is reported, and never by YTD differencing',()=>{
  const eps=events(company(base()),'eps','quarterly');
  // FY2021 EPS 2.6, 9-month 1.8 -> Q4 0.8.
  const q4=at(eps,'2021-12-31');expect(q4.method).toBe('fy-less-9m');expect(q4.value).toBeCloseTo(0.8,10);
  // Without the 3-month Q2 fact, Q2 is not derived from YTD6 - Q1 for a per-share line.
  const raw=base();const rows=factsOf(raw,'EarningsPerShareDiluted','USD/shares');rows.splice(rows.findIndex(r=>r.start==='2021-04-01'&&r.end==='2021-06-30'),1);
  expect(events(company(raw),'eps','quarterly').some(v=>v.end==='2021-06-30')).toBe(false);
  // Revenue (a currency flow) is derived from YTD in the same situation.
  const raw2=base();const rev=factsOf(raw2,REV);rev.splice(rev.findIndex(r=>r.start==='2021-04-01'&&r.end==='2021-06-30'),1);
  expect(at(events(company(raw2),'revenue','quarterly'),'2021-06-30')).toMatchObject({value:1100,method:'ytd-diff'});
 });
 it('prefers a reported Q4; a derived Q4 published earlier stays as the earlier version',()=>{
  const raw=base(),eps=factsOf(raw,'EarningsPerShareDiluted','USD/shares');
  // The FY2022 10-K (filed 2023-02-20) also reports Q4 2021 as a 3-month comparative: 0.81.
  eps.push({...quarterOf(2021,4),val:0.81,filed:'2023-02-20',form:'10-K',accn:accnFor(2022,4)});
  const list=events(company(raw),'eps','quarterly').filter(v=>v.end==='2021-12-31');
  expect(list.map(v=>v.method)).toEqual(['fy-less-9m','reported']);
  expect(list[0].value).toBeCloseTo(0.8,10);expect(list[1].value).toBe(0.81);
  expect(list[0].at).toBeLessThan(list[1].at);
  // Filed together with the full year, the reported Q4 is the only version.
  const raw2=base();factsOf(raw2,'EarningsPerShareDiluted','USD/shares').push({...quarterOf(2021,4),val:0.81,filed:'2022-02-20',form:'10-K',accn:accnFor(2021,4)});
  expect(events(company(raw2),'eps','quarterly').filter(v=>v.end==='2021-12-31').map(v=>[v.method,v.value])).toEqual([['reported',0.81]]);
 });
});
describe('TTM: four contiguous quarters, one tag',()=>{
 it('sums four standalone quarters; TTM EPS is the sum of four quarterly diluted EPS',()=>{
  const c=company(base());
  expect(at(events(c,'revenue','ttm'),'2021-12-31')).toMatchObject({value:4600,method:'sum-4q',start:'2021-01-01'});
  expect(at(events(c,'revenue','ttm'),'2022-06-30').value).toBe(1200+1300+1400+1500);
  const eps=at(events(c,'eps','ttm'),'2022-03-31');expect(eps.method).toBe('sum-4q');expect(eps.value).toBeCloseTo(0.6+0.7+0.8+0.9,10);
  expect(at(events(c,'ocf','ttm'),'2022-09-30').value).toBe(160+170+180+190);
  // Before four quarters exist, TTM is a gap that names the first missing quarter.
  expect(at(events(c,'revenue','ttm'),'2021-09-30')).toMatchObject({value:null,reason:'TTM needs four quarters in a row; the quarter ending 2020-12-31 is not reported.'});
  expect(events(c,'revenue','ttm').filter(v=>v.end<'2021-12-31').every(v=>v.value===null)).toBe(true);
 });
 it('is available when its last input is (the 10-K for a Q4), with that filing as provenance',()=>{
  const v=at(events(company(base()),'revenue','ttm'),'2021-12-31');
  expect(v).toMatchObject({filed:'2022-02-20',form:'10-K',accession:accnFor(2021,4)});
 });
 it('a missing quarter is a gap that names it, until four quarters in a row exist again',()=>{
  const raw=base(),rev=factsOf(raw,REV);
  for(const period of [quarterOf(2022,2),ytdOf(2022,2)])rev.splice(rev.findIndex(r=>r.start===period.start&&r.end===period.end),1);
  const ttm=events(company(raw),'revenue','ttm'),reason='TTM needs four quarters in a row; the quarter ending 2022-06-30 is not reported.';
  for(const end of ['2022-09-30','2022-12-31','2023-03-31'])expect(at(ttm,end)).toMatchObject({value:null,reason});
  expect(at(ttm,'2023-06-30').value).toBe(1800+1900+1700+1600);
  expect(ttm.some(v=>v.end==='2022-06-30')).toBe(false);
 });
 it('a tag switch inside the window is a gap; TTM resumes once four quarters share the new tag',()=>{
  const raw=base(),g=raw.facts['us-gaap'],rows=g[REV].units.USD;
  // 2021 revenue moves to the older Revenues tag (first in the preference list); 2022 on stays on the ASC 606 tag.
  g.Revenues={units:{USD:rows.filter(r=>r.end<'2022-01-01')}};g[REV]={units:{USD:rows.filter(r=>r.end>='2022-01-01')}};
  const ttm=events(company(raw),'revenue','ttm');
  expect(at(ttm,'2021-12-31')).toMatchObject({value:4600,tag:'us-gaap:Revenues'});
  for(const end of ['2022-03-31','2022-06-30','2022-09-30'])expect(at(ttm,end)).toMatchObject({value:null,reason:'Revenue changed tags inside this period (Revenues to '+REV+'). OpenCandle does not mix tags.'});
  expect(at(ttm,'2022-12-31')).toMatchObject({value:6200,tag:'us-gaap:'+REV});
 });
 it('tolerates a few days between quarters only where one filing shows that boundary',()=>{
  const k=(filed:string,n:number,form='10-Q')=>({filed,form,accn:'0009990001-21-'+String(n).padStart(6,'0')});
  const rows=(withComparative:boolean):RawFact[]=>[
   {start:'2021-01-01',end:'2021-03-31',val:100,...k('2021-05-05',1)},
   {start:'2021-04-03',end:'2021-06-30',val:110,...k('2021-08-05',2)},   // starts 2 days after Q1 ended
   ...(withComparative?[{start:'2021-01-01',end:'2021-03-31',val:100,...k('2021-08-05',2)}]:[]),
   {start:'2021-07-01',end:'2021-09-30',val:120,...k('2021-11-05',3)},
   {start:'2021-10-01',end:'2021-12-31',val:130,...k('2022-02-20',4,'10-K')},
  ];
  const ttm=(withComparative:boolean)=>at(events(company({cik:CIK,entityName:ENTITY,facts:{'us-gaap':{[REV]:{units:{USD:rows(withComparative)}}}}}),'revenue','ttm'),'2021-12-31');
  expect(ttm(true)).toMatchObject({value:460,start:'2021-01-01'});
  expect(ttm(false)).toMatchObject({value:null,reason:'TTM needs four quarters in a row; the quarter ending 2021-04-02 is not reported.'});
 });
 it('a same-day conflict is a gap in every value that uses it',()=>{
  const raw=base(),rev=factsOf(raw,REV),q3=rev.find(r=>r.start==='2021-07-01'&&r.end==='2021-09-30')!;
  rev.push({...q3,val:1201,accn:'0009990001-21-000099'});
  const reason='Conflicting values (1200, 1201) were filed on 2021-11-05. OpenCandle does not pick one.';
  expect(at(events(company(raw),'revenue','quarterly'),'2021-09-30')).toMatchObject({value:null,reason});
  expect(at(events(company(raw),'revenue','ttm'),'2021-12-31')).toMatchObject({value:null,reason});
  expect(at(events(company(raw),'revenue','ttm'),'2022-09-30').value).toBe(1300+1400+1500+1600);
 });
});
describe('revisions: first filed (default) and latest filed',()=>{
 const amended=()=>{const raw=base();factsOf(raw,REV).push({start:'2021-01-01',end:'2021-12-31',val:4700,filed:'2022-04-15',form:'10-K/A',accn:'0009990001-22-000050'});return raw;};
 it('first filed keeps the original 10-K; latest filed takes the amendment but keeps the first availability',()=>{
  const c=company(amended());
  const first=at(events(c,'revenue','annual','value','first'),'2021-12-31'),latest=at(events(c,'revenue','annual','value','latest'),'2021-12-31');
  expect(first).toMatchObject({value:4600,form:'10-K',filed:'2022-02-20'});
  expect(latest).toMatchObject({value:4700,form:'10-K/A',filed:'2022-04-15'});
  expect(latest.at).toBe(first.at);
  // The derived Q4 follows: 4600 - 3300 = 1300 first filed, 4700 - 3300 = 1400 latest filed.
  expect(at(events(c,'revenue','quarterly','value','first'),'2021-12-31').value).toBe(1300);
  expect(at(events(c,'revenue','quarterly','value','latest'),'2021-12-31').value).toBe(1400);
 });
 it('bars show the first-filed value before and after the amendment is filed',()=>{
  const c=company(amended()),bars=dailyBars('2022-03-01','2022-05-02',10);
  const s=computeFundamentalSeries(c,{bars,interval:{unit:'day',multiplier:1,seconds:null},adjustment:'split-adjusted',currency:'USD'},{metric:'revenue',period:'annual',display:'value',revisions:'first'});
  expect(new Set(s.values)).toEqual(new Set([4600]));
 });
});
describe('year over year',()=>{
 it('compares with the period ending 358-372 days earlier and of the same length',()=>{
  const c=company(base());
  expect(at(events(c,'revenue','quarterly','yoy'),'2022-03-31').value).toBeCloseTo((1400-1000)/1000*100,10);
  expect(at(events(c,'revenue','ttm','yoy'),'2022-12-31').value).toBeCloseTo((6200-4600)/4600*100,10);
  expect(at(events(c,'revenue','quarterly','yoy'),'2021-03-31')).toMatchObject({value:null,reason:'No comparable period a year earlier is reported.'});
 });
 it('is not meaningful when the prior-year value is zero or negative',()=>{
  const raw=syntheticCompany({2021:[q(1000,-0.2,100),q(1000,0.1,100),q(1000,0.1,100),q(1000,0.1,100)],2022:[q(1000,0.3,100),q(1000,0.1,100),q(1000,0.1,100),q(1000,0.1,100)]});
  expect(at(events(company(raw),'eps','quarterly','yoy'),'2022-03-31')).toMatchObject({value:null,reason:'The prior-year value is zero or negative, so growth is not meaningful.'});
 });
 it('uses one tag for both periods',()=>{
  const raw=base(),g=raw.facts['us-gaap'],rows=g[REV].units.USD;
  g.Revenues={units:{USD:rows.filter(r=>r.end<'2022-01-01')}};g[REV]={units:{USD:rows.filter(r=>r.end>='2022-01-01')}};
  expect(at(events(company(raw),'revenue','quarterly','yoy'),'2022-03-31')).toMatchObject({value:null,reason:'Revenue changed tags inside this period (Revenues to '+REV+'). OpenCandle does not mix tags.'});
 });
});
describe('52/53-week fiscal years',()=>{
 // Fiscal years end on the last Saturday of September: FY2022 2021-09-26..2022-09-24 (364 days, four 91-day quarters),
 // FY2023 2022-09-25..2023-09-30 (371 days; Q4 is the 14-week quarter 2023-06-25..2023-09-30, 98 days).
 const fiscal=()=>{
  const usd:RawFact[]=[],eps:RawFact[]=[];let n=0;
  const year=(start:string,lengths:number[],values:number[],filed:string[])=>{
   let s=start;const ends:string[]=[];for(const len of lengths){ends.push(addDays(s,len-1));s=addDays(s,len);}
   let qs=start,ytd=0;
   for(let i=0;i<3;i++){const f={filed:filed[i],form:'10-Q',accn:'0009990001-'+filed[i].slice(2,4)+'-'+String(++n).padStart(6,'0')};usd.push({start:qs,end:ends[i],val:values[i],...f});ytd+=values[i];if(i)usd.push({start,end:ends[i],val:ytd,...f});eps.push({start:qs,end:ends[i],val:values[i]/1000,...f});if(i)eps.push({start,end:ends[i],val:ytd/1000,...f});qs=addDays(ends[i],1);}
   const k={filed:filed[3],form:'10-K',accn:'0009990001-'+filed[3].slice(2,4)+'-'+String(++n).padStart(6,'0')};usd.push({start,end:ends[3],val:ytd+values[3],...k});eps.push({start,end:ends[3],val:(ytd+values[3])/1000,...k});
   return ends;
  };
  const e22=year('2021-09-26',[91,91,91,91],[100,110,120,130],['2022-01-28','2022-04-29','2022-07-29','2022-10-28']);
  const e23=year('2022-09-25',[91,91,91,98],[140,150,160,200],['2023-02-03','2023-05-05','2023-08-04','2023-11-03']);
  return {raw:{cik:CIK,entityName:ENTITY,facts:{'us-gaap':{[REV]:{units:{USD:usd}},EarningsPerShareDiluted:{units:{'USD/shares':eps}}}}},e22,e23};
 };
 it('accepts a 371-day TTM with a 14-week quarter and labels it',()=>{
  const {raw,e22,e23}=fiscal();
  expect(e22[3]).toBe('2022-09-24');expect(e23[3]).toBe('2023-09-30');expect(span('2023-06-25','2023-09-30')).toBe(98);
  const c=company(raw),q4=at(events(c,'revenue','quarterly'),'2023-09-30'),ttm=at(events(c,'revenue','ttm'),'2023-09-30');
  expect(q4).toMatchObject({value:200,method:'fy-less-9m',start:'2023-06-25',note:'14-week quarter'});
  expect(ttm).toMatchObject({value:650,start:'2022-09-25',note:'Includes a 14-week quarter'});
  expect(span(ttm.start!,ttm.end)).toBe(371);
 });
 it('compares the 14-week quarter with the prior 13-week quarter (371 days apart, 7 days longer)',()=>{
  const c=company(fiscal().raw),yoy=at(events(c,'revenue','quarterly','yoy'),'2023-09-30');
  expect(yoy.value).toBeCloseTo((200-130)/130*100,10);expect(yoy.note).toBe('14-week quarter');
  expect(at(events(c,'revenue','ttm','yoy'),'2023-09-30').value).toBeCloseTo((650-460)/460*100,10);
 });
});
describe('instant lines and gates',()=>{
 it('holds balance-sheet instants forward and filters annual instants to fiscal year ends',()=>{
  const c=company(syntheticCompany(flatYears([2021,2022]),{equity:5000}));
  expect(events(c,'shares','ttm').map(v=>v.end)).toContain('2021-05-01');
  const annual=events(c,'shares','annual').map(v=>v.end);
  expect(annual).toEqual(['2021-12-31','2022-12-31']);   // only the balance-sheet counts at fiscal year ends
 });
 it('names an untagged concept',()=>{
  expect(company(base()).statementEvents('dps','ttm','value','first').untagged).toBe(ENTITY+' does not tag dividends per share in its filings.');
 });
 it('gates IFRS filers',()=>{
  const c=company({cik:CIK,entityName:'Synthetic Abroad plc (SYNTHETIC)',facts:{'ifrs-full':{Revenue:{units:{EUR:[{start:'2021-01-01',end:'2021-12-31',val:1,filed:'2022-03-01',form:'20-F',accn:'0009990001-22-000001'}]}}}}});
  expect(c.gate).toBe('Synthetic Abroad plc (SYNTHETIC) reports under IFRS. This version reads US GAAP filings only.');
  const s=computeFundamentalSeries(c,{bars:dailyBars('2022-03-01','2022-03-04',1),interval:{unit:'day',multiplier:1,seconds:null},adjustment:'raw',currency:'EUR'},{metric:'pe',period:'ttm',display:'value',revisions:'first'});
  expect(s.reason).toBe(c.gate);expect(s.values).toEqual([null,null,null,null]);
 });
});
