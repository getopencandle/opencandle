import {expect,it,vi} from 'vitest';
import {annotationNativeHarness,annotationRecord} from '../chart/trendline-annotation-native-harness';
import {statsPainterHarness,statsRecord} from '../chart/trendline-stats-painter-harness';
import {installTrendlineAnnotation,registerOwnedTrendlineStatistics} from '../../src/chart/trendline-annotation';
import {installOwnedTrendlineInlineGeometry} from '../../src/chart/trendline-inline-geometry';
import {captureNativeInlineLayoutOwner} from '../../src/chart/native-inline-layout-owner';
import {captureTrendlineStatisticsNativeOwner} from '../../src/chart/trendline-stats-owner';
import type {Vela} from '@luxalgo/vela';

const statsGlyphs=(commands:any[])=>commands.filter(command=>command.op==='fillText'&&/^(Price|Change|Bars|Time):/.test(command.values[0]));
it('a returned statistics pass is disposed when its acquisition callback retires the native frame',async()=>{
 const f=await annotationNativeHarness(),annotation=installTrendlineAnnotation(f.renderer,f.chart as unknown as Vela,f.host),dispose=vi.fn();f.sync([annotationRecord(false)]);
 const registration=registerOwnedTrendlineStatistics(f.renderer,{begin(){f.retire();return{paint(){},dispose};}});
 try{expect(()=>f.render()).toThrow(/retired/);expect(dispose).toHaveBeenCalledTimes(1);}
 finally{registration.dispose();annotation.dispose();f.dispose();}
});
it('canonical retirement inside actual text measurement prevents all following derived glyphs',async()=>{
 const f=await statsPainterHarness();try{f.top.commands.length=0;
  let once=false;const measure=f.top.ctx.measureText;
  f.top.ctx.measureText=(text:string)=>{if(!once){once=true;f.canonical([statsRecord()]);}return measure(text);};
  f.render();expect(once).toBe(true);expect(statsGlyphs(f.top.commands)).toEqual([]);expect(f.notices).toEqual([]);
 }finally{f.cleanup();}
});
it('native layout retirement inside measurement prevents derived glyphs without replacement reporting',async()=>{
 const f=await statsPainterHarness();try{f.top.commands.length=0;
  let once=false;const measure=f.top.ctx.measureText;
  f.top.ctx.measureText=(text:string)=>{if(!once){once=true;f.coords.setViewport({barSpacing:90,rightOffset:0});}return measure(text);};
  f.render();expect(once).toBe(true);expect(statsGlyphs(f.top.commands)).toEqual([]);
 }finally{f.cleanup();}
});
it('price-only cached passes do not read the time grid and native source retirement prevents stale glyphs',async()=>{
 const f=await statsPainterHarness();try{f.top.commands.length=0;
  f.render();expect(statsGlyphs(f.top.commands)).toHaveLength(1);const first=f.counts();
  f.top.commands.length=0;f.render();expect(statsGlyphs(f.top.commands)).toHaveLength(1);expect(f.counts()).toEqual(first);expect(first.gridReads).toBe(0);
  f.top.commands.length=0;let once=false;const measure=f.top.ctx.measureText;
  f.top.ctx.measureText=(text:string)=>{if(!once){once=true;f.retireSource();}return measure(text);};
  expect(()=>f.render()).toThrow(/retired/);expect(statsGlyphs(f.top.commands)).toEqual([]);
 }finally{f.cleanup();}
});

it('the actual price-only paint path does not enter inactive percent or timestamp formatting',async()=>{
 const f=await statsPainterHarness();const data=vi.spyOn(globalThis,'DataView').mockImplementation(()=>{throw Error('SYNTHETIC inactive exact-percentage work');}),intl=vi.spyOn(Intl,'DateTimeFormat').mockImplementation(()=>{throw Error('SYNTHETIC inactive timestamp work');});
 try{f.top.commands.length=0;f.render();expect(statsGlyphs(f.top.commands).map(command=>command.values[0])).toEqual(['Price: +100.00']);expect(data).not.toHaveBeenCalled();expect(intl).not.toHaveBeenCalled();expect(f.counts().gridReads).toBe(0);}
 finally{data.mockRestore();intl.mockRestore();f.cleanup();}
});

