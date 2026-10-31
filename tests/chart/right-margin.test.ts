import {describe,expect,it} from 'vitest';
import {NativeRenderer} from '@luxalgo/vela';
import {applyRightMargin} from '../../src/chart/right-margin';
// canvas.rightMarginBars reaches the pinned renderer. Real NativeRenderer state and viewport
// methods; SYNTHETIC daily bars; no DOM or GUI claim.
const W=951;
function chart(){const r=new NativeRenderer() as any;r.scheduler={invalidate(){}};r.animator={stop(){},start(){}};r.animScroll.set(0);r.coords.setSize(W,700,1);r.coords.setBars(Array.from({length:500},(_,i)=>Date.UTC(2024,0,1)+i*86400000));r.fitContent();return r;}
describe('applyRightMargin',()=>{
 it('the first-open view uses the renderer default margin of 10 bars (the space after the last bar)',()=>{
  const r=chart();expect(r.scene.style.margins.right).toBe(10);expect(r.coords.getViewport().rightOffset).toBe(10);
 });
 it('a view at the old margin (just opened, or at the live edge) moves to the new margin',()=>{
  const r=chart();expect(applyRightMargin(r,3)).toBe(true);
  expect(r.coords.getViewport().rightOffset).toBe(3);expect(r.scene.style.margins.right).toBe(3);
 });
 it('a panned view stays, and later resets, scroll to latest and fits use the new margin',()=>{
  const r=chart();r.applyViewport({barSpacing:4,rightOffset:-50});
  expect(applyRightMargin(r,25)).toBe(false);expect(r.coords.getViewport().rightOffset).toBe(-50);
  r.resetView();expect(r.coords.getViewport().rightOffset).toBe(25);
  r.applyViewport({barSpacing:4,rightOffset:-50});r.scrollToRealtime();expect(r.coords.getViewport().rightOffset).toBe(25);
 });
 it('clamps to 0..200 whole bars like the renderer config path, ignores no-ops and refuses non-numbers',()=>{
  const r=chart();applyRightMargin(r,1000);expect(r.scene.style.margins.right).toBe(200);
  applyRightMargin(r,-4);expect(r.scene.style.margins.right).toBe(0);
  expect(applyRightMargin(r,0)).toBe(false);expect(()=>applyRightMargin(r,Number.NaN)).toThrow();
  expect(applyRightMargin(null,5)).toBe(false);
 });
});
