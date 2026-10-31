import {expect,it} from 'vitest';
import {createViewportCapture} from '../../src/chart/viewport-state';
// Click empty
// plot, arm the eraser, Escape, click, Ctrl+Z, all at once. Status "Change undone." but nothing changed: an invisible
// history entry. Every plain press on the plot makes the renderer re-apply its current viewport
// (node_modules/@luxalgo/vela/dist/chunk-UNUVPQFW.js:7459 onDown -> applyViewport :21755 -> emitViewportChange), so the
// cell's viewport capture marks itself dirty on a click that moves nothing. That capture used to commit whatever the live
// viewport was 150 ms later. While the frame gesture's 200 ms window was open the commit was swallowed (MultiChartGrid
// captureCell: viewport patches are dropped while interceptsViewport()); since an earlier fix a history key or eraser
// arming settles the frame gesture at once, so the click's capture reached captureCell on its own and recorded the live
// viewport (which differs from a stale saved one) as an undo step the user never made. A capture now commits only a
// viewport that differs from the one its gesture opened on. SYNTHETIC ranges; no renderer, DOM or package claim.
function harness(){
 let live={from:10,to:40},callback:(()=>void)|null=null;const saved:Array<{from:number;to:number}>=[];
 const capture=createViewportCapture({read:()=>({...live}),commit:range=>saved.push(range),schedule:fn=>{callback=fn;return 1 as any;},cancel:()=>{callback=null;}});
 return{capture,saved,set:(range:{from:number;to:number})=>{live=range;},run:()=>{const fn=callback;callback=null;fn?.();}};
}
it('ERASER-GHOST-UNDO: a click whose press only re-applies the same viewport commits nothing (no undo step)',()=>{
 const h=harness();
 h.capture.begin();h.capture.changed();h.capture.finish();h.run();
 expect(h.saved,'an empty gesture creates no viewport publication').toEqual([]);
});
it('ERASER-GHOST-UNDO: a real pan still commits the closing viewport once',()=>{
 const h=harness();
 h.capture.begin();h.set({from:12,to:42});h.capture.changed();h.capture.finish();h.run();
 expect(h.saved).toEqual([{from:12,to:42}]);
});
it('ERASER-GHOST-UNDO: coalesced presses compare against the first opening; a pan undone inside the window is no change',()=>{
 const h=harness();
 h.capture.begin();h.set({from:12,to:42});h.capture.changed();h.capture.finish();
 h.capture.begin();h.set({from:10,to:40});h.capture.changed();h.capture.finish();h.run();
 expect(h.saved).toEqual([]);
 h.capture.begin();h.set({from:11,to:41});h.capture.changed();h.capture.finish();h.capture.begin();h.capture.changed();h.capture.finish();h.run();
 expect(h.saved).toEqual([{from:11,to:41}]);
});
it('explicit navigation commands still commit at once (unchanged)',()=>{
 const h=harness();h.capture.command();expect(h.saved).toEqual([{from:10,to:40}]);
});
