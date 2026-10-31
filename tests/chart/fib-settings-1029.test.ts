import {expect,it,vi} from 'vitest';
import type {SerializedDrawing} from '@luxalgo/vela';
import {fibBaselineHarness,fibBaselineRecord} from './fib-trend-line-painter-harness';
import {assertNativeDrawingMatchesCanonical} from '../../src/chart/drawing-canonical';
import {installNativeShowOn,savedShowOnBands,withShowOn,SHOW_ON_BANDS} from '../../src/chart/native-show-on-readback';

// Report: "changed a time frame of a fib in the settings menu ... now the chart is showing errors".
// The renderer's double-click settings panel edits the renderer copy live (Show on bands, line width) and re-renders before the
// saved record follows; the Fib painter refused that frame and the annotation quarantined the whole chart ("Trendline annotation
// painting failed. Reopen the chart."). SYNTHETIC rows; actual native store/renderer bodies.

type Harness=Awaited<ReturnType<typeof fibBaselineHarness>>;
const ID='SYNTHETIC owned Fib baseline';
function record(){const row=fibBaselineRecord();row.props={...row.props,lvFibBackground:{schemaVersion:1,opacity:40}};return row;}
const fills=(f:Harness)=>[f.top,...f.slices].flatMap(row=>row.commands).filter(command=>command.op==='fillRect').length;
function paint(f:Harness){for(const row of [f.top,...f.slices])row.commands.length=0;let error:unknown;try{f.render();f.drain();}catch(caught){error=caught;}return error;}

it('a lasting saved/native divergence withholds one Fib, never quarantines, and re-syncs that drawing from the saved record',async()=>{
 const resync=vi.fn(),warn=vi.spyOn(console,'warn').mockImplementation(()=>{});
 const f=await fibBaselineHarness({resyncDrawing:resync});try{
  f.sync([record()]);f.drain();expect(fills(f)).toBeGreaterThan(0);
  // The native copy says one line width, the saved record another (a panel edit the record has not taken).
  const saved=record();(saved as any).style={...(saved as any).style,lineWidth:4};f.document.load({version:1,drawings:[saved]});
  expect(paint(f)).toBeUndefined();
  expect(f.diagnostics).toEqual([]);
  expect(fills(f)).toBe(0);
  expect(JSON.stringify(f.baseline.diagnostics())).toContain('differs from its canonical record');
  expect(warn.mock.calls.some(call=>String(call[0]).includes('Fibonacci '+ID))).toBe(true);
  // Logged once per divergence, however many frames paint it.
  const logged=warn.mock.calls.length;paint(f);paint(f);expect(warn.mock.calls.length).toBe(logged);
  // After the commit-lag window, with no settings panel open, the drawing is re-synced (once).
  expect(resync).not.toHaveBeenCalled();
  await new Promise(resolve=>setTimeout(resolve,2300));
  expect(resync).toHaveBeenCalledTimes(1);expect(resync).toHaveBeenCalledWith(ID);
  // Re-synced: the renderer copy equals the saved record again and the full presentation returns.
  f.sync([saved]);f.drain();expect(paint(f)).toBeUndefined();expect(fills(f)).toBeGreaterThan(0);expect(f.baseline.diagnostics()).toEqual([]);
 }finally{f.cleanup();warn.mockRestore();}
},10000);

// Non-divergence refusals (a non-finite saved anchor, a retired source) still throw: fib-absorb-scope.test.ts P3, fib-drag-commit-lag.test.ts.

it('legacy Show on bands are interval visibility, not native state: the canonical comparison ignores them',()=>{
 const saved={...record(),showOn:['s','1','5','15','60','240','D','M']} as SerializedDrawing,renderer=record();
 expect(()=>assertNativeDrawingMatchesCanonical(saved,renderer)).not.toThrow();
 expect(()=>assertNativeDrawingMatchesCanonical(renderer,{...renderer,showOn:['W']} as SerializedDrawing)).not.toThrow();
 expect(()=>assertNativeDrawingMatchesCanonical(saved,{...renderer,locked:true} as SerializedDrawing)).toThrow(/differs from its canonical record/);
});

