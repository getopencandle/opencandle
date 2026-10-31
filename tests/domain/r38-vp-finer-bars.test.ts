import {afterEach,describe,expect,it} from 'vitest';
import type {Vela} from '@luxalgo/vela';
import {nativeHost} from '../ui/indicator-real-port-harness';
import {createIndicatorPort} from '../../src/chart/indicator-port';
import {validateIndicatorPresentationContext,type IndicatorPresentationContext} from '../../src/chart/indicator-presentation';
import {source as ownedProfileFixture} from '../fixtures/r43-profile-source';
import {sourceContextForDataset} from '../../src/chart/source-context';
import {setProfileDatasets,profileFinerLookup,profileSourceContext} from '../../src/chart/vp-visible-range-ltf';
import {profileFinerNotice} from '../../src/chart/vp-visible-range-presentation';
import {calculateIndicator} from '../../src/domain/indicators';
import {buildVolumeProfile,profileFinerInterval,PROFILE_FINER_INTERVALS,type FinerBarsResult} from '../../src/domain/volume-profile';
import {R38_POLICIES} from '../../src/domain/indicators-ext/vp-catalog';
import {installScriptRequestResolver,notifyScriptRequestData,scriptRequestKey,type ScriptRequestBase,type ScriptRequestDeclaration} from '../../src/ui/script-requests';
import {scriptRequestDemand} from '../../src/ui/script-request-demand';
import type {Bar} from '../../src/domain/types';

afterEach(()=>setProfileDatasets([]));

// Finer bars on demand for the volume profiles. SYNTHETIC hand-made bars only; every expected level below is
// computed by hand in the comments.
const H=3600,T0=1767225600;// 2026-01-01 00:00 UTC
// Two 60m chart bars of one UTC day, each spanning 10 to 12, 100 volume each (bar 0 up, bar 1 down).
const CHART:Bar[]=[{time:T0,open:10,high:12,low:10,close:12,volume:100},{time:T0+H,open:12,high:12,low:10,close:10,volume:100}];
// Their 5m bars: A inside bar 0 (11.2 to 11.8, 100 up), B inside bar 1 (10.2 to 10.8, 30 down).
const FINE:Bar[]=[{time:T0,open:11.2,high:11.8,low:11.2,close:11.8,volume:100},{time:T0+H,open:10.8,high:10.8,low:10.2,close:10.2,volume:30}];
const SVP={rowsLayout:'Number Of Rows',rowSize:2};
const last=(result:ReturnType<typeof calculateIndicator>,id:string)=>result.series.find(row=>row.id===id)!.values.at(-1);
function lookup(answer:FinerBarsResult){const calls:string[]=[];return {calls,fn:(interval:string)=>{calls.push(interval);return answer;}};}

describe(' finer interval ladder (OpenCandle-defined)',()=>{
 it('maps chart intervals to a strictly finer interval, and 1m or event bars to none',()=>{
  expect(PROFILE_FINER_INTERVALS.map(row=>row[1])).toEqual(['1D','30m','5m','1m']);
  expect(['1M','1W','1D','4h','60m','30m','5m','2m','1m','15s','1T',null].map(row=>profileFinerInterval(row as string|null))).toEqual(['1D','1D','30m','5m','5m','1m','1m','1m',null,null,null,null]);
 });
});

describe(' need: a bar crossing a row boundary',()=>{
 it('counts chart bars whose own range is spread over more than one row',()=>{
  // Rows 2: [10,11) and [11,12]; both bars cross 11, so both are spread.
  expect(buildVolumeProfile(CHART,0,1,{rowsLayout:'Number Of Rows',rowSize:2,valueAreaPct:70})!.spreadBars).toBe(2);
  // One row: every bar fits inside it.
  expect(buildVolumeProfile(CHART,0,1,{rowsLayout:'Number Of Rows',rowSize:1,valueAreaPct:70})!.spreadBars).toBe(0);
  // Finer bars cover both chart bars: nothing is spread.
  expect(buildVolumeProfile(CHART,0,1,{rowsLayout:'Number Of Rows',rowSize:2,valueAreaPct:70,lowerTimeframe:{interval:'5m',bars:FINE},resolution:'60m'})!.spreadBars).toBe(0);
 });
});

