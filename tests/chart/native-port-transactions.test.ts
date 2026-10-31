import {it,expect} from 'vitest';
import {getNativeIndicator,type Vela,type NativeIndicator,type NativeIndicatorContext} from '@luxalgo/vela';
import {createIndicatorPort} from '../../src/chart/indicator-port';
import {createComparisonPort} from '../../src/chart/compare-port';
import {createScriptPort} from '../../src/chart/script-port';
import {fixtureDataset} from '../../src/domain/fixtures';
const dataset=fixtureDataset('GME',5),bars=dataset.bars.map(bar=>({...bar,time:bar.time*1000}));
/** Delays native model start like Vela; panes exist only after the first emitted model. */
function nativeChart(delayed=false){
 let sequence=0,throwNext=false;const live=new Map<string,{model:NativeIndicator;pane:string;mounted:boolean;start:()=>void}>(),moves:string[]=[],emitted=new Map<string,unknown>(),events=new Map<string,Set<(value:any)=>void>>();const emit=(event:string,value:unknown)=>{for(const callback of events.get(event)??[])callback(value);};
 const chart={on:(event:string,callback:(value:any)=>void)=>{const callbacks=events.get(event)??new Set();callbacks.add(callback);events.set(event,callbacks);return()=>{callbacks.delete(callback);};},panes:{list:()=>[...new Set(['price',...[...live.values()].filter(row=>row.mounted).map(row=>row.pane)])].map(id=>({id,indicators:[...live].filter(([,row])=>row.mounted&&row.pane===id).map(([id])=>({id}))}))},getVisibleRange:()=>({from:bars[0].time,to:bars.at(-1)!.time}),addNativeIndicator(type:string){
  const descriptor=getNativeIndicator(type)!,id=`native-${++sequence}`,model=descriptor.create(),row={model,pane:descriptor.paneHint==='price'?'price':`pane-${sequence}`,mounted:false,start:()=>{}};live.set(id,row);
  row.start=()=>{if(!live.has(id))return;model.start({id,symbol:'SYNTHETIC',timeframe:'1',live:false,data:{} as any,bars:()=>bars,emit:(output:unknown)=>{row.mounted=true;emitted.set(id,output);},pushData:()=>{},setStatus:()=>{}} as NativeIndicatorContext,descriptor.defaultInputs());};
  const handle={id,setInputs:(values:any)=>model.setInputs(values),setVisible:(visible:boolean)=>{visible?model.resume():model.suspend();},moveTo:(target:any)=>{if(!row.mounted)return;moves.push(id);row.pane=typeof target==='string'?target:target.pane??`new-pane-${++sequence}`;},remove:()=>{model.stop();live.delete(id);emit('indicator:removed',{id});}};
  if(!delayed)row.start();if(throwNext){throwNext=false;live.delete(id);throw new Error('Native failed after start');}return handle;
 }};
 return {chart:chart as unknown as Vela,live,moves,emitted,removeNative:(id:string)=>{live.get(id)?.model.stop();live.delete(id);emit('indicator:removed',{id});},stop:()=>{for(const row of live.values()){row.model.stop();row.mounted=false;}},start:()=>{for(const row of [...live.values()])row.start();},failNext:()=>{throwNext=true;}};
}
it('all native ports publish one complete add/remove and no transient failed instance',()=>{
 for(const kind of ['indicator','comparison','script'] as const){const native=nativeChart(),port=kind==='indicator'?createIndicatorPort(native.chart):kind==='comparison'?createComparisonPort(native.chart):createScriptPort(native.chart),seen:any[]=[];
  port.subscribe(()=>seen.push(port.list()));const add=()=>kind==='indicator'?(port as ReturnType<typeof createIndicatorPort>).add('rsi',{length:3},{id:'same'}):kind==='comparison'?(port as ReturnType<typeof createComparisonPort>).add(dataset,{id:'same'}):(port as ReturnType<typeof createScriptPort>).add({plots:[]},{id:'same'});
  native.failNext();expect(add).toThrow('Native failed after start');expect(port.list()).toEqual([]);expect(seen).toEqual([]);
  const id=add();expect(seen).toHaveLength(1);expect(seen[0][0].rendererId).not.toBe('');port.remove(id);expect(seen).toHaveLength(2);expect(seen[1]).toEqual([]);port.remove('missing');expect(seen).toHaveLength(2);add();const beforeDispose=seen.length;port.dispose();expect(seen).toHaveLength(beforeDispose);expect(native.live.size).toBe(0);
 }
});
it('delayed native starts preserve saved logical shared panes before and after mounting',()=>{
 const native=nativeChart(true),port=createIndicatorPort(native.chart);
 const saved=[{id:'rsi-a',kind:'rsi' as const,inputs:{length:3,source:'close'},plots:{},offset:0,visible:true,paneId:'lv-pane-saved'},{id:'atr-b',kind:'atr' as const,inputs:{length:3,smoothing:'RMA'},plots:{},offset:0,visible:true,paneId:'lv-pane-saved'}];
 port.restore(saved);expect(port.serialize().map(row=>row.paneId)).toEqual(['lv-pane-saved','lv-pane-saved']);native.start();
 expect(port.serialize().map(row=>row.paneId)).toEqual(['lv-pane-saved','lv-pane-saved']);expect(port.list()[0].paneId).toBe(port.list()[1].paneId);expect(native.moves).toHaveLength(1);port.dispose();
});
it('comparison moves to its own scale in the price pane after asynchronous model mounting',()=>{
 const native=nativeChart(true),port=createComparisonPort(native.chart),id=port.add(dataset,{id:'comparison'});
 expect(native.moves).toEqual([]);native.start();expect(native.moves).toHaveLength(1);expect(native.live.get(port.list()[0].rendererId)!.pane).toBe('price');port.remove(id);port.dispose();
});
it('comparison restore validates first, is a no-op for equal settings, and rolls native failures back',()=>{
 const native=nativeChart(),port=createComparisonPort(native.chart);port.add(dataset,{id:'original'});const saved=port.list().map(({rendererId,...settings})=>settings);let notifications=0;port.subscribe(()=>notifications++);
 expect(port.restore(structuredClone(saved))).toEqual({changed:false});expect(notifications).toBe(0);
 expect(()=>port.restore([{...saved[0],width:-1}])).toThrow('Invalid comparison');expect(port.list().map(({rendererId,...settings})=>settings)).toEqual(saved);expect(notifications).toBe(0);
 native.failNext();expect(()=>port.restore([{...saved[0],id:'replacement'}])).toThrow('Native failed after start');expect(port.list().map(({rendererId,...settings})=>settings)).toEqual(saved);expect(native.live.size).toBe(1);expect(notifications).toBe(0);
 expect(port.restore([{...saved[0],id:'replacement'}])).toEqual({changed:true});expect(notifications).toBe(1);expect(port.list()[0].id).toBe('replacement');port.dispose();
});
it('comparison restoration refreshes corrected bars and revisions under the same dataset ID',()=>{
 const native=nativeChart(),port=createComparisonPort(native.chart);port.add(dataset,{id:'correction',mode:'absolute'});const original=port.list().map(({rendererId,...settings})=>settings),corrected=structuredClone(original);corrected[0].dataset.bars[0].close+=1;corrected[0].dataset.provenance.revision='2';
 const oldHandle=port.list()[0].rendererId;expect(port.restore(corrected)).toEqual({changed:true});expect(port.list()[0].rendererId).not.toBe(oldHandle);expect(port.list()[0].dataset.provenance.revision).toBe('2');expect(port.list()[0].dataset.bars[0].close).toBe(dataset.bars[0].close+1);expect(port.restore(corrected)).toEqual({changed:false});port.dispose();
});
it('source invalidation removes accepted script results before native input callbacks can reuse them',()=>{
 const native=nativeChart(),port=createScriptPort(native.chart);port.add({plots:[{id:'old',title:'Old source',color:'#ffffff',values:[{time:dataset.bars[0].time,value:999999}]}]},{id:'script'});expect(port.list()[0].plotDescriptors).toHaveLength(1);
 let notifications=0;port.subscribe(()=>notifications++);port.invalidateResults();expect(port.list()[0].plotDescriptors).toEqual([]);expect(JSON.stringify(port.list())).not.toContain('999999');expect(port.list()[0].diagnostics).toContain('Chart input changed; script results require recalculation.');expect(notifications).toBe(1);
 native.start();expect(port.list()[0].plotDescriptors).toEqual([]);port.dispose();
});
it('renaming an accepted script changes metadata/rendered labels without replacing its handle or plots',()=>{
 const native=nativeChart(),port=createScriptPort(native.chart);port.add({plots:[{id:'close',title:'Close',color:'#ffffff',values:[{time:dataset.bars[0].time,value:2}]}]},{id:'named',title:'Before'});const handle=port.list()[0].rendererId,before=native.emitted.get(handle) as any;let notifications=0;port.subscribe(()=>notifications++);
 port.rename('named','After');expect(port.list()[0].title).toBe('After');expect(port.list()[0].rendererId).toBe(handle);const after=native.emitted.get(handle) as any;expect(after.series[0].title).toBe('After · Close');expect(after.series[0].id).toBe(before.series[0].id);expect(after.series[0].points).toEqual(before.series[0].points);expect(notifications).toBe(1);port.dispose();
});
it('native source/style restart keeps saved instances and logical panes; actual native deletion removes them',()=>{
 const native=nativeChart(),indicators=createIndicatorPort(native.chart),scripts=createScriptPort(native.chart),comparisons=createComparisonPort(native.chart);indicators.add('rsi',{length:3},{id:'rsi'});scripts.add({plots:[]},{id:'script'});comparisons.add(dataset,{id:'comparison'});const saved=indicators.serialize();
 const transientSnapshots:any[]=[];indicators.subscribe(()=>transientSnapshots.push(indicators.serialize()));native.stop();expect(indicators.serialize()).toEqual(saved);expect(transientSnapshots.every(rows=>rows.length===1&&rows[0].paneId===saved[0].paneId)).toBe(true);expect(scripts.list()).toHaveLength(1);expect(comparisons.list()).toHaveLength(1);
 scripts.update('script',{plots:[]});native.start();expect(indicators.serialize()).toEqual(saved);expect(scripts.list()).toHaveLength(1);expect(comparisons.list()).toHaveLength(1);
 native.removeNative(indicators.list()[0].rendererId);native.removeNative(scripts.list()[0].rendererId);native.removeNative(comparisons.list()[0].rendererId);expect(indicators.serialize()).toEqual([]);expect(scripts.list()).toEqual([]);expect(comparisons.list()).toEqual([]);indicators.dispose();scripts.dispose();comparisons.dispose();
});
