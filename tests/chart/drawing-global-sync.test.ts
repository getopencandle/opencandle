import {describe,expect,it} from 'vitest';
import {applyGlobalDrawings,recordGlobalDrawingEdits,GLOBAL_TOMBSTONE,globalDrawingKey} from '../../src/chart/drawing-global-sync';
import {validateGlobalDrawings} from '../../src/chart/drawing-utility-state';

type Row=Record<string,unknown>;
const g=(id:string,price=1):Row=>({id,type:'hline',paneId:'price',lvSyncScope:'global',anchors:[{time:1,price}]});
const grid=(layout:string,cells:Record<string,{symbol:string;rows:Row[]}>)=>({layout:{id:layout,cells:Object.entries(cells).map(([id,c])=>({id,symbol:c.symbol}))},cells:Object.fromEntries(Object.entries(cells).map(([id,c])=>[id,{drawings:{version:1,drawings:c.rows}}]))});
const GME=globalDrawingKey('GME');

describe(' global drawing sync (.UTILITY.SYNC_DRAWINGS_GLOBAL)',()=>{
 it('records adds and edits of global price rows only, keyed by symbol',()=>{
  const a=grid('A',{c1:{symbol:'GME',rows:[]}}),b=grid('A',{c1:{symbol:'GME',rows:[g('x'),{id:'local',type:'hline',paneId:'price'},{...g('layout1'),lvSyncScope:'layout'}]}});
  const store=recordGlobalDrawingEdits({},a,b);expect(store).toEqual({[GME]:[g('x')]});
  const edited=grid('A',{c1:{symbol:'GME',rows:[g('x',5)]}});expect(recordGlobalDrawingEdits(store,b,edited)[GME]).toEqual([g('x',5)]);
  expect(recordGlobalDrawingEdits(store,b,b)).toBe(store);
  expect(()=>validateGlobalDrawings(store)).not.toThrow();
 });
 it('a symbol switch, another layout or a removed chart records nothing',()=>{
  const a=grid('A',{c1:{symbol:'GME',rows:[g('x')]}}),store={[GME]:[g('x')]};
  expect(recordGlobalDrawingEdits(store,a,grid('A',{c1:{symbol:'AAPL',rows:[]}}))).toBe(store);
  expect(recordGlobalDrawingEdits(store,a,grid('B',{c9:{symbol:'GME',rows:[]}}))).toBe(store);
  expect(recordGlobalDrawingEdits(store,a,grid('A',{c2:{symbol:'GME',rows:[]}}))).toBe(store);
 });
 it('applies to every same-symbol chart of an opening layout; deletes and unsync propagate (.UTILITY.DISABLE_GLOBAL_SYNC_COPIES)',()=>{
  const layoutA0=grid('A',{a1:{symbol:'GME',rows:[]}}),layoutA1=grid('A',{a1:{symbol:'GME',rows:[g('x'),g('y')]}});
  let store=recordGlobalDrawingEdits({},layoutA0,layoutA1);
  const layoutB=grid('B',{b1:{symbol:'GME',rows:[{id:'mine',type:'hline',paneId:'price'}]},b2:{symbol:'AAPL',rows:[]}});
  const opened=applyGlobalDrawings(store,layoutB);
  expect((opened.grid.cells.b1.drawings.drawings as Row[]).map(row=>row.id)).toEqual(['mine','x','y']);
  expect(opened.grid.cells.b2).toBe(layoutB.cells.b2);
  // Delete x and unsync y (stamp leaves global) in A: both copies leave B, y stays in A as a layout drawing.
  const layoutA2=grid('A',{a1:{symbol:'GME',rows:[{...g('y'),lvSyncScope:'layout'}]}});
  store=recordGlobalDrawingEdits(store,layoutA1,layoutA2);
  expect(store[GME].every(row=>row[GLOBAL_TOMBSTONE]===true)).toBe(true);
  const reopened=applyGlobalDrawings(store,opened.grid);
  expect((reopened.grid.cells.b1.drawings.drawings as Row[]).map(row=>row.id)).toEqual(['mine']);
  // Re-stamping global revives the row.
  store=recordGlobalDrawingEdits(store,layoutA2,grid('A',{a1:{symbol:'GME',rows:[g('y')]}}));
  expect(store[GME].filter(row=>row[GLOBAL_TOMBSTONE]!==true).map(row=>row.id)).toEqual(['y']);
  expect(()=>validateGlobalDrawings(store)).not.toThrow();
 });
 it('an old workspace keeps unknown stamped rows and merges them up; group membership is pruned',()=>{
  const legacy=grid('B',{b1:{symbol:'GME',rows:[g('old')]}});
  const first=applyGlobalDrawings({},legacy);expect(first.grid).toBe(legacy);expect(first.store[GME]).toEqual([g('old')]);
  const doc={version:1,drawings:[g('gone'),g('keep')],lvDrawingManager:{schemaVersion:1,groups:[{id:'g1',memberIds:['gone','keep']}],templates:[]}};
  const withGroup={layout:{id:'C',cells:[{id:'c1',symbol:'GME'}]},cells:{c1:{drawings:doc}}};
  const out=applyGlobalDrawings({[GME]:[g('keep'),{id:'gone',[GLOBAL_TOMBSTONE]:true}]},withGroup);
  expect(out.grid.cells.c1.drawings).toEqual({version:1,drawings:[g('keep')],lvDrawingManager:{schemaVersion:1,groups:[{id:'g1',memberIds:['keep']}],templates:[]}});
 });
});