describe(' Session volume profile with finer bars on demand',()=>{
 const facts={resolution:'60m',calendar:'utc' as const};
 it('without a lookup (alerts, tests) nothing changes: POC 10.5, VA 10 to 12',()=>{
  // Plain: rows 100/100 (each bar split 50/50); the POC tie goes to the lower row (10.5); VA takes the upper row: 10 to 12.
  const plain=calculateIndicator('svp',CHART,SVP,facts);
  expect(plain.diagnostics).toEqual([]);expect([last(plain,'poc'),last(plain,'vah'),last(plain,'val')]).toEqual([10.5,12,10]);
  expect(plain.profiles![0].spreadBars).toBe(2);expect(plain.profiles![0].finer).toBeUndefined();
  expect(plain.policies).toEqual(expect.arrayContaining([...R38_POLICIES]));
 });
 it('ready finer bars rebuild the profile: POC 11.4, VA 11 to 11.8',()=>{
  // Finer: low 10.2, high 11.8, two rows of 0.8: [10.2,11.0) holds B (30), [11.0,11.8] holds A (100). POC 11.4; target 91
  // of 130 is reached by the POC row alone: VAH 11.8, VAL 11.0.
  const l=lookup({state:'ready',bars:FINE,message:null});
  const out=calculateIndicator('svp',CHART,SVP,{...facts,finerBars:l.fn});
  expect(l.calls).toEqual(['5m']);
  expect(last(out,'poc')).toBeCloseTo(11.4,12);expect(last(out,'vah')).toBeCloseTo(11.8,12);expect(last(out,'val')).toBeCloseTo(11.0,12);
  expect(out.profiles![0].lowerTimeframeBars).toBe(2);expect(out.profiles![0].spreadBars).toBe(0);expect(out.profiles![0].finer).toBeUndefined();
 });
 it('the developing POC uses the same finer bars: 11.35 then 11.4',()=>{
  // Bar 0 alone: A only, 11.2 to 11.8 in two rows of 0.3, split 50/50; the tie goes to the lower row, centre 11.35.
  const l=lookup({state:'ready',bars:FINE,message:null});
  const out=calculateIndicator('svp',CHART,{...SVP,developingPoc:true},{...facts,finerBars:l.fn});
  const dev=out.series.find(row=>row.id==='devPoc')!.values;
  expect(dev[0]).toBeCloseTo(11.35,12);expect(dev[1]).toBeCloseTo(11.4,12);
 });
 it('while loading, the chart-bar profile stays and carries the pending state',()=>{
  const l=lookup({state:'loading',bars:null,message:'SYN is loading.'});
  const out=calculateIndicator('svp',CHART,SVP,{...facts,finerBars:l.fn});
  expect(l.calls).toEqual(['5m']);expect([last(out,'poc'),last(out,'vah'),last(out,'val')]).toEqual([10.5,12,10]);
  expect(out.profiles![0].finer).toEqual({state:'loading',interval:'5m',message:'SYN is loading.'});
  expect(profileFinerNotice(out.profiles!)).toBe('Loading 5m bars to place the volume at each price. Until they arrive, the volume of a bar that spans more than one row is spread evenly over its high-low range.');
  const failed=calculateIndicator('svp',CHART,SVP,{...facts,finerBars:lookup({state:'unavailable',bars:null,message:'No data.'}).fn});
  expect(failed.profiles![0].finer?.state).toBe('unavailable');expect(profileFinerNotice(failed.profiles!)).toBeNull();
 });
 it('asks for nothing when every bar fits one row, when loaded finer bars cover it, or on 1m charts',()=>{
  const none=lookup({state:'ready',bars:FINE,message:null});
  calculateIndicator('svp',CHART,{...SVP,rowSize:1},{...facts,finerBars:none.fn});
  calculateIndicator('svp',CHART,SVP,{...facts,lowerTimeframe:{interval:'5m',bars:FINE},finerBars:none.fn});
  calculateIndicator('svp',CHART.map((row,i)=>({...row,time:T0+i*60})),SVP,{resolution:'1m',calendar:'utc',finerBars:none.fn});
  expect(none.calls).toEqual([]);
 });
 it('finer bars that spread no fewer bars are not used',()=>{
  // A finer bar outside every chart bar covers none of them: the rebuild still spreads 2 bars, so the first build is kept.
  const outside=lookup({state:'ready',bars:[{time:T0+5*H,open:11,high:11,low:11,close:11,volume:5}],message:null});
  const kept=calculateIndicator('svp',CHART,SVP,{...facts,finerBars:outside.fn});
  expect(outside.calls).toEqual(['5m']);expect(kept.profiles![0].lowerTimeframeBars).toBe(0);expect(last(kept,'poc')).toBe(10.5);
 });
 it('Session volume profile HD, Visible range, Periodic and Auto anchored ask the same way',()=>{
  for(const kind of ['svphd','vrvp','pvp','aavp']){
   const l=lookup({state:'ready',bars:FINE,message:null});
   const out=calculateIndicator(kind,CHART,{rowsLayout:'Number Of Rows',rowSize:2,...(kind==='pvp'?{period:'Day'}:{})},{...facts,finerBars:l.fn});
   expect(l.calls,kind).toEqual(['5m']);expect(out.profiles![0].lowerTimeframeBars,kind).toBe(2);
  }
 });
 it('refuses a lookup that is not a function',()=>{
  expect(calculateIndicator('svp',CHART,SVP,{...facts,finerBars:'x' as never}).diagnostics.join(' ')).toMatch(/lower-timeframe bars supplied/);
 });
});

