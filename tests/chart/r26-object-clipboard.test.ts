import {describe,expect,it,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {createObjectClipboard,sharedObjectClipboard,pasteRouteFor,preparePastedRows,stackingFloor,clipboardMessage,OBJECT_PASTE_UNAVAILABLE,OBJECT_PASTE_EMPTY} from '../../src/chart/drawing-object-clipboard';
import {createDrawingManager,type DrawingManagerHost} from '../../src/chart/drawing-manager';
import {defaultDrawingUtility} from '../../src/chart/drawing-utility-state';

// The window's shared drawing clipboard (copy, cut, cross-chart paste), the manager's one-step insert and
// move-objects (group change plus order) routes. SYNTHETIC rows; pure modules and the manager port with a recording host.
type Row=Record<string,unknown>;
const row=(id:string,extra:Row={}):Row=>({id,type:'trendline',paneId:'price',anchors:[{time:1000,price:100}],style:{lineColor:'#123456'},zIndex:1,...extra});

describe('shared object clipboard',()=>{
 it('copy keeps a frozen deep snapshot with its origin and cut flag; the window has one shared instance',()=>{
  const clip=createObjectClipboard(),owner={},source=[row('a')];
  expect(clip.read()).toBeNull();expect(clip.size()).toBe(0);
  clip.copy(source,{owner,symbol:'SYNTH'},true);source[0].id='changed';
  const held=clip.read()!;expect(held.rows.map(item=>item.id)).toEqual(['a']);expect(held.cut).toBe(true);expect(held.origin).toEqual({owner,symbol:'SYNTH'});
  expect(Object.isFrozen(held.rows[0])).toBe(true);expect(clip.size()).toBe(1);
  expect(()=>clip.copy([],{owner,symbol:null})).toThrow();expect(()=>clip.copy([{id:1} as never],{owner,symbol:null})).toThrow();
  expect(()=>clip.copy(Array.from({length:129},(_,index)=>row('r'+index)),{owner,symbol:null})).toThrow();
  clip.clear();expect(clip.read()).toBeNull();
  expect(typeof sharedObjectClipboard.copy).toBe('function');
 });
 it('route: the same chart with every source present duplicates; a cut or another chart inserts',()=>{
  const owner={},other={},clip=createObjectClipboard();
  clip.copy([row('a'),row('b')],{owner,symbol:null});
  expect(pasteRouteFor(clip.read()!,owner,new Set(['a','b','c']))).toBe('duplicate');
  expect(pasteRouteFor(clip.read()!,owner,new Set(['a']))).toBe('insert');
  expect(pasteRouteFor(clip.read()!,other,new Set(['a','b']))).toBe('insert');
  clip.copy([row('a')],{owner,symbol:null},true);expect(pasteRouteFor(clip.read()!,owner,new Set(['a']))).toBe('insert');
 });
 it('prepared rows: fresh ids, stacked above the floor in copy order, same anchors, target sync stamp',()=>{
  let n=0;const ids=['taken','x1','x2'];
  const out=preparePastedRows([row('a',{lvSyncScope:'global'}),row('b',{zIndex:9})],{occupied:new Set(['taken','a']),makeId:()=>ids[n++]??'z'+n,floor:7.2,known:type=>type==='trendline'});
  expect(out.map(item=>[item.id,item.zIndex])).toEqual([['x1',9],['x2',10]]);
  expect(out[0].anchors).toEqual([{time:1000,price:100}]);expect('lvSyncScope' in out[0]).toBe(false);
  const stamped=preparePastedRows([row('a')],{occupied:new Set(),makeId:()=>'s1',floor:0,known:()=>true,utility:{...defaultDrawingUtility(),syncOn:true,syncMode:'layout'}});
  expect(stamped[0].id).toBe('s1');expect(stamped[0].lvSyncScope).toBe('layout');
  expect(()=>preparePastedRows([row('a',{type:'unknown'})],{occupied:new Set(),makeId:()=>'q',floor:0,known:type=>type==='trendline'})).toThrow(OBJECT_PASTE_UNAVAILABLE);
  expect(()=>preparePastedRows([],{occupied:new Set(),makeId:()=>'q',floor:0,known:()=>true})).toThrow(OBJECT_PASTE_EMPTY);
  expect(()=>preparePastedRows([row('a')],{occupied:new Set(['q']),makeId:()=>'q',floor:0,known:()=>true})).toThrow('collided');
  expect(stackingFloor([row('a',{zIndex:3}),row('b',{zIndex:'x'}),row('c',{zIndex:5})])).toBe(5);expect(stackingFloor([])).toBe(0);
  expect(clipboardMessage(1,true)).toBe('Drawing cut. Press Ctrl+V to paste it.');expect(clipboardMessage(3,false)).toBe('3 drawings copied. Press Ctrl+V to paste them.');
 });
});

function managerHost(rows:Row[],withInsert=true){
 let doc:Row={version:1,drawings:rows};const calls:string[]=[];
 const host:DrawingManagerHost={read:()=>doc,write:next=>{calls.push('write');doc=structuredClone(next);},known:type=>type==='trendline',update:()=>{calls.push('update');},remove:ids=>{calls.push('remove:'+ids.join(','));},select:ids=>{calls.push('select:'+ids.join(','));},
  front:id=>{calls.push('front:'+id);},back:id=>{calls.push('back:'+id);},transaction:operation=>{calls.push('begin');const result=operation();calls.push('end');return result;},changed:()=>{calls.push('changed');},
  ...(withInsert?{insert:(next:Row)=>{calls.push('insert');doc=structuredClone(next);}}:{})};
 return{manager:createDrawingManager(host),calls,doc:()=>doc};
}
describe('manager insert and move objects (one transaction = one workspace step)',()=>{
 it('insert appends the rows in one transaction, publishes once and selects them',()=>{
  const t=managerHost([row('a')]);
  expect(t.manager.insert([row('p1'),row('p2')])).toEqual(['p1','p2']);
  expect(t.calls).toEqual(['begin','insert','changed','end','select:p1,p2']);
  expect((t.doc().drawings as Row[]).map(item=>item.id)).toEqual(['a','p1','p2']);
 });
 it('insert refuses taken ids, unknown types, empty input and a host without an insert route',()=>{
  const t=managerHost([row('a')]);
  expect(()=>t.manager.insert([row('a')])).toThrow('collide');expect(()=>t.manager.insert([row('p'),row('p')])).toThrow('collide');
  expect(()=>t.manager.insert([row('p',{type:'mystery'})])).toThrow('not available');expect(()=>t.manager.insert([])).toThrow();
  expect(t.calls).toEqual([]);
  expect(()=>managerHost([row('a')],false).manager.insert([row('p')])).toThrow('unavailable');
 });
 it('moveObjects regroups and reorders in ONE transaction; an emptied group is dropped, an already empty one kept',()=>{
  const t=managerHost([row('a'),row('b'),row('c')]);
  const g1=t.manager.group(['a'],'G1'),g2=t.manager.group(['b'],'G2');t.calls.length=0;
  expect(t.manager.moveObjects(['a'],g2,['a'])).toBe(true);
  expect(t.calls).toEqual(['begin','write','front:a','changed','end']);
  expect(t.manager.state().groups.map(group=>[group.id,group.memberIds])).toEqual([[g2,['b','a']]]);
  t.calls.length=0;expect(t.manager.moveObjects(['a'],g2,[])).toBe(false);expect(t.calls).toEqual([]);// no change, no step
  expect(t.manager.assignGroup(['a','b'],null)).toBe(true);expect(t.manager.state().groups).toEqual([]);
  expect(()=>t.manager.moveObjects(['a'],'missing',[])).toThrow('Unknown drawing group');void g1;
 });
});

describe('adapter wiring (source assertions)',()=>{
 const adapter=readFileSync('src/chart/adapter.ts','utf8');
 it('the clipboard is the shared one, paste falls back to an insert step, and Cut refuses under Lock all drawings',()=>{
  expect(adapter).not.toContain('let copiedDrawings');
  expect(adapter).toContain("paste:assert=>pasteOrInsert(assert)");
  expect(adapter).toContain("pasteRouteFor(held,document,new Set(document.ids()))==='insert'?insertSnapshot(held,assert):pasteRoute.paste(assert)");
  expect(adapter).toContain("insert:next=>{managerNativeTouched=true;restore(next);}");
  expect(adapter).toMatch(/cutDrawings:\(ids:readonly string\[\]\)=>\{if\(drawingUtilityState\?\.drawingsLocked===true\)throw/);
 });
});
void vi;
