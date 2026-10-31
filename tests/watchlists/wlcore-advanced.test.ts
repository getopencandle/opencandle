import {createHash} from 'node:crypto';
import {describe,expect,it} from 'vitest';
import {fixtureDataset} from '../../src/domain/fixtures';
import type {BarDataset} from '../../src/domain/types';
import {calculateWatchAdvanced,createWatchAdvancedState,prepareWatchAdvancedInput,restoreWatchAdvancedSettings,type AdvancedMetric,type AdvancedObservation} from '../../src/watchlists/advanced';
import type {WatchList} from '../../src/watchlists/model';
import {LV_METRIC_LABEL} from '../../src/watchlists/local-metrics';

// SYNTHETIC daily bars and hand-computed oracles. The formulas are OpenCandle's own, not reference values.
const day=86400,start=Date.UTC(2026,6,1)/1000,now=Date.UTC(2026,9,14,16)/1000;
function dataset(symbol:string,closes:number[],notes:string[]=[]):BarDataset{const value=fixtureDataset(symbol,closes.length);value.instrument={...value.instrument,id:'TEST:'+symbol,symbol,exchange:'TEST',currency:'USD',name:'Synthetic '+symbol};value.provenance={...value.provenance,providerId:'unit-test',providerName:'Synthetic supplied input',datasetId:'test:'+symbol,revision:'1',session:'regular',coverage:'Synthetic original daily history',asOf:now,notes};value.resolution='1D';value.bars=closes.map((close,index)=>({time:start+index*day,open:close,high:close+Math.min(1,close/2),low:close-Math.min(1,close/2),close,volume:index+1}));return value;}
function list(sources:BarDataset[]):WatchList{return{id:'watch',name:'Synthetic watchlist',favorite:false,sort:null,rows:sources.map((source,index)=>({id:'row'+index,kind:'symbol',reference:{exchange:source.instrument.exchange,symbol:source.instrument.symbol,synthetic:source.provenance.fixture,datasetId:source.provenance.datasetId,dailyDatasetId:null}}))};}
function input(sources:BarDataset[],mode:'price'|'financials'|'performance'|'risk'|'technicals',extra:{benchmarkDatasetId?:string|null}={}){const state=createWatchAdvancedState();state.settings.mode=mode;return{list:list(sources),datasets:sources,settings:state.settings,data:state.data,now,...extra};}
function observation(source:BarDataset,metric:AdvancedMetric,value:number,overrides:Partial<AdvancedObservation>={}):AdvancedObservation{return{id:'obs:'+source.instrument.symbol+':'+metric,revision:1,market:{exchange:source.instrument.exchange,symbol:source.instrument.symbol,synthetic:true},metric,value,unit:metric.startsWith('performance')?'percent':'currency',currency:metric.startsWith('performance')?null:source.instrument.currency,period:{label:'declared',start,end:start+9*day},asOf:start+9*day,availableAt:start+9*day,definition:'Explicit supplied definition',source:{label:'Synthetic declared observation',datasetId:null,basisKey:null,fixture:true,adjustment:'unknown'},coverage:'complete-period',state:'ready',...overrides};}
const sha=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const ramp=[90,95,100,101,102,103,104,105,106,110];

