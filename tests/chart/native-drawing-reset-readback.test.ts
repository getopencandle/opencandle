import {expect,it} from 'vitest';
import {createDrawing} from '@luxalgo/vela';
import {annotationRecord} from './trendline-annotation-native-harness';
import {nativeResetHarness} from './native-drawing-reset-harness';

it('actual native target creation metadata changed during held Reset cannot be accepted through canonical matcher exclusions',async()=>{
 const row=annotationRecord(false),f=await nativeResetHarness([row]);try{
  const opening=f.open();f.core.on('drawing:edited',()=>{f.core.controller.store.get(row.id).createdAt+=1;});
  expect(()=>opening.actions.resetSettings()).toThrow(/non-settings|creation|state|readback/i);
 }finally{f.dispose();}
});
it('actual held Reset detects unrelated native row edits, removal, order change and same-value object replacement',async()=>{
 for(const change of ['edit','remove','reorder','replace']){
  const rows=[annotationRecord(false),{...annotationRecord(true),id:'SYNTHETIC unrelated native drawing',zIndex:6}],f=await nativeResetHarness(rows);try{
   const opening=f.open([rows[0].id]);let changed=false;f.core.on('drawing:edited',()=>{if(changed)return;changed=true;const store=f.core.controller.store,unrelated=store.get(rows[1].id);if(change==='edit')unrelated.style.lineWidth=7;else if(change==='remove')store.byId.delete(rows[1].id);else if(change==='reorder')unrelated.zIndex=1;else store.byId.set(rows[1].id,createDrawing('trendline',rows[1] as any));});
   expect(()=>opening.actions.resetSettings(),change).toThrow(/unrelated|membership|order|identity|state|readback/i);
  }finally{f.dispose();}
 }
});
it('actual held Reset detects unrelated renderer-only paint state changes even when authoritative core rows match',async()=>{
 const rows=[annotationRecord(false),{...annotationRecord(true),id:'SYNTHETIC unrelated renderer drawing',zIndex:6}],f=await nativeResetHarness(rows);try{
  const opening=f.open([rows[0].id]);f.core.on('drawing:edited',()=>{const model=f.paint.controller.drawings.find((drawing:any)=>drawing.id===rows[1].id);model.style.lineWidth=9;});
  expect(()=>opening.actions.resetSettings()).toThrow(/renderer|state|readback/i);
 }finally{f.dispose();}
});
