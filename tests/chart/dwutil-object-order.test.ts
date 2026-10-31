import {describe,expect,it} from 'vitest';
import {drawingOrderDisabled,createDrawingManager,type DrawingManagerHost} from '../../src/chart/drawing-manager';

// manager.order forward and backward swap zIndex with the
// adjacent drawing of the same pane through host update in one transaction, and the context menu
// gets the disabled flags of VDL#series.moreMenu (Bring to front and Bring forward disabled at
// the front, Send to back and Send backward disabled at the bottom). Synthetic rows; manager port only.
type Row=Record<string,unknown>;
const row=(id:string,zIndex:number|undefined,paneId='price',type='trendline'):Row=>({id,type,paneId,...(zIndex===undefined?{}:{zIndex}),anchors:[{time:1,price:1},{time:2,price:2}]});
function fixture(rows:Row[]){
 let doc:Row={version:1,drawings:rows};const updates:string[][]=[],log:string[]=[];let transactions=0,changed=0,failUpdate=false;
 const host:DrawingManagerHost={read:()=>doc,write:next=>{doc=structuredClone(next);},known:type=>type!=='future',
  update:list=>{if(failUpdate)throw Error('SYNTHETIC native update failure');updates.push(list.map(item=>item.id));},remove:()=>{},select:()=>{},front:id=>log.push('front:'+id),back:id=>log.push('back:'+id),
  transaction:operation=>{const before=structuredClone(doc);transactions++;try{return operation();}catch(error){doc=before;throw error;}},changed:()=>{changed++;}};
 const port=createDrawingManager(host),z=(id:string)=>(doc.drawings as Row[]).find(item=>item.id===id)?.zIndex;
 return{port,doc:()=>doc,updates,log,transactions:()=>transactions,changed:()=>changed,z,json:(ids:string[])=>JSON.stringify(ids.map(id=>(doc.drawings as Row[]).find(item=>item.id===id))),fail:()=>{failUpdate=true;}};
}
const base=()=>[row('a',1),row('b',2),row('c',3),row('o',2,'other'),row('x',2,'price','future')];

describe('order forward and backward',()=>{
 it('forward swaps zIndex with the adjacent drawing above in one transaction and one change, touching only the pair',()=>{
  const f=fixture(base()),before=f.json(['c','o','x']);
  f.port.order(['a'],'forward');
  expect([f.z('a'),f.z('b'),f.z('c')]).toEqual([2,1,3]);expect(f.updates).toEqual([['a','b']]);expect(f.transactions()).toBe(1);expect(f.changed()).toBe(1);
  expect(f.json(['c','o','x'])).toBe(before);// unrelated rows, other panes and the opaque future row are byte-identical
  expect(f.log).toEqual([]);// no front/back host call: one updateMany carries the whole swap
 });
 it('backward swaps with the adjacent drawing below',()=>{
  const f=fixture(base());f.port.order(['c'],'backward');expect([f.z('a'),f.z('b'),f.z('c')]).toEqual([1,3,2]);expect(f.updates).toEqual([['b','c']]);
 });
 it('the set of zIndex values is preserved, so a boundary zIndex such as a series level is never crossed',()=>{
  const f=fixture(base()),before=(f.doc().drawings as Row[]).map(item=>item.zIndex).filter(value=>value!==undefined).sort();
  f.port.order(['b'],'forward');f.port.order(['b'],'backward');f.port.order(['a'],'forward');
  expect((f.doc().drawings as Row[]).map(item=>item.zIndex).filter(value=>value!==undefined).sort()).toEqual(before);
 });
 it('at the top forward does nothing, and at the bottom backward does nothing, with no transaction',()=>{
  const f=fixture(base());f.port.order(['c'],'forward');f.port.order(['a'],'backward');
  expect(f.transactions()).toBe(0);expect(f.changed()).toBe(0);expect(f.updates).toEqual([]);expect(f.z('c')).toBe(3);expect(f.z('a')).toBe(1);
 });
 it('a selection moves as a block and never swaps with its own members',()=>{
  const f=fixture([row('a',1),row('b',2),row('c',3),row('d',4)]);f.port.order(['a','b'],'forward');
  expect(['a','b','c','d'].map(id=>f.z(id))).toEqual([2,3,1,4]);// block above c: c drops below, a and b keep their relative order
  expect(f.updates).toEqual([['a','b','c']]);
 });
 it('an opaque drawing is never an adjacent partner and an opaque selection is refused',()=>{
  const f=fixture([row('a',1),row('x',2,'price','future'),row('c',3)]);f.port.order(['a'],'forward');
  expect(f.z('a')).toBe(3);expect(f.z('c')).toBe(1);expect(f.z('x')).toBe(2);
  expect(()=>f.port.order(['x'],'forward')).toThrow('no available render ordering');
 });
 it('equal zIndex values step by one so the move is still visible ',()=>{
  const f=fixture([row('a',5),row('b',5)]);f.port.order(['a'],'forward');expect(f.z('a')).toBe(6);expect(f.z('b')).toBe(5);
 });
 it('a failing native update rolls the canonical swap back and reports no change',()=>{
  const f=fixture(base()),before=JSON.stringify(f.doc());f.fail();expect(()=>f.port.order(['a'],'forward')).toThrow('SYNTHETIC native update failure');
  expect(JSON.stringify(f.doc())).toBe(before);expect(f.changed()).toBe(0);
 });
 it('front and back keep their existing host calls',()=>{
  const f=fixture(base());f.port.order(['a'],'front');f.port.order(['c'],'back');expect(f.log).toEqual(['front:a','back:c']);
 });
});

describe('visual order disabled flags',()=>{
 const rows=base();
 it.each([
  [['c'],{front:true,forward:true,backward:false,back:false}],
  [['a'],{front:false,forward:false,backward:true,back:true}],
  [['b'],{front:false,forward:false,backward:false,back:false}],
  [['b','c'],{front:true,forward:true,backward:false,back:false}],
  [['a','b','c'],{front:true,forward:true,backward:true,back:true}],
  [['o'],{front:true,forward:true,backward:true,back:true}],
  [[],{front:false,forward:false,backward:false,back:false}],
 ])('selection %j',(ids,expected)=>{
  expect(drawingOrderDisabled(rows.filter(item=>item.type!=='future'),ids)).toEqual(expected);
 });
 it('the manager exposes the same flags and ignores opaque rows',()=>{
  const f=fixture(base());expect(f.port.orderState(['c'])).toEqual({front:true,forward:true,backward:false,back:false});
 });
});
