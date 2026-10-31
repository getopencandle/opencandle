// Layout tab switches. A switch builds the incoming tab's charts anew; their indicator sessions now adopt the
// pooled state of the same configuration on the same bars (the tab's earlier charts), exactly. SYNTHETIC bars only.
import {expect,it} from 'vitest';
import {performance} from 'node:perf_hooks';
import {calculateIndicator,type IndicatorId} from '../../src/domain/indicators';
import {createIncrementalIndicatorSession,clearIncrementalSessionPool} from '../../src/domain/indicator-incremental';
import {indicatorDefaults} from '../../src/chart/indicator-settings';
import type {Bar} from '../../src/domain/types';

const START=Date.UTC(2026,8,1,8,0)/1000;
const synthetic=(count:number,shift=0):Bar[]=>Array.from({length:count},(_,i)=>{const c=100+5*Math.sin((i+shift)/37)+((i+shift)%31)/4;return{time:START+i*60,open:c-.25,high:c+.5,low:c-.5,close:c,volume:100+((i+shift)*53)%500};});
const json=(value:unknown)=>JSON.stringify(value,(_k,v)=>typeof v==='number'&&!Number.isFinite(v)?String(v):Object.is(v,-0)?'-0':v);
const configs:Array<[IndicatorId,Record<string,unknown>]>=[['sma',{}],['ema',{}],['rsi',{}],['macd',{}],['volume',{}],['bb',{}],['obv',{}],['atr',{}],['stochastic',{}],
 ['sma',{smoothingType:'SMA+BB',smoothingLength:14,smoothingMultiplier:2}],['rsi',{smoothingType:'EMA',smoothingLength:9,smoothingMultiplier:2}],['macd',{oscillatorType:'SMA',signalType:'SMA'}],['atr',{smoothing:'WMA'}],['bb',{basisType:'WMA'}]];
const inputsOf=(kind:IndicatorId,extra:Record<string,unknown>)=>({...indicatorDefaults[kind],...extra}) as any;

it('a fresh shared session adopts a pooled session exactly (same bars), resumes it (newer bars), or calculates (anything else)',()=>{
 for(const [kind,extra] of configs){
  clearIncrementalSessionPool();const inputs=inputsOf(kind,extra),bars=synthetic(3000);
  const left=createIncrementalIndicatorSession({shared:true});expect(json(left.calculate(kind,bars,inputs))).toBe(json(calculateIndicator(kind,bars,inputs)));
  // Switching back: the rebuilt chart's new session, same bars (an import, or a live feed with no new bar yet).
  const back=createIncrementalIndicatorSession({shared:true}),again=back.calculate(kind,bars,inputs);expect(back.lastMode).toBe('adopt');expect(json(again)).toBe(json(calculateIndicator(kind,bars,inputs)));
  // The adopted copy keeps working incrementally and never touches the pooled original.
  const tick=[...bars.slice(0,-1),{...bars.at(-1)!,close:bars.at(-1)!.close+0.37}];expect(json(back.calculate(kind,tick,inputs))).toBe(json(calculateIndicator(kind,tick,inputs)));
  expect(json(left.calculate(kind,bars,inputs))).toBe(json(calculateIndicator(kind,bars,inputs)));
  // A reconnected live feed (same history, newer bars): the adopted state resumes from its checkpoint.
  const grown=[...bars,...synthetic(3005).slice(3000).map((bar,i)=>({...bar,time:bars.at(-1)!.time+60*(i+1)}))];
  const reconnect=createIncrementalIndicatorSession({shared:true}),resumed=reconnect.calculate(kind,grown,inputs);expect(json(resumed)).toBe(json(calculateIndicator(kind,grown,inputs)));
  // An earlier bar differs (split reload, history paging): no adoption, the reference.
  const changed=bars.map((bar,i)=>i===10?{...bar,close:bar.close*2}:bar),other=createIncrementalIndicatorSession({shared:true}),fresh=other.calculate(kind,changed,inputs);
  expect(other.lastMode).not.toBe('adopt');expect(json(fresh)).toBe(json(calculateIndicator(kind,changed,inputs)));
  // Other settings never adopt.
  const settings=createIncrementalIndicatorSession({shared:true});settings.calculate(kind,bars,{...inputs,length:(inputs.length??9)+1});expect(settings.lastMode).not.toBe('adopt');
  // Sessions that are not shared (the default) never adopt.
  const plain=createIncrementalIndicatorSession();plain.calculate(kind,bars,inputs);expect(plain.lastMode).toBe('seed');
 }
 clearIncrementalSessionPool();
});

it('timing: rebuilding a tab of 3 charts x 5 indicators on 20,000 bars, first visit vs switching back (LV_BENCH=1 prints)',()=>{
 const kinds:IndicatorId[]=['volume','sma','ema','rsi','macd'],charts=[synthetic(20000,0),synthetic(20000,7),synthetic(20000,13)];
 const build=()=>{const start=performance.now();for(const bars of charts)for(const kind of kinds){const session=createIncrementalIndicatorSession({shared:true});session.calculate(kind,bars,{...indicatorDefaults[kind]});}return performance.now()-start;};
 const runs:{cold:number[];warm:number[]}={cold:[],warm:[]};
 for(let round=0;round<(process.env.LV_BENCH?5:1);round++){clearIncrementalSessionPool();runs.cold.push(build());runs.warm.push(build());}
 const median=(values:number[])=>[...values].sort((a,b)=>a-b)[Math.floor(values.length/2)];
 if(process.env.LV_BENCH)console.log(JSON.stringify({lane:'R28-PERF2',tabRebuild3x5IndicatorsColdMs:+median(runs.cold).toFixed(1),tabRebuild3x5IndicatorsWarmMs:+median(runs.warm).toFixed(1)}));
 clearIncrementalSessionPool();
 if(process.env.LV_BENCH)expect(median(runs.warm)).toBeLessThan(median(runs.cold));
});
