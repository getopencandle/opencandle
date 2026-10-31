import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {composeInputFeel,INPUT_FEEL_RUNTIMES,INPUT_FEEL_WHEEL_K} from '../../src/chart/vela-input-feel-transform.mjs';
import {clampDialogOffset,isDialogDragStart} from '../../src/ui/Modal';
import {clampRightPanelWidth,parseStoredWidth,RIGHT_PANEL_MAX_W,RIGHT_PANEL_MIN_W} from '../../src/ui/RightPanelSplitter';

// The LV-VELA-INPUT-FEEL-1 transform and the dialog / right panel drag helpers. Text and pure-function
// checks only; the CDP-measured run of the built app is recorded in
const raw=(path:string)=>readFileSync('node_modules/@luxalgo/vela/'+path,'utf8');
const composed=composeInputFeel(raw('dist/chunk-UNUVPQFW.js'),'dist/chunk-UNUVPQFW.js');
const slice=(from:string,to:string)=>{const start=composed.indexOf(from),end=composed.indexOf(to,start);expect(start).toBeGreaterThan(-1);return composed.slice(start,end);};

describe('LV-VELA-INPUT-FEEL-1 transform',()=>{
 it('composes every runtime input once and is idempotent',()=>{
  for(const path of INPUT_FEEL_RUNTIMES){const input=raw(path),once=composeInputFeel(input,path);expect(once,path).not.toBe(input);expect(composeInputFeel(once,path),path).toBe(once);}
  expect(()=>composeInputFeel('var x = 1;','dist/index.cjs')).toThrow(/anchor mismatch/);
 });
 it('one 100-delta wheel notch is about 11%, still proportional for a touchpad delta',()=>{
  expect(composed).toContain('var WHEEL_ZOOM_K = '+INPUT_FEEL_WHEEL_K+';');
  expect(1/Math.exp(-100*INPUT_FEEL_WHEEL_K)).toBeGreaterThan(1.10);expect(1/Math.exp(-100*INPUT_FEEL_WHEEL_K)).toBeLessThan(1.12);
  expect(1/Math.exp(-8.3*INPUT_FEEL_WHEEL_K)).toBeCloseTo(1.0092,3);
  expect(composed).toContain('const target = clampBarSpacing(vp.barSpacing * Math.exp(-e.deltaY * WHEEL_ZOOM_K));');
 });
 it('a time-axis drag to the right spreads the bars and to the left compresses them',()=>{
  const spacing=new Function(slice('function lvTimeAxisDragSpacing','\n}\n')+'\n}\nreturn lvTimeAxisDragSpacing;')() as (s:number,a:number,b:number,w:number)=>number;
  expect(spacing(6,1000,1300,2000)).toBeGreaterThan(6);expect(spacing(6,1000,700,2000)).toBeLessThan(6);expect(spacing(6,1000,1000,2000)).toBe(6);
  expect(spacing(6,1000,1300,2000)).toBeCloseTo(6*1400/1100,6);
  expect(composed).toContain('lvTimeAxisDragSpacing(this.startBarSpacing, this.startX, x, this.deps.getCoords().width)');
 });
 it('plain Left/Right scroll one bar, Shift 10 bars, Alt steps the crosshair',()=>{
  const keyToAction=new Function('PAN_BARS',slice('function keyToAction(e)','var KeyboardController')+'return keyToAction;')(10) as (e:Record<string,unknown>)=>unknown;
  const key=(k:string,mods:Record<string,boolean>={})=>keyToAction({key:k,shiftKey:false,altKey:false,ctrlKey:false,metaKey:false,...mods});
  expect(key('ArrowLeft')).toEqual({kind:'pan',bars:-1});expect(key('ArrowRight')).toEqual({kind:'pan',bars:1});
  expect(key('ArrowLeft',{shiftKey:true})).toEqual({kind:'pan',bars:-10});expect(key('ArrowRight',{shiftKey:true})).toEqual({kind:'pan',bars:10});
  expect(key('ArrowLeft',{altKey:true})).toEqual({kind:'step',delta:-1});expect(key('ArrowRight',{altKey:true})).toEqual({kind:'step',delta:1});
  expect(key('ArrowRight',{altKey:true,shiftKey:true})).toEqual({kind:'realtime'});expect(key('ArrowLeft',{ctrlKey:true})).toBeNull();
  expect(key('Home')).toEqual({kind:'edge',edge:'first'});expect(key('End')).toEqual({kind:'edge',edge:'last'});
 });
 it('a mouse pan shows the closed hand and the gesture end restores the cursor',()=>{
  expect(composed).toContain('this.el.style.cursor = "grabbing";');
  expect(composed).toContain('if (this.el && this.el.style.cursor === "grabbing") this.el.style.cursor = this.deps.lvCursorCss?.() ?? "";');
 });
});

describe('dialog title-bar drag',()=>{
 const box={left:500,top:300,width:600,height:400},view={width:1600,height:1000};
 it('moves freely inside the viewport and clamps at the edges',()=>{
  expect(clampDialogOffset({x:100,y:-50},box,view)).toEqual({x:100,y:-50});
  expect(clampDialogOffset({x:-900,y:-900},box,view)).toEqual({x:-500,y:-300});
  expect(clampDialogOffset({x:900,y:900},box,view)).toEqual({x:500,y:300});
  expect(clampDialogOffset({x:0,y:-500},{left:0,top:0,width:600,height:1200},view)).toEqual({x:0,y:0});
 });
 it('never starts from a header button or field',()=>{
  const at=(hit:boolean)=>({closest:(selector:string)=>hit&&selector.includes('button')?{}:null});
  expect(isDialogDragStart({button:0,target:at(false) as unknown as EventTarget})).toBe(true);
  expect(isDialogDragStart({button:0,target:at(true) as unknown as EventTarget})).toBe(false);
  expect(isDialogDragStart({button:2,target:at(false) as unknown as EventTarget})).toBe(false);
 });
});

describe('right panel splitter width',()=>{
 it('clamps to the bounds and keeps room for the chart',()=>{
  expect(clampRightPanelWidth(100,2560)).toBe(RIGHT_PANEL_MIN_W);expect(clampRightPanelWidth(5000,2560)).toBe(RIGHT_PANEL_MAX_W);
  expect(clampRightPanelWidth(600,900)).toBe(480);expect(clampRightPanelWidth(600,500)).toBe(RIGHT_PANEL_MIN_W);
  expect(clampRightPanelWidth(Number.NaN,2560)).toBe(302);
 });
 it('reads only a sane stored width',()=>{
  expect(parseStoredWidth('400')).toBe(400);expect(parseStoredWidth('10')).toBeNull();expect(parseStoredWidth('9999')).toBeNull();expect(parseStoredWidth('40px')).toBeNull();expect(parseStoredWidth(null)).toBeNull();
 });
});
