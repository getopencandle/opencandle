import {describe,expect,it} from 'vitest';
import {createDrawing} from '@luxalgo/vela';

// Audit 2026-10-19: the creation-hook refusal must show the placement's own reason (the bar count over the 50,000 cap, or
// "no bars"), not a generic "(none, or more than 50,000)". The native controller re-assigns the id on create, so the reason
// must survive that. SYNTHETIC bars only; no DOM, canvas or GUI claim.
await import('../../src/chart/lv-drawing-types');
const {LV_BARS_PATTERN,barsPatternPlacementRefusal}=await import('../../src/chart/lv-types/bars-pattern');
const {readBarsPattern}=await import('../../src/chart/lv-types/bars-pattern-data');
const {nativeDrawingHarness}=await import('./drawing-native-harness');

const T0=Date.UTC(2026,2,2);
/** n one-minute SYNTHETIC bars from T0, epoch ms like the renderer. */
const minuteRows=(n:number)=>Array.from({length:n},(_,i)=>({time:T0+i*60_000,open:100,high:101,low:99,close:100.5}));
const projectionFor=(rows:ReturnType<typeof minuteRows>)=>({width:600,height:400,xOf:(t:number)=>(t-T0)/60_000,yOf:(p:number)=>300-p,pxToPoint:()=>({time:0,price:0}),paneIdAtY:()=>'price',
 barsInRange:(from:number,to:number)=>rows.filter(row=>row.time>=from&&row.time<=to)}) as never;
function place(rows:ReturnType<typeof minuteRows>,from:number,to:number){
 const draft=createDrawing(LV_BARS_PATTERN as never,{paneId:'price',anchors:[{time:from,price:100},{time:to,price:100}]})!;
 draft.onPlaced(projectionFor(rows));return draft.serialize();
}

describe('Bars pattern placement refusal names the actual reason (audit)',()=>{
 it('over the cap: the message carries the bar count and the limit, through the native create (new id)',async()=>{
  const rows=minuteRows(50_001),doc=place(rows,rows[0].time,rows[rows.length-1].time);
  expect(readBarsPattern(doc.props).state).toBe('absent');
  const t=await nativeDrawingHarness();
  try{
   t.controller.setTool(LV_BARS_PATTERN);t.controller.onIntent({kind:'create',doc});t.controller.onIntent({kind:'tool-finished',type:LV_BARS_PATTERN});
   const created=t.controller.all().find((row:any)=>row.type===LV_BARS_PATTERN)!;
   const message=barsPatternPlacementRefusal(created);
   expect(message).toBe('The two points hold 50,001 bars; the limit is 50,000. Nothing was placed.');
  }finally{t.dispose();}
 });
 it('no bars between the points: the specific empty message; the stored record carries no extra key',()=>{
  const doc=place(minuteRows(10),T0+3_600_000,T0+7_200_000);
  expect(Object.keys(doc.props??{}).sort()).toEqual(['flipped','mirrored','mode']);
  expect(barsPatternPlacementRefusal(doc)).toBe('No bars between the two points. Nothing was placed.');
 });
 it('an absent record with no recorded placement (e.g. loaded or pasted) keeps the generic notice; a supported one is not refused',()=>{
  const loose=createDrawing(LV_BARS_PATTERN as never,{paneId:'price',anchors:[{time:T0+1,price:5},{time:T0+2,price:5}]})!.serialize();
  expect(barsPatternPlacementRefusal(loose)).toContain('Nothing was placed.');
  const rows=minuteRows(5),ok=place(rows,rows[0].time,rows[4].time);
  expect(barsPatternPlacementRefusal(ok)).toBeNull();
 });
});
