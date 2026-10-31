import {describe,expect,it} from 'vitest';
import {createDrawing,deserializeDrawing} from '@luxalgo/vela';
import {installAppearancePainters} from '../../src/chart/appearance-painters';
import {installTimeAxisTicks} from '../../src/chart/time-axis-ticks';
import {drawingAxisLabels,drawingTimeAxisLabels} from '../../src/chart/axis-labels';
import {dwb3ShapePayload} from '../../src/chart/dwb3-shape-layer';
import {axisLineFlag,readAxisLine,AXIS_LINE_FIELD} from '../../src/chart/lv-types/axis-line-settings';
import {lvDrawingTypeStatus} from '../../src/chart/lv-drawing-types';
import {painterFixture} from './chart-paint-harness';

// Drawings-desktop-1028: Vertical line Extend / Time label, Cross line Price label / Time label, all on by default.
void lvDrawingTypeStatus();
const T=Date.UTC(2026,9,28,14,30);
const make=(type:'vline'|'crossline')=>createDrawing(type as never,{id:'SYNTHETIC '+type,paneId:'price',anchors:[{time:T,price:10}]} as never)! as any;

describe('lvAxisLine member on the models',()=>{
 it('fresh lines write no member (all on) and offer the two checkboxes on the Style tab',()=>{
  const v=make('vline'),c=make('crossline');
  expect(v.serialize().props?.[AXIS_LINE_FIELD]).toBeUndefined();expect(c.serialize().props?.[AXIS_LINE_FIELD]).toBeUndefined();
  expect(v.schema().fields.filter((f:any)=>f.path.startsWith('lvAxisLine.')).map((f:any)=>[f.path,f.label,f.kind,f.group])).toEqual([['lvAxisLine.extend','Extend','boolean','line'],['lvAxisLine.timeLabel','Time label','boolean','line']]);
  expect(c.schema().fields.filter((f:any)=>f.path.startsWith('lvAxisLine.')).map((f:any)=>f.label)).toEqual(['Price label','Time label']);
  expect(v.lvAxisLine).toEqual({schemaVersion:1,extend:true,timeLabel:true});
 });
 it('an edit writes the whole member, round trips, and rejects foreign keys and non-booleans',()=>{
  const v=make('vline');v.applySettings({'lvAxisLine.extend':false});
  const saved=v.serialize();expect(saved.props[AXIS_LINE_FIELD]).toEqual({schemaVersion:1,extend:false,timeLabel:true});
  const back=deserializeDrawing(saved) as any;expect(back.lvAxisLine).toEqual({schemaVersion:1,extend:false,timeLabel:true});expect(back.serialize()).toEqual(saved);
  expect(()=>v.applySettings({'lvAxisLine.priceLabel':false})).toThrow();
  expect(()=>v.applySettings({'lvAxisLine.timeLabel':'no'})).toThrow();
  const c=make('crossline');c.applySettings({'lvAxisLine.priceLabel':false,'style.lineWidth':3});
  expect(c.serialize().props[AXIS_LINE_FIELD]).toEqual({schemaVersion:1,priceLabel:false,timeLabel:true});expect(c.style.lineWidth).toBe(3);
 });
 it('an invalid saved member is retained verbatim, read as all on and not editable',()=>{
  const v=make('vline'),record={...v.serialize(),props:{[AXIS_LINE_FIELD]:{schemaVersion:9,future:true}}};
  const back=deserializeDrawing(record as never) as any;
  expect(back.serialize().props[AXIS_LINE_FIELD]).toEqual({schemaVersion:9,future:true});
  expect(back.schema().fields.some((f:any)=>f.path.startsWith('lvAxisLine.'))).toBe(false);
  expect(()=>back.applySettings({'lvAxisLine.extend':false})).toThrow();
  expect(readAxisLine('vline',record.props).state).toBe('unavailable');expect(axisLineFlag('vline',record.props,'extend')).toBe(true);
 });
});