describe('LV formulas fill the performance, risk and momentum cells',()=>{
 it('weekly performance 100 to 110 is 10.00, with the OpenCandle label and a local calculation',()=>{
  const a=dataset('A',ramp),cells=calculateWatchAdvanced(input([a],'performance')).rows[0].cells;
  expect(cells.performanceWeek.value).toBeCloseTo(10,12);expect(cells.performanceWeek.calculation).toBe('local');expect(cells.performanceWeek.unit).toBe('percent');
  expect(cells.performanceWeek.reason.startsWith(LV_METRIC_LABEL)).toBe(true);expect(cells.performanceWeek.definition).toContain(LV_METRIC_LABEL);
  for(const metric of ['performanceMonth','performanceThreeMonths','performanceYear','performanceFiveYears','performanceYtd','performanceAllTime'] as const){expect(cells[metric].value).toBeNull();expect(cells[metric].calculation).toBe('unavailable');}
  expect(cells.performanceAllTime.reason).toContain('listing start');
 });
 it('all time needs the dataset to declare its first bar as the listing start',()=>{
  const declared=dataset('A',ramp,['listing-start:first-bar']),cells=calculateWatchAdvanced(input([declared],'performance')).rows[0].cells;expect(cells.performanceAllTime.value).toBeCloseTo((110/90-1)*100,12);
 });
 it('volatility 1D, 1W and 1M follow the hand-computed oracles; momentum 10 on a ramp is 10',()=>{
  const a=dataset('A',Array.from({length:30},(_,i)=>i+1)),risk=calculateWatchAdvanced(input([a],'risk')).rows[0].cells;
  // last bar: close 30, high 31, low 29 => (31 - 29) / 30 * 100 = 6.6666...
  expect(risk.volatility1d.value).toBeCloseTo(200/30,10);expect(risk.volatility1d.unit).toBe('percent');
  // closes 1..30 have log returns ln(k+1)-ln(k); the 5-return window is the last five, population sd times 100
  const logs=(n:number)=>Array.from({length:n},(_,i)=>Math.log(30-i)-Math.log(29-i)).reverse(),sd=(xs:number[])=>{const m=xs.reduce((s,v)=>s+v,0)/xs.length;return Math.sqrt(xs.reduce((s,v)=>s+(v-m)*(v-m),0)/xs.length)*100;};
  expect(risk.volatility1w.value).toBeCloseTo(sd(logs(5)),9);expect(risk.volatility1m.value).toBeCloseTo(sd(logs(21)),9);
  const tech=calculateWatchAdvanced(input([a],'technicals')).rows[0].cells;expect(tech.momentum10.value).toBe(10);expect(tech.momentum10.unit).toBe('currency/share');expect(calculateWatchAdvanced(input([dataset('S',[1,2,3])],'technicals')).rows[0].cells.momentum10.value).toBeNull();
 });
 it('beta uses the benchmark the user picked: twice the benchmark moves gives 2, no pick or a missing dataset says why',()=>{
  const returns=Array.from({length:252},(_,i)=>0.01*Math.sin(i/3)+0.002*((i*7)%5-2)),closes=(rs:number[],first:number)=>rs.reduce((acc,r)=>[...acc,acc.at(-1)!*(1+r)],[first]);
  const earlier=(source:BarDataset):BarDataset=>({...source,bars:source.bars.map(bar=>({...bar,time:bar.time-300*day}))}),benchmark=earlier(dataset('SPY',closes(returns,100))),subject=earlier(dataset('TWO',closes(returns.map(r=>2*r),30)));
  const picked=calculateWatchAdvanced({...input([subject,benchmark],'risk',{benchmarkDatasetId:benchmark.provenance.datasetId}),list:list([subject])}).rows[0].cells;
  expect(picked.beta1y.value,picked.beta1y.reason).toBeCloseTo(2,12);expect(picked.beta1y.reason.startsWith(LV_METRIC_LABEL)).toBe(true);expect(picked.beta3y.value).toBeNull();expect(picked.beta5y.value).toBeNull();
  const none=calculateWatchAdvanced({...input([subject,benchmark],'risk'),list:list([subject])}).rows[0].cells.beta1y;expect(none.value).toBeNull();expect(none.reason).toContain('Choose a benchmark');
  const missing=calculateWatchAdvanced({...input([subject],'risk',{benchmarkDatasetId:'test:GONE'})}).rows[0].cells.beta1y;expect(missing.value).toBeNull();expect(missing.reason).toContain('Benchmark data is not loaded');
 });
 it('an accepted supplied observation keeps priority and its label; a rejected one lets the LV formula fill',()=>{
  const a=dataset('A',ramp),request=input([a],'performance');request.data.observations=[observation(a,'performanceWeek',99)];
  const cells=calculateWatchAdvanced(request).rows[0].cells;expect(cells.performanceWeek.value).toBe(99);expect(cells.performanceWeek.calculation).toBe('supplied');expect(cells.performanceWeek.reason).toContain('Supplied observation');expect(cells.performanceWeek.reason).not.toContain(LV_METRIC_LABEL);
  expect(cells.performanceMonth.calculation).toBe('unavailable');
  const rejected=input([a],'performance');rejected.data.observations=[observation(a,'performanceWeek',99,{coverage:'partial'})];expect(calculateWatchAdvanced(rejected).rows[0].cells.performanceWeek.value).toBeCloseTo(10,12);
  const cutoff=input([a],'performance');cutoff.settings.asOf=start+20*day;expect(calculateWatchAdvanced(cutoff).rows[0].cells.performanceWeek.value).toBeNull();
 });
});

