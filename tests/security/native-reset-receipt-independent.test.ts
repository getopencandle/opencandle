import {expect,it} from 'vitest';
import {nativeResetHarness} from '../chart/native-drawing-reset-harness';
import {annotationRecord} from '../chart/trendline-annotation-native-harness';

it('popup B opened inside the first native batch event survives the old action and remains usable',async()=>{
 const rows=[annotationRecord(false),{...annotationRecord(false),id:'SYNTHETIC second reset target',zIndex:5},{...annotationRecord(true),id:'SYNTHETIC mid-batch popup owner',zIndex:6}],f=await nativeResetHarness(rows);
 try{
  const opening=f.open(rows.slice(0,2).map(row=>row.id));let replacement:any,events=0;
  f.core.on('drawing:edited',()=>{if(++events===1)replacement=f.open([rows[2].id]);});
  expect(()=>opening.actions.resetSettings()).toThrow(/session|retired|replaced|selection/i);
  expect(f.latest()).toBe(replacement);expect(f.core.selection()).toEqual([rows[2].id]);expect(f.diagnostics).toEqual([]);
  expect(f.core.controller.store.get(rows[0].id).text).toBeUndefined();expect(f.core.controller.store.get(rows[1].id).text).toBeUndefined();
  expect(f.core.controller.store.get(rows[2].id).text).toEqual(rows[2].text);
  replacement.actions.resetSettings();expect(f.core.controller.store.get(rows[2].id).text).toBeUndefined();expect(f.document.all().map(row=>row.text)).toEqual([undefined,undefined,undefined]);
  expect(f.document.undo()).toBe(true);expect(f.document.all()[2].text).toEqual(rows[2].text);expect(f.document.undo()).toBe(true);expect(f.document.all()).toEqual(rows);expect(f.document.undo()).toBe(false);
 }finally{f.dispose();}
});
