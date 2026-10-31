import {describe,expect,it} from 'vitest';
import {calculateIndicator} from '../../src/domain/indicators';
import {rolling24hVolume} from '../../src/domain/indicators-ext/indgaps-catalog';
import {planHigherTimeframe,alignHigherTimeframe} from '../../src/domain/indicator-resample';
import {patternMarksNative} from '../../src/chart/indicator-presentation';
import type {Bar} from '../../src/domain/types';

// SYNTHETIC bars only, hand-built for these definitions.
const series=(result:ReturnType<typeof calculateIndicator>,id:string)=>{expect(result.diagnostics).toEqual([]);return result.series.find(row=>row.id===id)!.values;};

describe('Detrended price oscillator (StockCharts: price n/2 + 1 bars ago minus the current n-bar SMA)',()=>{
 const bars:Bar[]=Array.from({length:10},(_,i)=>({time:1700000000+i*86400,open:i+1,high:i+1,low:i+1,close:i+1,volume:1}));
 it('not centered: close[i - k] - SMA(n)[i], available from bar n - 1',()=>{
  const values=series(calculateIndicator('dpo',bars,{length:4,centered:false,source:'close'}),'dpo');
  expect(values).toEqual([null,null,null,-1.5,-1.5,-1.5,-1.5,-1.5,-1.5,-1.5]);
 });
 it('centered: close[i] - SMA(n)[i + k], the same values moved k bars left',()=>{
  const values=series(calculateIndicator('dpo',bars,{length:4,centered:true,source:'close'}),'dpo');
  expect(values).toEqual([-1.5,-1.5,-1.5,-1.5,-1.5,-1.5,-1.5,null,null,null]);
 });
});

describe('24-hour volume with an unknown volume inside its window',()=>{
 const bars:Bar[]=[10,NaN,20].map((volume,i)=>({time:1700000000+i*3600,open:10,high:11,low:9,close:10,volume}));
 it('a window holding the unknown volume is unavailable, matching the rolling kernel',()=>{
  expect(rolling24hVolume(bars)).toEqual([10,null,null]);
  expect(series(calculateIndicator('vol24h',bars),'volume')).toEqual([10,null,null]);
 });
 it('resumes once the unknown bar leaves the 24-hour window',()=>{
  const later=[...bars,{time:1700000000+3600+86400,open:10,high:11,low:9,close:10,volume:5}];
  expect(series(calculateIndicator('vol24h',later),'volume')).toEqual([10,null,null,25]);
 });
 it('a negative volume counts as unknown too',()=>{
  const negative=bars.map((bar,i)=>i===1?{...bar,volume:-4}:bar);
  expect(series(calculateIndicator('vol24h',negative),'volume')).toEqual([10,null,null]);
 });
});

describe('Harami accepts either colour for the small second body (Nison)',()=>{
 const make=(last:[number,number,number,number]):Bar[]=>Array.from({length:16},(_,i)=>{
  const [open,high,low,close]=i<14?[124-i,124.2-i,122.8-i,123-i]:i===14?[110,111,99,100]:last;
  return {time:1700000000+i*3600,open,high,low,close,volume:1};
 });
 const mirror=(bars:Bar[])=>bars.map(bar=>({...bar,open:240-bar.open,close:240-bar.close,high:240-bar.low,low:240-bar.high}));
 const at15=(kind:string,bars:Bar[],plot:string)=>series(calculateIndicator(kind,bars,{trendRule:'No detection'}),plot)[15];
 it.each([['same colour (black)',[105,106,103,104]],['opposite colour (white)',[104,106,103,105]]] as const)('bullish with a %s second body',(_name,last)=>{
  const bars=make([...last]);
  expect(at15('cdlharamibull',bars,'bullish')).toBe(1);
  expect(at15('cdlharamibear',mirror(bars),'bearish')).toBe(1);
  const all=calculateIndicator('cdlall',bars,{trendRule:'No detection'});expect(all.marks?.markers.some(row=>row.index===15&&row.text==='HR')).toBe(true);
  const allMirror=calculateIndicator('cdlall',mirror(bars),{trendRule:'No detection'});expect(allMirror.marks?.markers.some(row=>row.index===15&&row.text==='HR')).toBe(true);
 });
 it('near miss: a second body reaching outside the first body is not a harami',()=>{
  expect(at15('cdlharamibull',make([111,112,103,104]),'bullish')).toBe(0);
 });
});

