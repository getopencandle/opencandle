import {expect,it} from 'vitest';
import {installNativeDrawingReset} from '../../src/chart/native-drawing-reset';
import {nativeResetHarness} from '../chart/native-drawing-reset-harness';
import {annotationRecord} from '../chart/trendline-annotation-native-harness';

it('partial popup wrapper installation that writes then throws is rolled back without leaving a poisoned native method',async()=>{
 const f=await nativeResetHarness([annotationRecord(false)]);f.reset.dispose();const popup=f.popup;let attempted=false,helper:ReturnType<typeof installNativeDrawingReset>|undefined;
 const proxy=new Proxy(popup,{defineProperty(target,key,descriptor){if(key==='open'&&!attempted){attempted=true;Reflect.defineProperty(target,key,descriptor);throw Error('Independent popup write failed after mutation');}return Reflect.defineProperty(target,key,descriptor);}});
 f.paint.controller.popup=proxy;
 try{
  expect(()=>{helper=installNativeDrawingReset(f.paint.renderer,f.chart as any,{document:f.document,captureOwner:f.captureOwner,assertMutable:()=>{},publish:f.publishDefault,unavailable:message=>f.diagnostics.push(message)});}).toThrow(/write failed/);
  expect(attempted).toBe(true);expect(Object.hasOwn(popup,'open')).toBe(false);
  for(const key of ['openSettingsById','openSettingsForSelection','emit'])expect(Object.hasOwn(f.paint.controller,key),key).toBe(false);
 }finally{helper?.dispose();f.dispose();}
});
it('native popup callback retired before reset performs no preview, publication, history or replacement quarantine',async()=>{
 const row=annotationRecord(false),f=await nativeResetHarness([row]);try{
  const opening=f.open(),before=f.document.serialize(),native=f.core.controller.all(),commands=f.paint.top.commands.length;
  f.retire();expect(()=>opening.actions.resetSettings()).toThrow();expect(f.document.serialize()).toEqual(before);expect(f.core.controller.all()).toEqual(native);expect(f.core.controller.canUndo()).toBe(false);expect(f.document.undo()).toBe(false);expect(f.paint.top.commands).toHaveLength(commands);expect(f.diagnostics).toEqual([]);
 }finally{f.dispose();}
});
it('forwarding cannot borrow a replaced canonical batch while preserving old source identity',async()=>{
 const row=annotationRecord(false),f=await nativeResetHarness([row]);try{
  f.setPublish(batch=>f.document.atomic(()=>{f.document.stageEditedRecords(batch.expected,batch.next);const altered=f.document.serialize();(altered.drawings as any[])[0].anchors[0].price+=1;f.document.load(altered);batch.forward(()=>{});}));
  expect(()=>f.open().actions.resetSettings()).toThrow(/staged|recovery|changed/);expect(f.core.controller.all()).toEqual([row]);expect(f.document.all()).toEqual([row]);expect(f.core.controller.canUndo()).toBe(false);expect(f.document.undo()).toBe(false);
 }finally{f.dispose();}
});
it('a retained native Reset callback cannot act after a different popup opening replaced its session',async()=>{
 const rows=[annotationRecord(false),{...annotationRecord(true),id:'SYNTHETIC new popup owner'}],f=await nativeResetHarness(rows);try{
  const old=f.open([rows[0].id]),replacement=f.open([rows[1].id]),before=f.document.serialize(),native=f.core.controller.all();
  expect(()=>old.actions.resetSettings()).toThrow(/retired|opening|popup|changed|replaced/i);expect(f.document.serialize()).toEqual(before);expect(f.core.controller.all()).toEqual(native);expect(f.core.controller.canUndo()).toBe(false);expect(f.document.undo()).toBe(false);expect(f.latest()).toBe(replacement);
  replacement.actions.resetSettings();expect(f.core.controller.store.get(rows[0].id).text).toEqual(rows[0].text);expect(f.core.controller.store.get(rows[1].id).text).toBeUndefined();
 }finally{f.dispose();}
});
it('accepted Reset publication cannot let the old native callback tail reopen over a reentrant new popup',async()=>{
 const rows=[annotationRecord(false),{...annotationRecord(true),id:'SYNTHETIC publication replacement popup'}],f=await nativeResetHarness(rows);try{
  const opening=f.open([rows[0].id]);let replacement:any;
  f.setPublish(batch=>{f.publishDefault(batch);replacement=f.open([rows[1].id]);});
  expect(()=>opening.actions.resetSettings()).toThrow(/session|retired|replaced|recovery|changed/i);
  expect(f.core.controller.store.get(rows[0].id).text).toBeUndefined();expect(f.core.controller.store.get(rows[1].id).text).toEqual(rows[1].text);
  expect(f.document.all()[0].text).toBeUndefined();expect(f.latest()).toBe(replacement);expect(f.core.selection()).toEqual([rows[1].id]);expect(f.diagnostics).toEqual([]);
 }finally{f.dispose();}
});
