// Keyboard year entry in the Coordinates date field, the edit bar clear of the chart nav strip, the drawing hover dropped
// when the pointer leaves the plot, and the Text tool's theme-ink default.
import {describe,expect,it,vi} from 'vitest';
import {coordinateDateComplete,coordinateDateTimeSeconds} from '../../src/ui/drawing-dialog-model';
import {placeBarInPane,NAV_STRIP_GAP,PANE_LEGEND_RESERVE} from '../../src/ui/drawing-edit-bar-position';
import {installDrawingHoverLeave} from '../../src/chart/drawing-hover-leave';
import {createDrawing} from '@luxalgo/vela';
import '../../src/chart/drawing-port';

describe('FIX-RI6A item 1: typing a year',()=>{
 it('the partial years a date input reports while "2025" is typed wait; the full year applies',()=>{
  expect(['0002-12-19','0020-12-19','0202-12-19'].map(coordinateDateComplete)).toEqual([false,false,false]);
  expect(coordinateDateComplete('2025-12-19')).toBe(true);expect(coordinateDateComplete('')).toBe(true);expect(coordinateDateComplete('20251-12-19')).toBe(false);
 });
 it('a two-digit year is not remapped to 19xx',()=>{
  expect(new Date(coordinateDateTimeSeconds('0002-12-19','00:00','UTC')*1000).getUTCFullYear()).toBe(2);
  expect(new Date(coordinateDateTimeSeconds('2025-12-19','00:00','UTC')*1000).toISOString()).toBe('2025-12-19T00:00:00.000Z');
 });
});

describe('FIX-RI6A item 2: edit bar and the nav strip',()=>{
 // Shape: a short 2x2 cell, the fib near the bottom, the nav strip 40 px above the plot bottom.
 const pane={width:500,height:320},bar={width:296,height:40},strip={left:150,top:268,right:330,bottom:296};
 const overlaps=(top:number,left:number)=>top<strip.bottom+NAV_STRIP_GAP&&top+bar.height>strip.top-NAV_STRIP_GAP&&left<strip.right&&left+bar.width>strip.left;
 it('without the strip the bar lands on it; with it the bar sits clear above',()=>{
  const box={left:150,top:40,right:400,bottom:260};
  const before=placeBarInPane(box,bar,pane);expect(overlaps(before.top,before.left)).toBe(true);
  const after=placeBarInPane(box,bar,pane,PANE_LEGEND_RESERVE,8,strip);expect(overlaps(after.top,after.left)).toBe(false);expect(after.top+bar.height).toBeLessThanOrEqual(strip.top-NAV_STRIP_GAP);
 });
 it('a bar already clear of the strip does not move',()=>{
  const box={left:150,top:150,right:400,bottom:200};
  expect(placeBarInPane(box,bar,pane,PANE_LEGEND_RESERVE,8,strip)).toEqual(placeBarInPane(box,bar,pane));
 });
});

describe('FIX-RI6A item 3: hover handles after the pointer leaves the plot',()=>{
 it('pointerleave on the plot clears the renderer hover; uninstall stops it',()=>{
  const plot=new EventTarget(),clearHover=vi.fn(),renderer={plot,userDrawings:{clearHover}};
  const off=installDrawingHoverLeave(renderer);plot.dispatchEvent(new Event('pointerleave'));expect(clearHover).toHaveBeenCalledTimes(1);
  plot.dispatchEvent(new Event('pointermove'));expect(clearHover).toHaveBeenCalledTimes(1);
  off();plot.dispatchEvent(new Event('pointerleave'));expect(clearHover).toHaveBeenCalledTimes(1);
 });
 it('a renderer without a plot or hover owner is a no-op',()=>{
  expect(()=>installDrawingHoverLeave(null)()).not.toThrow();
  const plot=new EventTarget();installDrawingHoverLeave({plot});expect(()=>plot.dispatchEvent(new Event('pointerleave'))).not.toThrow();
 });
});

describe('FIX-RI6A item 4: Text default color',()=>{
 it('a fresh Text carries no fixed blue: the renderer fills theme ink at placement',()=>{
  const text=createDrawing('text' as never,{paneId:'price',anchors:[{time:1,price:1}]} as never)!.serialize().text;
  expect(text?.color).toBeUndefined();expect(text).toMatchObject({size:'normal',bold:false,italic:false});
 });
});