describe('Session higher timeframe confirmations are never changed by a later date',()=>{
 const rows:Bar[]=Array.from({length:13},(_,i)=>({time:Date.parse('2024-01-02T14:30:00Z')/1000+i*1800,open:100,high:100,low:100,close:100,volume:1}));
 const plan=(bars:Bar[])=>{const value=planHigherTimeframe(bars,'30m','1D',{calendar:'us-equity'});if(!value.ok)throw Error(value.message);return value.plan;};
 it('a regular-only day followed by a next-day premarket bar keeps its regular-close confirmation',()=>{
  const before=plan(rows);expect(before.confirmedAt[0]).toBe(12);expect(before.buckets[0].end).toBe(Date.parse('2024-01-02T21:00:00Z')/1000);
  const extended=[...rows,{time:Date.parse('2024-01-03T09:00:00Z')/1000,open:200,high:200,low:200,close:200,volume:1}],after=plan(extended);
  expect(after.confirmedAt[0]).toBe(12);expect(after.buckets[0]).toEqual(before.buckets[0]);
  expect(alignHigherTimeframe(after.bars.map(bar=>bar.close),after,extended.length,true).slice(0,13)).toEqual(alignHigherTimeframe(before.bars.map(bar=>bar.close),before,13,true));
  // The premarket day itself runs to the after-hours close.
  expect(after.buckets[1].end).toBe(Date.parse('2024-01-04T01:00:00Z')/1000);
 });
 it('a chart with extended-hours bars from its first day still confirms at the after-hours close',()=>{
  const pre={time:Date.parse('2024-01-02T13:00:00Z')/1000,open:100,high:100,low:100,close:100,volume:1},value=plan([pre,...rows]);
  expect(value.buckets[0].end).toBe(Date.parse('2024-01-03T01:00:00Z')/1000);expect(value.confirmedAt[0]).toBeNull();
 });
});

describe('Periodic and session volume profile levels are causal',()=>{
 const bars:Bar[]=[{time:Date.parse('2024-01-02T14:30:00Z')/1000,open:10,high:10,low:10,close:10,volume:1},{time:Date.parse('2024-01-02T15:00:00Z')/1000,open:20,high:20,low:20,close:20,volume:9}];
 it.each(['pvp','svp'])('%s: adding a bar leaves the earlier bar POC, VAH and VAL unchanged',kind=>{
  const run=(rows:Bar[])=>calculateIndicator(kind,rows,{rowsLayout:'Number Of Rows',rowSize:2},{calendar:'us-equity',resolution:'30m'});
  const one=run(bars.slice(0,1)),two=run(bars);expect(one.diagnostics).toEqual([]);expect(two.diagnostics).toEqual([]);
  for(const row of one.series)expect(two.series.find(item=>item.id===row.id)!.values[0],row.id).toEqual(row.values[0]);
 });
});

describe('Auto Elliott waves never move a drawn wave endpoint',()=>{
 const knots:[number,number][]=[[0,110],[20,100],[40,120],[60,110],[80,145],[100,130],[120,160],[130,159],[140,170],[155,169]];
 const all:Bar[]=Array.from({length:156},(_,i)=>{let k=0;while(k<knots.length-2&&knots[k+1][0]<i)k++;const [x0,y0]=knots[k],[x1,y1]=knots[k+1],c=y0+(y1-y0)*(i-x0)/(x1-x0);return {time:1700000000+i*3600,open:c,high:c+0.1,low:c-0.1,close:c,volume:1};});
 const marks=(n:number)=>{const result=calculateIndicator('autoelliott',all.slice(0,n),{});expect(result.diagnostics).toEqual([]);return result.marks!;};
 it('wave 5 stays at its first confirmed peak when a higher peak follows a small dip',()=>{
  const early=marks(126),late=marks(146);
  const five=(m:ReturnType<typeof marks>)=>m.markers.find(row=>row.text==='5');
  expect(five(early)).toMatchObject({index:120});expect(five(late)).toMatchObject({index:120});
 });
 it('every marker and line drawn on a prefix is drawn identically on every longer prefix',()=>{
  const key=(m:ReturnType<typeof marks>)=>({markers:m.markers.map(row=>JSON.stringify(row)),lines:m.lines.map(row=>JSON.stringify(row))});
  let previous=key(marks(60));
  for(let n=61;n<=156;n++){const next=key(marks(n));for(const row of previous.markers)expect(next.markers,`marker at ${n}`).toContain(row);for(const row of previous.lines)expect(next.lines,`line at ${n}`).toContain(row);previous=next;}
 });
 it('wave labels sit on the endpoint price: a peak label at the high, a trough label at the low',()=>{
  const result=calculateIndicator('autoelliott',all.slice(0,126),{}),bars=all.slice(0,126);
  const native=patternMarksNative('e',result,bars,()=>({visible:true,color:'#000000',opacity:100,width:1,lineStyle:'solid'} as never));
  const ends=new Map(result.marks!.lines.map(row=>[row.to.index,row.to.price]));
  for(const label of native.labels){const index=bars.findIndex(bar=>bar.time*1000===label.x);expect(label.y).toBeCloseTo(ends.get(index)!,9);}
  expect(native.labels.length).toBeGreaterThanOrEqual(5);
 });
});
