import {expect,it} from 'vitest';
import {nativeCoreHarness} from './native-core-harness';
import {createIndicatorPort,defaultPlotStyle} from '../../src/chart/indicator-port';
import {DOMAIN_INDICATORS,defaultIndicatorPresentation} from '../../src/chart/indicator-settings';
import {makeIndicatorIntervalVisibility} from '../../src/chart/indicator-visibility';
import {acquireIndicatorDisplayPort} from '../../src/chart/indicator-display-source';
import {createMarketQueue,type MarketInput} from '../../src/chart/market-queue';

const onlyDaily=makeIndicatorIntervalVisibility('include',['1D'],[]);
const rows=Array.from({length:40},(_,i)=>({time:1700000000000+i*60000,open:10+i,high:12+i,low:9+i,close:11+i,volume:i+1}));

it('actual pinned core removes/restores every built-in model and private display tuple',async()=>{
 const t=await nativeCoreHarness();let resolution='1m';const port=createIndicatorPort(t.chart,undefined,undefined,undefined,t.bridge.claim,()=>({resolution}));
 try{t.core.bars=rows;const ids=DOMAIN_INDICATORS.map(kind=>port.add(kind)),display=acquireIndicatorDisplayPort(port,t.chart);const values=ids.map(id=>port.values(id).series),before=new Map(port.list().map(row=>[row.id,structuredClone(t.native.scene.indicators.get(row.rendererId).series)]));
  for(const row of port.list()){const plot=port.values(row.id).series[0].id;port.update(row.id,{plots:{[plot]:{...defaultPlotStyle(row.kind,plot,0),trackPrice:true}},presentation:{...defaultIndicatorPresentation(row.kind),visibility:onlyDaily}});const model=t.native.scene.indicators.get(row.rendererId);expect(model.series).toEqual([]);expect(model.fills).toEqual([]);expect(model.priceLines).toEqual([]);}
  for(const owner of display.read()){expect(owner.plots).toEqual([]);expect(owner.series).toEqual([]);expect(t.native.readoutRowsFor(t.native.scene.indicators.get(owner.rendererId),39,t.native.scene.panes.get('price'),'legend')).toEqual([]);}expect(t.native.dataWindowGroups(39,t.native.scene.panes.get('price'))).toEqual([]);expect(ids.map(id=>port.values(id).series)).toEqual(values);
  resolution='1D';port.recompute();for(const row of port.list()){const model=t.native.scene.indicators.get(row.rendererId);expect(model.series.map((series:any)=>series.id)).toEqual(before.get(row.id)!.map((series:any)=>series.id));expect(model.priceLines.length).toBeGreaterThan(0);}expect(display.read().every(owner=>owner.plots.length>0)).toBe(true);expect(t.native.dataWindowGroups(39,t.native.scene.panes.get('price'))).toHaveLength(10);
 }finally{port.dispose();t.dispose();}
});