it('canonical Stats member removal erases cached slices through the actual native scheduling path',async()=>{
 const row=statsRecord(),f=await statsPainterHarness([row]);try{
  f.setBoundary([10]);f.core.controller.updateMany([{id:row.id,patch:row}]);expect(f.drain()).toBeGreaterThan(0);
  expect(f.composites.at(-1)?.some(value=>value.startsWith('Price:'))).toBe(false);f.top.commands.length=0;f.render();expect(statsGlyphs(f.top.commands).length).toBeGreaterThan(0);
  const removed=structuredClone(row);delete removed.props!.lvTrendlineStats;
  f.canonical([removed]);f.core.controller.updateMany([{id:row.id,patch:removed}]);expect(f.drain()).toBeGreaterThan(0);
  expect(f.composites.at(-1)?.some(value=>value.startsWith('Price:'))).toBe(false);f.top.commands.length=0;f.render();expect(statsGlyphs(f.top.commands)).toEqual([]);expect(f.controller.drawings[0].text.value).toBe(row.text!.value);
 }finally{f.cleanup();}
});
it('native inline geometry probes contain only annotation text while Stats remains a separate paint',async()=>{
 const row=statsRecord();(row.text as any).lvAnnotation={schemaVersion:1,enabled:true};const f=await statsPainterHarness([row]);let geometry:ReturnType<typeof installOwnedTrendlineInlineGeometry>|undefined;
 try{
  Object.assign(f.top.ctx,{direction:'ltr',fontKerning:'auto',fontStretch:'normal',fontVariantCaps:'normal',textRendering:'auto',letterSpacing:'0px',wordSpacing:'0px'});
  const measured:string[]=[],ctx:any={canvas:{synthetic:true},font:'14px sans-serif',direction:'ltr',fontKerning:'auto',fontStretch:'normal',fontVariantCaps:'normal',textRendering:'auto',letterSpacing:'0px',wordSpacing:'0px',measureText(value:string){measured.push(value);return{width:value.length*7,actualBoundingBoxLeft:0,actualBoundingBoxRight:value.length*7,actualBoundingBoxAscent:-2,actualBoundingBoxDescent:12};}};
  geometry=installOwnedTrendlineInlineGeometry(f.renderer,{createMeasurementContext:()=>ctx,captureLayoutOwner:pane=>captureNativeInlineLayoutOwner(f.renderer,pane,f.host.captureOwner()),captureDrawingOwner(id,projected){const canonical=f.document.all().find(value=>value.id===id)!;return captureTrendlineStatisticsNativeOwner({ctrl:f.core.controller},canonical as any,projected,f.document.captureReadOnlyOwner(),f.host.captureOwner());}});
  const before=f.counts();const target=geometry.targets()[0];expect(target.unavailable).toBeUndefined();expect(target.geometry!.lines.map(line=>line.text)).toEqual(['SYNTHETIC alpha','retained']);expect(measured.some(value=>/^(Price|Change|Bars|Time):/.test(value))).toBe(false);expect(f.counts()).toEqual({...before,allCalls:before.allCalls+1});
  f.top.commands.length=0;f.render();expect(statsGlyphs(f.top.commands)).toHaveLength(1);
 }finally{geometry?.dispose();f.cleanup();}
});

it('Stats unwinds its canvas frame with the retained cleanup method instead of a measurement replacement',async()=>{
 const f=await statsPainterHarness();try{
  f.top.commands.length=0;const original=f.top.ctx.restore,measure=f.top.ctx.measureText;let replacements=0;
  f.top.ctx.measureText=(value:string)=>{f.top.ctx.restore=()=>{if(f.top.ctx.font==='12px sans-serif')replacements++;return original();};return measure(value);};
  f.render();expect(statsGlyphs(f.top.commands)).toHaveLength(1);expect(replacements).toBe(0);expect(f.top.ctx.restore).toBe(original);
 }finally{f.cleanup();}
});

it('selected interleaved overlays obey the actual native timeframe and zero-height pane gates',async()=>{
 const row=statsRecord({priceRange:true,alwaysShow:false});row.showOn=['D'];const f=await statsPainterHarness([row]);try{
  let barMs=60000;f.controller.deps.chartBarMs=()=>barMs;f.setBoundary([10]);f.withDocument(()=>f.controller.prepareSlices(['price']));f.controller.selectedIds=new Set([row.id]);
  f.top.commands.length=0;f.render();expect(statsGlyphs(f.top.commands)).toEqual([]);expect(f.counts().bindCalls).toBe(0);
  barMs=86400000;f.top.commands.length=0;f.render();expect(statsGlyphs(f.top.commands)).toHaveLength(1);
  f.pane.bounds.height=0;f.top.commands.length=0;f.render();expect(statsGlyphs(f.top.commands)).toEqual([]);
 }finally{f.cleanup();}
});

it('Stats frame diagnostics are withheld after their exact source is retired',async()=>{
 const f=await annotationNativeHarness(),annotation=installTrendlineAnnotation(f.renderer,f.chart as unknown as Vela,f.host);f.sync([annotationRecord(false)]);
 const registration=registerOwnedTrendlineStatistics(f.renderer,{begin(){throw Error('SYNTHETIC old-source Stats frame error');}});
 try{f.render();expect(annotation.diagnostics().filter(row=>row.code==='TRENDLINE_STATS_UNAVAILABLE')).toHaveLength(1);f.retire();expect(annotation.diagnostics().filter(row=>row.code==='TRENDLINE_STATS_UNAVAILABLE')).toEqual([]);}
 finally{registration.dispose();annotation.dispose();f.dispose();}
});
