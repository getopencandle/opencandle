import {afterEach,describe,expect,it} from 'vitest';
import type {Bar} from '../../src/domain/types';
import {calculateIndicator} from '../../src/domain/indicators';
import {catalogDefinition} from '../../src/domain/indicator-catalog';
import {CHART_PATTERNS,detectChartPatterns} from '../../src/domain/indicators-ext/patterns-chart';
import {PATTERN_MARK_LIMIT} from '../../src/domain/indicators-ext/patterns-catalog';
import {alignHigherTimeframe,planHigherTimeframe} from '../../src/domain/indicator-resample';
import {buildVolumeProfile} from '../../src/domain/volume-profile';
import {selectorView} from '../../src/domain/indicator-selector-catalog';
import {INDICATOR_KINDS} from '../../src/chart/indicator-settings';
import {indicatorNames,indicatorWarmupBars} from '../../src/ui/indicator-dialog-model';
import {indicatorDefaults} from '../../src/chart/indicator-settings';
import {indicatorHistoryLookup,replayClippedResolver} from '../../src/chart/indicator-history-lookup';
import {installScriptRequestResolver,type ScriptRequestResolver} from '../../src/ui/script-requests';

// 0.8.1 timing and plumbing fixes. Every bar here is SYNTHETIC (hand-built, not market data).
const T0=1767225600;// 2026-01-01T00:00:00Z
const bar=(time:number,open:number,high:number,low:number,close:number,volume=100):Bar=>({time,open,high,low,close,volume});
const ones=(values:readonly (number|null)[])=>values.flatMap((value,i)=>value===1?[i]:[]);
const series=(result:ReturnType<typeof calculateIndicator>,id:string)=>result.series.find(row=>row.id===id)!.values;

/** A sawtooth of equal highs and lows: three bars up, three down, so with pivot length 2 nearly every pivot completes a
 *  double top or bottom, a triple top or bottom and a rectangle. */
function sawtooth(count:number):Bar[]{
 const path=[100,102,104,106,104,102];
 return Array.from({length:count},(_,i)=>{const close=path[i%6];return bar(T0+i*3600,close,close+0.5,close-0.5,close);});
}

describe('chart pattern signals are not truncated (SYNTHETIC)',()=>{
 const bars=sawtooth(12000),inputs={pivotLength:2,tolerance:2,breakout:false};
 it('more than PATTERN_MARK_LIMIT hits: every distinct hit bar carries a signal',()=>{
  const hits=detectChartPatterns(bars,CHART_PATTERNS.map(row=>row.id),2,2);
  expect(hits.length).toBeGreaterThan(PATTERN_MARK_LIMIT);
  const result=calculateIndicator('chpall',bars,inputs);
  for(const direction of ['bullish','bearish','neutral'] as const){
   const expected=[...new Set(hits.filter(hit=>hit.direction===direction).map(hit=>hit.confirmedAt))].sort((a,b)=>a-b);
   expect(ones(series(result,direction)),direction).toEqual(expected);
  }
  // The drawn marks stay bounded.
  expect(result.marks!.markers.length).toBeLessThanOrEqual(PATTERN_MARK_LIMIT);expect(result.marks!.lines.length).toBeLessThanOrEqual(PATTERN_MARK_LIMIT);
 });
 it('a prefix run equals the full run on the prefix (old bars never change as bars arrive)',()=>{
  const full=calculateIndicator('chpall',bars,inputs),prefix=calculateIndicator('chpall',bars.slice(0,10500),inputs);
  for(const direction of ['bullish','bearish','neutral'])expect(series(prefix,direction)).toEqual(series(full,direction).slice(0,10500));
  const breakout={...inputs,breakout:true},fullB=calculateIndicator('chpall',bars,breakout),prefixB=calculateIndicator('chpall',bars.slice(0,10500),breakout);
  for(const direction of ['bullish','bearish','neutral'])expect(series(prefixB,direction)).toEqual(series(fullB,direction).slice(0,10500));
 });
});

