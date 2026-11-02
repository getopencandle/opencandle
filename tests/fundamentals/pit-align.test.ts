import {describe,it,expect} from 'vitest';
import {normalizeCompanyFacts} from '../../src/fundamentals/company-facts';
import {acceptanceFromFilings,alignEvents,availabilityResolver,barClock,nextSessionStart,parseAcceptance} from '../../src/fundamentals/pit-align';
import {buildPitCompany,computeFundamentalSeries} from '../../src/fundamentals/pit-metrics';
import {newYorkWallTime} from '../../src/domain/us-market-hours';
import {CIK,ENTITY,dailyBars,factsOf,flatYears,syntheticCompany,type RawCompany} from '../fixtures/fundamentals/pit-company';
// Bars and filings are SYNTHETIC. Expected instants are written out as New York wall-clock times.
const ny=(date:string,hh:number,mm=0)=>newYorkWallTime(date,hh*60+mm),REV='RevenueFromContractWithCustomerExcludingAssessedTax';
const DAY={unit:'day' as const,multiplier:1,seconds:null},WEEK={unit:'week' as const,multiplier:1,seconds:null},MONTH={unit:'month' as const,multiplier:1,seconds:null},MIN5={unit:'minute' as const,multiplier:5,seconds:300};
function rng(seed:number){let s=seed>>>0;return ()=>{s=(s+0x6D2B79F5)>>>0;let t=s;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return ((t^t>>>14)>>>0)/4294967296;};}
describe('availability: SEC acceptance time, else the next session after the filed date',()=>{
 it('reads EDGAR acceptance digits as New York wall-clock time',()=>{
  expect(parseAcceptance('2020-10-29T18:04:19.000Z')).toBe(ny('2020-10-29',18,4)+19);
  expect(parseAcceptance('2021-01-15T07:00:00Z')).toBe(ny('2021-01-15',7));   // winter offset
  expect(parseAcceptance('2021-13-01T07:00:00Z')).toBeNull();
  expect(parseAcceptance('yesterday')).toBeNull();
  expect(parseAcceptance(null)).toBeNull();
 });
 it('falls back to 04:00 New York of the next trading day, skipping weekends and holidays',()=>{
  expect(nextSessionStart('2021-05-05')).toBe(ny('2021-05-06',4));
  expect(nextSessionStart('2021-11-05')).toBe(ny('2021-11-08',4));   // Friday -> Monday
  expect(nextSessionStart('2022-02-20')).toBe(ny('2022-02-22',4));   // Sunday, then Presidents Day 2022-02-21
 });
 it('uses an acceptance consistent with the filed date, else the later of acceptance and the fallback',()=>{
  const at=availabilityResolver(acceptanceFromFilings([
   {accession:'a-same-day',acceptanceReported:'2021-05-05T16:20:00.000Z'},
   {accession:'a-evening-before',acceptanceReported:'2021-05-04T18:10:00.000Z'},
   {accession:'a-too-early',acceptanceReported:'2021-03-01T09:00:00.000Z'},
   {accession:'a-missing',acceptanceReported:null},
  ]));
  expect(at('a-same-day','2021-05-05')).toBe(ny('2021-05-05',16,20));
  expect(at('a-evening-before','2021-05-05')).toBe(ny('2021-05-04',18,10));   // accepted after 17:30, dated the next day
  expect(at('a-too-early','2021-05-05')).toBe(ny('2021-05-06',4));
  expect(at('a-missing','2021-05-05')).toBe(ny('2021-05-06',4));
  expect(at(null,'2021-05-05')).toBe(ny('2021-05-06',4));
 });
});
describe('bar ends for every bar size',()=>{
 it('daily bars end at the regular close; early closes at 13:00',()=>{
  const {dates,ends}=barClock([{time:ny('2021-11-26',0)},{time:ny('2021-11-29',0)}],DAY);
  expect(dates).toEqual(['2021-11-26','2021-11-29']);
  expect([...ends]).toEqual([ny('2021-11-26',13),ny('2021-11-29',16)]);
 });
 it('daily bars stamped at UTC midnight keep their own date (midday rule)',()=>{
  expect(barClock([{time:Date.parse('2021-05-05T00:00:00Z')/1000}],DAY).dates).toEqual(['2021-05-05']);
 });
 it('weekly and monthly bars end at the close of their last trading session',()=>{
  // Week of Monday 2021-11-01 ends Friday 2021-11-05 16:00. April 2021 ends Friday 2021-04-30 16:00.
  expect([...barClock([{time:ny('2021-11-01',0)}],WEEK).ends]).toEqual([ny('2021-11-05',16)]);
  expect([...barClock([{time:ny('2021-04-01',0)}],MONTH).ends]).toEqual([ny('2021-04-30',16)]);
  // Week of 2021-12-27 ends Friday 2021-12-31; December 2022 ends Friday 2022-12-30 (no session on the 31st).
  expect([...barClock([{time:ny('2021-12-27',0)}],WEEK).ends]).toEqual([ny('2021-12-31',16)]);
  expect([...barClock([{time:ny('2022-12-01',0)}],MONTH).ends]).toEqual([ny('2022-12-30',16)]);
 });
 it('intraday bars end at open plus interval, cut at the session segment',()=>{
  const hour={unit:'minute' as const,multiplier:60,seconds:3600};
  expect([...barClock([{time:ny('2021-05-05',15,30)},{time:ny('2021-05-05',10,30)}],hour).ends]).toEqual([ny('2021-05-05',16),ny('2021-05-05',11,30)]);
 });
});
describe('alignment: a value shows on a bar only when available before the bar ends',()=>{
 const raw=()=>syntheticCompany(flatYears([2021]));
 const company=(r:RawCompany,acceptance?:Map<string,string|null>)=>buildPitCompany({facts:normalizeCompanyFacts(r),retrievedAt:'2026-11-02T12:00:00Z',acceptance,splitActions:[]});
 const req={metric:'revenue' as const,period:'quarterly' as const,display:'value' as const,revisions:'first' as const};
 it('without acceptance, a filing shows from the session after its filed date',()=>{
  const bars=dailyBars('2021-05-03','2021-05-10',100),s=computeFundamentalSeries(company(raw()),{bars,interval:DAY,adjustment:'split-adjusted',currency:'USD'},req);
  expect(bars.map(b=>b.date)).toEqual(['2021-05-03','2021-05-04','2021-05-05','2021-05-06','2021-05-07','2021-05-10']);
  expect(s.values).toEqual([null,null,null,1000,1000,1000]);
  const stamp=s.fundamentalStamps.table[s.fundamentalStamps.index[3]];
  expect(stamp).toMatchObject({start:'2021-01-01',end:'2021-03-31',filed:'2021-05-05',form:'10-Q',method:'reported',availableAt:ny('2021-05-06',4),retrievedAt:'2026-11-02T12:00:00Z',tag:'us-gaap:RevenueFromContractWithCustomerExcludingAssessedTax'});
  expect(s.fundamentalStamps.index[2]).toBe(-1);
 });
 it('a filing accepted before the close shows on that day; after the close it waits for the next bar',()=>{
  const bars=dailyBars('2021-05-04','2021-05-06',100),chart={bars,interval:DAY,adjustment:'split-adjusted' as const,currency:'USD'};
  const q1=factsOf(raw(),REV).find(f=>f.end==='2021-03-31')!.accn;
  expect(computeFundamentalSeries(company(raw(),new Map([[q1,'2021-05-05T08:15:00.000Z']])),chart,req).values).toEqual([null,1000,1000]);
  expect(computeFundamentalSeries(company(raw(),new Map([[q1,'2021-05-05T16:20:00.000Z']])),chart,req).values).toEqual([null,null,1000]);
  // 5-minute bars: the 16:15 bar ends at 16:20 and does not show it; the 16:20 bar does.
  const intraday=[ny('2021-05-05',16,10),ny('2021-05-05',16,15),ny('2021-05-05',16,20)].map(time=>({time,open:1,close:1}));
  expect(computeFundamentalSeries(company(raw(),new Map([[q1,'2021-05-05T16:20:00.000Z']])),{bars:intraday,interval:MIN5,adjustment:'split-adjusted',currency:'USD'},req).values).toEqual([null,null,1000]);
 });
 it('an acceptance after the last session of a week or month belongs to the next bar',()=>{
  const r=raw(),q3=factsOf(r,REV).find(f=>f.end==='2021-09-30')!.accn;
  const c=company(r,new Map([[q3,'2021-11-05T16:30:00.000Z']]));
  const weeks=[ny('2021-11-01',0),ny('2021-11-08',0)].map(time=>({time,open:1,close:1}));
  const w=computeFundamentalSeries(c,{bars:weeks,interval:WEEK,adjustment:'split-adjusted',currency:'USD'},req);
  expect(w.values).toEqual([1000,1000]);
  expect(w.fundamentalStamps.table[w.fundamentalStamps.index[0]].end).toBe('2021-06-30');   // Q2 still showing that week
  expect(w.fundamentalStamps.table[w.fundamentalStamps.index[1]].end).toBe('2021-09-30');
  const months=[ny('2021-10-01',0),ny('2021-11-01',0)].map(time=>({time,open:1,close:1}));
  const m=computeFundamentalSeries(c,{bars:months,interval:MONTH,adjustment:'split-adjusted',currency:'USD'},req);
  expect(m.fundamentalStamps.table[m.fundamentalStamps.index[1]].end).toBe('2021-09-30');
  const acceptedInOctober=company(r,new Map([[q3,'2021-10-29T16:01:00.000Z']]));
  const m2=computeFundamentalSeries(acceptedInOctober,{bars:months,interval:MONTH,adjustment:'split-adjusted',currency:'USD'},req);
  expect(m2.fundamentalStamps.table[m2.fundamentalStamps.index[0]].end).toBe('2021-06-30');   // after October's last close
  expect(m2.fundamentalStamps.table[m2.fundamentalStamps.index[1]].end).toBe('2021-09-30');
 });
 it('shows the available event with the greatest period end; a newer version of the same period replaces it',()=>{
  const events=[{end:'2021-06-30',at:10},{end:'2021-03-31',at:20},{end:'2021-06-30',at:30},{end:'2021-09-30',at:40}];
  expect([...alignEvents(events,Float64Array.from([5,15,25,35,45]))]).toEqual([-1,0,0,2,3]);
 });
});
describe('property: 1,000 filings never show before they are available',()=>{
 it('holds for daily, weekly, monthly and intraday bars',()=>{
  const random=rng(20261102),usd:object[]=[],acceptance=new Map<string,string|null>();
  for(let i=0;i<1000;i++){
   const year=2016+Math.floor(random()*8),q=1+Math.floor(random()*4),endMonth=q*3,end=year+'-'+String(endMonth).padStart(2,'0')+'-'+(endMonth===3||endMonth===12?'31':'30');
   const start=year+'-'+String(endMonth-2).padStart(2,'0')+'-01',filedTime=Date.parse(end+'T00:00:00Z')+(20+Math.floor(random()*400))*86400000,filed=new Date(filedTime).toISOString().slice(0,10);
   const accn='0009990001-'+String(i%100).padStart(2,'0')+'-'+String(i).padStart(6,'0');
   usd.push({start,end,val:Math.round(random()*1000),filed,form:random()<0.1?'10-Q/A':'10-Q',accn});
   if(random()<0.7){const h=Math.floor(random()*24),mi=Math.floor(random()*60);acceptance.set(accn,filed+'T'+String(h).padStart(2,'0')+':'+String(mi).padStart(2,'0')+':00.000Z');}
  }
  const facts=normalizeCompanyFacts({cik:CIK,entityName:ENTITY,facts:{'us-gaap':{RevenueFromContractWithCustomerExcludingAssessedTax:{units:{USD:usd}}}}});
  for(const revisions of ['first','latest'] as const){
   const company=buildPitCompany({facts,retrievedAt:'2026-11-02T00:00:00Z',acceptance,splitActions:[]});
   const daily=dailyBars('2016-01-01','2025-12-31',1),weekly=daily.filter((_,i)=>i%5===0),monthly=daily.filter((b,i)=>i===0||b.date.slice(0,7)!==daily[i-1].date.slice(0,7));
   const intraday:{time:number;open:number;close:number}[]=[];for(const b of daily.filter((_,i)=>i%7===0))for(let k=0;k<12;k++)intraday.push({time:ny(b.date,9,30)+k*1800,open:1,close:1});
   for(const [bars,interval] of [[daily,DAY],[weekly,WEEK],[monthly,MONTH],[intraday,{unit:'minute' as const,multiplier:30,seconds:1800}]] as const){
    for(const period of ['quarterly','ttm'] as const){
     const s=computeFundamentalSeries(company,{bars,interval,adjustment:'split-adjusted',currency:'USD'},{metric:'revenue',period,display:'value',revisions});
     const {ends}=barClock(bars,interval);let shown=0;
     for(let i=0;i<bars.length;i++){const k=s.fundamentalStamps.index[i];if(k<0)continue;shown++;expect(s.fundamentalStamps.table[k].availableAt).toBeLessThan(ends[i]);}
     expect(shown).toBeGreaterThan(bars.length/2);
    }
   }
  }
 });
});
