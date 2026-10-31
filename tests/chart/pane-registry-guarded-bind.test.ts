import {expect,it} from 'vitest';
import type {Vela,IndicatorHandle} from '@luxalgo/vela';
import {createPaneRegistry,type PaneBindingGuard} from '../../src/chart/pane-registry';

/** Controlled public pane/handle API collaborators. No source, native frame or numeric permission is supplied. */
function fixture(initial='price'){
 const rows=new Map<string,{pane:string;ownScale:boolean}>([['A',{pane:initial,ownScale:false}]]),handles=new Map<string,IndicatorHandle>(),moves:Array<{id:string;target:unknown;owned:boolean}>=[];
 let live=true,depth=0,next=1,listCalls=0,listHook:((count:number)=>void)|undefined,handlesHook:(()=>void)|undefined,moveHook:((id:string)=>void)|undefined,noop=false;
 const current=()=>{if(!live)throw Error('SYNTHETIC owner retired');};
 const guard:PaneBindingGuard={assertCurrent:current,mutate(action){current();depth++;try{action();}finally{depth--;}}};
 const add=(id:string,pane:string,ownScale=false)=>{
  rows.set(id,{pane,ownScale});const handle={id,moveTo(target:unknown){
   moves.push({id,target,owned:depth>0});moveHook?.(id);if(noop)return handle;
   const before=rows.get(id)!;if(target==='price')before.pane='price';
   else if(target&&typeof target==='object'&&'newPane' in target){before.pane='SYNTHETIC-new-'+next++;before.ownScale=false;}
   else if(target&&typeof target==='object'&&'pane' in target){before.pane=String(target.pane);before.ownScale=true;}
   return handle;
  }} as unknown as IndicatorHandle;handles.set(id,handle);return handle;
 };
 const a=add('A',initial),chart={panes:{list(){listHook?.(++listCalls);const names=[...new Set(['price',...Array.from(rows.values(),row=>row.pane)])];return names.map(id=>({id,indicators:Array.from(rows,([key,row])=>row.pane===id?{id:key,ownScale:row.ownScale}:null).filter((row):row is {id:string;ownScale:boolean}=>row!==null)}));}},indicators(){handlesHook?.();return [...handles.values()];}} as unknown as Vela;
 const registry=createPaneRegistry(chart);
 return{a,chart,registry,guard,rows,moves,add,retire(){live=false;},depth:()=>depth,setListHook(value:typeof listHook){listHook=value;},setHandlesHook(value:typeof handlesHook){handlesHook=value;},setMoveHook(value:typeof moveHook){moveHook=value;},setNoop(value:boolean){noop=value;}};
}

it('a genuine public new-pane move is confirmed before the logical binding is published',()=>{
 const f=fixture();expect(f.registry.bind(f.a,'SYNTHETIC desired',undefined,f.guard)).toBe(true);
 expect(f.rows.get('A')!.pane).toBe('SYNTHETIC-new-1');expect(f.registry.renderer('SYNTHETIC desired')).toBe('SYNTHETIC-new-1');
 expect(f.moves).toEqual([{id:'A',target:{newPane:true},owned:true}]);expect(f.depth()).toBe(0);
});
it('retirement inside a later pane lookup prevents stale native movement and logical publication',()=>{
 const f=fixture();f.add('B','SYNTHETIC old',true);f.registry.identify('SYNTHETIC desired','SYNTHETIC old');f.setListHook(count=>{if(count===2)f.retire();});
 expect(()=>f.registry.bind(f.a,'SYNTHETIC desired',undefined,f.guard)).toThrow('owner retired');
 f.setListHook(undefined);expect(f.moves).toEqual([]);expect(f.registry.renderer('SYNTHETIC desired')).toBe('SYNTHETIC old');
});
it('a move method getter that retires the owner cannot enter the native operation',()=>{
 const f=fixture(),method=f.a.moveTo;Object.defineProperty(f.a,'moveTo',{get(){f.retire();return method;}});
 expect(()=>f.registry.bind(f.a,'SYNTHETIC desired',undefined,f.guard)).toThrow('owner retired');
 expect(f.moves).toEqual([]);expect(f.depth()).toBe(0);expect(f.registry.renderer('SYNTHETIC desired')).toBeNull();
});
it('a no-op move returns false and cannot identify a nonprice logical pane as price',()=>{
 const f=fixture();f.setNoop(true);
 expect(f.registry.bind(f.a,'SYNTHETIC desired',undefined,f.guard)).toBe(false);expect(f.rows.get('A')!.pane).toBe('price');
 expect(f.registry.renderer('SYNTHETIC desired')).toBeNull();expect(f.depth()).toBe(0);
});
it('a falsy native exception is preserved and the caller owned-move marker unwinds',()=>{
 const f=fixture();f.setMoveHook(()=>{throw 0;});let caught=false,value:unknown;
 try{f.registry.bind(f.a,'SYNTHETIC desired',undefined,f.guard);}catch(error){caught=true;value=error;}
 expect(caught).toBe(true);expect(value).toBe(0);expect(f.depth()).toBe(0);expect(f.registry.renderer('SYNTHETIC desired')).toBeNull();
});
it('retirement during an entered native callback prevents subsequent logical identification',()=>{
 const f=fixture();f.setMoveHook(()=>f.retire());
 expect(()=>f.registry.bind(f.a,'SYNTHETIC desired',undefined,f.guard)).toThrow('owner retired');
 expect(f.rows.get('A')!.pane).toBe('SYNTHETIC-new-1');expect(f.registry.renderer('SYNTHETIC desired')).toBeNull();expect(f.depth()).toBe(0);
});
it('a disappeared post-move handle refuses binding rather than publishing its destination',()=>{
 const f=fixture();f.setListHook(count=>{if(count===2)f.rows.delete('A');});
 expect(f.registry.bind(f.a,'SYNTHETIC desired',undefined,f.guard)).toBe(false);f.setListHook(undefined);
 expect(f.registry.renderer('SYNTHETIC desired')).toBeNull();expect(f.depth()).toBe(0);
});
it('a shared-master restore moves only through the guard and preserves the complete member destination',()=>{
 const f=fixture(),b=f.add('B','SYNTHETIC old',true);f.registry.identify('SYNTHETIC desired','SYNTHETIC old');
 expect(f.registry.bind(f.a,'SYNTHETIC desired',false,f.guard)).toBe(true);
 expect(f.rows.get('A')).toEqual({pane:'SYNTHETIC-new-1',ownScale:false});expect(f.rows.get(b.id)).toEqual({pane:'SYNTHETIC-new-1',ownScale:true});
 expect(f.registry.renderer('SYNTHETIC desired')).toBe('SYNTHETIC-new-1');expect(f.moves.every(row=>row.owned)).toBe(true);expect(f.depth()).toBe(0);
});
it('member-handle API reentry retires the operation before it moves another pane owner',()=>{
 const f=fixture();f.add('B','SYNTHETIC old',true);f.registry.identify('SYNTHETIC desired','SYNTHETIC old');f.setHandlesHook(()=>f.retire());
 expect(()=>f.registry.bind(f.a,'SYNTHETIC desired',false,f.guard)).toThrow('owner retired');
 expect(f.rows.get('B')!.pane).toBe('SYNTHETIC old');expect(f.moves.map(row=>row.id)).toEqual(['A']);expect(f.depth()).toBe(0);
});
