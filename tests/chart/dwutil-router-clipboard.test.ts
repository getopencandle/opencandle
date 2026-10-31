import {describe,expect,it,vi} from 'vitest';
import type {Vela} from '@luxalgo/vela';
import {clipboardKeyDispatcher,installDrawingCommandRouter,type DrawingCommandRouterHost} from '../../src/chart/drawing-command-router';
import {createDrawingPasteRoute,DRAWING_PASTE_UNAVAILABLE,type DrawingClipboardPort} from '../../src/chart/drawing-duplicate-publication';
import {drawingRouterHarness} from './drawing-command-router-harness';
import {duplicateAdapterFixture} from './drawing-duplicate-adapter-harness';
import {annotationRecord} from './trendline-annotation-native-harness';

// router copy and paste intents. Copy writes no history.
// Paste is one owned Duplicate step with fresh ids that selects the pasted drawings, never calls
// the native clipboard, and two pastes give distinct ids. Exactly one dispatcher per keystroke.
// Original native facade/core/input bodies with controlled construction-only services.
type Row=Record<string,unknown>;
const key=(name:string,extra:Record<string,unknown>={})=>({key:name,ctrlKey:true,metaKey:false,shiftKey:false,altKey:false,target:null,...extra});
function memoryClipboard():DrawingClipboardPort&{rows:Row[];pasteCalls:number}{
 const state={rows:[] as Row[],pasteCalls:0};
 return Object.assign(state,{copy(rows:readonly Row[]){state.rows=structuredClone([...rows]);},paste(known:(type:string)=>boolean){state.pasteCalls++;return {rows:structuredClone(state.rows),refused:state.rows.some(row=>!known(String(row.type)))};}});
}

describe('router copy and paste intents',()=>{
 async function routed(){
  const row=annotationRecord(),f=await drawingRouterHarness([row]);
  f.reset.dispose();f.router.dispose();
  const copied:string[][]=[],pasted:number[]=[],history:string[]=[];
  const host:DrawingCommandRouterHost={captureOwner:f.captureOwner,assertMutable(){},duplicate:(ids,assert)=>{assert();f.duplicates.push([...ids]);return f.receipt(ids);},history(direction,assert){assert();history.push(direction);},historyStatus:()=>({canUndo:true,canRedo:false}),
   copy(ids,assert){assert();copied.push([...ids]);},paste(assert){assert();pasted.push(pasted.length+1);return f.receipt(['pasted-'+pasted.length]);}};
  const router=installDrawingCommandRouter(f.paint.renderer,f.chart as unknown as Vela,host);
  return{f,row,copied,pasted,history,router,dispose(){router.dispose();f.dispose();}};
 }
 it('copy and paste intents reach the host once and never the native clipboard or native paste',async()=>{
  const t=await routed();try{
   const nativePaste=vi.spyOn(t.f.native.controller,'paste');
   t.f.paint.controller.emit({kind:'copy',ids:[t.row.id]});
   expect(t.copied).toEqual([[t.row.id]]);expect(t.f.native.controller.clipboard).toHaveLength(0);
   t.f.paint.controller.emit({kind:'paste'});
   expect(t.pasted).toEqual([1]);expect(nativePaste).not.toHaveBeenCalled();
   expect(t.history).toEqual([]);expect(t.f.duplicates).toEqual([]);// the host owns the paste step; no history dispatch from the router
  }finally{t.dispose();}
 });
 it('Ctrl+C and Ctrl+V on the canvas give exactly one copy and one paste',async()=>{
  const t=await routed();try{
   t.f.native.controller.setSelection([t.row.id]);
   expect(t.f.paint.controller.handleKey(key('c'))).toBe(true);expect(t.f.paint.controller.handleKey(key('v'))).toBe(true);
   expect(t.copied).toEqual([[t.row.id]]);expect(t.pasted).toEqual([1]);expect(t.f.native.controller.clipboard).toHaveLength(0);
  }finally{t.dispose();}
 });
 it('the facade copyToClipboard and paste methods take the same route and return the facade',async()=>{
  const t=await routed();try{
   expect(t.f.facade.copyToClipboard([t.row.id])).toBe(t.f.facade);expect(t.f.facade.paste()).toBe(t.f.facade);
   expect(t.copied).toEqual([[t.row.id]]);expect(t.pasted).toEqual([1]);expect(t.f.native.controller.clipboard).toHaveLength(0);
   expect(t.router.copy([t.row.id])).toBeUndefined();expect(t.router.paste().ids).toEqual(['pasted-2']);
  }finally{t.dispose();}
 });
 it('a copy needs bounded unique ids and a busy or retired owner refuses; the native intent for other kinds still forwards',async()=>{
  const t=await routed();try{
   for(const ids of [[],[t.row.id,t.row.id]])expect(()=>t.router.copy(ids as string[])).toThrow();
   t.f.paint.controller.emit({kind:'clone',docs:[]});expect(t.f.intents.at(-1)).toEqual({kind:'clone',docs:[]});
   expect(()=>({...t.router}).paste()).toThrow('receiver');
  }finally{t.dispose();}
 });
 it('callbacks must be supplied together, and without them the router keeps the native clipboard exactly as before',async()=>{
  const f=await drawingRouterHarness([annotationRecord()]);try{
   f.reset.dispose();f.router.dispose();
   const base:DrawingCommandRouterHost={captureOwner:f.captureOwner,assertMutable(){},duplicate:(ids,assert)=>{assert();return f.receipt(ids);},history(_d,assert){assert();},historyStatus:()=>({canUndo:false,canRedo:false})};
   expect(()=>installDrawingCommandRouter(f.paint.renderer,f.chart as unknown as Vela,{...base,copy(){}})).toThrow('together');
   const plain=installDrawingCommandRouter(f.paint.renderer,f.chart as unknown as Vela,base);
   expect(()=>plain.copy(['x'])).toThrow('unavailable');expect(()=>plain.paste()).toThrow('unavailable');
   f.paint.controller.emit({kind:'copy',ids:['synthetic-annotation']});expect(f.native.controller.clipboard).toHaveLength(1);
   plain.dispose();
  }finally{f.dispose();}
 });
});

