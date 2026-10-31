// Synthetic fixtures only. Drawings on derived (non-time) chart types keep anchors in source time; only the
// renderer sees the logical axis. Real native drawing controller (store, history) with the adapter's own intent seam.
import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {createDrawing,type SerializedDrawing} from '@luxalgo/vela';
import type {Bar} from '../../src/domain/types';
import {computeDerived,type DerivedSeries} from '../../src/chart/derived';
import {buildDerivedAxis,type DerivedAxis} from '../../src/chart/derived/derived-axis';
import {createDerivedDrawingLens,createDerivedDrawingTimeMap,mapDrawingIntentTimes,DERIVED_DRAWING_REFUSED,type DerivedDrawingLens} from '../../src/chart/derived/derived-drawings';
import {nativeDrawingModule} from './drawing-native-harness';

const STEP=60,AXIS_STEP=45;// a logical step unlike the source cadence, so an unmapped anchor can never pass for a mapped one
const closes=(values:number[]):Bar[]=>values.map((close,index)=>({time:1000+index*STEP,open:close,high:close,low:close,close,volume:1}));
const series=(result:ReturnType<typeof computeDerived>):DerivedSeries=>{if(!result.ok)throw Error(result.diagnostic.code);return result.value;};
const BARS=closes([10,16.5,9.5,12,14,13,18,11]);
const renkoAxis=(bars:Bar[]=BARS)=>buildDerivedAxis(series(computeDerived('renko',bars,{boxMethod:'Traditional',boxSize:2,atrLength:14,percentage:1,source:'close',wicks:true})),AXIS_STEP);
const lineBreakAxis=(bars:Bar[]=BARS)=>buildDerivedAxis(series(computeDerived('linebreak',bars,{lines:3})),AXIS_STEP);
const nativeMs=(axis:DerivedAxis,index:number)=>axis.feed[index].time*1000;

/** The adapter's derived-drawing intent seam, extracted from src/chart/adapter.ts and run against a real native controller. */
async function harness(lens:DerivedDrawingLens){
  const loaded=await nativeDrawingModule();let intent:((value:unknown)=>void)|null=null,rendered:SerializedDrawing[]=[],ghost:unknown='unset';
  const diagnostics:{code:string}[]=[];
  // Mirrors the adapter push: the visibility projection hands store rows to the renderer through the lens.
  const rendererDrawingPort:any={setToolbar(){},showToolbar(){},setActiveTool(){},setSelection(){},onDrawingIntent(cb:(value:unknown)=>void){intent=cb;return()=>{};},syncDrawings(rows:SerializedDrawing[]){rendered=rows.map(row=>lens.toNativeRow(row));},setExternalGhost(doc:unknown){ghost=doc;}};
  const events={emit(){}};
  const controller=new loaded.module.LVActualDrawingController({capabilities:{userDrawings:true},userDrawingsPort:rendererDrawingPort},events,false);
  const source=readFileSync('src/chart/adapter.ts','utf8'),begin=source.indexOf('  // Renderer gestures (place, drag'),end=source.indexOf('  const reprojectDrawings=',begin);
  expect(begin).toBeGreaterThan(0);expect(end).toBeGreaterThan(begin);
  const chart={drawings:{ctrl:controller}},drawingProjection={refresh(){rendererDrawingPort.syncDrawings(controller.all());}};
  const run=new Function('chart','derivedDrawings','rendererDrawingPort','diagnostics','drawingProjection','DERIVED_DRAWING_REFUSED',stripTypeScriptTypes(source.slice(begin,end),{mode:'strip'}));
  run(chart,lens,rendererDrawingPort,diagnostics,drawingProjection,DERIVED_DRAWING_REFUSED);
  return {controller,diagnostics,emit:(value:unknown)=>intent!(value),rendered:()=>rendered,store:()=>controller.all() as SerializedDrawing[],ghost:()=>ghost,port:rendererDrawingPort};
}
const trend=(anchors:{time:number;price:number}[],id='draft')=>createDrawing('trendline',{id,paneId:'price',anchors,style:{lineColor:'#123456',lineWidth:2,lineStyle:'solid'}} as any)!.serialize() as SerializedDrawing;