describe('consumers',()=>{
 const off=(type:string,key:string)=>({[AXIS_LINE_FIELD]:{schemaVersion:1,...(type==='vline'?{extend:true,timeLabel:true}:{priceLabel:true,timeLabel:true}),[key]:false}});
 const row=(type:string,props?:object)=>({id:'SYNTHETIC '+type,type,paneId:'price',anchors:[{time:T,price:10}],style:{lineColor:'#445566'},...(props?{props}:{})});
 it('Extend off keeps the vline in its own pane (no row)',()=>{
  expect(dwb3ShapePayload([row('vline')]).rows).toHaveLength(1);
  expect(dwb3ShapePayload([row('vline',off('vline','extend'))]).rows).toEqual([]);
  expect(dwb3ShapePayload([row('vline',off('vline','timeLabel'))]).rows).toHaveLength(1);
 });
 it('Time label off drops the time-axis label; cross line Price label off drops the price label but keeps the band',()=>{
  expect(drawingTimeAxisLabels([row('vline',off('vline','timeLabel')),row('crossline',off('crossline','timeLabel'))] as never)).toEqual([]);
  expect(drawingTimeAxisLabels([row('vline',off('vline','extend'))] as never)).toHaveLength(1);
  const labels=drawingAxisLabels([row('crossline',off('crossline','priceLabel'))] as never,['SYNTHETIC crossline']);
  expect(labels.labels).toEqual([]);expect(labels.bands).toHaveLength(1);
  expect(drawingAxisLabels([row('crossline',off('crossline','timeLabel'))] as never,[]).labels).toHaveLength(1);
 });
});

describe('time-axis hook in the appearance painters',()=>{
 it('paints drawing time labels after the native time axis (via the mark lane, leaving drawTimeAxis to time-axis-ticks) and releases the wrapper on dispose',async()=>{
  const f=await painterFixture(false),chrome=f.native.chrome,original=chrome.drawMarkLane;
  let drawings:any[]=[{id:'SYNTHETIC vline',type:'vline',paneId:'price',anchors:[{time:T,price:10}],style:{lineColor:'#ffffff'}}];
  const context={labels:{symbolName:false,prevClose:false,highLow:false,noOverlap:false},lines:{prevCloseLine:false},symbol:null,timezone:'UTC',session:{kind:'continuous',extended:true},drawings:()=>drawings,selected:()=>[]} as any;
  const dispose=installAppearancePainters(f.renderer,()=>context);
  try{
   expect(chrome.drawMarkLane).not.toBe(original);expect(Object.hasOwn(chrome,'drawTimeAxis')).toBe(false);chrome.canvas={height:128};
   f.native.scene.showAxisLabels=true;f.native.scene.timezone='UTC';
   const coords={...f.coords,visibleTimeRange:()=>({from:T-3_600_000,to:T+3_600_000}),timeToX:(time:number)=>150+(time-T)/60_000};
   const texts=()=>f.recording.commands.filter((c:any)=>c.op==='fillText').map((c:any)=>c.values[0]);
   f.recording.commands.length=0;chrome.drawMarkLane(f.recording.ctx,f.native.scene,coords,f.native.theme,300,100);
   const all=texts();expect(all.at(-1)).toBe("Wed 28 Oct '26 14:30");expect(all.filter((t:string)=>t.includes("'26")).length).toBe(1);
   drawings=[];f.recording.commands.length=0;chrome.drawMarkLane(f.recording.ctx,f.native.scene,coords,f.native.theme,300,100);
   expect(texts().some((t:string)=>t.includes("'26"))).toBe(false);
   // A throwing provider leaves the native axis alone.
   // The time axis tick format (time-axis-ticks.ts) still installs on the same chart.
   const ticks=installTimeAxisTicks(f.renderer);ticks.dispose();
   drawings=null as never;f.recording.commands.length=0;expect(()=>chrome.drawMarkLane(f.recording.ctx,f.native.scene,coords,f.native.theme,300,100)).not.toThrow();
  }finally{dispose();f.dispose();}
  expect(Object.hasOwn(chrome,'drawMarkLane')).toBe(false);expect(chrome.drawMarkLane).toBe(original);
 });
});
