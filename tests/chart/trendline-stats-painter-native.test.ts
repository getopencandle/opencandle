import {expect,it} from 'vitest';
import {deserializeDrawing,type Vela} from '@luxalgo/vela';
import {annotationNativeHarness,annotationRecord} from './trendline-annotation-native-harness';
import {installTrendlineAnnotation,registerOwnedTrendlineStatistics} from '../../src/chart/trendline-annotation';
import {statsPainterHarness,statsRecord} from './trendline-stats-painter-harness';

const statsText=(commands:any[])=>commands.filter(command=>command.op==='fillText'&&/^(Price|Change|Bars|Time):/.test(command.values[0])).map(command=>command.values[0]);

it('first actual native sync paints requested independent metrics with literal values and separate retained annotation output',async()=>{
 const row=statsRecord({priceRange:true,percentChange:true,barsRange:true,dateTimeRange:true,alwaysShow:true}),f=await statsPainterHarness([row]);try{
  expect(statsText(f.top.commands).slice(0,3)).toEqual(['Price: +100.00','Change: +100.00%','Bars: 2']);expect(statsText(f.top.commands)[3]).toBe('Time: 4m');expect(f.counts()).toEqual({allCalls:1,bindCalls:1,gridReads:1});expect(f.notices).toEqual([]);
  const before=f.counts();f.top.commands.length=0;f.render();f.render();expect(f.counts()).toEqual(before);expect(statsText(f.top.commands)).toHaveLength(8);expect(f.core.controller.store.get(row.id).text.value).toBe(row.text!.value);
 }finally{f.cleanup();}
});

it('source wrappers do not invalidate cached price/date metrics and inactive bars performs no grid read',async()=>{
 const f=await statsPainterHarness([statsRecord({priceRange:true,dateTimeRange:true,alwaysShow:true})]);try{const counts=f.counts();expect(counts.gridReads).toBe(0);f.render();f.coords.setViewport({...f.coords.getViewport(),rightOffset:1});f.render();expect(f.counts()).toEqual(counts);expect(f.notices).toEqual([]);}finally{f.cleanup();}
});

it('selected-only top labels follow exact selection while legacy/all-off produce no native binding or grid work',async()=>{
 const selected=statsRecord({priceRange:true,alwaysShow:false}),legacy={...statsRecord(),id:'SYNTHETIC legacy'};delete legacy.props!.lvTrendlineStats;const off={...statsRecord({priceRange:false}),id:'SYNTHETIC off'},f=await statsPainterHarness([selected,legacy,off]);try{expect(statsText(f.top.commands)).toEqual([]);expect(f.counts().bindCalls).toBe(0);f.controller.selectedIds=new Set([selected.id]);f.top.commands.length=0;f.render();expect(statsText(f.top.commands)).toEqual(['Price: +100.00']);f.controller.selectedIds=new Set();f.top.commands.length=0;f.render();expect(statsText(f.top.commands)).toEqual([]);expect(f.counts().gridReads).toBe(0);}finally{f.cleanup();}
});

it('interleaved always-show stats paint on the top canvas (CLEANUP-1028), never in a slice, and selected-only overlays follow native selection and selected-only overlays follow native selection',async()=>{
 const row=statsRecord({priceRange:true,alwaysShow:true}),f=await statsPainterHarness([row]);try{
  f.setBoundary([10]);f.drain();expect(f.composites.at(-1)).toEqual([]);f.top.commands.length=0;f.render();expect(statsText(f.top.commands)).toEqual(['Price: +100.00']);const next=statsRecord({priceRange:true,alwaysShow:false});f.canonical([next]);
  const before=f.composites.length;f.core.controller.updateMany([{id:row.id,patch:next}]);expect(f.callbacks.length).toBeGreaterThan(0);f.drain();expect(f.composites.length).toBeGreaterThan(before);expect(f.composites.at(-1)).toEqual([]);
  f.controller.selectedIds=new Set([row.id]);f.top.commands.length=0;f.render();expect(statsText(f.top.commands)).toEqual(['Price: +100.00']);f.controller.selectedIds=new Set();f.top.commands.length=0;f.render();expect(statsText(f.top.commands)).toEqual([]);
  const allOff=statsRecord({priceRange:false,alwaysShow:true});f.canonical([allOff]);f.core.controller.updateMany([{id:row.id,patch:allOff}]);f.drain();expect(f.composites.at(-1)).toEqual([]);f.top.commands.length=0;f.render();expect(statsText(f.top.commands)).toEqual([]);
 }finally{f.cleanup();}
});