describe('saved Advanced View is not repainted',()=>{
 it('settings keep their exact key list and restore unchanged',()=>{
  const settings=createWatchAdvancedState().settings;expect(Object.keys(settings).sort()).toEqual(['asOf','currency','dividendBasis','group','mode','news','schemaVersion','search','sort','summary','tab','timezone']);
  expect(JSON.stringify(restoreWatchAdvancedSettings(JSON.parse(JSON.stringify(settings))))).toBe(JSON.stringify(settings));expect(()=>restoreWatchAdvancedSettings({...settings,benchmark:'x'})).toThrow();
 });
 it('displayed price and financials columns with supplied observations are byte-identical to the pre-lane output (golden hashes captured before the change)',()=>{
  const a=dataset('A',ramp),b=dataset('B',[10,12,11,13,15]);const observed=(mode:'price'|'financials'|'performance')=>{const request=input([a,b],mode);request.settings.summary='mean';request.data.observations=[observation(a,'performanceWeek',5),observation(a,'revenue',700),observation(b,'revenue',20)];return request;};
  // Cells of columns that are not displayed carry explanatory text and may be reworded; the displayed columns, summaries and composition may not change.
  const view=(result:ReturnType<typeof calculateWatchAdvanced>)=>({columns:result.columns,cells:result.rows.map(row=>[row.id,result.columns.map(column=>row.cells[column])]),summaries:result.summaries,composition:result.composition,membershipRows:result.membershipRows,distinctMarkets:result.distinctMarkets,unresolved:result.unresolved,matched:result.matched});
  const price=calculateWatchAdvanced(observed('price')),financials=calculateWatchAdvanced(observed('financials')),performance=calculateWatchAdvanced(observed('performance'));
  expect({price:sha(view(price)),financials:sha(view(financials)),observedWeekCell:sha(performance.rows[0].cells.performanceWeek),observedRevenue:sha(financials.rows.map(row=>row.cells.revenue))}).toEqual(GOLDEN);
 });
});
// Captured by running this scenario against the pre-lane advanced.ts (before any WLCORE edit to it).
const GOLDEN={price:'fe45b43415a926d3b7623da957a92e60aa187010e2fab59bc5bcb16ddccd481a',financials:'dd031b50798f1654193acba580c8f7d68c1a4fd2e63c0a93e7dfb67eac7728d5',observedWeekCell:'7463dd74bc7017275ae5041760314ad5ef541a02d7e7570501a0951da1a5e2cd',observedRevenue:'7f0fc32378847768a8f139c99e74607ad68eb8beb60580801ce9aa0c39b16f15'};

describe('round 2 review fixes',()=>{
 it('two conflicting supplied observations fall back to the OpenCandle formula instead of blanking the cell',()=>{
  const a=dataset('A',ramp),request=input([a],'performance');
  request.data.observations=[observation(a,'performanceWeek',50),observation(a,'performanceWeek',60,{id:'obs:A:other'})];
  const cell=calculateWatchAdvanced(request).rows[0].cells.performanceWeek;expect(cell.value).toBeCloseTo(10,12);expect(cell.calculation).toBe('local');
  // a non-formula metric with the same conflict still reports ambiguity
  const revenue=input([a],'financials');revenue.data.observations=[observation(a,'revenue',1),observation(a,'revenue',2,{id:'obs:A:r2'})];expect(calculateWatchAdvanced(revenue).rows[0].cells.revenue.state).toBe('ambiguous');
 });
 it('beta 3Y and 5Y use their full windows against the picked benchmark',()=>{
  for(const [metric,count] of [['beta3y',756],['beta5y',1260]] as const){
   const returns=Array.from({length:count},(_,i)=>0.01*Math.sin(i/5)+0.002*((i*3)%7-3)),closes=(rs:number[],first:number)=>rs.reduce((acc,r)=>[...acc,acc.at(-1)!*(1+r)],[first]);
   const earlier=(source:BarDataset):BarDataset=>({...source,bars:source.bars.map(row=>({...row,time:row.time-(count+40)*day}))}),benchmark=earlier(dataset('SPY',closes(returns,100))),subject=earlier(dataset('TWO',closes(returns.map(r=>2*r),30)));
   const cells=calculateWatchAdvanced({...input([subject,benchmark],'risk',{benchmarkDatasetId:benchmark.provenance.datasetId}),list:list([subject])}).rows[0].cells;
   expect(cells[metric].value,cells[metric].reason).toBeCloseTo(2,11);
  }
 });
});