it('actual pinned setMarket reevaluates exact declared resolution on identical data without port recompute',async()=>{
 const t=await nativeCoreHarness();let resolution='1m';const port=createIndicatorPort(t.chart,undefined,undefined,undefined,t.bridge.claim,()=>({resolution}));
 try{t.core.bars=rows;const id=port.add('rsi'),rendererId=port.list()[0].rendererId;port.update(id,{presentation:{...defaultIndicatorPresentation('rsi'),visibility:onlyDaily}});const numerical=port.values(id),display=acquireIndicatorDisplayPort(port,t.chart);
  // Local loader, unmounted status sink and animation are controlled. Actual
  // setMarket/restart/start/build/applyModel/full-model mount remain intact.
  Object.assign(t.core,{config:{market:{symbol:'SYNTHETIC',timeframe:'1m',data:rows},live:false},rawBars:rows,generation:0,supersedeWaiters:[],readyPromise:Promise.resolve(),replayQueue:null,replayCarrying:null,typeEngines:new Map(),resolveHistoryComplete(){},feed:{},dataControl:{},stopLive(){},startLive(){},loadMarket:async()=>{t.core.setBarSeries(t.core.config.market.data);}});
  t.native.inputsUI.setStatus=()=>{};t.native.introPlayed=true;t.records.get(rendererId).native.started=true;const faults:unknown[]=[];t.chart.on('indicator:error',event=>faults.push(event));
  expect(t.native.scene.indicators.get(rendererId).series).toEqual([]);resolution='1D';await t.core.setMarket({data:rows});await Promise.resolve();expect(faults).toEqual([]);expect(t.native.scene.indicators.get(rendererId).series).toHaveLength(3);expect(t.native.scene.indicators.get(rendererId).fills).toHaveLength(1);/* RSI + band anchors; RSI zones draw as native boxes (no anchors) */expect(display.read()[0].plots.length).toBeGreaterThan(0);
  resolution='1m';await t.core.setMarket({data:rows});await Promise.resolve();expect(faults).toEqual([]);expect(t.native.scene.indicators.get(rendererId).series).toEqual([]);expect(t.native.scene.indicators.get(rendererId).fills).toEqual([]);expect(display.read()[0].plots).toEqual([]);expect(port.values(id).series).toEqual(numerical.series);
 }finally{port.dispose();t.dispose();}
});

it('rolls back rejected visibility edits and paired market resolution before accepting later state',async()=>{
 const t=await nativeCoreHarness();let state:MarketInput={bars:rows.map(row=>({...row,time:row.time/1000})),source:{datasetId:'original',revision:'1',fixture:true,label:'Synthetic',resolution:'1D'}};
 const port=createIndicatorPort(t.chart,undefined,undefined,()=>state.bars,t.bridge.claim,()=>({resolution:state.source.resolution??null}));
 try{t.core.bars=rows;const id=port.add('rsi'),rendererId=port.list()[0].rendererId,display=acquireIndicatorDisplayPort(port,t.chart),before=port.serialize(),visible=structuredClone(t.native.scene.indicators.get(rendererId).series),mount=t.renderer.mountIndicator.bind(t.renderer);let fail=true;
  t.renderer.mountIndicator=next=>{const handle=mount(next);if(fail){fail=false;throw Error('literal visibility mount failure');}return handle;};
  expect(()=>port.update(id,{presentation:{...defaultIndicatorPresentation('rsi'),visibility:makeIndicatorIntervalVisibility('include',[],[])}})).toThrow();expect(port.serialize()).toEqual(before);expect(t.native.scene.indicators.get(rendererId).series).toEqual(visible);expect(display.read()[0].plots.length).toBeGreaterThan(0);
  port.update(id,{presentation:{...defaultIndicatorPresentation('rsi'),visibility:onlyDaily}});const seen:Array<[string|undefined,number]>=[];
  const queue=createMarketQueue({read:()=>state,write:next=>{state=next;},disposed:()=>false,apply:async input=>{t.core.bars=input.map(row=>({...row,time:row.time*1000}));port.recompute();seen.push([state.source.resolution,t.native.scene.indicators.get(rendererId).series.length]);if(state.source.datasetId==='rejected')throw Error('literal market failure');}});
  await expect(queue.set(state.bars,{...state.source,datasetId:'rejected',resolution:'1m'})).rejects.toThrow('literal market failure');expect(seen).toEqual([['1m',0],['1D',3]]);/* RSI + band anchors; RSI zones are native boxes */expect(state.source.datasetId).toBe('original');expect(display.read()[0].plots.length).toBeGreaterThan(0);
  const transaction=queue.setWithRollback(state.bars,{...state.source,datasetId:'minute',resolution:'1m'});expect(await transaction.result).toEqual({ok:true});expect(display.read()[0].plots).toEqual([]);await transaction.rollback();expect(display.read()[0].plots.length).toBeGreaterThan(0);expect(state.source.resolution).toBe('1D');
 }finally{port.dispose();t.dispose();}
});
