import {expect,it} from 'vitest';
import {nativeCoreHarness} from './native-core-harness';
import {createIndicatorPort,defaultPlotStyle} from '../../src/chart/indicator-port';
import {VWAP_BAND_DEFAULTS} from '../../src/domain/indicators';
import {defaultIndicatorPresentation,indicatorLegacyDefaults} from '../../src/chart/indicator-settings';
import {createMarketQueue,type MarketInput} from '../../src/chart/market-queue';
const bands={...VWAP_BAND_DEFAULTS,band1Enabled:true,band2Enabled:true,band3Enabled:true};
it('adds/removes all three VWAP pairs and fills through actual pinned core full-model emissions',async()=>{
 const t=await nativeCoreHarness();let resolution='1m';const port=createIndicatorPort(t.chart,undefined,undefined,undefined,t.bridge.claim,()=>({resolution}));
 try{t.core.bars=[10,20,30].map((close,i)=>({time:1700000000000+i*60000,open:close,high:close,low:close,close,volume:[1,3,2][i]}));const id=port.add('vwap',{source:'close'}),native=port.list()[0].rendererId,get=()=>t.native.scene.indicators.get(native);expect(get().series).toHaveLength(1);expect(port.list()[0].presentationDiagnostics).toEqual([]);
 port.update(id,{inputs:bands,plots:{vwap:{...defaultPlotStyle('vwap','vwap',0),trackPrice:true}}});expect(get().series).toHaveLength(13);expect(get().fills).toHaveLength(3);expect(get().priceLines[0].price).toBe(65/3);
 const numerical=port.values(id),presentation={...defaultIndicatorPresentation('vwap'),hideOnDaily:true};port.update(id,{presentation});resolution='1D';port.recompute();expect(get().series).toEqual([]);expect(get().fills).toEqual([]);expect(get().priceLines).toEqual([]);expect(port.values(id).series).toEqual(numerical.series);
 resolution='1m';port.recompute();expect(get().series).toHaveLength(13);resolution='1Y';port.recompute();expect(get().series).toEqual([]);expect(port.list()[0].presentationDiagnostics.join(' ')).toContain('withheld');resolution='1m';port.recompute();
 port.update(id,{inputs:{...bands,band1Enabled:false,band2Enabled:false}});expect(get().series).toHaveLength(5);expect(get().fills).toHaveLength(1);port.update(id,{inputs:VWAP_BAND_DEFAULTS});expect(get().series).toHaveLength(1);expect(get().fills).toEqual([]);
 }finally{port.dispose();t.dispose();}
});
it('retains accepted settings and actual native output when a band update mount fails',async()=>{
 const t=await nativeCoreHarness(),port=createIndicatorPort(t.chart,undefined,undefined,undefined,t.bridge.claim,()=>({resolution:'1m'}));try{const id=port.add('vwap',{source:'close'}),native=port.list()[0].rendererId,before=port.serialize(),model=t.native.scene.indicators.get(native),mount=t.renderer.mountIndicator.bind(t.renderer);let fail=true;
 t.renderer.mountIndicator=next=>{const handle=mount(next);if(fail){fail=false;throw Error('literal native mount fault');}return handle;};expect(()=>port.update(id,{inputs:bands})).toThrow();expect(port.serialize()).toEqual(before);expect(t.native.scene.indicators.get(native).series).toEqual(model.series);expect(t.native.scene.indicators.get(native).fills).toEqual(model.fills);
 port.update(id,{inputs:bands});expect(t.native.scene.indicators.get(native).fills).toHaveLength(3);
 }finally{port.dispose();t.dispose();}
});
it('round-trips untouched legacy ordinary snapshots without injecting a band tuple or hidden presentation',async()=>{
 const t=await nativeCoreHarness(),port=createIndicatorPort(t.chart,undefined,undefined,undefined,t.bridge.claim);try{const legacy={id:'legacy-vwap',kind:'vwap' as const,inputs:{...indicatorLegacyDefaults.vwap},plots:{},offset:0,visible:true,paneId:'price'};port.restore([legacy]);expect(port.serialize()).toEqual([legacy]);port.update(legacy.id,{offset:1});expect(port.serialize()[0].inputs).toEqual(legacy.inputs);expect(Object.hasOwn(port.serialize()[0],'presentation')).toBe(false);}finally{port.dispose();t.dispose();}
});
it('pairs source resolution with actual native recomputation and restores both after a rejected market transaction',async()=>{
 const t=await nativeCoreHarness();let state:MarketInput={bars:[{time:1700000000,open:10,high:10,low:10,close:10,volume:1}],source:{datasetId:'original',revision:'1',fixture:true,label:'Synthetic',resolution:'1m'}};
 const port=createIndicatorPort(t.chart,undefined,undefined,()=>state.bars,t.bridge.claim,()=>({resolution:state.source.resolution??null})),seen:Array<[string|undefined,number]>=[];
 try{t.core.bars=state.bars.map(bar=>({...bar,time:bar.time*1000}));const id=port.add('vwap',{source:'close',...bands}),native=port.list()[0].rendererId;port.update(id,{presentation:{...defaultIndicatorPresentation('vwap'),hideOnDaily:true}});
 const queue=createMarketQueue({read:()=>state,write:next=>{state=next;},disposed:()=>false,apply:async rows=>{t.core.bars=rows.map(bar=>({...bar,time:bar.time*1000}));port.recompute();seen.push([state.source.resolution,t.native.scene.indicators.get(native).series.length]);if(state.source.datasetId==='rejected')throw Error('literal rejected market');}});
 await expect(queue.set(state.bars,{...state.source,datasetId:'rejected',resolution:'1D'})).rejects.toThrow('literal rejected market');expect(seen).toEqual([['1D',0],['1m',13]]);expect(state.source.datasetId).toBe('original');expect(port.values(id).series[0].values).toEqual([10]);
 const transaction=queue.setWithRollback(state.bars,{...state.source,datasetId:'daily',resolution:'1D'});expect(await transaction.result).toEqual({ok:true});expect(t.native.scene.indicators.get(native).series).toEqual([]);await transaction.rollback();expect(t.native.scene.indicators.get(native).series).toHaveLength(13);expect(state.source.resolution).toBe('1m');
 }finally{port.dispose();t.dispose();}
});
it('actual pinned setMarket restarts VWAP for identical row data and resolution-only supplier changes without port recompute',async()=>{
 const t=await nativeCoreHarness();let resolution='1m';const port=createIndicatorPort(t.chart,undefined,undefined,undefined,t.bridge.claim,()=>({resolution}));
 try{
  const rows=[10,20].map((close,i)=>({time:1700000000000+i*60000,open:close,high:close,low:close,close,volume:1}));t.core.bars=rows;
  const id=port.add('vwap',{source:'close',...bands}),native=port.list()[0].rendererId;port.update(id,{presentation:{...defaultIndicatorPresentation('vwap'),hideOnDaily:true}});
  // The controlled loader supplies local rows only. Actual setMarket, generation,
  // blanking, restartNativeIndicators, async startNativeIndicator, build and mount run.
  Object.assign(t.core,{config:{market:{symbol:'SYNTHETIC',timeframe:'1m',data:rows},live:false},rawBars:rows,generation:0,supersedeWaiters:[],readyPromise:Promise.resolve(),replayQueue:null,replayCarrying:null,typeEngines:new Map(),resolveHistoryComplete(){},feed:{},dataControl:{},stopLive(){},startLive(){},loadMarket:async()=>{t.core.setBarSeries(t.core.config.market.data);}});
  t.native.inputsUI.setStatus=()=>{}; // Controlled unmounted legend/status sink.
  t.native.introPlayed=true; // Animation and DOM frame scheduling are outside this core test.
  t.records.get(native).native.started=true;
  const faults:unknown[]=[];t.chart.on('indicator:error',event=>faults.push(event));
  expect(t.native.scene.indicators.get(native).series).toHaveLength(13);
  resolution='1D';await t.core.setMarket({data:rows});await Promise.resolve();expect(faults).toEqual([]);expect(t.native.scene.indicators.get(native).series).toEqual([]);expect(t.native.scene.indicators.get(native).fills).toEqual([]);expect(t.records.get(native).native.started).toBe(true);
  resolution='1m';await t.core.setMarket({data:rows});await Promise.resolve();expect(faults).toEqual([]);expect(t.native.scene.indicators.get(native).series).toHaveLength(13);expect(t.native.scene.indicators.get(native).fills).toHaveLength(3);expect(port.values(id).series[0].values).toEqual([10,15]);
 }finally{port.dispose();t.dispose();}
});
