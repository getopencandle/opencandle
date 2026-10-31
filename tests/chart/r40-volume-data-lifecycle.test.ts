import {afterEach,describe,expect,it} from 'vitest';
import type {Vela} from '@luxalgo/vela';
import {nativeHost} from '../ui/indicator-real-port-harness';
import {createIndicatorPort} from '../../src/chart/indicator-port';
import {scriptRequestDemand} from '../../src/ui/script-request-demand';
import {installScriptRequestResolver,notifyScriptRequestData,scriptRequestKey} from '../../src/ui/script-requests';
import {indicatorAlertBlock} from '../../src/domain/indicator-alertability';
import type {Bar} from '../../src/domain/types';
import {encodeIndicatorSource} from '../../src/domain/indicator-source';
import {setProfileDatasets} from '../../src/chart/vp-visible-range-ltf';

// SYNTHETIC. One 5m bucket: +10, -4, -3 gives delta +3 with high 10, low 0. Next bucket: -6 gives -6.
const T=1767225600;
const row=(time:number,open:number,close:number,volume:number):Bar=>({time,open,high:Math.max(open,close),low:Math.min(open,close),close,volume});
const chart=[row(T,10,10,17),row(T+300,10,9,6)],fine=[row(T,10,11,10),row(T+60,11,10,4),row(T+120,10,10,3),row(T+300,10,9,6)];
const ports:ReturnType<typeof createIndicatorPort>[]=[];let uninstall:(()=>void)|undefined;
afterEach(()=>{for(const port of ports.splice(0))port.dispose();uninstall?.();uninstall=undefined;setProfileDatasets([]);});
function rig(bars=chart,resolution='5m'){
 const host=nativeHost(bars.map(item=>({...item,time:item.time*1000})));let range:{from:number;to:number}|null=null;
 (host.chart as any).getVisibleRange=()=>range;
 const port=createIndicatorPort(host.chart as unknown as Vela,undefined,undefined,undefined,undefined,()=>({resolution,calendar:'utc',datasetId:'synthetic-chart',instrument:'synthetic-instrument'}));ports.push(port);
 return {host,port,setRange:(from:number,to:number)=>{range={from:from*1000,to:to*1000};},model:(id:string)=>host.live.get(port.list().find(item=>item.id===id)!.rendererId)};
}
describe(' volume studies on the real indicator port (synthetic)',()=>{
 it('draws Up/Down columns on opposite sides of zero and a notch in the prevailing color',()=>{
  uninstall=installScriptRequestResolver(()=>({bars:fine,resolution:'1m',label:'Synthetic 1m',fixture:true}));
  const {port,model}=rig(),id=port.add('updownvolume'),output=model(id).emitted;
  expect(port.values(id).series.find(item=>item.id==='up')!.values).toEqual([10,0]);
  expect(port.values(id).series.find(item=>item.id==='down')!.values).toEqual([-7,-6]);
  expect(output.lines.map((line:any)=>[line.y1,line.y2,line.color])).toEqual([[3,3,'#089981'],[-6,-6,'#f23645']]);
  expect(output.lines.every((line:any)=>line.x1<line.x2)).toBe(true);
 });
 it('shows loading, computes only after real intrabars arrive, and emits native OHLC candles',()=>{
  let ready=false;const calls:string[]=[];
  uninstall=installScriptRequestResolver(request=>{calls.push(String(request.interval));if(!ready)throw new Error('Synthetic history is loading.');return {bars:fine,resolution:'1m',label:'Synthetic 1m',fixture:true};});
  const {port,model}=rig(),id=port.add('volumedelta');
  expect(port.list()[0].diagnostics.join(' ')).toMatch(/Loading 1m bars/);
  expect(model(id).emitted.series.find((series:any)=>series.kind==='candle').bars).toEqual([]);
  ready=true;notifyScriptRequestData();
  expect(port.values(id).series.find(item=>item.id==='close')!.values).toEqual([3,-6]);
  expect(port.list()[0].diagnostics).toEqual([]);
  const candles=model(id).emitted.series.find((series:any)=>series.kind==='candle');
  expect(candles.bars).toEqual([{time:T*1000,open:0,high:10,low:0,close:3},{time:(T+300)*1000,open:0,high:0,low:-6,close:-6}]);
  expect(model(id).emitted.series.filter((series:any)=>series.kind!=='candle').every((series:any)=>series.display.pane===false)).toBe(true);
  const before=calls.length;notifyScriptRequestData();expect(calls.length).toBe(before+1);
  expect(port.values(id).series.find(item=>item.id==='close')!.values).toEqual([3,-6]);
 });
 it('ready history corrected in place or replaced refreshes numerical values and dependent studies',()=>{
  let history=fine.map(item=>({...item}));
  uninstall=installScriptRequestResolver(()=>({bars:history,resolution:'1m',label:'Synthetic corrected history',fixture:true}));
  const {port}=rig(),id=port.add('volumedelta'),dependent=port.add('ema',{length:1,source:encodeIndicatorSource(id,'close')});
  const close=(key:string)=>port.values(key).series.find(item=>item.id===(key===id?'close':'ema'))!.values;
  expect(close(id)).toEqual([3,-6]);expect(close(dependent)).toEqual([3,-6]);
  history[0].volume=20;notifyScriptRequestData();expect(close(id)).toEqual([13,-6]);expect(close(dependent)).toEqual([13,-6]);
  history=history.map((item,i)=>i===0?{...item,volume:7}:item);notifyScriptRequestData();
  expect(close(id)).toEqual([0,-6]);expect(close(dependent)).toEqual([0,-6]);
 });
 it('remove, undo-style restore, redo-style removal and a fresh layout restore use current data',()=>{
  let volume=10;
  uninstall=installScriptRequestResolver(()=>({bars:[{...fine[0],volume}],resolution:'1m',label:'Synthetic 1m',fixture:true}));
  const first=rig(),id=first.port.add('volumedelta'),saved=structuredClone(first.port.serialize());
  expect(first.port.values(id).series.find(item=>item.id==='close')!.values[0]).toBe(10);
  first.port.remove(id);expect(first.port.list()).toEqual([]);
  volume=25;first.port.restore(structuredClone(saved));
  expect(first.port.values(id).series.find(item=>item.id==='close')!.values[0]).toBe(25);
  first.port.restore([]);expect(first.port.list()).toEqual([]);
  volume=40;const second=rig();second.port.restore(structuredClone(saved));
  expect(second.port.values(id).series.find(item=>item.id==='close')!.values[0]).toBe(40);
 });
 it('accepts exact 1m/1s source history at equal chart intervals and refuses mismatched resolver metadata',()=>{
  for(const [resolution,spacing] of [['1m',60],['1s',1]] as const){
   const source=[row(T,10,11,10),row(T+spacing,11,10,4)],requests:string[]=[];
   uninstall?.();uninstall=installScriptRequestResolver(request=>{requests.push(String(request.interval));return {bars:source,resolution,label:'Synthetic matching history',fixture:true};});
   const current=rig(source,resolution),id=current.port.add('volumedelta');
   expect(current.port.values(id).series.find(item=>item.id==='close')!.values).toEqual([10,-4]);
   expect(requests).toEqual([resolution]);current.port.dispose();ports.splice(ports.indexOf(current.port),1);
  }
  uninstall?.();uninstall=installScriptRequestResolver(()=>({bars:fine,resolution:'5m',label:'Synthetic mismatched history',fixture:true}));
  const current=rig(),id=current.port.add('volumedelta');
  expect(current.port.values(id).series.every(item=>item.values.every(value=>value===null))).toBe(true);
  expect(current.port.list()[0].diagnostics.join(' ')).toMatch(/Intrabar data is unavailable/);
 });
 it('never borrows an unrelated loaded dataset solely because its instrument and interval match',()=>{
  setProfileDatasets([{resolution:'1m',instrument:{id:'synthetic-instrument'},bars:[row(T,10,11,999)],provenance:{fixture:true,providerId:'different-synthetic-provider'}}] as never);
  uninstall=installScriptRequestResolver(()=>{throw new Error('No history for the exact synthetic source basis.');});
  const current=rig(),id=current.port.add('volumedelta');
  expect(current.port.values(id).series.every(item=>item.values.every(value=>value===null))).toBe(true);
  expect(current.port.list()[0].diagnostics.join(' ')).toMatch(/Intrabar data is unavailable/);
 });
 it('Visible average price follows viewport callbacks and restored snapshots without stale memo values',()=>{
  const source=[row(T,10,10,1),row(T+300,20,20,1),row(T+600,30,30,1)];
  const first=rig(source);first.setRange(T,T+300);const id=first.port.add('visibleavg'),saved=structuredClone(first.port.serialize());
  expect(first.port.values(id).series[0].values).toEqual([15,15,null]);
  first.setRange(T+300,T+600);first.model(id).model.onViewport();
  expect(first.port.values(id).series[0].values).toEqual([null,25,25]);
  first.port.restore([]);first.setRange(T,T+300);first.port.restore(structuredClone(saved));
  expect(first.port.values(id).series[0].values).toEqual([15,15,null]);
  const restored=rig(source);restored.setRange(T+300,T+600);restored.port.restore(structuredClone(saved));
  expect(restored.port.values(id).series[0].values).toEqual([null,25,25]);
 });
 it('daily-history loading has a non-profile notice and retries through the existing resolver notification',()=>{
  let ready=false;const calls:string[]=[];
  const daily=Array.from({length:9},(_,i)=>({...row(T+i*86400,10,10,1),high:20+i,low:10-i}));
  uninstall=installScriptRequestResolver(request=>{calls.push(String(request.interval));if(!ready)throw new Error('Synthetic daily history is loading.');return {bars:daily,resolution:'1D',label:'Synthetic daily',fixture:true};});
  const {port}=rig([row(T+8*86400+3600,11,12,1)],'60m'),id=port.add('w52hl',{weeks:1});
  expect(port.list()[0].diagnostics.join(' ')).toMatch(/Loading daily history/);
  ready=true;notifyScriptRequestData();expect(calls).toEqual(['1D','1D']);
  expect(port.values(id).series.find(item=>item.id==='high')!.values).toEqual([27]);
  expect(port.list()[0].diagnostics).toEqual([]);
  daily[7].high=99;notifyScriptRequestData();
  expect(port.values(id).series.find(item=>item.id==='high')!.values).toEqual([99]);
 });
 it('keeps exact live data requests for hidden/custom/restored studies and removes demand with the studies',()=>{
  const grid=(kind:string,inputs:Record<string,unknown>={},datasetId='live:synthetic:SYN:60m')=>({layout:{cells:[{id:'c1',symbol:'SYN',interval:'60m'}]},cells:{c1:{datasetId,indicators:[{id:'i1',kind,inputs,visible:false}]}}}) as never;
  expect([...scriptRequestDemand(grid('volumedelta'))]).toEqual([scriptRequestKey('SYN','1m')]);
  expect([...scriptRequestDemand(grid('cvd',{useCustomTimeframe:true,timeframe:'5m'}))]).toEqual([scriptRequestKey('SYN','5m')]);
  expect([...scriptRequestDemand(grid('w52hl'))]).toEqual([scriptRequestKey('SYN','1D')]);
  expect([...scriptRequestDemand(grid('visibleavg'))]).toEqual([]);
  expect([...scriptRequestDemand(grid('volumedelta',{},'import:synthetic'))]).toEqual([]);
  const saved=grid('volumedelta') as any,empty=structuredClone(saved);empty.cells.c1.indicators=[];
  expect([...scriptRequestDemand(empty)]).toEqual([]);expect([...scriptRequestDemand(structuredClone(saved))]).toEqual([scriptRequestKey('SYN','1m')]);
  expect([...scriptRequestDemand(grid('cvd',{useCustomTimeframe:true,timeframe:'120m'}))]).toEqual([]);
 });
 it('refuses unavailable background alert inputs with plain reasons',()=>{
  for(const kind of ['updownvolume','volumedelta','cvd'])expect(indicatorAlertBlock(kind)).toMatch(/lower-timeframe history.*cannot be alerted on/);
  expect(indicatorAlertBlock('visibleavg')).toMatch(/visible range.*cannot be alerted on/);
 });
});
