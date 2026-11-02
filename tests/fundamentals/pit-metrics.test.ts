import {describe,it,expect} from 'vitest';
import {normalizeCompanyFacts} from '../../src/fundamentals/company-facts';
import {buildPitCompany,computeFundamentalSeries,createPeBands,emptyPitSeries,PIT_METRICS,type PitCompany} from '../../src/fundamentals/pit-metrics';
import {PIT_METHOD_LABELS,type AdjustmentBasis,type PeBandsRequest,type PitChart,type PitMetricKey,type PitRequest} from '../../src/fundamentals/pit-types';
import {ENTITY,dailyBars,factsOf,flatYears,syntheticCompany,type RawCompany} from '../fixtures/fundamentals/pit-company';
// All facts and bars are SYNTHETIC. Expected values are worked out by hand: every quarter has revenue 1000, diluted EPS 1,
// operating cash flow 150 and capex 50; equity is 5000 and 100 shares are outstanding. TTM EPS 4, TTM revenue 4000,
// TTM free cash flow 400.
const DAY={unit:'day' as const,multiplier:1,seconds:null};
const company=(raw:RawCompany,extra:{classTickers?:string[]}={}):PitCompany=>buildPitCompany({facts:normalizeCompanyFacts(raw),retrievedAt:'2026-11-02T00:00:00Z',splitActions:[],...extra});
const chart=(bars:{time:number;open:number;close:number}[],patch:Partial<PitChart>={}):PitChart=>({bars,interval:DAY,adjustment:'split-adjusted',currency:'USD',...patch});
const req=(metric:PitMetricKey,patch:Partial<PitRequest>={}):PitRequest=>({metric,period:'ttm',display:'value',revisions:'first',...patch});
const flat=()=>syntheticCompany(flatYears([2021,2022,2023]));
const on=(bars:{date:string}[],values:readonly (number|null|string)[],date:string)=>values[bars.findIndex(b=>b.date===date)];
describe('valuation ratios on each bar\'s own close',()=>{
 const bars=dailyBars('2022-03-01','2022-03-04',80);
 it('computes P/E, earnings yield, market cap, P/S, P/B, P/FCF, FCF yield and FCF per share',()=>{
  const c=company(flat()),v=(m:PitMetricKey)=>computeFundamentalSeries(c,chart(bars),req(m)).values[0];
  expect(v('pe')).toBe(20);expect(v('ey')).toBe(5);expect(v('mcap')).toBe(8000);expect(v('ps')).toBe(2);expect(v('pb')).toBe(1.6);
  expect(v('pfcf')).toBe(20);expect(v('fcfy')).toBe(5);expect(v('fcf_ps')).toBe(4);
 });
 it('ignores the Period and Display inputs for ratios',()=>{
  const c=company(flat());
  expect(computeFundamentalSeries(c,chart(bars),req('pe',{period:'quarterly',display:'yoy'})).values[0]).toBe(20);
 });
 it('stamps ratios as calculated, with the TTM EPS filing as provenance',()=>{
  const s=computeFundamentalSeries(company(flat()),chart(bars),req('pe')),stamp=s.fundamentalStamps.table[s.fundamentalStamps.index[0]];
  expect(stamp).toMatchObject({end:'2021-12-31',start:'2021-01-01',filed:'2022-02-20',form:'10-K',method:'computed'});
  expect(PIT_METHOD_LABELS[stamp.method]).toBe('Calculated by OpenCandle');
 });
 it('dividend yield needs tagged dividends per share',()=>{
  expect(computeFundamentalSeries(company(flat()),chart(bars),req('dy')).reason).toBe(ENTITY+' does not tag dividends per share in its filings.');
  const raw=flat(),eps=factsOf(raw,'EarningsPerShareDiluted','USD/shares');
  raw.facts['us-gaap'].CommonStockDividendsPerShareDeclared={units:{'USD/shares':eps.map(r=>({...r,val:Math.round(r.val/4*100)/100}))}};
  expect(computeFundamentalSeries(company(raw),chart(bars),req('dy')).values[0]).toBe(1.25);   // TTM DPS 1 / 80
 });
 it('leaves P/E empty while TTM EPS is zero or negative and keeps earnings yield',()=>{
  const raw=syntheticCompany({...flatYears([2022]),2021:[0,1,2,3].map(i=>({revenue:1000,netIncome:-10,eps:i===1?-0.12:-0.1,ocf:150,capex:50,dilutedShares:100}))});
  const c=company(raw),pe=computeFundamentalSeries(c,chart(bars),req('pe'));
  expect(pe.values[0]).toBeNull();
  expect(pe.gapNotes[0]).toBe('P/E is not meaningful while TTM EPS is zero or negative (-0.42). Choose Earnings yield to chart it.');
  expect(computeFundamentalSeries(c,chart(bars),req('ey')).values[0]).toBeCloseTo(-0.42/80*100,10);
 });
 it('refuses total-return bars and mismatched or missing currencies',()=>{
  const c=company(flat());
  expect(computeFundamentalSeries(c,chart(bars,{adjustment:'total-return'}),req('pe')).reason).toBe('Ratios need split-adjusted or raw prices; this chart uses total-return prices.');
  expect(computeFundamentalSeries(c,chart(bars,{currency:'EUR'}),req('mcap')).reason).toBe('The loaded price is in EUR but the filing values are in USD. OpenCandle does not convert currencies.');
  expect(computeFundamentalSeries(c,chart(bars,{currency:null}),req('pe')).reason).toBe('The loaded dataset does not state a currency, so it cannot be matched to the USD filing values. OpenCandle never guesses a currency.');
  // Statement metrics are not price ratios and still plot on total-return charts.
  expect(computeFundamentalSeries(c,chart(bars,{adjustment:'total-return'}),req('revenue')).values[0]).toBe(4000);
 });
});
describe('share counts',()=>{
 const bars=dailyBars('2022-03-01','2022-03-04',80);
 it('rejects counts of zero and uses the latest positive count',()=>{
  const raw=flat();
  for(const r of factsOf(raw,'EntityCommonStockSharesOutstanding','shares','dei'))if(r.filed==='2022-02-20')r.val=0;
  for(const r of factsOf(raw,'CommonStockSharesOutstanding','shares'))if(r.filed==='2022-02-20')r.val=0;
  const s=computeFundamentalSeries(company(raw),chart(bars),req('mcap'));
  expect(s.values[0]).toBe(8000);
  const shares=computeFundamentalSeries(company(raw),chart(bars),req('shares'));
  expect(shares.fundamentalStamps.table[shares.fundamentalStamps.index[0]].end).toBe('2021-11-01');
 });
 it('leaves share-based values empty once the latest count is more than 400 days old',()=>{
  const c=company(syntheticCompany(flatYears([2021]))),later=dailyBars('2023-03-01','2023-03-15',80);
  const s=computeFundamentalSeries(c,chart(later),req('mcap'));
  expect(on(later,s.values,'2023-03-07')).toBe(8000);   // 2022-02-01 + 399 days
  expect(on(later,s.values,'2023-03-08')).toBe(8000);   // 400 days is still allowed; 2023-03-09 is 401
  expect(on(later,s.values,'2023-03-09')).toBeNull();
  expect(on(later,s.gapNotes,'2023-03-09')).toBe('The latest share count (2022-02-01) is over a year old.');
  expect(on(later,computeFundamentalSeries(c,chart(later),req('pe')).values,'2023-03-09')).toBe(20);
 });
 it('leaves market value empty for a company with several share classes',()=>{
  const c=company(flat(),{classTickers:['SYNA','SYNB']}),text=ENTITY+" has several share classes (SYNA, SYNB). Market value needs each class's price, so this is left empty.";
  for(const m of ['mcap','ps','pb','pfcf','fcfy','fcf_ps','shares'] as const){const s=computeFundamentalSeries(c,chart(bars),req(m));expect(s.values[0]).toBeNull();expect(s.gapNotes[0]).toBe(text);}
  expect(computeFundamentalSeries(c,chart(bars),req('pe')).values[0]).toBe(20);
 });
 it('treats several values on one filing as several share classes',()=>{
  const raw=flat(),dei=factsOf(raw,'EntityCommonStockSharesOutstanding','shares','dei'),row=dei.find(r=>r.filed==='2022-02-20')!;
  dei.push({...row,val:40});
  const s=computeFundamentalSeries(company(raw),chart(bars),req('shares'));
  expect(s.values[0]).toBeNull();expect(s.gapNotes[0]).toBe(ENTITY+" has several share classes. Market value needs each class's price, so this is left empty.");
 });
});
describe('statement metrics on bars',()=>{
 const bars=dailyBars('2022-03-01','2022-03-04',80);
 it('free cash flow, margins and balance-sheet ratios',()=>{
  const raw=flat();const g=raw.facts['us-gaap'];
  g.GrossProfit={units:{USD:factsOf(raw,'RevenueFromContractWithCustomerExcludingAssessedTax').map(r=>({...r,val:r.val*0.4}))}};
  g.AssetsCurrent={units:{USD:factsOf(raw,'StockholdersEquity').map(r=>({...r,val:3000}))}};
  g.LiabilitiesCurrent={units:{USD:factsOf(raw,'StockholdersEquity').map(r=>({...r,val:1500}))}};
  g.Liabilities={units:{USD:factsOf(raw,'StockholdersEquity').map(r=>({...r,val:2500}))}};
  const c=company(raw),v=(m:PitMetricKey,p:Partial<PitRequest>={})=>computeFundamentalSeries(c,chart(bars),req(m,p)).values[0];
  expect(v('fcf')).toBe(400);expect(v('fcf',{period:'quarterly'})).toBe(100);expect(v('fcf',{period:'annual'})).toBe(400);
  expect(v('fcf_margin')).toBe(10);expect(v('gross_margin')).toBeCloseTo(40,10);expect(v('net_margin')).toBe(10);
  expect(v('current_ratio')).toBe(2);expect(v('liab_equity')).toBe(0.5);
  expect(computeFundamentalSeries(c,chart(bars),req('op_margin')).reason).toBe(ENTITY+' does not tag operating income in its filings.');
 });
 it('names the missing input of a derived value',()=>{
  const raw=flat(),capex=factsOf(raw,'PaymentsToAcquirePropertyPlantAndEquipment');
  capex.splice(0,capex.length,...capex.filter(r=>r.end!=='2021-12-31'));
  const s=computeFundamentalSeries(company(raw),chart(bars),req('fcf',{period:'annual'}));
  expect(s.values[0]).toBeNull();expect(s.gapNotes[0]).toBe('Free cash flow needs capital expenditures for the period ending 2021-12-31.');
 });
 it('lists every metric with a stable key and never throws',()=>{
  expect(PIT_METRICS.map(m=>m.key)).toEqual(['eps','revenue','net_income','ocf','capex','fcf','fcf_margin','fcf_ps','gross_margin','op_margin','net_margin','current_ratio','liab_equity','shares','dps','pe','ey','mcap','ps','pb','pfcf','fcfy','dy']);
  const bad=computeFundamentalSeries(company(flat()),chart([{time:Number.NaN,open:1,close:1}]),req('pe'));
  expect(bad.values).toEqual([null]);expect(bad.reason).toMatch(/^Fundamental values could not be computed: /);
  expect(emptyPitSeries(2,'Loading SEC company data for SYN.')).toMatchObject({values:[null,null],reason:'Loading SEC company data for SYN.'});
 });
});
describe('P/E bands',()=>{
 const five=()=>syntheticCompany(flatYears([2019,2020,2021,2022,2023]));
 const own:PeBandsRequest={mode:'own',lookbackYears:5,bands:'percentile',multiples:[15,20,25],graham:false,revisions:'first'};
 const wave=(date:string,i:number)=>60+20*Math.sin(i/9)+((i*37)%11);
 const bars=dailyBars('2020-03-02','2023-06-30',wave);
 /** Independent reference: one P/E per date (close / 4) from earlier dates within 5 years, plus this bar's own. */
 function reference(i:number,p:number,sigma=false,years=5):number|null{
  const date=bars[i].date,cutoff=String(Number(date.slice(0,4))-years)+date.slice(4),sample=bars.slice(0,i+1).filter(b=>b.date>cutoff).map(b=>b.close/4);
  if((Date.parse(date)-Date.parse(bars[0].date))/86400000<365)return null;
  if(sigma){const mean=sample.reduce((s,x)=>s+x,0)/sample.length,sd=Math.sqrt(sample.reduce((s,x)=>s+(x-mean)**2,0)/sample.length);return (mean+p*sd)*4;}
  const s=[...sample].sort((a,b)=>a-b),h=(s.length-1)*p,k=Math.floor(h);return (s[k]+(h-k)*((s[k+1]??s[k])-s[k]))*4;
 }
 it('multiples are k x TTM EPS',()=>{
  const r=createPeBands(company(flat()),{...own,mode:'multiples'}).compute(chart(dailyBars('2022-03-01','2022-03-02',80)));
  expect([r.m1[0],r.m2[0],r.m3[0]]).toEqual([60,80,100]);expect(r.median[0]).toBeNull();
 });
 it('own-history percentiles match an independent calculation and are causal',()=>{
  const r=createPeBands(company(five()),own).compute(chart(bars));
  for(const i of [300,420,555,700,bars.length-1]){
   expect(r.median[i]).toBeCloseTo(reference(i,0.5)!,9);expect(r.upper[i]).toBeCloseTo(reference(i,0.75)!,9);expect(r.lower[i]).toBeCloseTo(reference(i,0.25)!,9);
  }
  const early=bars.findIndex(b=>b.date==='2020-12-01');
  expect(r.median[early]).toBeNull();expect(r.gapNotes[early]).toBe('Own-history bands need 1 year of P/E history before this bar.');
  const cut=createPeBands(company(five()),own).compute(chart(bars.slice(0,500)));
  expect(cut.median).toEqual(r.median.slice(0,500));
 });
 it('drops dates older than the lookback',()=>{
  const r=createPeBands(company(five()),{...own,lookbackYears:1}).compute(chart(bars));
  for(const i of [300,555,bars.length-1])expect(r.median[i]).toBeCloseTo(reference(i,0.5,false,1)!,9);
 });
 it('mean plus or minus one sigma',()=>{
  const r=createPeBands(company(five()),{...own,bands:'sigma'}).compute(chart(bars));
  for(const i of [400,700]){expect(r.median[i]).toBeCloseTo(reference(i,0,true)!,8);expect(r.upper[i]).toBeCloseTo(reference(i,1,true)!,8);expect(r.lower[i]).toBeCloseTo(reference(i,-1,true)!,8);}
 });
 it('needs P/E dates spanning a year',()=>{
  const r=createPeBands(company(flat()),own).compute(chart(dailyBars('2022-03-01','2022-09-30',80)));
  expect(r.reason).toBe('Own-history bands need 1 year of bars; this chart has 0.5 years.');
  expect(new Set(r.median)).toEqual(new Set([null]));
 });
 it('skips bars with negative EPS',()=>{
  const raw=syntheticCompany({...flatYears([2019,2021,2022,2023]),2020:[0,1,2,3].map(()=>({revenue:1000,netIncome:-10,eps:-1,ocf:150,capex:50,dilutedShares:100}))});
  // TTM EPS: Q2 2020 0, then negative until Q3 2021 (-1 + 1 + 1 + 1 = 2, available 2021-11-08).
  const b=dailyBars('2020-09-01','2023-06-30',wave),r=createPeBands(company(raw),own).compute(chart(b));
  const i=b.findIndex(x=>x.date==='2021-03-01');
  expect(r.median[i]).toBeNull();expect(r.gapNotes[i]).toBe('P/E is not meaningful while TTM EPS is zero or negative (-4). Choose Earnings yield to chart it.');
  // The first valid P/E date is 2021-11-08, so bands start 365 days later.
  expect(on(b,r.median,'2022-11-07')).toBeNull();expect(on(b,r.gapNotes,'2022-11-07')).toBe('Own-history bands need 1 year of P/E history before this bar.');
  expect(on(b,r.median,'2022-11-08')).not.toBeNull();
 });
 it('recomputes only the last date on ticks and gives the same result as a fresh run',()=>{
  const engine=createPeBands(company(five()),own),c1=chart(bars.slice(0,-1));
  engine.compute(c1);
  const ticked=bars.slice(0,-1).map((b,i,a)=>i===a.length-1?{...b,close:b.close+3}:b),appended=[...ticked,bars[bars.length-1]];
  for(const next of [ticked,appended,bars.slice(0,600),bars]){
   expect(engine.compute(chart(next))).toEqual(createPeBands(company(five()),own).compute(chart(next)));
  }
 });
 it('Graham number (TTM variant) uses book value per share net of preferred stock',()=>{
  const raw=flat();raw.facts['us-gaap'].PreferredStockValue={units:{USD:factsOf(raw,'StockholdersEquity').map(r=>({...r,val:1000}))}};
  const r=createPeBands(company(raw),{...own,mode:'multiples',graham:true}).compute(chart(dailyBars('2022-03-01','2022-06-01',80)));
  // BVPS (5000 - 1000) / 100 = 40 at 2021-12-31; sqrt(22.5 * 4 * 40) = 60. After the Q1 10-Q the count comes from its cover page.
  expect(r.graham[0]).toBeCloseTo(60,10);expect(r.graham[r.graham.length-1]).toBeCloseTo(60,10);
  expect(createPeBands(company(flat()),{...own,mode:'multiples',graham:true}).compute(chart(dailyBars('2022-03-01','2022-03-02',80))).graham[0]).toBeCloseTo(Math.sqrt(22.5*4*50),10);
 });
 it('refuses gates like the ratios do',()=>{
  const r=createPeBands(company(flat()),own).compute(chart(bars,{adjustment:'total-return' as AdjustmentBasis}));
  expect(r.reason).toBe('Ratios need split-adjusted or raw prices; this chart uses total-return prices.');
 });
});

