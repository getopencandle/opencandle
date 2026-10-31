import {expect,it} from 'vitest';
import {drawingRouterHarness} from './drawing-command-router-harness';
import {annotationRecord} from './trendline-annotation-native-harness';
// the recorded facts (colors.textcolor #2962FF, fontsize 14, bold false, italic false, horzLabelsAlign center, vertLabelsAlign bottom): native Reset keeps the label value and restores the fresh Ray's text style.
const RAY_FACTORY_TEXT={color:'#2962FF',size:'normal',bold:false,italic:false,place:'middle',side:'above',hAlign:'center',vAlign:'bottom'};

it('actual single and multi native popup actions route through the one command and close exactly once',async()=>{
 for(const count of [1,2]){const rows=Array.from({length:count},(_,index)=>({...annotationRecord(),id:'SYNTHETIC popup '+index})),f=await drawingRouterHarness(rows);try{let closes=0;f.onClose(()=>{closes++;});const opening=f.open();opening.actions.duplicate();expect(f.duplicates).toEqual([rows.map(row=>row.id)]);expect(closes).toBe(1);expect(f.latest()).toBeNull();expect(()=>opening.actions.duplicate()).toThrow('consumed');expect(f.native.controller.all()).toEqual(rows);}finally{f.dispose();}}
});
it('all-tool popup authority protects ray Duplicate while leaving its native Reset callback unchanged',async()=>{
 const row={...annotationRecord(),type:'ray' as const},f=await drawingRouterHarness([row]),baseline=await drawingRouterHarness([row]);baseline.reset.dispose();try{const first=f.open();first.actions.duplicate();expect(f.duplicates).toEqual([[row.id]]);const second=f.open();second.actions.resetSettings();baseline.open().actions.resetSettings();expect(f.native.controller.all()).toEqual(baseline.native.controller.all());expect(f.native.controller.store.get(row.id).text).toEqual({...RAY_FACTORY_TEXT,value:row.text!.value});}finally{baseline.dispose();f.dispose();}
});
it('native Trendline Reset remains functional with router/duplicate popup installed',async()=>{
 const row=annotationRecord(false),f=await drawingRouterHarness([row]);try{f.open().actions.resetSettings();expect(f.native.controller.store.get(row.id).text).toBeUndefined();expect(Object.hasOwn(f.document.all()[0],'text')).toBe(false);expect(f.duplicates).toEqual([]);}finally{f.dispose();}
});
it('retained/copied A action rejects after popup B and does not close or change B',async()=>{
 const rows=[annotationRecord(),{...annotationRecord(),id:'SYNTHETIC popup B'}],f=await drawingRouterHarness(rows);try{const a=f.open([rows[0].id]),b=f.open([rows[1].id]);expect(()=>a.actions.duplicate()).toThrow('session');expect(f.latest()).toBe(b);expect(()=>({...b.actions}).duplicate()).toThrow('receiver');expect(f.duplicates).toEqual([]);b.actions.duplicate();expect(f.duplicates).toEqual([[rows[1].id]]);}finally{f.dispose();}
});
it('active native editor refuses before close and never invokes original implicit text finishing callback',async()=>{
 const row=annotationRecord(),f=await drawingRouterHarness([row]);try{const a=f.open();let closes=0;f.onClose(()=>{closes++;});f.paint.controller.textEditor={};expect(()=>a.actions.duplicate()).toThrow('gesture or text');expect(closes).toBe(0);expect(f.latest()).toBe(a);expect(f.duplicates).toEqual([]);f.paint.controller.textEditor=null;}finally{f.dispose();}
});
it('popup B/source retirement/editor activation during close refuses old forwarding without closing replacement',async()=>{
 for(const phase of ['popup','source','editor']){const rows=[annotationRecord(),{...annotationRecord(),id:'SYNTHETIC close B'}],f=await drawingRouterHarness(rows);try{const a=f.open([rows[0].id]);let b:any;f.onClose(()=>{if(phase==='popup'){b=f.open([rows[1].id]);throw Error('SYNTHETIC close reentry');}if(phase==='source')f.retire();if(phase==='editor')f.paint.controller.textEditor={};});expect(()=>a.actions.duplicate()).toThrow();expect(f.duplicates).toEqual([]);if(b)expect(f.latest()).toBe(b);f.paint.controller.textEditor=null;}finally{f.dispose();}}
});
it('129 native popup targets refuse before native opening/close/duplicate',async()=>{
 const rows=Array.from({length:129},(_,index)=>({...annotationRecord(),id:'SYNTHETIC popup bounded '+index})),f=await drawingRouterHarness(rows);try{let opened=0,closed=0;f.onOpen(()=>{opened++;});f.onClose(()=>{closed++;});expect(()=>f.open()).toThrow('bounded');expect(opened).toBe(0);expect(closed).toBe(0);expect(f.duplicates).toEqual([]);}finally{f.dispose();}
});
it('accepted host selection opens B legitimately without rechecking old popup action after the command returns',async()=>{
 const rows=[annotationRecord(),{...annotationRecord(),id:'SYNTHETIC accepted selection'}],f=await drawingRouterHarness(rows);try{const a=f.open([rows[0].id]);let b:any;f.setDuplicate((ids,assert)=>{assert();b=f.open([rows[1].id]);return f.receipt(ids);});expect(()=>a.actions.duplicate()).not.toThrow();expect(f.latest()).toBe(b);expect(f.native.selection()).toEqual([rows[1].id]);}finally{f.dispose();}
});