describe('single dispatcher per keystroke',()=>{
 it.each([
  [{inChartCell:true,inTextInput:false,composing:false,chartActive:true},'router'],
  [{inChartCell:false,inTextInput:false,composing:false,chartActive:true},'app'],
  [{inChartCell:false,inTextInput:false,composing:false,chartActive:false},'ignore'],
  [{inChartCell:false,inTextInput:true,composing:false,chartActive:true},'ignore'],
  [{inChartCell:true,inTextInput:true,composing:false,chartActive:true},'ignore'],
  [{inChartCell:true,inTextInput:false,composing:true,chartActive:true},'ignore'],
 ])('focus %j is dispatched to %s',(focus,expected)=>{expect(clipboardKeyDispatcher(focus)).toBe(expected);});
});

describe('paste through the actual owned Duplicate route',()=>{
 const rows=()=>[{...annotationRecord(),id:'SYNTHETIC copy source',lvPaneBinding:{schemaVersion:1,target:{kind:'price'}}}] as never;
 async function pasting(source=rows()){
  const f=await duplicateAdapterFixture(source);f.controller.bindDrawingWorkspaceHost(f.host);
  const clipboard=memoryClipboard(),known=(type:string)=>type==='trendline';
  const route=createDrawingPasteRoute({clipboard,canonical:()=>f.f.document.all(),known,duplicate:(ids,assert)=>{assert();return f.controller.duplicateDrawings([...ids]);}});
  return{f,clipboard,route,assert:()=>{},id:(source[0] as Row).id as string};
 }
 it('copy writes no history; paste is one history step with a fresh id and selects the pasted drawing',async()=>{
  const t=await pasting();try{
   t.route.copy([t.id],t.assert);
   expect(t.f.history.status().undo).toBe(0);expect(t.clipboard.rows.map(row=>row.id)).toEqual([t.id]);expect(t.f.f.document.all()).toHaveLength(1);
   const receipt=t.route.paste(t.assert);
   expect(receipt).toMatchObject({canonicalAccepted:true,workspaceAcknowledged:true,observersComplete:true,nativeState:'complete'});
   expect(receipt.ids).toHaveLength(1);expect(receipt.ids[0]).not.toBe(t.id);
   expect(t.f.history.status().undo).toBe(1);expect(t.f.f.document.all()).toHaveLength(2);
   const all=t.f.f.document.all() as Row[],copy=all.find(row=>row.id===receipt.ids[0])!,source=all.find(row=>row.id===t.id)!;
   expect(copy.anchors).toEqual(source.anchors);// same time and price
   expect(t.f.state().selectedDrawingIds).toEqual(receipt.ids);expect(t.f.f.native.controller.clipboard).toHaveLength(0);
  }finally{t.f.dispose();}
 });
 it('two pastes give distinct ids and two history steps',async()=>{
  const t=await pasting();try{
   t.route.copy([t.id],t.assert);const first=t.route.paste(t.assert),second=t.route.paste(t.assert);
   expect(new Set([t.id,...first.ids,...second.ids]).size).toBe(3);expect(t.f.history.status().undo).toBe(2);expect(t.f.f.document.all()).toHaveLength(3);
  }finally{t.f.dispose();}
 });
 it('an unknown copied type is refused with the unavailable text and nothing changes',async()=>{
  const t=await pasting();try{
   t.clipboard.rows=[{id:t.id,type:'future-tool'}];const before=t.f.f.document.serialize();
   expect(()=>t.route.paste(t.assert)).toThrow(DRAWING_PASTE_UNAVAILABLE);expect(DRAWING_PASTE_UNAVAILABLE).toBe('Some copied drawings are not available in this chart and were not pasted.');
   expect(t.f.f.document.serialize()).toEqual(before);expect(t.f.history.status().undo).toBe(0);expect(t.f.f.native.controller.clipboard).toHaveLength(0);
  }finally{t.f.dispose();}
 });
 it('a source removed since Copy is refused, an empty clipboard says so, and a missing copy source is refused',async()=>{
  const t=await pasting();try{
   t.clipboard.rows=[{id:'gone',type:'trendline'}];expect(()=>t.route.paste(t.assert)).toThrow(DRAWING_PASTE_UNAVAILABLE);
   t.clipboard.rows=[];expect(()=>t.route.paste(t.assert)).toThrow('Nothing has been copied yet.');
   expect(()=>t.route.copy(['missing'],t.assert)).toThrow('no longer exists');expect(t.f.history.status().undo).toBe(0);
  }finally{t.f.dispose();}
 });
 it('the clipboard may return plain rows; the route reads the same list',async()=>{
  const t=await pasting();try{
   const rowsOnly:DrawingClipboardPort={copy(){},paste:()=>[{id:t.id,type:'trendline'}]};
   const route=createDrawingPasteRoute({clipboard:rowsOnly,canonical:()=>t.f.f.document.all(),known:type=>type==='trendline',duplicate:(ids,assert)=>{assert();return t.f.controller.duplicateDrawings([...ids]);}});
   expect(route.paste(()=>{}).ids).toHaveLength(1);
  }finally{t.f.dispose();}
 });
});

