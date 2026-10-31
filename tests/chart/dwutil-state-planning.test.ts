import {describe,expect,it} from 'vitest';
import {defaultDrawingUtility,freshDrawingUtility,planRemove,removeCountsFor,effectiveDrawingLocked,eraserMayRemove,createUnhideUnlock,unhideUnlockStep,validateGlobalDrawings,stampLegacyRows,GLOBAL_DRAWINGS_LIMITS,REMOVE_HISTORY_LABEL} from '../../src/chart/drawing-utility-state';
const rows=[{id:'a',type:'trendline'},{id:'b',type:'hline',locked:true},{id:'c',type:'box',visible:false}];
describe(' remove planning (DD-11, DD-28)',()=>{
 it('locked kept while the preference is off, removed when on',()=>{
  const u=defaultDrawingUtility();
  expect(planRemove({rows,indicatorIds:['i1'],utility:u,scope:'drawings'})).toEqual({drawingIds:['a','c'],keptLockedIds:['b'],indicatorIds:[],historyLabel:REMOVE_HISTORY_LABEL});
  expect(planRemove({rows,indicatorIds:['i1'],utility:{...u,removeLocked:true},scope:'drawings'}).drawingIds).toEqual(['a','b','c']);
 });
 it('overlay lock protects every row unless removeLocked',()=>{
  const u={...defaultDrawingUtility(),drawingsLocked:true};
  expect(planRemove({rows,indicatorIds:[],utility:u,scope:'drawings'}).drawingIds).toEqual([]);expect(planRemove({rows,indicatorIds:[],utility:u,scope:'drawings'}).keptLockedIds).toEqual(['a','b','c']);
  expect(planRemove({rows,indicatorIds:[],utility:{...u,removeLocked:true},scope:'drawings'}).drawingIds).toEqual(['a','b','c']);
 });
 it('scopes: indicators and all; counts follow the preference',()=>{
  const u=defaultDrawingUtility();
  expect(planRemove({rows,indicatorIds:['i1','i2'],utility:u,scope:'indicators'})).toMatchObject({drawingIds:[],indicatorIds:['i1','i2']});
  expect(planRemove({rows,indicatorIds:['i1','i2'],utility:u,scope:'all'})).toMatchObject({drawingIds:['a','c'],indicatorIds:['i1','i2'],historyLabel:'remove objects'});
  expect(removeCountsFor({rows,indicatorIds:['i1'],utility:u})).toEqual({drawings:2,indicators:1,removeLocked:false});
  expect(removeCountsFor({rows,indicatorIds:['i1'],utility:{...u,removeLocked:true}})).toEqual({drawings:3,indicators:1,removeLocked:true});
 });
 it('eraser treats every drawing as locked under drawing lock (DD-6)',()=>{
  const u=defaultDrawingUtility();expect(effectiveDrawingLocked(rows[0],u)).toBe(false);expect(effectiveDrawingLocked(rows[1],u)).toBe(true);
  expect(effectiveDrawingLocked(rows[0],{...u,drawingsLocked:true})).toBe(true);expect(eraserMayRemove(rows[0],{...u,drawingsLocked:true})).toBe(false);expect(eraserMayRemove(rows[0],u)).toBe(true);
  expect(effectiveDrawingLocked(rows[0],{...u,indicatorsLocked:true})).toBe(false);
 });
});
describe(' unhide-unlock listener',()=>{
 it('first draft of a placement only, re-arms on create or cancel, clears only the drawing half',()=>{
  let s=createUnhideUnlock();const u={...defaultDrawingUtility(),drawingsLocked:true,indicatorsLocked:true,drawingsHidden:true,indicatorsHidden:true};
  let r=unhideUnlockStep(s,'draft',u);expect(r.utility).toMatchObject({drawingsLocked:false,drawingsHidden:false,indicatorsLocked:true,indicatorsHidden:true});expect(r.changed).toBe(true);
  s=r.state;const again=unhideUnlockStep(s,'draft',{...u,drawingsLocked:true});expect(again.changed).toBe(false);expect(again.utility.drawingsLocked).toBe(true);
  s=unhideUnlockStep(s,'create',u).state;r=unhideUnlockStep(s,'draft',u);expect(r.changed).toBe(true);
  s=r.state;s=unhideUnlockStep(s,'cancel',u).state;expect(unhideUnlockStep(s,'draft',u).changed).toBe(true);
  expect(unhideUnlockStep(createUnhideUnlock(),'draft',defaultDrawingUtility()).changed).toBe(false);
 });
});
describe(' globalDrawings validation (DD-21)',()=>{
 it('accepts a plain map, refuses bad shapes and caps',()=>{
  expect(GLOBAL_DRAWINGS_LIMITS).toEqual({scopeKeys:128,rows:10000});
  const ok={'{"s":1}':[{id:'a',type:'hline'}]};expect(validateGlobalDrawings(ok)).toEqual(ok);expect(validateGlobalDrawings({})).toEqual({});
  expect(()=>validateGlobalDrawings([])).toThrow();expect(()=>validateGlobalDrawings(null)).toThrow();expect(()=>validateGlobalDrawings({k:'x'})).toThrow();
  expect(()=>validateGlobalDrawings({k:[{type:'x'}]})).toThrow();expect(()=>validateGlobalDrawings({k:[{id:'a'},{id:'a'}]})).toThrow();expect(()=>validateGlobalDrawings({k:[1]})).toThrow();
  const many=Object.fromEntries(Array.from({length:129},(_,i)=>['k'+i,[]]));expect(()=>validateGlobalDrawings(many)).toThrow();
  const exactKeys=Object.fromEntries(Array.from({length:128},(_,i)=>['k'+i,[]]));expect(()=>validateGlobalDrawings(exactKeys)).not.toThrow();
  const rowsOk={a:Array.from({length:5000},(_,i)=>({id:'a'+i})),b:Array.from({length:5000},(_,i)=>({id:'b'+i}))};expect(()=>validateGlobalDrawings(rowsOk)).not.toThrow();
  expect(()=>validateGlobalDrawings({...rowsOk,c:[{id:'c'}]})).toThrow();
  expect(()=>validateGlobalDrawings(JSON.parse('{"__proto__":[{"id":"a"}]}'))).toThrow();
 });
});
describe(' legacy stamping (DD-20)',()=>{
 it('stamps once, only when drawingUtility is absent and the old flag was on',()=>{
  const r=[{id:'a'},{id:'b',lvSyncScope:'global'}];
  expect(stampLegacyRows(r,true,false)).toEqual([{id:'a',lvSyncScope:'layout'},{id:'b',lvSyncScope:'global'}]);
  expect(stampLegacyRows(r,false,false)).toEqual(r);expect(stampLegacyRows(r,true,true)).toEqual(r);
  expect(r[0]).toEqual({id:'a'});
  const once=stampLegacyRows(r,true,false);expect(stampLegacyRows(once,true,false)).toEqual(once);
 });
 it('fresh utility keeps unused exports honest',()=>{expect(freshDrawingUtility().syncOn).toBe(true);});
});