describe('chart pattern breakout confirmation (Bulkowski) (SYNTHETIC)',()=>{
 // Highs and lows are close +/- 0.5. Tops at bars 4 and 12 (high 110.5), valley at bar 8 (low 99.5). With pivot length 2 the
 // second top is known on bar 14; the first close below the valley low 99.5 is bar 17 (close 99).
 const top=(closes:readonly number[])=>closes.map((close,i)=>bar(T0+i*86400,close,close+0.5,close-0.5,close));
 const DOUBLE=[100,101,102,103,110,103,102,101,100,101,102,103,110,103,102,101,100,99,98];
 const kind='chpdoubletop';
 it('new instances default the input on; a saved instance without the key keeps the last-pivot report',()=>{
  expect(catalogDefinition(kind)!.inputs.find(row=>row.key==='breakout')).toMatchObject({type:'bool',defval:true});
  expect(indicatorDefaults[kind as never]).toMatchObject({breakout:true});
  expect(ones(series(calculateIndicator(kind,top(DOUBLE),{pivotLength:2}),'bearish'))).toEqual([14]);
 });
 it('off: reported on the bar that confirms the last pivot; on: on the first close through the valley',()=>{
  expect(ones(series(calculateIndicator(kind,top(DOUBLE),{pivotLength:2,breakout:false}),'bearish'))).toEqual([14]);
  expect(ones(series(calculateIndicator(kind,top(DOUBLE),{pivotLength:2,breakout:true}),'bearish'))).toEqual([17]);
 });
 it('on: nothing before the breakout, and a close above the tops first voids the pattern',()=>{
  expect(ones(series(calculateIndicator(kind,top(DOUBLE.slice(0,17)),{pivotLength:2,breakout:true}),'bearish'))).toEqual([]);
  const voided=[...DOUBLE.slice(0,15),120,104,100,99,98];
  expect(ones(series(calculateIndicator(kind,top(voided),{pivotLength:2,breakout:true}),'bearish'))).toEqual([]);
 });
 it('the policy text names the confirmation rule and both modes',()=>{
  const text=catalogDefinition(kind)!.policies!.join(' ');
  expect(text).toMatch(/Require breakout confirmation/);expect(text).toMatch(/reported unconfirmed/);
  // Every chart pattern now has a breakout rule and offers the input (see r38-chart-patterns2.test.ts).
  expect(catalogDefinition('chptriangle')!.inputs.find(row=>row.key==='breakout')).toMatchObject({type:'bool',defval:true,legacyOmit:true,legacyDefval:false});
 });
});

describe('Wait for timeframe closes on a forming bar (SYNTHETIC)',()=>{
 // 1h bars 12:00..15:00 UTC: one 4h bucket 12:00-16:00. The 15:00 bar's nominal end reaches 16:00.
 const hourly=[0,1,2,3].map(k=>bar(T0+12*3600+k*3600,100+k,101+k,99+k,100.5+k));
 it('a forming last bar leaves the bucket developing and the value null under wait-for-close',()=>{
  const planned=planHigherTimeframe(hourly,'1h','4h',{completeRows:3});if(!planned.ok)throw Error(planned.message);
  expect(planned.plan.confirmedAt).toEqual([null]);expect(planned.plan.developing).toBe(true);
  expect(alignHigherTimeframe([42],planned.plan,4,true)).toEqual([null,null,null,null]);
  expect(alignHigherTimeframe([42],planned.plan,4,false)).toEqual([null,null,null,42]);
 });
 it('once that bar is closed, the bucket confirms on it',()=>{
  for(const options of [{completeRows:4},{}]){
   const planned=planHigherTimeframe(hourly,'1h','4h',options);if(!planned.ok)throw Error(planned.message);
   expect(planned.plan.confirmedAt).toEqual([3]);expect(alignHigherTimeframe([42],planned.plan,4,true)).toEqual([null,null,null,42]);
  }
 });
 it('the session calendar path follows the same rule',()=>{
  // 2026-01-05 (Monday) 1h bars 09:30.. New York; a 1D target closes at 16:00.
  const open=Date.parse('2026-01-05T14:30:00Z')/1000,rows=Array.from({length:7},(_,k)=>bar(open+k*3600,100,101,99,100));
  const forming=planHigherTimeframe(rows,'1h','1D',{calendar:'us-equity',completeRows:6}),closed=planHigherTimeframe(rows,'1h','1D',{calendar:'us-equity'});
  if(!forming.ok||!closed.ok)throw Error('plan');
  expect(closed.plan.confirmedAt).toEqual([6]);expect(forming.plan.confirmedAt).toEqual([null]);
 });
});

describe('candlestick warm-up counts the trend rule (SYNTHETIC)',()=>{
 it('SMA50, SMA200 needs at least 200 bars',()=>{
  expect(indicatorWarmupBars('cdlhammer' as never,{trendRule:'SMA50, SMA200'})).toBeGreaterThanOrEqual(200);
  expect(indicatorWarmupBars('cdlall' as never,{trendRule:'SMA50, SMA200'})).toBeGreaterThanOrEqual(200);
  // Neutral families have no trend rule.
  expect(indicatorWarmupBars('cdldoji' as never,{})).toBeLessThan(50);
 });
});

