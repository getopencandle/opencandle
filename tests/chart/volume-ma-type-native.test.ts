import {expect,it} from 'vitest';
import {indicatorDisplayHarness} from './indicator-display-harness';
import {nativeCoreHarness} from './native-core-harness';
import {createIndicatorPort,defaultPlotStyle} from '../../src/chart/indicator-port';
import {defaultIndicatorPresentation} from '../../src/chart/indicator-settings';
import {acquireIndicatorDisplayPort} from '../../src/chart/indicator-display-source';
import type {Bar} from '../../src/domain/types';

const rows=[3,9,6,12].map((volume,index)=>({time:1700000000000+index*60000,open:10,high:12,low:9,close:11,volume}));
const expected={SMA:[null,null,6,9],EMA:[3,6,6,9],WMA:[null,null,6.5,9.5]};

it('actual full models and indexed MA readouts follow type while Volume colors and the latest MA remain independent',async()=>{
 const t=await indicatorDisplayHarness();try{
  t.core.bars=rows;t.native.bars=rows;t.native.scene.bars=rows;t.coords.barCount=4;
  const id=t.port.add('volume',{length:3}),rendererId=t.port.list()[0].rendererId;
  expect(t.port.list()[0].inputs).toEqual({length:3});
  t.port.update(id,{presentation:{...defaultIndicatorPresentation('volume'),precision:2,volumePalette:{schemaVersion:1,mode:'previous-close',upColor:'#00ff00',downColor:'#ff0000'}},plots:{ma:{...defaultPlotStyle('volume','ma',1),visible:true,trackPrice:true}}});
  const originalVolume=structuredClone(t.native.scene.indicators.get(rendererId).series[0].points);
  for(const maType of ['SMA','EMA','WMA'] as const){
   t.port.update(id,{inputs:{maType}});const model=t.native.scene.indicators.get(rendererId),pane=t.native.scene.panes.get(model.paneId);Object.assign(pane,{bounds:{top:0,height:300},scale:{min:0,max:15},axisFormat:'volume'});
   expect(model.series.find((series:any)=>series.title==='Volume MA').points.map((point:any)=>point.value)).toEqual(expected[maType]);expect(model.series[0].points).toEqual(originalVolume);
   for(let index=0;index<4;index++)for(const surface of ['legend','dataWindow']){
    const ma=t.native.readoutRowsFor(model,index,t.pane,surface).find((row:any)=>row.label==='Volume MA'),value=expected[maType][index];if(value===null)expect(ma).toBeUndefined();else expect(ma.value).toBe(value.toFixed(2));
   }
   const value=expected[maType][3];expect(acquireIndicatorDisplayPort(t.port,t.chart).read()[0].plots.find(plot=>plot.id==='ma')?.value).toBe(value);expect(model.priceLines.find((line:any)=>line.title?.startsWith('Volume MA:')).price).toBe(value);
  }
  t.port.update(id,{offset:1});const shifted=t.native.scene.indicators.get(rendererId);expect(t.native.readoutRowsFor(shifted,3,t.pane,'legend').find((row:any)=>row.label==='Volume MA').value).toBe('6.50');expect(shifted.priceLines.find((line:any)=>line.title?.startsWith('Volume MA:')).price).toBe(9.5);
 }finally{t.dispose();}
});

it('actual rejected native type update restores omitted SMA and does not leak the failed type into the next edit',async()=>{
 const t=await nativeCoreHarness(),port=createIndicatorPort(t.chart,undefined,undefined,undefined,t.bridge.claim,()=>({resolution:'1m'}));try{
  t.core.bars=rows;const id=port.add('volume',{length:3}),rendererId=port.list()[0].rendererId,saved=port.serialize(),accepted=structuredClone(t.native.scene.indicators.get(rendererId).series),display=acquireIndicatorDisplayPort(port,t.chart),oldDisplay=structuredClone(display.read()[0].plots),mount=t.renderer.mountIndicator.bind(t.renderer);let fail=true;
  t.renderer.mountIndicator=next=>{const handle=mount(next);if(fail){fail=false;throw Error('literal MA type native rejection');}return handle;};
  expect(()=>port.update(id,{inputs:{maType:'WMA'}})).toThrow();expect(port.serialize()).toEqual(saved);expect(t.native.scene.indicators.get(rendererId).series).toEqual(accepted);expect(display.read()[0].plots).toEqual(oldDisplay);
  expect(t.records.get(rendererId).inputValues).toEqual({length:3});
  port.update(id,{inputs:{length:2}});expect(port.list()[0].inputs).toEqual({length:2});expect(port.values(id).series.find(plot=>plot.id==='ma')?.values).toEqual([null,6,7.5,9]);
 }finally{port.dispose();t.dispose();}
});

it('actual source replacement and restore retain separate MA choices and omission for untouched instances',async()=>{
 const t=await nativeCoreHarness(),port=createIndicatorPort(t.chart,undefined,undefined,undefined,t.bridge.claim,()=>({resolution:'1m'}));try{
  t.core.bars=rows;const first=port.add('volume',{length:3}),second=port.add('volume',{length:3,maType:'WMA'}),secondNative=port.list().find(row=>row.id===second)!.rendererId;
  const originalSecond=structuredClone(t.native.scene.indicators.get(secondNative).series);port.update(first,{inputs:{length:2}});expect(port.list().find(row=>row.id===first)!.inputs).toEqual({length:2});expect(t.native.scene.indicators.get(secondNative).series).toEqual(originalSecond);
  const saved=port.serialize();port.restore(JSON.parse(JSON.stringify(saved)));expect(port.serialize()).toEqual(saved);
  const prefix=rows.slice(0,3);t.core.bars=prefix;for(const instance of t.instances.values())instance.onBars();expect(port.values(first).series[1].values).toEqual([null,6,7.5]);expect(port.values(second).series[1].values).toEqual([null,null,6.5]);
  port.remove(first);expect(port.list().map(row=>row.id)).toEqual([second]);expect(port.list()[0].inputs).toEqual({length:3,maType:'WMA'});expect(port.values(second).series[1].values).toEqual([null,null,6.5]);
 }finally{port.dispose();t.dispose();}
});

it('actual port quota rejects WMA before touching rows or native models, even when the MA is hidden',async()=>{
 const t=await nativeCoreHarness();let input:readonly Bar[]=rows.map(row=>({...row,time:row.time/1000}));const port=createIndicatorPort(t.chart,undefined,undefined,()=>input,t.bridge.claim,()=>({resolution:'1m'}));try{
  t.core.bars=rows;const id=port.add('volume',{length:1000});port.update(id,{plots:{ma:{...defaultPlotStyle('volume','ma',1),visible:false}}});const saved=port.serialize(),nativeCount=t.native.scene.indicators.size;let reads=0;
  const forbidden=Array<Bar>(20348);Object.defineProperty(forbidden,'0',{get(){reads++;throw Error('Unadmitted source read');}});input=forbidden;
  expect(()=>port.update(id,{inputs:{maType:'WMA'}})).toThrow(/batch exceeds/);expect(reads).toBe(0);expect(port.serialize()).toEqual(saved);expect(t.native.scene.indicators.size).toBe(nativeCount);
 }finally{port.dispose();t.dispose();}
});
