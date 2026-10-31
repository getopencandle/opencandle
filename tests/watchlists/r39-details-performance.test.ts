import {expect,it} from 'vitest';
import {fixtureDataset} from '../../src/domain/fixtures';
import type {Bar,BarDataset} from '../../src/domain/types';
import {referenceFromDataset} from '../../src/watchlists/model';
import {watchQuote} from '../../src/watchlists/quotes';
import {DETAIL_PERFORMANCE_PERIODS,detailPerformance,prepareDetailSnapshot} from '../../src/watchlists/details';

// SYNTHETIC bars only.: performance bars and key stats in the symbol details, computed
// from the daily bars LV already holds. Fundamentals are never invented.
const DAY=86400,day=(y:number,m:number,d:number)=>Date.UTC(y,m-1,d)/1000;
const closeAt=(time:number)=>100+(time-day(2025,1,1))/DAY*0.25;
function calendar(from:number,to:number,close=closeAt):Bar[]{const bars:Bar[]=[];for(let time=from;time<=to;time+=DAY){const value=close(time);bars.push({time,open:value-1,high:value+2,low:value-2,close:value,volume:1000+bars.length});}return bars;}
function daily(bars:Bar[]):BarDataset{const base=fixtureDataset('GME',3);return{...base,resolution:'1D',provenance:{...base.provenance,datasetId:'r39-perf-daily'},bars};}
const pct=(last:number,base:number)=>(last/base-1)*100;

