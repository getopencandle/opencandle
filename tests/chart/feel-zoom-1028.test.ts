import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {composeInputFeel,INPUT_FEEL_RUNTIMES} from '../../src/chart/vela-input-feel-transform.mjs';

// History room. A live chart that can still page older bars zooms out by bar spacing (down to 0.5 px), not
// to the loaded range, and pans past its oldest bar; the empty area waits for the pages. Room 0 keeps LV-VELA-NAV-1 exactly.
// Extracted-method checks on the composed renderer; the hidden-window measurements are in
const raw=(path:string)=>readFileSync('node_modules/@luxalgo/vela/'+path,'utf8');
const composed=composeInputFeel(raw('dist/chunk-UNUVPQFW.js'),'dist/chunk-UNUVPQFW.js');
const ROOM_LINE='const lvRoom = this.lvHistoryRoom > 0 ? this.lvHistoryRoom : 0;';
const clampBody=()=>{const start=composed.indexOf('  clampViewport(barSpacing, rightOffset) {'),end=composed.indexOf('\n  }\n',start);expect(start).toBeGreaterThan(-1);return composed.slice(composed.indexOf('{',start)+1,end);};
type Clamp=(barSpacing:number,rightOffset:number)=>{barSpacing:number;rightOffset:number};
const renderer=(barCount:number,room?:number)=>{
 const self={coords:{barCount,width:968,spacingScale:1},scene:{style:{margins:{right:10}}},lvHistoryRoom:room};
 const clamp=new Function('MIN_BAR_SPACING','MAX_BAR_SPACING','MIN_VISIBLE_BARS','ZOOM_OUT_MARGIN_BARS','clampBarSpacing','return function(barSpacing, rightOffset){'+clampBody()+'};')(0.5,1000,2,6,(value:number)=>Math.max(0.5,Math.min(1000,value)));
 return (clamp as Clamp).bind(self);
};

describe('history room zoom and pan bounds',()=>{
 it('every runtime input carries the room once, and the transform stays idempotent',()=>{
  for(const path of INPUT_FEEL_RUNTIMES){const once=composeInputFeel(raw(path),path);expect(once.split(ROOM_LINE).length-1,path).toBe(1);expect(once.split('- lvRoom));').length-1,path).toBe(1);expect(composeInputFeel(once,path),path).toBe(once);}
 });
 it('without room a zoom-out stops at the loaded bars and the oldest bar stays near the left edge (unchanged)',()=>{
  for(const room of [undefined,0]){
   const clamp=renderer(300,room),out=clamp(0.5,10);
   expect(out.barSpacing).toBeCloseTo(968/306,9);
   const left=clamp(968/306,-500);expect(left.rightOffset).toBeGreaterThan(-500);
  }
 });
 it('with room a zoom-out reaches the 0.5 px floor at the right edge, and a pan may pass the oldest bar',()=>{
  const clamp=renderer(300,5000),out=clamp(0.5,10);
  expect(out).toEqual({barSpacing:0.5,rightOffset:10});
  expect(clamp(3,-200).rightOffset).toBe(-200); // panned left: the empty area past the oldest bar stays
  expect(clamp(3,-299).rightOffset).toBe(-298); // at least MIN_VISIBLE_BARS stay on screen
  expect(clamp(3,1000).rightOffset).toBeCloseTo(968/3*0.5,9); // the newest-bar bound (mid-plot) is unchanged
 });
});