describe('Delete under Lock all in the router',()=>{
 it('retires the native delete intent, including a single locked selection that vela itself would delete, and forwards it otherwise',async()=>{
  const row=annotationRecord(),f=await drawingRouterHarness([row]);
  try{
   f.reset.dispose();f.router.dispose();let locked=true;
   const host:DrawingCommandRouterHost={captureOwner:f.captureOwner,assertMutable(){},duplicate:(ids,assert)=>{assert();return f.receipt(ids);},history(_d,assert){assert();},historyStatus:()=>({canUndo:false,canRedo:false}),drawingsLocked:()=>locked};
   const router=installDrawingCommandRouter(f.paint.renderer,f.chart as unknown as Vela,host);
   f.paint.controller.setSelection([row.id]);
   expect(f.paint.controller.handleKey({key:'Delete',ctrlKey:false,metaKey:false,shiftKey:false,altKey:false,target:null})).toBe(true);
   expect(f.intents.some(intent=>intent.kind==='delete')).toBe(false);// vela emitted it (a single selection ignores locks); the router retired it before the native handler
   expect((f.native.controller.all() as {id:string}[]).map(item=>item.id)).toEqual([row.id]);
   locked=false;f.paint.controller.emit({kind:'delete',ids:[row.id]});expect(f.native.controller.all()).toEqual([]);
   router.dispose();
  }finally{f.dispose();}
 });
 it('the lock callback must return a boolean',async()=>{
  const f=await drawingRouterHarness([annotationRecord()]);
  try{
   f.reset.dispose();f.router.dispose();
   const host:DrawingCommandRouterHost={captureOwner:f.captureOwner,assertMutable(){},duplicate:(ids,assert)=>{assert();return f.receipt(ids);},history(_d,assert){assert();},historyStatus:()=>({canUndo:false,canRedo:false}),drawingsLocked:()=>'yes' as never};
   const router=installDrawingCommandRouter(f.paint.renderer,f.chart as unknown as Vela,host);
   expect(()=>f.paint.controller.emit({kind:'delete',ids:['synthetic-annotation']})).toThrow('boolean');
   router.dispose();
  }finally{f.dispose();}
 });
});