describe('derived drawing time map',()=>{
  it('is strictly increasing, round-trips exactly and spreads bricks of one source bar toward the next source event',()=>{
    const axis=renkoAxis(),map=createDerivedDrawingTimeMap(axis,STEP)!;
    expect(axis.sourceTimes.length).toBeGreaterThan(new Set(axis.sourceTimes).size);// the fixture has several bricks on one source bar
    let previous=-Infinity;
    for(let index=-3;index<axis.feed.length+3;index+=0.25){const native=(axis.feed[0].time+index*AXIS_STEP)*1000,sourceMs=map.toSource(native);expect(sourceMs).toBeGreaterThan(previous);previous=sourceMs;expect(map.toNative(sourceMs)).toBe(native);}
    // The first brick of every run sits exactly on its source bar.
    axis.sourceTimes.forEach((time,index)=>{if(index===0||axis.sourceTimes[index-1]!==time)expect(createDerivedDrawingTimeMap(axis,STEP)!.toSource(nativeMs(axis,index))).toBe(time*1000);});
    const fresh=createDerivedDrawingTimeMap(axis,STEP)!;for(const time of axis.sourceTimes)expect(fresh.toNative(time*1000)).toBeCloseTo(nativeMs(axis,axis.sourceTimes.indexOf(time)),6);
  });
  it('refuses an axis that cannot carry a map and leaves non-geometry intents alone',()=>{
    const axis=renkoAxis();
    expect(createDerivedDrawingTimeMap({...axis,feed:[],sourceTimes:[]},STEP)).toBeNull();
    expect(createDerivedDrawingTimeMap({...axis,sourceTimes:[...axis.sourceTimes].reverse()},STEP)).toBeNull();
    expect(createDerivedDrawingTimeMap(axis,0)).toBeNull();
    const select={kind:'select',ids:['a']};expect(mapDrawingIntentTimes(select,ms=>ms+1)).toBe(select);
  });
});

