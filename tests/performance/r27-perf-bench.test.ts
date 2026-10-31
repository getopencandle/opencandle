// focused benchmark: each fast path against the code path it replaces, in the same run, on SYNTHETIC
// 20,000-bar one-minute US equity data. Assertions are relative (the machine may be loaded); numbers are printed once.
import {expect,it} from 'vitest';
import {performance} from 'node:perf_hooks';
import {cloneBarList,cloneMarketInput} from '../../src/chart/bar-clone';
import {sessionZonesFor} from '../../src/chart/session-zones';
import {calculateIndicator,type IndicatorId} from '../../src/domain/indicators';
import {createIncrementalIndicatorSession} from '../../src/domain/indicator-incremental';
import {renderIndicatorSeries} from '../../src/chart/indicator-rendering';
import {indicatorDefaults} from '../../src/chart/indicator-settings';
import {scriptBarIds,clearScriptBarIdCache} from '../../src/ui/script-input';
import type {Bar} from '../../src/domain/types';

const N=20000,START=Date.UTC(2026,8,1,8,0)/1000;
const synthetic=(count:number,shift=0):Bar[]=>Array.from({length:count},(_,i)=>{const c=100+5*Math.sin((i+shift)/37)+((i+shift)%31)/4;return{time:START+i*60,open:c-.25,high:c+.5,low:c-.5,close:c,volume:100+((i+shift)*53)%500};});
const median=(runs:number,work:(run:number)=>void)=>{const times:number[]=[];for(let run=0;run<runs;run++){const start=performance.now();work(run);times.push(performance.now()-start);}times.sort((a,b)=>a-b);return times[Math.floor(times.length/2)];};
const tick=(bars:Bar[],run:number):Bar[]=>{const last=bars.at(-1)!;return [...bars.slice(0,-1),{...last,close:last.close+0.01*((run%5)-2)}];};

// Timing assertions are opt-in (LV_BENCH=1), like LV_FIB_TIMING; the equality tests stay in the default suite.
const benchEnabled=!!process.env.LV_BENCH;
it.skipIf(!benchEnabled)('R27-PERF hot paths beat the paths they replace (SYNTHETIC 20,000 bars)',async()=>{
 const report:Record<string,number>={bars:N};
 // 1. Market queue copies (two per live tick and chart).
 const bars=synthetic(N),input={bars,source:{datasetId:'synthetic',revision:'1',fixture:true,label:'SYNTHETIC'}};
 report.copyStructuredCloneMs=median(7,()=>{structuredClone([...bars]);structuredClone(input);});
 report.copyFastMs=median(7,()=>{cloneBarList(bars);cloneMarketInput(input);});
 expect(report.copyFastMs).toBeLessThan(report.copyStructuredCloneMs/3);
 // 2. Five indicators on a live tick: reference recalculation against the incremental session.
 const kinds:IndicatorId[]=['volume','sma','ema','rsi','macd'],sessions=kinds.map(()=>createIncrementalIndicatorSession());
 let live=synthetic(N);kinds.forEach((kind,index)=>{sessions[index].calculate(kind,live,{...indicatorDefaults[kind]});});
 live=tick(live,0);kinds.forEach((kind,index)=>{sessions[index].calculate(kind,live,{...indicatorDefaults[kind]});});// first tick verifies
 report.indicatorsReferenceTickMs=median(7,run=>{const next=tick(live,run);for(const kind of kinds)calculateIndicator(kind,next,{...indicatorDefaults[kind]});});
 report.indicatorsIncrementalTickMs=median(7,run=>{live=tick(live,run);kinds.forEach((kind,index)=>{sessions[index].calculate(kind,live,{...indicatorDefaults[kind]});expect(sessions[index].lastMode).toBe('resume');});});
 expect(report.indicatorsIncrementalTickMs).toBeLessThan(report.indicatorsReferenceTickMs/2);
 // 3. Plot points on a tick: fresh instance ids build every point; one id reuses the unchanged ones.
 const sma=calculateIndicator('sma',live,{...indicatorDefaults.sma});renderIndicatorSeries('r27-bench','sma',sma,live,{},0);
 report.pointsFreshMs=median(7,run=>{renderIndicatorSeries('r27-fresh-'+run,'sma',sma,live,{},0);});
 report.pointsReusedMs=median(7,()=>{renderIndicatorSeries('r27-bench','sma',sma,live,{},0);});
 expect(report.pointsReusedMs).toBeLessThan(report.pointsFreshMs);
 // 4. Session zones: the chart's own array, first pass against a pass after a tick.
 const own=synthetic(N,7);report.zonesFirstMs=median(1,()=>{sessionZonesFor(own,60000);});
 report.zonesTickMs=median(7,run=>{own[own.length-1]={...own[own.length-1],close:run};sessionZonesFor(own,60000);});
 expect(report.zonesTickMs).toBeLessThan(report.zonesFirstMs/5);
 // 5. Script bar IDs: a first run hashes every bar, a rerun after a tick only the changed bar.
 clearScriptBarIdCache();const scripted=synthetic(N,3);let start=performance.now();await scriptBarIds('["synthetic"]',scripted);report.scriptIdsFirstMs=performance.now()-start;
 start=performance.now();await scriptBarIds('["synthetic"]',tick(scripted,1));report.scriptIdsRepeatMs=performance.now()-start;
 expect(report.scriptIdsRepeatMs).toBeLessThan(report.scriptIdsFirstMs/3);
 console.info('R27-PERF '+JSON.stringify(report,(_key,value)=>typeof value==='number'?+value.toFixed(2):value));
},120000);