describe('Nison candlestick definitions (SYNTHETIC)',()=>{
 const FILL=Array.from({length:20},(_,i)=>bar(T0+i*86400,100,101.5,99.5,101));
 const run=(kind:string,rows:readonly [number,number,number,number][],inputs:Record<string,unknown>={})=>{const bars=[...FILL,...rows.map(([o,h,l,c],i)=>bar(T0+(20+i)*86400,o,h,l,c))];return {last:bars.length-1,result:calculateIndicator(kind,bars,inputs)};};
 it('Piercing opens below the prior LOW, Dark cloud above the prior HIGH; opening only beyond the close is not enough',()=>{
  // Long black 103 -> 100, low 99.9. Opening at 99.95 is below the close but above the low.
  let {last,result}=run('cdlpiercing',[[103,103.1,99.9,100],[99.95,102.1,99.9,102]],{trendRule:'No detection'});expect(ones(series(result,'bullish'))).not.toContain(last);
  ({last,result}=run('cdlpiercing',[[103,103.1,99.9,100],[99.5,102.1,99.4,102]],{trendRule:'No detection'}));expect(ones(series(result,'bullish'))).toContain(last);
  ({last,result}=run('cdldarkcloud',[[100,103.1,99.9,103],[103.05,103.2,100.9,101]],{trendRule:'No detection'}));expect(ones(series(result,'bearish'))).not.toContain(last);
  ({last,result}=run('cdldarkcloud',[[100,103.1,99.9,103],[103.5,103.6,100.9,101]],{trendRule:'No detection'}));expect(ones(series(result,'bearish'))).toContain(last);
 });
 it('Kicking is not trend-gated: it fires with no prior trend and offers no trend input',()=>{
  expect(catalogDefinition('cdlkickingbull')!.inputs.some(row=>row.key==='trendRule')).toBe(false);
  const {last,result}=run('cdlkickingbull',[[102,102,100,100],[102.5,104.5,102.5,104.5]]);expect(ones(series(result,'bullish'))).toEqual([last]);
  // A saved instance's old trendRule is still accepted (and ignored).
  expect(ones(series(calculateIndicator('cdlkickingbull',[...FILL,bar(T0+20*86400,102,102,100,100),bar(T0+21*86400,102.5,104.5,102.5,104.5)],{trendRule:'SMA50'}),'bullish'))).toEqual([last]);
 });
 it('Tweezers need matching lows (highs), not opposite colours',()=>{
  // Two white bars with lows 99 and 99.02.
  const {last,result}=run('cdltweezerbottom',[[99.5,101.2,99,100.5],[99.6,101,99.02,100.8]],{trendRule:'No detection'});expect(ones(series(result,'bullish'))).toContain(last);
 });
});

describe('volume profile skips a bar without a finite range (SYNTHETIC)',()=>{
 it('one bar with a NaN high and positive volume does not null the profile',()=>{
  const rows=[bar(T0,10,14,10,14,400),bar(T0+86400,12,Number.NaN,11,11,300),bar(T0+2*86400,12,13,11,12,100)];
  const profile=buildVolumeProfile(rows,0,2,{rowsLayout:'Number Of Rows',rowSize:4,valueAreaPct:70});
  expect(profile).not.toBeNull();expect(profile!.total).toBe(500);expect([profile!.low,profile!.high]).toEqual([10,14]);
 });
});

describe('Patterns tab search reads keywords (SYNTHETIC)',()=>{
 it('a keyword finds its pattern',()=>{
  const source={indicators:INDICATOR_KINDS.map(kind=>({id:kind,name:indicatorNames[kind],acronym:kind})),scripts:[]};
  expect(selectorView(source,{item:'built-ins',tab:'patterns',query:'H&S'}).entries.map(row=>row.id)).toEqual(['chpheadshoulders','chpinvheadshoulders']);
 });
});

describe('intrabar history during Bar Replay stops at the replay clock (SYNTHETIC)',()=>{
 let uninstall:(()=>void)|null=null;afterEach(()=>{uninstall?.();uninstall=null;});
 // A 1h chart replaying at a 1m step: 25 minutes of the 15:00 hour are revealed (clock 15:25).
 const H15=T0+15*3600,minutes=Array.from({length:60},(_,k)=>bar(H15+k*60,100,100.5,99.5,k%2?100.2:99.8,k+1));
 const inner:ScriptRequestResolver=request=>({bars:request.interval==='1m'?minutes:[],resolution:request.interval??'1h',label:'SYNTHETIC',fixture:true});
 it('the forming bar volume equals the sum of the revealed minutes',()=>{
  const clock=H15+25*60;
  uninstall=installScriptRequestResolver(replayClippedResolver(inner,id=>id==='synthetic:1h'?clock:null));
  const lookup=indicatorHistoryLookup('synthetic:1h','1h')!,found=lookup('1m');
  expect(found.state).toBe('ready');expect(found.bars!.length).toBe(25);
  const revealed=minutes.slice(0,25).reduce((sum,row)=>sum+row.volume,0);
  const result=calculateIndicator('updownvolume',[bar(H15,100,100.5,99.5,100,revealed)],{useCustomTimeframe:true,timeframe:'1m'},{resolution:'1h',finerBars:lookup});
  const up=series(result,'up')[0]!,down=series(result,'down')[0]!;
  expect(up-down).toBe(revealed);
 });
 it('a chart that is not replaying reads the full history',()=>{
  uninstall=installScriptRequestResolver(replayClippedResolver(inner,()=>null));
  expect(indicatorHistoryLookup('synthetic:1h','1h')!('1m').bars!.length).toBe(60);
 });
});
