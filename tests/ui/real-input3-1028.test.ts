import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {composeInputFeel,INPUT_FEEL_RUNTIMES} from '../../src/chart/vela-input-feel-transform.mjs';

// Shift+wheel pans as the reference app does (measured with real input: wheel up = later bars).
// Text and extracted-function checks on the composed renderer; the real-input run is in
const raw=(path:string)=>readFileSync('node_modules/@luxalgo/vela/'+path,'utf8');
const composed=composeInputFeel(raw('dist/chunk-UNUVPQFW.js'),'dist/chunk-UNUVPQFW.js');
const fn=(name:string)=>{const start=composed.indexOf('function '+name+'('),end=composed.indexOf('\n}\n',start);expect(start).toBeGreaterThan(-1);return composed.slice(start,end+3);};
const PAN_LINE='const pan = e.shiftKey && !isHorizontalWheel(e.deltaX, e.deltaY) ? -e.deltaY : wheelPanDelta(e.deltaX, e.deltaY, e.shiftKey);';

describe('Shift+wheel pan direction',()=>{
 it('every runtime input carries the flipped Shift+wheel line once, and the transform stays idempotent',()=>{
  for(const path of INPUT_FEEL_RUNTIMES){const once=composeInputFeel(raw(path),path);expect(once.split(PAN_LINE).length-1,path).toBe(1);expect(composeInputFeel(once,path),path).toBe(once);}
 });
 it('Shift+wheel up pans to later bars, down to earlier; tilt and touchpad swipes keep their native direction',()=>{
  const pan=new Function(fn('isHorizontalWheel')+fn('wheelPanDelta')+'return (e)=>{'+PAN_LINE+'return pan;};')() as (e:{deltaX:number;deltaY:number;shiftKey:boolean})=>number|null;
  // A positive pan raises the right offset (later bars come into view).
  expect(pan({deltaX:0,deltaY:-100,shiftKey:true})).toBe(100);
  expect(pan({deltaX:0,deltaY:100,shiftKey:true})).toBe(-100);
  expect(pan({deltaX:100,deltaY:0,shiftKey:false})).toBe(100);
  expect(pan({deltaX:-40,deltaY:3,shiftKey:true})).toBe(-40);
  expect(pan({deltaX:0,deltaY:-100,shiftKey:false})).toBeNull();
 });
});