it('hidden, timeframe-filtered and removed-pane selected interleaved targets do not receive a derived overlay',async()=>{
 const row=statsRecord({alwaysShow:false}),f=await statsPainterHarness([row]);try{f.setBoundary([10]);f.controller.selectedIds=new Set([row.id]);f.controller.drawings[0].visible=false;f.top.commands.length=0;f.render();expect(statsText(f.top.commands)).toEqual([]);f.controller.drawings[0].visible=true;f.renderer.scene.panes.delete('price');f.top.commands.length=0;f.render();expect(statsText(f.top.commands)).toEqual([]);}finally{f.cleanup();}
});

it('copied-ID placement and external ghosts never borrow committed statistics',async()=>{
 const row=statsRecord(),f=await statsPainterHarness([row]);try{f.top.commands.length=0;f.controller.externalGhost=deserializeDrawing(row);f.render();expect(statsText(f.top.commands)).toEqual(['Price: +100.00']);f.top.commands.length=0;f.controller.externalGhost=null;f.interaction.state={kind:'placing',draft:deserializeDrawing(row),cursor:row.anchors[1]};f.render();expect(statsText(f.top.commands)).toEqual(['Price: +100.00']);}finally{f.cleanup();}
});

it('post-save source retirement attempts owned cleanup and produces no old statistics glyphs',async()=>{
 const row=statsRecord();row.style.arrowLeft=false;row.style.arrowRight=false;const f=await statsPainterHarness([row]);try{let saves=0,restores=0,armed=true;const save=f.top.ctx.save,restore=f.top.ctx.restore;f.top.ctx.save=()=>{save();saves++;if(armed&&saves===3){armed=false;f.retireSource();}};f.top.ctx.restore=()=>{restores++;restore();};f.top.commands.length=0;expect(()=>f.render()).toThrow();expect(saves).toBe(restores);expect(statsText(f.top.commands)).toEqual([]);}finally{f.cleanup();}
});

it('an exception after statistics save pushes a frame still attempts its owned cleanup',async()=>{
 const row=statsRecord();row.style.arrowLeft=false;row.style.arrowRight=false;const f=await statsPainterHarness([row]);try{let saves=0,restores=0;const save=f.top.ctx.save,restore=f.top.ctx.restore;f.top.ctx.save=()=>{save();if(++saves===3)throw Error('SYNTHETIC late save failure');};f.top.ctx.restore=()=>{restores++;restore();};f.top.commands.length=0;f.render();expect(saves).toBe(restores);expect(statsText(f.top.commands)).toEqual([]);expect(f.notices.join(' ')).toContain('late save failure');}finally{f.cleanup();}
});

it('canonical replacement during diagnostic conversion cannot publish a stale candidate-owner diagnostic',async()=>{
 const f=await statsPainterHarness();try{f.document.all=()=>{throw{toString(){f.canonical([]);return'SYNTHETIC obsolete stats diagnostic';}};};f.stats.invalidate();f.render();expect(f.notices).toEqual([]);expect(f.stats.diagnostics()).toEqual([]);}finally{f.cleanup();}
});

it('statistics error conversion cannot write a frame diagnostic after it retires the source',async()=>{const f=await annotationNativeHarness(),annotation=installTrendlineAnnotation(f.renderer,f.chart as unknown as Vela,f.host);f.sync([annotationRecord(false)]);const registration=registerOwnedTrendlineStatistics(f.renderer,{begin(){throw{toString(){f.retire();return'SYNTHETIC retired frame stats diagnostic';}};}});try{expect(()=>f.render()).toThrow();expect(annotation.diagnostics().filter(row=>row.code==='TRENDLINE_STATS_UNAVAILABLE')).toEqual([]);}finally{registration.dispose();annotation.dispose();f.dispose();}});