it('the six periods are 1W, 1M, 3M, 6M, YTD and 1Y in that order',()=>{
 expect(DETAIL_PERFORMANCE_PERIODS.map(row=>row.label)).toEqual(['1W','1M','3M','6M','YTD','1Y']);
});
it('each period compares the last daily close with the close on or before its calendar base date',()=>{
 const last=day(2026,9,15),result=detailPerformance(calendar(day(2025,1,1),last)),value=(label:string)=>result.rows.find(row=>row.label===label)!;
 const expected:Record<string,number>={'1W':day(2026,9,8),'1M':day(2026,8,15),'3M':day(2026,6,15),'6M':day(2026,3,15),'YTD':day(2025,12,31),'1Y':day(2025,9,15)};
 for(const [label,base] of Object.entries(expected)){const row=value(label);expect(row.reason).toBeNull();expect(row.base).toEqual({time:base,close:closeAt(base)});expect(row.value).toBeCloseTo(pct(closeAt(last),closeAt(base)),10);}
 expect(result.asOf).toBe(last);expect(result.reason).toBeNull();
});
it('month arithmetic clamps to the last day of the month and a weekend base takes the earlier bar',()=>{
 const weekdays=calendar(day(2025,6,1),day(2026,5,31)).filter(row=>![0,6].includes(new Date(row.time*1000).getUTCDay())||row.time===day(2026,5,31));
 const result=detailPerformance(weekdays),month=result.rows.find(row=>row.label==='1M')!;
 expect(month.base!.time).toBe(day(2026,4,30));
 const week=result.rows.find(row=>row.label==='1W')!;expect(week.base!.time).toBe(day(2026,5,22)); // 2026-05-24 is a Sunday
});
it('short history, a missing previous year and a non-positive base are unavailable with a reason',()=>{
 const short=detailPerformance(calendar(day(2026,8,1),day(2026,9,15)));
 expect(short.rows.find(row=>row.label==='1W')!.value).not.toBeNull();expect(short.rows.find(row=>row.label==='1M')!.value).not.toBeNull();
 for(const label of ['3M','6M','1Y']){const row=short.rows.find(item=>item.label===label)!;expect(row.value).toBeNull();expect(row.reason).toMatch(/history/i);}
 expect(short.rows.find(row=>row.label==='YTD')!.reason).toMatch(/previous calendar year/i);
 const zero=detailPerformance(calendar(day(2026,9,1),day(2026,9,15),time=>time<=day(2026,9,8)?0:5));expect(zero.rows.find(row=>row.label==='1W')!.value).toBeNull();expect(zero.rows.find(row=>row.label==='1W')!.reason).toMatch(/not positive/i);
 const none=detailPerformance(null);expect(none.rows).toHaveLength(6);expect(none.rows.every(row=>row.value===null&&row.reason===none.reason)).toBe(true);expect(none.reason).toMatch(/daily/i);
 expect(detailPerformance([]).rows.every(row=>row.value===null)).toBe(true);
});
it('reads bars through data descriptors only: an accessor bar is refused without running it',()=>{
 const bars=calendar(day(2026,1,1),day(2026,9,15));let reads=0;
 for(let index=0;index<bars.length;index++){const value=bars[index];Object.defineProperty(bars,String(index),{get(){reads++;return value;},enumerable:true});}
 expect(()=>detailPerformance(bars)).toThrow(/plain/i);expect(reads).toBe(0);
});
it('reads a bounded number of bars from a 100000-bar daily history, well under 50 ms',()=>{
 const bars=Array.from({length:100000},(_,index)=>({time:day(1800,1,1)+index*DAY,open:10,high:12,low:9,close:10+index%7,volume:1}));
 let descriptors=0,gets=0;const counted=new Proxy(bars,{getOwnPropertyDescriptor(target,key){if(typeof key==='string'&&/^\d+$/.test(key))descriptors++;return Reflect.getOwnPropertyDescriptor(target,key);},get(target,key,receiver){if(typeof key==='string'&&/^\d+$/.test(key))gets++;return Reflect.get(target,key,receiver);}});
 const started=performance.now(),result=detailPerformance(counted),elapsed=performance.now()-started;
 expect(result.rows.every(row=>row.value!==null)).toBe(true);expect(gets).toBe(0);expect(descriptors).toBeLessThan(300);expect(elapsed).toBeLessThan(50);
});
it('key stats come from the daily snapshot, and fundamentals are unavailable with a reason, never a number',()=>{
 const bars=calendar(day(2025,1,1),day(2026,9,15)),source=daily(bars),reference=referenceFromDataset(source),prepared=prepareDetailSnapshot(reference,watchQuote(reference,[source]));
 const stats=prepared.snapshot.keyStats!,stat=(label:string)=>stats.find(row=>row.label===label)!;
 const lastBar=bars.at(-1)!;
 expect(stat('Volume').value).toBe(lastBar.volume);expect(stat('Volume').reason).toBeNull();
 expect(stat('Average volume (30 days)').value).toBe(bars.slice(-31,-1).reduce((sum,row)=>sum+row.volume,0)/30);
 // UI audit 1028 #2: ranges show the tick size decimals (0.01 gives two).
 expect(stat('Day range').value).toBe(lastBar.low.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})+' to '+lastBar.high.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}));
 expect(typeof stat('52-week high').value).toBe('number');expect(typeof stat('52-week low').value).toBe('number');
 for(const label of ['Market capitalization','Dividend yield (indicated)','Price to earnings ratio (TTM)','Basic EPS (TTM)','Net income (FY)','Revenue (FY)','Shares float']){const row=stat(label);expect(row.value).toBeNull();expect(row.reason).toMatch(/fundamentals/i);}
 expect(stat('Beta (1Y)').value).toBeNull();expect(stat('Beta (1Y)').reason).toMatch(/benchmark/i);
 expect(JSON.stringify(stats)).not.toMatch(/[\u2013\u2014]/);
 // The bounded snapshot contract is unchanged: performance is a separate, explicit read of the validated daily bars.
 expect(prepared.performanceBars).toBe(source.bars);expect(prepared.snapshot.performance).toBeUndefined();
});
it('without a compatible daily snapshot key stats explain why and the performance source is absent',()=>{
 const base=daily(calendar(day(2026,9,1),day(2026,9,15))),intraday={...base,resolution:'5',provenance:{...base.provenance,datasetId:'r39-perf-intraday'}};
 const reference=referenceFromDataset(intraday),prepared=prepareDetailSnapshot(reference,watchQuote(reference,[intraday]));
 expect(prepared.performanceBars).toBeNull();
 const volume=prepared.snapshot.keyStats!.find(row=>row.label==='Volume')!;expect(volume.value).toBeNull();expect(volume.reason).toMatch(/daily snapshot/i);
});
