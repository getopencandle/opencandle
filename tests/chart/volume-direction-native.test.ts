import {expect,it} from 'vitest';
import {indicatorDisplayHarness} from './indicator-display-harness';
import {nativeCoreHarness} from './native-core-harness';
import {createIndicatorPort,defaultPlotStyle} from '../../src/chart/indicator-port';
import {defaultIndicatorPresentation,type IndicatorVolumePalette} from '../../src/chart/indicator-settings';
import {acquireIndicatorDisplayPort} from '../../src/chart/indicator-display-source';
import {heikinAshiBars} from '../../src/chart/calculation-bars';

const opens=[10,12,9,14],closes=[11,11,10,12],volumes=[100,0,300,200];
const rows=closes.map((close,i)=>({time:1700000000000+i*60000,open:opens[i],high:Math.max(opens[i],close)+1,low:Math.min(opens[i],close)-1,close,volume:volumes[i]}));
const palette=(mode:IndicatorVolumePalette['mode']='previous-close'):IndicatorVolumePalette=>({schemaVersion:1,mode,upColor:'rgba(0,255,0,.5)',downColor:'#ff000080'});
const presentation=(mode:IndicatorVolumePalette['mode']='previous-close')=>({...defaultIndicatorPresentation('volume'),volumePalette:palette(mode)});
const up='rgba(0,255,0,0.25)',down='rgba(255,0,0,0.25098039215686274)';

it('actual pinned full-model, Canvas columns, indexed readouts and owned endpoint strokes share exact direction colors',async()=>{
 const t=await indicatorDisplayHarness();try{
  t.core.bars=rows;t.native.bars=rows;t.native.scene.bars=rows;t.coords.barCount=4;
  const id=t.port.add('volume',{length:2}),rendererId=t.port.list()[0].rendererId,plots={volume:{...defaultPlotStyle('volume','volume',0),opacity:50,trackPrice:true}};
  const numeric=t.port.values(id).series;
  for(const [mode,colors]of [['open-close',[up,down,up,down]],['previous-close',[up,up,down,up]]] as const){
   t.port.update(id,{plots,presentation:presentation(mode)});const model=t.native.scene.indicators.get(rendererId),pane=t.native.scene.panes.get(model.paneId);Object.assign(pane,{bounds:{top:0,height:300},scale:{min:0,max:400},axisFormat:'volume'});
   t.recording.commands.length=0;t.native.backend.drawHistogram(t.recording.ctx,model.series[0],pane,t.coords,0,3);
   const painted=t.recording.commands.filter(command=>command.op==='fillRect');expect(painted.map(command=>command.color)).toEqual(colors);expect(painted[1].values[3]).toBe(1); // Zero volume still paints the native one-pixel baseline.
   for(let index=0;index<4;index++){expect(t.native.readoutRowsFor(model,index,t.pane,'legend').find((row:any)=>row.label==='Volume').color).toBe(colors[index]);expect(t.native.readoutRowsFor(model,index,t.pane,'dataWindow').find((row:any)=>row.label==='Volume').color).toBe(colors[index]);}
   expect(model.priceLines.find((line:any)=>line.title?.startsWith('Volume:'))).toMatchObject({price:200,color:colors[3]});t.paint();expect(t.display.diagnostics()).toEqual([]);expect(t.recording.commands.filter(command=>command.op==='strokeRect').map(command=>command.color)).toContain(colors[3]);
   expect(t.port.values(id).series).toEqual(numeric);
  }
  t.port.update(id,{offset:1});let model=t.native.scene.indicators.get(rendererId);expect(t.native.readoutRowsFor(model,0,t.pane,'legend')).toEqual([]);expect(t.native.readoutRowsFor(model,3,t.pane,'legend').find((row:any)=>row.label==='Volume').color).toBe(down);expect(model.priceLines[0].color).toBe(up);
  t.port.update(id,{plots:{ma:{...defaultPlotStyle('volume','ma',1),visible:false}}});model=t.native.scene.indicators.get(rendererId);expect(model.series[1].visible).toBe(false);expect(t.port.values(id).series[1].values).toEqual([null,50,150,250]);
 }finally{t.dispose();}
});

