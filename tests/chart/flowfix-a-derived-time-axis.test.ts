import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {NativeRenderer} from '@luxalgo/vela';
import type {Bar} from '../../src/domain/types';
import {parseInterval} from '../../src/domain/intervals';
import {computeDerived} from '../../src/chart/derived';
import {buildDerivedAxis} from '../../src/chart/derived/derived-axis';
import {commandCanvas} from './chart-paint-harness';

// Renko (and the other derived types) on a daily chart drew clock times on the time axis, because the
// adapter fed the renderer a 60 s synthetic step for every source the interval parser gives no seconds for (day/week/month).
// The actual adapter step line runs here, then the pinned Vela time axis paints the derived feed. SYNTHETIC bars.
const source=readFileSync('src/chart/adapter.ts','utf8'),start=source.indexOf('    let seconds=60;try{'),end=source.indexOf('\n',start);
const stepLine=source.slice(start,end);
const adapterStep=(resolution:string|null):number=>Function('currentSource','parseInterval',stripTypeScriptTypes(stepLine,{mode:'transform'})+';return seconds;')({resolution},parseInterval);
const DAY=86400;
const daily:Bar[]=Array.from({length:240},(_,index)=>{const close=20+6*Math.sin(index/12)+index*0.02;return{time:Date.UTC(2025,0,2)/1000+index*DAY,open:close,high:close+0.4,low:close-0.4,close,volume:1};});
function axisLabels(step:number){
 const result=computeDerived('renko',daily,{boxMethod:'Traditional',boxSize:0.5,atrLength:14,percentage:1,source:'close',wicks:false});if(!result.ok)throw Error(result.diagnostic.code);
 const axis=buildDerivedAxis(result.value,step),from=axis.feed[0].time*1000,to=axis.feed.at(-1)!.time*1000;
 const native=new NativeRenderer() as any,recording=commandCanvas();native.scene.showAxisLabels=true;native.scene.timezone='UTC';
 const width=800,coords={visibleTimeRange:()=>({from,to}),timeToX:(time:number)=>(time-from)/(to-from)*width};
 native.chrome.drawTimeAxis(recording.ctx,native.scene,coords,{},width,400,428);
 return{bricks:axis.feed.length,labels:recording.commands.filter((row:any)=>row.op==='fillText').map((row:any)=>String(row.values[0]))};
}
describe('FLOWS-AUDIT-1028 #13 derived types keep a date axis on daily-or-higher sources',()=>{
 it('the adapter step follows the source interval',()=>{
  expect(adapterStep('1D')).toBe(DAY);expect(adapterStep('3D')).toBe(3*DAY);expect(adapterStep('1W')).toBe(7*DAY);expect(adapterStep('1M')).toBe(30*DAY);
  expect(adapterStep('1')).toBe(60);expect(adapterStep('15')).toBe(900);expect(adapterStep('60')).toBe(3600);expect(adapterStep('5S')).toBe(5);
  expect(adapterStep(null)).toBe(60);expect(adapterStep('100R')).toBe(60);expect(adapterStep('not an interval')).toBe(60);
 });
 it('a daily Renko axis shows dates, no clock times',()=>{
  const {bricks,labels}=axisLabels(adapterStep('1D'));expect(bricks).toBeGreaterThan(20);expect(labels.length).toBeGreaterThan(2);
  expect(labels.filter(label=>/^\d{1,2}:\d{2}$/.test(label))).toEqual([]);
  // The old 60 s step on the same bricks is the reported symptom.
  expect(axisLabels(60).labels.some(label=>/^\d{1,2}:\d{2}$/.test(label))).toBe(true);
 });
});