describe(' chart lookup through the script request resolver',()=>{
 it('asks for the chart symbol at the finer interval, chart owned; a loading answer is the pending state',()=>{
  const seen:Array<[ScriptRequestDeclaration,ScriptRequestBase]>=[];let state:'loading'|'ready'|'fail'='loading',pending=0;
  const resolver=(request:ScriptRequestDeclaration,base:ScriptRequestBase)=>{seen.push([request,base]);if(state==='loading')throw new Error('SYN is loading.');if(state==='fail')throw new Error('No loaded data for SYN.');return {bars:FINE,resolution:'5m',label:'SYN 5m',fixture:true};};
  // Preserve the ready/loading/refusal oracle while proving the actual primary and finer dataset owners.
  const primary=ownedProfileFixture('60m',CHART,'syn-chart'),fine=ownedProfileFixture('5m',FINE,'syn-finer');setProfileDatasets([primary,fine]);
  const proof=profileSourceContext(sourceContextForDataset(primary),primary.bars).profileSource;
  const fn=profileFinerLookup('syn-chart','60m',()=>{pending++;},resolver,undefined,proof)!;
  expect(fn('5m')).toEqual({state:'loading',bars:null,message:'SYN is loading.'});expect(pending).toBe(1);
  state='ready';expect(fn('5m')).toEqual({state:'ready',bars:FINE,message:null});
  state='fail';expect(fn('5m')).toEqual({state:'unavailable',bars:null,message:'No loaded data for SYN.'});expect(pending).toBe(1);
  expect(seen[0]).toEqual([{id:'volume-profile',symbol:null,interval:'5m'},{datasetId:'syn-chart',resolution:'60m',owner:'chart'}]);
  expect(profileFinerLookup(undefined,'60m')).toBeNull();expect(profileFinerLookup('syn-chart',null)).toBeNull();
  expect(profileFinerLookup('syn-chart','60m',undefined,null)!('5m').state).toBe('unavailable');
 });
 it('the presentation context carries the chart dataset id',()=>{
  expect(profileSourceContext({datasetId:'live:syn:SYN:60m'})).toEqual({datasetId:'live:syn:SYN:60m'});
  expect(()=>validateIndicatorPresentationContext({resolution:'60m',datasetId:'live:syn:SYN:60m'})).not.toThrow();
  expect(()=>validateIndicatorPresentationContext({resolution:'60m',datasetId:''} as never)).toThrow();
 });
 it('a profile on a live chart keeps the finer feed open; an imported chart or another kind does not',()=>{
  const grid=(datasetId:string,kind:string,interval='60m')=>({layout:{cells:[{id:'c1',symbol:'syn',interval}]},cells:{c1:{datasetId,indicators:[{id:'i1',kind,inputs:{}}]}}}) as never;
  expect([...scriptRequestDemand(grid('live:syn:SYN:60m','svp'))]).toEqual([scriptRequestKey('SYN','5m')]);
  expect([...scriptRequestDemand(grid('live:syn:SYN:1D','vrvp','1D'))]).toEqual([scriptRequestKey('SYN','30m')]);
  expect([...scriptRequestDemand(grid('import:syn','svp'))]).toEqual([]);
  expect([...scriptRequestDemand(grid('live:syn:SYN:60m','rsi'))]).toEqual([]);
  expect([...scriptRequestDemand(grid('live:syn:SYN:1m','svp','1m'))]).toEqual([]);
 });
});

describe(' on the real indicator port',()=>{
 let uninstall:(()=>void)|null=null;
 afterEach(()=>{uninstall?.();uninstall=null;});
 it('a waiting profile shows the notice and recalculates when the finer bars arrive',()=>{
  let ready=false;const calls:string[]=[];
  uninstall=installScriptRequestResolver((request,base)=>{calls.push(request.interval+'@'+base.datasetId);if(!ready)throw new Error('SYN is loading.');return {bars:FINE,resolution:'5m',label:'SYN 5m',fixture:true};});
  const primary=ownedProfileFixture('60m',CHART,'syn-chart'),fine=ownedProfileFixture('5m',FINE,'syn-finer');setProfileDatasets([primary]);
  const context=():IndicatorPresentationContext=>({resolution:'60m',calendar:'utc',...profileSourceContext(sourceContextForDataset(primary),primary.bars)});
  const host=nativeHost(CHART.map(row=>({...row,time:row.time*1000})));(host.chart as any).getVisibleRange=()=>null;
  const port=createIndicatorPort(host.chart as unknown as Vela,undefined,undefined,()=>CHART,undefined,context);
  const id=port.add('svp',SVP),other=port.add('vrvp',SVP);
  const poc=()=>port.values(id).series.find(row=>row.id==='poc')!.values.at(-1);
  expect(poc()).toBe(10.5);
  const diag=(key:string)=>port.list().find(row=>row.id===key)!.diagnostics;
  expect(diag(id)).toContain('Loading 5m bars to place the volume at each price. Until they arrive, the volume of a bar that spans more than one row is spread evenly over its high-low range.');
  expect(diag(other).join(' ')).toMatch(/Loading 5m bars/);// the pending notice shows for every profile kind
  expect(calls.every(row=>row==='5m@syn-chart')).toBe(true);
  ready=true;setProfileDatasets([primary,fine]);notifyScriptRequestData();
  expect(poc()).toBeCloseTo(11.4,12);expect(diag(id)).toEqual([]);expect(diag(other)).toEqual([]);
  // Nothing waits any more: a further notification recalculates nothing.
  const before=calls.length;notifyScriptRequestData();expect(calls.length).toBe(before);
 });
});