it('actual onBars captures one source prefix for transformed numerics and palette, and clears a missing latest direction',async()=>{
 const t=await nativeCoreHarness();let transformations=0;const port=createIndicatorPort(t.chart,undefined,bars=>{transformations++;return heikinAshiBars(bars);},undefined,t.bridge.claim,()=>({resolution:'1m'}));
 try{
  t.core.bars=rows;const id=port.add('volume',{length:2}),rendererId=port.list()[0].rendererId;port.update(id,{plots:{volume:{...defaultPlotStyle('volume','volume',0),trackPrice:true},ma:{...defaultPlotStyle('volume','ma',1),visible:true}},presentation:{...presentation('open-close'),volumePalette:{...palette('open-close'),upColor:'#00ff00',downColor:'#ff0000'}}});
  const instance=t.instances.get(rendererId),input=rows.map(row=>({...row}));let reads=0;transformations=0;t.core.bars=input;instance.ctx.bars=()=>{reads++;if(reads>1)throw Error('Second source read during one calculation');return input;};instance.onBars();expect(reads).toBe(1);expect(transformations).toBe(1);expect(t.native.scene.indicators.get(rendererId).series[0].points.map((point:any)=>point.color)).toEqual(['#00ff00','#00ff00','#ff0000','#00ff00']);
  // A replacement prefix is captured once; no earlier direction or source is borrowed.
  const replacement=input.map(row=>({...row}));replacement[3].close=NaN;t.core.bars=replacement;reads=0;instance.ctx.bars=()=>{reads++;return replacement;};instance.onBars();expect(reads).toBe(1);
  const model=t.native.scene.indicators.get(rendererId),display=acquireIndicatorDisplayPort(port,t.chart).read()[0];expect(model.series[0].points[3].value).toBeNull();expect(model.priceLines).toEqual([]);expect(display.plots.map(row=>row.id)).toEqual(['ma']);expect(port.values(id).series[1].values.at(-1)).toBe(250);expect(port.list()[0].presentationDiagnostics.join(' ')).toContain('required current');
 }finally{port.dispose();t.dispose();}
});

it('actual native failure restores accepted palette/model/display and invalid area fails before native mutation',async()=>{
 const t=await nativeCoreHarness(),port=createIndicatorPort(t.chart,undefined,undefined,undefined,t.bridge.claim,()=>({resolution:'1m'}));
 try{
  t.core.bars=rows;const id=port.add('volume',{length:2}),rendererId=port.list()[0].rendererId;port.update(id,{presentation:presentation('open-close')});const saved=port.serialize(),accepted=structuredClone(t.native.scene.indicators.get(rendererId).series),display=acquireIndicatorDisplayPort(port,t.chart),oldDisplay=structuredClone(display.read()[0].plots),mount=t.renderer.mountIndicator.bind(t.renderer);let attempts=0,fail=true;
  t.renderer.mountIndicator=next=>{attempts++;const handle=mount(next);if(fail){fail=false;throw Error('literal Volume native rejection');}return handle;};
  expect(()=>port.update(id,{presentation:presentation('previous-close')})).toThrow();expect(attempts).toBeGreaterThan(1);expect(port.serialize()).toEqual(saved);expect(t.native.scene.indicators.get(rendererId).series).toEqual(accepted);expect(display.read()[0].plots).toEqual(oldDisplay);
  attempts=0;expect(()=>port.update(id,{plots:{volume:{...defaultPlotStyle('volume','volume',0),kind:'area'}}})).toThrow(/area plots/);expect(attempts).toBe(0);expect(port.serialize()).toEqual(saved);
  port.update(id,{presentation:presentation('previous-close')});expect(t.native.scene.indicators.get(rendererId).series[0].points[3].color).toBe('rgba(0,255,0,.5)');
 }finally{port.dispose();t.dispose();}
});

it('actual Volume add, MA-length edit and removal preserve the other instance and its native ownership',async()=>{
 const t=await nativeCoreHarness(),port=createIndicatorPort(t.chart,undefined,undefined,undefined,t.bridge.claim,()=>({resolution:'1m'}));
 try{
  t.core.bars=rows;const first=port.add('volume',{length:2}),second=port.add('volume',{length:3}),firstNative=port.list().find(row=>row.id===first)!.rendererId,secondNative=port.list().find(row=>row.id===second)!.rendererId;
  expect(firstNative).not.toBe(secondNative);expect(port.values(first).series[1].values).toEqual([null,50,150,250]);expect(port.values(second).series[1].values).toEqual([null,null,400/3,500/3]);
  const output=()=>{const model=t.native.scene.indicators.get(secondNative);return {series:model.series,priceLines:model.priceLines,fills:model.fills,paneId:model.paneId};},unchanged=structuredClone(output());port.update(first,{inputs:{length:1},presentation:presentation()});expect(port.values(first).series[1].values).toEqual([100,0,300,200]);expect(output()).toEqual(unchanged);
  port.remove(first);expect(port.list().map(row=>row.id)).toEqual([second]);expect(t.native.scene.indicators.has(firstNative)).toBe(false);expect(output()).toEqual(unchanged);expect(acquireIndicatorDisplayPort(port,t.chart).read().map(row=>row.id)).toEqual([second]);
 }finally{port.dispose();t.dispose();}
});