describe('drawings on derived charts through the native controller',()=>{
  it('Renko: place, move, undo, save/reload keep source-time anchors and repaint on the bricks',async()=>{
    const axis=renkoAxis(),lens=createDerivedDrawingLens();lens.fed(axis,true,BARS,STEP);const chart=await harness(lens);
    const placed=[{time:nativeMs(axis,1),price:12},{time:nativeMs(axis,4),price:16}];
    chart.emit({kind:'create',doc:trend(placed)});
    const [stored]=chart.store();expect(stored.anchors.map(anchor=>anchor.time)).toEqual([lens.toSourceSeconds(axis.feed[1].time)!*1000,lens.toSourceSeconds(axis.feed[4].time)!*1000]);
    expect(stored.anchors.every(anchor=>anchor.time>=BARS[0].time*1000&&anchor.time<=(BARS.at(-1)!.time+STEP)*1000)).toBe(true);
    expect(chart.rendered()[0].anchors).toEqual(placed);// the renderer paints exactly where the pointer placed it
    // Move (drag one brick right): the renderer edit arrives in logical time and is stored in source time.
    const moved=placed.map(anchor=>({...anchor,time:anchor.time+AXIS_STEP*1000}));
    chart.emit({kind:'edit',doc:{...chart.rendered()[0],anchors:moved}});
    expect(chart.rendered()[0].anchors).toEqual(moved);expect(chart.store()[0].anchors[0].time).toBe(lens.toSourceSeconds(axis.feed[2].time)!*1000);
    chart.controller.undo();expect(chart.store()[0].anchors).toEqual(stored.anchors);expect(chart.rendered()[0].anchors).toEqual(placed);
    chart.controller.redo();expect(chart.rendered()[0].anchors).toEqual(moved);
    // Save/reload: a new chart with a freshly built axis over the same bars paints the saved drawing on the same bricks.
    const saved=JSON.parse(JSON.stringify(chart.controller.toJSON()));
    const reloadLens=createDerivedDrawingLens();reloadLens.fed(renkoAxis(BARS.map(bar=>({...bar}))),true,BARS,STEP);const reloaded=await harness(reloadLens);
    reloaded.controller.fromJSON(saved);
    expect(reloaded.store()[0].anchors).toEqual(chart.store()[0].anchors);
    reloaded.rendered()[0].anchors.forEach((anchor,index)=>{expect(anchor.time).toBeCloseTo(moved[index].time,3);expect(anchor.price).toBe(moved[index].price);});
  });
  it('Line break: place and move, then switch types: the source anchor follows its source bar on every axis',async()=>{
    const lineBreak=lineBreakAxis(),lens=createDerivedDrawingLens();lens.fed(lineBreak,true,BARS,STEP);const chart=await harness(lens);
    const index=lineBreak.feed.length-1,placed=[{time:nativeMs(lineBreak,0),price:10},{time:nativeMs(lineBreak,index),price:14}];
    chart.emit({kind:'create',doc:trend(placed)});
    expect(chart.store()[0].anchors.map(anchor=>anchor.time)).toEqual([lineBreak.sourceTimes[0]*1000,lineBreak.sourceTimes[index]*1000]);
    expect(chart.rendered()[0].anchors).toEqual(placed);
    chart.emit({kind:'edit-many',docs:[{...chart.rendered()[0],anchors:[placed[0],{...placed[1],price:15}]}]});
    expect(chart.store()[0].anchors[1]).toMatchObject({time:lineBreak.sourceTimes[index]*1000,price:15});
    const sourceTimes=chart.store()[0].anchors.map(anchor=>anchor.time);
    // Switch to Renko: same store rows, re-projected onto the brick that carries each source bar.
    const renko=renkoAxis();lens.fed(renko,true,BARS,STEP);chart.port.syncDrawings(chart.controller.all());
    chart.rendered()[0].anchors.forEach((anchor,position)=>{const brick=renko.sourceTimes.indexOf(sourceTimes[position]/1000);if(brick>=0)expect(anchor.time).toBeCloseTo(nativeMs(renko,brick),3);});
    expect(chart.store()[0].anchors.map(anchor=>anchor.time)).toEqual(sourceTimes);
    // Switch to a time axis (Candles): the renderer gets the source times themselves.
    lens.fed(null,false,BARS,STEP);chart.port.syncDrawings(chart.controller.all());
    expect(chart.rendered()[0].anchors.map(anchor=>anchor.time)).toEqual(sourceTimes);
    // A pointer edit on the time axis is stored unchanged, and back on Line break it lands on its display bar again.
    lens.fed(lineBreak,true,BARS,STEP);chart.port.syncDrawings(chart.controller.all());
    chart.rendered()[0].anchors.forEach((anchor,position)=>expect(anchor.time).toBeCloseTo([placed[0].time,placed[1].time][position],3));
  });
  it('a derived feed without bars refuses geometry intents and keeps the store, the ghost and selection safe',async()=>{
    const lens=createDerivedDrawingLens();lens.fed(null,true,BARS,STEP);const chart=await harness(lens);
    chart.emit({kind:'create',doc:trend([{time:1000,price:1},{time:2000,price:2}])});
    expect(chart.store()).toEqual([]);expect(chart.diagnostics.map(row=>row.code)).toContain('DERIVED_DRAWING_REFUSED');
    expect(lens.toNativeSeconds(1)).toBeNull();
    chart.port.setExternalGhost(trend([{time:1000,price:1},{time:2000,price:2}]));expect(chart.ghost()).toBeNull();
    expect(()=>chart.emit({kind:'select',ids:[]})).not.toThrow();
  });
});

describe('adapter wiring (source order)',()=>{
  it('records the fed topology after setMarket and before re-projecting, and every renderer push goes through the lens',()=>{
    const source=readFileSync('src/chart/adapter.ts','utf8'),apply=source.indexOf('await chart.setMarket({data:fed});'),fed=source.indexOf('derivedDrawings.fed(fedAxis,fedDerived,next,',apply),reproject=source.indexOf('reprojectDrawings();',apply);
    expect(apply).toBeGreaterThan(0);expect(fed).toBeGreaterThan(apply);expect(reproject).toBeGreaterThan(fed);
    expect(source).toContain("originalDrawingSync.call(rendererDrawingPort,(typeof derivedDrawings!=='undefined'?rows.map(row=>derivedDrawings.toNativeRow(row)):rows)");
    expect(source.match(/dwb3ShapePayload\(document\.all\(\)\.map\(row=>derivedDrawings\.toNativeRow\(row\)\)/g)?.length).toBe(2);
    expect(source).toContain("const sourceTime=typeof derivedDrawings!=='undefined'?derivedDrawings.toSourceSeconds(point.time):point.time;");
  });
});
