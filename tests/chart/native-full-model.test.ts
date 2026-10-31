import {expect,it} from 'vitest';
import type {NativeIndicatorOutput} from '@luxalgo/vela';
import {nativeCoreHarness} from './native-core-harness';
import {createIndicatorPort,defaultPlotStyle} from '../../src/chart/indicator-port';
import {defaultIndicatorPresentation} from '../../src/chart/indicator-settings';
import {createScriptPort} from '../../src/chart/script-port';
import {createComparisonPort} from '../../src/chart/compare-port';
import type {BarDataset} from '../../src/domain/types';
import {rolldown} from 'rolldown';
import {writeFileSync,unlinkSync,readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {randomUUID,createHash} from 'node:crypto';
import {getNativeIndicator} from '@luxalgo/vela';
const output=(color='#ff0000',kind='line'):NativeIndicatorOutput=>({series:[{id:'plot',title:'Main',paneId:'',kind:kind as 'line',points:[{time:1700000000000,value:10}],style:{color,width:2,lineStyle:'solid'}}],fills:[],priceLines:[{id:'tracking',paneId:'',price:10}]});
it('actual pinned core applies same-ID style and kind changes rather than only replacing points',async()=>{
 const test=await nativeCoreHarness();try{test.emit(output());test.emit(output('#0000ff','area'));const actual=test.native.scene.indicators.get('actual-native');expect(actual.series[0].style.color).toBe('#0000ff');expect(actual.series[0].kind).toBe('area');}finally{test.dispose();}
});
it('unrelated native descriptors keep the exact upstream value-only update behavior',async()=>{
 const t=await nativeCoreHarness(false);try{t.emit(output());t.emit(output('#abcdef','area'));expect(t.native.scene.indicators.get(t.record.id).series[0]).toMatchObject({kind:'line',style:{color:'#ff0000'}});expect(t.bridge.update(t.record.renderHandle,{kind:'value',indicatorId:t.record.id,dirty:{from:0,to:0},series:[]})).toBe(false);}finally{t.dispose();}
});
it('released descriptor identities cannot be reacquired or update a retired instance',async()=>{
 const t=await nativeCoreHarness();try{t.emit(output());t.release();expect(()=>t.bridge.claim(t.descriptor)).toThrow('not current');expect(()=>t.emit(output('#abcdef'))).toThrow('retired');expect(t.native.scene.indicators.get(t.record.id).series[0].style.color).toBe('#ff0000');}finally{t.dispose();}
});
it.each(['built','script','comparison'] as const)('releases %s descriptor authority and registrations despite failing native removal',async kind=>{
 const t=await nativeCoreHarness();let port:ReturnType<typeof createIndicatorPort>|ReturnType<typeof createScriptPort>|ReturnType<typeof createComparisonPort>;try{
 if(kind==='built'){const value=createIndicatorPort(t.chart,undefined,undefined,undefined,t.bridge.claim);value.add('sma',{length:1});port=value;}
 else if(kind==='script'){const value=createScriptPort(t.chart,undefined,t.bridge.claim);value.add({plots:[]});port=value;}
 else{const value=createComparisonPort(t.chart,t.bridge.claim);value.add({instrument:{symbol:'SYNTHETIC'},bars:[],provenance:{fixture:true}} as unknown as BarDataset);port=value;}
 const row=port.list()[0],record=t.records.get(row.rendererId),handle=t.core.handles.get(row.rendererId),descriptor=record.native.descriptor;handle.remove=()=>{throw Error('synthetic removal failure');};expect(()=>port.dispose()).toThrow();expect(port.list()).toEqual([]);expect(getNativeIndicator(descriptor.type)).toBeUndefined();expect(()=>t.bridge.claim(descriptor)).toThrow('not current');
 }finally{t.dispose();}
});
it('real built-in ordinary bar updates refresh and remove the tracked endpoint',async()=>{
 const t=await nativeCoreHarness(),port=createIndicatorPort(t.chart,undefined,undefined,undefined,t.bridge.claim);try{const id=port.add('sma',{length:1}),rendererId=port.list()[0].rendererId;port.update(id,{plots:{sma:{...defaultPlotStyle('sma','sma',0),trackPrice:true}}});expect(t.native.scene.indicators.get(rendererId).priceLines[0].price).toBe(10);
 t.core.bars=[{...t.core.bars[0],close:25}];t.instances.get(rendererId).onBars();expect(t.native.scene.indicators.get(rendererId).priceLines[0].price).toBe(25);
 t.core.bars=[];t.instances.get(rendererId).onBars();expect(t.native.scene.indicators.get(rendererId).priceLines).toEqual([]);
 }finally{port.dispose();t.dispose();}
});
it('minified original OpenCandle bridge executes against the exact pinned core without constructor-name authority',async()=>{
 const t=await nativeCoreHarness(false),temporary=resolve('.cache',`lv-full-model-minified-${randomUUID()}.mjs`);let bundle:Awaited<ReturnType<typeof rolldown>>|undefined;try{
 bundle=await rolldown({input:resolve('src/chart/native-full-model.ts'),external:['@luxalgo/vela']});const generated=await bundle.generate({format:'esm',minify:true});writeFileSync(temporary,generated.output[0].code);const loaded=await import(/* @vite-ignore */ pathToFileURL(temporary).href);const bridge=loaded.createNativeFullModelBridge(t.chart,t.renderer),release=bridge.claim(t.descriptor),original=t.renderer.updateIndicator.bind(t.renderer);t.renderer.updateIndicator=(handle,patch)=>{if(!bridge.update(handle,patch))original(handle,patch);};
 try{t.emit(output());t.emit(output('#123456','area'));expect(t.native.scene.indicators.get(t.record.id).series[0]).toMatchObject({kind:'area',style:{color:'#123456'}});}finally{release();bridge.dispose();}
 }finally{await bundle?.close();try{unlinkSync(temporary);}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}t.dispose();}
});
it('measures bounded actual native full-model mount overhead for ten studies and five hundred loaded bars',async()=>{
 const t=await nativeCoreHarness(),port=createIndicatorPort(t.chart,undefined,undefined,undefined,t.bridge.claim);try{
 t.core.bars=Array.from({length:500},(_,i)=>({time:1700000000000+i*60000,open:100+i%9,high:110+i%9,low:90+i%9,close:101+i%9,volume:100+i}));let mounts=0,mountMs=0;const mount=t.renderer.mountIndicator.bind(t.renderer);t.renderer.mountIndicator=model=>{mounts++;const start=performance.now();try{return mount(model);}finally{mountMs+=performance.now()-start;}};for(let i=0;i<10;i++)port.add(i%2?'rsi':'sma',{length:14});mounts=0;mountMs=0;
 const before=process.memoryUsage().heapUsed,start=performance.now();for(let i=0;i<16;i++)port.recompute();const elapsed=performance.now()-start;
 writeFileSync('reports/native-full-model-performance.json',JSON.stringify({synthetic:true,kind:'actual pinned core and NativeRenderer scene, controlled scheduler and legend sinks',gui:false,referenceCompared:false,chartCount:1,sequentialUpdateRounds:16,studyCount:10,barCount:500,fullMounts:mounts,publicMountMs:mountMs,totalMs:elapsed,meanRoundMs:elapsed/16,sampledHeapDeltaBytes:process.memoryUsage().heapUsed-before,coreSha256:t.sourceHash,bridgeSha256:createHash('sha256').update(readFileSync('src/chart/native-full-model.ts')).digest('hex'),ceilingMs:2000,pass:elapsed<2000},null,2));expect(mounts).toBe(160);expect(elapsed).toBeLessThan(2000);
 }finally{port.dispose();t.dispose();}
});
it('real built-in port style-only emissions update the actual scene without synthetic input events',async()=>{
 const t=await nativeCoreHarness(),port=createIndicatorPort(t.chart,undefined,undefined,undefined,t.bridge.claim);try{
 t.core.bars=Array.from({length:20},(_,i)=>({time:1700000000000+i*60000,open:i+1,close:i+2,high:i+3,low:i,volume:10}));
 const id=port.add('rsi',{length:2}),rendererId=port.list()[0].rendererId;let inputs=0;t.chart.on('indicator:inputs',()=>inputs++);
 const style={...defaultPlotStyle('rsi','rsi',0),color:'#abcdef',kind:'area' as const,width:4,trackPrice:true};
 const presentation=defaultIndicatorPresentation('rsi');presentation.guides.upper={visible:true,value:80,color:'#123456',width:3,lineStyle:'dotted'};presentation.fills.band={visible:true,color:'#ff0000',opacity:25};
 port.update(id,{plots:{rsi:style},presentation});let actual=t.native.scene.indicators.get(rendererId);expect(actual.series[0]).toMatchObject({kind:'area',style:{color:'#abcdef',width:4}});expect(actual.priceLines.some((line:any)=>line.price===80)).toBe(true);expect(actual.fills.length).toBeGreaterThan(0);expect(inputs).toBe(0);
 port.update(id,{inputs:{smoothingType:'SMA+BB',smoothingLength:2}});actual=t.native.scene.indicators.get(rendererId);expect(actual.series.length).toBeGreaterThan(3);expect(inputs).toBe(1);
 port.update(id,{inputs:{smoothingType:'None'}});expect(t.native.scene.indicators.get(rendererId).series.length).toBeLessThan(actual.series.length);
 }finally{port.dispose();t.dispose();}
});
it('real script port physically replaces plot topology, style and empty invalidation',async()=>{
 const t=await nativeCoreHarness(),port=createScriptPort(t.chart,undefined,t.bridge.claim);try{const plot={id:'one',title:'One',color:'#ff0000',values:[{time:1700000000,value:10}]},id=port.add({plots:[plot]}),rendererId=port.list()[0].rendererId;
 port.style(id,{one:{...defaultPlotStyle('sma','one',0),color:'#123456',kind:'area'}});expect(t.native.scene.indicators.get(rendererId).series[0]).toMatchObject({kind:'area',style:{color:'#123456'}});
 port.update(id,{plots:[{...plot,id:'two',title:'Two'}]});expect(t.native.scene.indicators.get(rendererId).series).toHaveLength(1);expect(t.native.scene.indicators.get(rendererId).series[0].title).toContain('Two');
 port.invalidateResults();expect(t.native.scene.indicators.get(rendererId).series).toEqual([]);
 }finally{port.dispose();t.dispose();}
});
it('real comparison port updates actual color and width while retaining its independent price scale',async()=>{
 const t=await nativeCoreHarness(),port=createComparisonPort(t.chart,t.bridge.claim);try{const dataset={instrument:{symbol:'SYNTHETIC-COMPARE'},bars:[{time:1700000000,open:9,high:11,low:8,close:10,volume:1}],provenance:{fixture:true}} as BarDataset;const id=port.add(dataset),rendererId=port.list()[0].rendererId;
 port.update(id,{color:'#345678',width:5});expect(t.native.scene.indicators.get(rendererId)).toMatchObject({paneId:'price',ownScale:true,series:[{style:{color:'#345678',width:5}}]});
 }finally{port.dispose();t.dispose();}
});
it('failed public mount recovers both the actual scene and authoritative core model',async()=>{
 const t=await nativeCoreHarness();try{t.emit(output());const previous=t.record.model;let fail=true;const mount=t.renderer.mountIndicator.bind(t.renderer);t.renderer.mountIndicator=model=>{const handle=mount(model);if(fail){fail=false;throw Error('synthetic mount failure');}return handle;};
 expect(()=>t.emit(output('#abcdef'))).toThrow('synthetic mount failure');expect(t.native.scene.indicators.get(t.record.id)).toBe(previous);expect(t.record.model).toBe(previous);t.emit(output('#123456'));expect(t.record.model.series[0].style.color).toBe('#123456');
 }finally{t.dispose();}
});
it('actual pinned core adds/removes series and changes fills, guides and tracking endpoints atomically',async()=>{
 const test=await nativeCoreHarness();try{test.emit(output());const next=output('#00ff00');next.series!.push({...next.series![0],id:'smoothing',title:'Smoothing'});next.fills=[{id:'band',paneId:'',fromSeriesId:'plot',toSeriesId:'smoothing',color:'#abcdef'}];next.priceLines=[{id:'guide',paneId:'',price:70},{id:'tracking',paneId:'',price:15}];test.emit(next);
  let actual=test.native.scene.indicators.get('actual-native');expect(actual.series.map((row:any)=>row.id)).toEqual(['plot','smoothing']);expect(actual.fills[0].color).toBe('#abcdef');expect(actual.priceLines.map((row:any)=>row.price)).toEqual([70,15]);
  test.emit({series:[],fills:[],priceLines:[]});actual=test.native.scene.indicators.get('actual-native');expect(actual.series).toEqual([]);expect(actual.fills).toEqual([]);expect(actual.priceLines).toEqual([]);
 }finally{test.dispose();}
});
it('actual native full updates preserve native ID, placement, independent manual ranges and z order',async()=>{
 const test=await nativeCoreHarness();try{test.emit(output());const scene=test.native.scene,price=scene.panes.get('price');price.manualScale={min:1,max:100};const model=scene.indicators.get('actual-native');model.ownScale=true;test.record.paneLocked=true;scene.indicatorScales.set('actual-native',{scale:{min:2,max:90},scaleTarget:{min:3,max:80},manualScale:{min:2,max:90},initialized:true});scene.seriesZ.set('actual-native',7);const prior=structuredClone(scene.indicatorScales.get('actual-native'));
  test.emit(output('#ffffff'));const actual=scene.indicators.get('actual-native');expect(actual.id).toBe('actual-native');expect(actual.paneId).toBe('price');expect(actual.ownScale).toBe(true);expect(price.manualScale).toEqual({min:1,max:100});expect(scene.indicatorScales.get('actual-native')).toEqual(prior);expect(scene.seriesZ.get('actual-native')).toBe(7);expect(actual.series[0].style.color).toBe('#ffffff');
 }finally{test.dispose();}
});