it('withShowOn sets, orders and clears saved bands; unknown bands are refused',()=>{
 const doc={version:1,drawings:[{id:'a',type:'fibretracement'},{id:'b',type:'trendline',showOn:['D']}]};
 const set=withShowOn(doc,'a',['W','s','D']);expect((set.drawings as any)[0].showOn).toEqual(['s','D','W']);expect(doc.drawings[0]).toEqual({id:'a',type:'fibretracement'});
 const cleared=withShowOn(doc,'b',undefined);expect(Object.hasOwn((cleared.drawings as any)[1],'showOn')).toBe(false);
 expect(withShowOn(doc,'b',['D'])).toBe(doc);
 expect(()=>withShowOn(doc,'a',['3m'])).toThrow(/Unsupported/);expect(()=>withShowOn(doc,'zz',['D'])).toThrow(/not found/);
 expect(savedShowOnBands({showOn:['D','W']})).toEqual(['D','W']);expect(savedShowOnBands({showOn:['future-band']})).toBeUndefined();expect(savedShowOnBands(undefined)).toBeUndefined();
 expect(SHOW_ON_BANDS).toEqual(['s','1','5','15','60','240','D','W','M']);
});

it('the panel Show on fold reads the saved bands, writes them to the saved record, and Cancel restores the opened bands',()=>{
 // A stand-in for the renderer settings panel: the vela fold body reads b.live().showOn and writes b.edit({showOn}).
 let saved:readonly string[]|undefined=['s','1','5','15','60','240','D','M'];const writes:unknown[]=[];const patches:unknown[]=[];const restores:unknown[]=[];
 const renderer={id:'fib-1',type:'fibretracement',showOn:undefined as unknown,width:2};
 class Panel{
  b:any;
  open(drawing:any,actions:any){this.b={live:()=>drawing,edit:(p:any)=>actions.patch(p),actions};this.cancel=()=>actions.restore({id:drawing.id});return this.showOnFold(this.b);}
  cancel=()=>{};
  showOnFold(b:any){const bands=()=>b.live().showOn;return{bands,set:(next:unknown)=>b.edit({showOn:next}),edit:(p:any)=>b.edit(p)};}
 }
 const panel=new Panel(),session=function(this:Panel,...args:any[]){return Reflect.apply(Panel.prototype.open,this,args);};
 Object.defineProperty(panel,'open',{configurable:true,writable:true,value:session});
 const release=installNativeShowOn(panel,{read:()=>saved,write:(_id,bands)=>{writes.push(bands);saved=bands;}});
 const fold=panel.open(renderer,{patch:(p:any)=>patches.push(p),restore:(doc:unknown)=>restores.push(doc)}) as any;
 expect(fold.bands()).toEqual(['s','1','5','15','60','240','D','M']);
 fold.set(['s','1','5','15','60','240','M']);
 expect(writes).toEqual([['s','1','5','15','60','240','M']]);expect(patches).toEqual([]);expect(renderer.showOn).toBeUndefined();
 expect(fold.bands()).toEqual(['s','1','5','15','60','240','M']);
 fold.set(undefined);expect(saved).toBeUndefined();expect(fold.bands()).toBeUndefined();
 // Other members still reach the native patch unchanged.
 fold.edit({width:3});expect(patches).toEqual([{width:3}]);
 // Cancel: the native restore runs, then the bands the panel opened with are written back.
 panel.cancel();expect(restores).toEqual([{id:'fib-1'}]);expect(saved).toEqual(['s','1','5','15','60','240','D','M']);
 release();expect(Object.getOwnPropertyDescriptor(panel,'open')!.value).toBe(session);expect(Object.hasOwn(panel,'showOnFold')).toBe(false);
});