// A Line break cell in a 16-chart wall showed "2027" on its time axis for daily data ending in 2026: past the last brick the
// axis extrapolated one source interval per blank logical slot, and the wall cell's right margin reached the next year.
// The axis view (axisFrameCoords) drops ticks outside the bricks' own source times. The real pinned Vela axis paints here.
import {axisFrameCoords,frameCoords,setDerivedTimeSource} from '../../src/chart/derived-time-labels';
import {derivedAxisSourceTime} from '../../src/chart/derived/derived-axis';
import {inspectedBar} from '../../src/chart/inspection';
describe('derived time axis past the last brick',()=>{
 const end=Date.UTC(2026,10,2)/1000,lastDaily:Bar[]=Array.from({length:500},(_,index)=>{const close=400+60*Math.sin(index/40)+index*0.1;return{time:end-(499-index)*DAY,open:close,high:close+2,low:close-2,close,volume:1};});
 const result=computeDerived('linebreak',lastDaily,{lines:3});if(!result.ok)throw Error(result.diagnostic.code);
 const axis=buildDerivedAxis(result.value,DAY),last=axis.bars.length-1;
 function labels(view:(renderer:object,coords:any)=>any){
  const renderer={},native=new NativeRenderer() as any,recording=commandCanvas();native.scene.showAxisLabels=true;native.scene.timezone='UTC';
  // A narrow wall cell zoomed out with a wide blank margin: the visible logical range runs 120 slots past the last brick.
  const width=260,from=last-60,to=last+120,coords={barInterval:DAY*1000,visibleLogicalRange:()=>({from,to}),logicalToX:(logical:number)=>(logical-from)/(to-from)*width};
  setDerivedTimeSource(renderer,()=>axis.sourceTimes.map(time=>time*1000));
  try{native.chrome.drawTimeAxis(recording.ctx,native.scene,view(renderer,coords),{},width,200,228);}finally{setDerivedTimeSource(renderer,null);}
  return recording.commands.filter((row:any)=>row.op==='fillText').map((row:any)=>({text:String(row.values[0]),x:Number(row.values[1])}));
 }
 it('labels no date after the data ends',()=>{
  const lastX=60/180*260;expect(new Date(axis.sourceTimes[last]*1000).getUTCFullYear()).toBe(2026);
  // The reported symptom (the extrapolating view): a label in the blank space, for a month of 2027.
  expect(labels(frameCoords).filter(row=>row.x>lastX+1).map(row=>row.text)).toContain('Jan');
  const shown=labels(axisFrameCoords);expect(shown.length).toBeGreaterThan(0);expect(shown.filter(row=>row.x>lastX+1)).toEqual([]);
 });
});

// The legend change compares the shown display bar with the display bar before it. On a live chart the bars a forming
// source bar completes are projection rows, which the App calculation bars (confirmed only) do not hold, so indexing them
// by the display index lost the previous bar (live Range showed no change at all). The data window now carries it.
describe('derived data window carries the previous display bar',()=>{
 const adapter=readFileSync('src/chart/adapter.ts','utf8'),from=adapter.indexOf('const axis=derived.axis,index='),to=adapter.indexOf(':null}};',from)+':null}};'.length;
 const readout=Function('derived','hovered','currentBars','inspectedBar','derivedAxisSourceTime',adapter.slice(from,to));
 const bars:Bar[]=Array.from({length:30},(_,index)=>({time:Date.UTC(2026,0,1)/1000+index*DAY,open:100+index,high:101+index,low:99+index,close:100.5+index,volume:1}));
 const result=computeDerived('range',bars,{range:100,phantomBars:false},{tickSize:0.01,lastBarOpen:true});if(!result.ok)throw Error(result.diagnostic.code);
 const axis=buildDerivedAxis(result.value,DAY);
 it('the latest (projection) row reads the projection row before it, with its source time',()=>{
  expect(result.value.projection.length).toBeGreaterThan(1);
  const view=readout({axis},null,bars,inspectedBar,derivedAxisSourceTime),index=axis.bars.length-1;
  expect(view.displayed.index).toBe(index);expect(index-1).toBeGreaterThanOrEqual(result.value.confirmed.length);
  expect(view.displayed.previous).toEqual({time:axis.sourceTimes[index-1],open:axis.bars[index-1].open,high:axis.bars[index-1].high,low:axis.bars[index-1].low,close:axis.bars[index-1].close,volume:axis.bars[index-1].volume});
  expect(readout({axis},axis.feed[0].time,bars,inspectedBar,derivedAxisSourceTime).displayed.previous).toBeNull();
 });
 it('the App legend reads that previous bar before indexing the calculation bars',()=>{
  expect(readFileSync('src/ui/App.tsx','utf8')).toContain("headerPrevious=validInspection&&'previous' in validInspection.displayed?validInspection.displayed.previous??undefined:calculationBars[");
 });
});
