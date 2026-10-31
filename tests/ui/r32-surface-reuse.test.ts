// The helpers that keep the last surfaces off the live tick (src/ui/surface-reuse.ts) and the object tree's
// kept element in its widget. SYNTHETIC test values only.
import {describe,expect,it,vi} from 'vitest';
import {holdWhile,keepLiveIdentity,liveIdentityKey,onceWhile,stableProps,surfaceCaches} from '../../src/ui/surface-reuse';
import {ObjectTreePanel} from '../../src/ui/ObjectTreePanel';
import {ObjectTreeDataWindowWidget} from '../../src/ui/ObjectTreePanelWidget';
import type {BarDataset} from '../../src/domain/types';

const hooks=vi.hoisted(()=>({cells:[] as any[],cursor:0}));
vi.mock('react',async()=>{
 const actual=await vi.importActual<any>('react');
 const memo=(fn:()=>any,deps:any[])=>{const index=hooks.cursor++,old=hooks.cells[index];if(!old||deps.some((v,i)=>!Object.is(v,old.deps[i])))hooks.cells[index]={deps,value:fn()};return hooks.cells[index].value;};
 return {...actual,
  useState:(initial:any)=>{const index=hooks.cursor++;if(!(index in hooks.cells))hooks.cells[index]=typeof initial==='function'?initial():initial;return[hooks.cells[index],(value:any)=>{hooks.cells[index]=typeof value==='function'?value(hooks.cells[index]):value;}];},
  useRef:(initial:any)=>{const index=hooks.cursor++;if(!(index in hooks.cells))hooks.cells[index]={current:initial};return hooks.cells[index];},
  useMemo:memo,useCallback:(fn:any,deps:any[])=>memo(()=>fn,deps)};
});

function dataset(id:string,closes:number[],extra:Partial<BarDataset['provenance']>={}):BarDataset{
 return{instrument:{id:'SYNTH:'+id,symbol:id,name:'SYNTHETIC '+id,exchange:'SYNTH',assetClass:'crypto',currency:'USD',timezone:'UTC',tickSize:0.01,lotSize:1} as BarDataset['instrument'],resolution:'1D',
  bars:closes.map((close,index)=>({time:86_400*(index+1),open:close,high:close,low:close,close,volume:1})),
  provenance:{providerId:'coinbase',providerName:'SYNTHETIC feed',datasetId:id,fixture:true,coverage:'test',asOf:closes.length,delaySeconds:0,adjustment:'raw',session:'regular',timezone:'UTC',state:'ready',license:'test',revision:'r1',notes:[],...extra} as BarDataset['provenance']} as BarDataset;
}

describe('keepLiveIdentity',()=>{
 it('keeps one object while a live feed only grows; any identity change hands the new dataset',()=>{
  const cell={dataset:null,key:''},first=dataset('live:coinbase:BTC-USD:1D',[1,2]);
  expect(keepLiveIdentity(cell,first)).toBe(first);
  expect(keepLiveIdentity(cell,dataset('live:coinbase:BTC-USD:1D',[1,2,3]))).toBe(first);
  const stale=dataset('live:coinbase:BTC-USD:1D',[1,2,3],{state:'stale'});
  expect(keepLiveIdentity(cell,stale)).toBe(stale);
  expect(liveIdentityKey(stale)).not.toBe(liveIdentityKey(first));
 });
 it('passes every non-live dataset through (its bars can matter to the interval dialog)',()=>{
  const cell={dataset:null,key:''},a=dataset('demo',[1]),b=dataset('demo',[1,2]);
  expect(keepLiveIdentity(cell,a)).toBe(a);expect(keepLiveIdentity(cell,b)).toBe(b);
 });
});

describe('stableProps',()=>{
 it('keeps the object while its values are equal (plain data by content) and forwards handlers to the newest one',()=>{
  const cache=new Map(),calls:string[]=[];
  const first=stableProps(cache,'slot',{flag:true,list:['A'],run:()=>calls.push('first')});
  const second=stableProps(cache,'slot',{flag:true,list:['A'],run:()=>calls.push('second')});
  expect(second).toBe(first);second.run();expect(calls).toEqual(['second']);
  const third=stableProps(cache,'slot',{flag:false,list:['A'],run:()=>calls.push('third')});
  expect(third).not.toBe(first);
  // A replaced object keeps calling its own last closure.
  first.run();third.run();expect(calls).toEqual(['second','second','third']);
 });
 it('compares objects that hold functions by identity, and rebuilds when deps change',()=>{
  const cache=new Map(),bridgeA={call:()=>1},bridgeB={call:()=>2};
  const a=stableProps(cache,'slot',{bridge:bridgeA});
  expect(stableProps(cache,'slot',{bridge:bridgeB})).not.toBe(a);
  const b=stableProps(cache,'other',{value:1},['x']);
  expect(stableProps(cache,'other',{value:1},['x'])).toBe(b);
  expect(stableProps(cache,'other',{value:1},['y'])).not.toBe(b);
 });
});

describe('holdWhile and onceWhile',()=>{
 it('holds the value while hold is true and takes the new one when it ends',()=>{
  const cell={value:undefined,set:false};
  expect(holdWhile(cell,true,'a')).toBe('a');expect(holdWhile(cell,true,'b')).toBe('a');expect(holdWhile(cell,false,'c')).toBe('c');
  // With a sameness rule, a different input is never held.
  expect(holdWhile(cell,true,'cz',(kept,next)=>kept[0]===next[0])).toBe('c');expect(holdWhile(cell,true,'e',(kept,next)=>kept===next)).toBe('e');
 });
 it('computes once per dependency list',()=>{
  const cell={deps:null,value:undefined},make=vi.fn(()=>({read:true}));
  const one=onceWhile(cell,['owner',1],make);expect(onceWhile(cell,['owner',1],make)).toBe(one);
  expect(onceWhile(cell,['owner',2],make)).not.toBe(one);expect(make).toHaveBeenCalledTimes(2);
 });
 it('gives each owner its own caches',()=>{const a={},b={};expect(surfaceCaches(a)).toBe(surfaceCaches(a));expect(surfaceCaches(a)).not.toBe(surfaceCaches(b));});
});

describe('ObjectTreeDataWindowWidget',()=>{
 const find=(node:any,type:any):any=>{if(Array.isArray(node)){for(const child of node){const found=find(child,type);if(found)return found;}return null;}if(!node?.props)return null;if(node.type===type)return node;return find(node.props.children,type);};
 it('keeps the object tree element while its props object is the same; the data window still gets new bars',()=>{
  hooks.cells=[];const objectTree={chart:null,dataset:dataset('live:coinbase:BTC-USD:1D',[1]),onSelectionChange:vi.fn()} as any;
  const render=(bars:number[])=>{hooks.cursor=0;return ObjectTreeDataWindowWidget({tab:'object_tree',objectTree,dataWindow:{chart:null,dataset:objectTree.dataset,bars:bars.map(close=>({time:close,open:close,high:close,low:close,close,volume:1}))} as any});};
  const first=find(render([1]),ObjectTreePanel),second=render([1,2]);
  expect(find(second,ObjectTreePanel)).toBe(first);
  find(second,ObjectTreePanel).props.onSelectionChange(['series']);expect(objectTree.onSelectionChange).toHaveBeenCalledWith(['series']);
  hooks.cursor=0;const changed=ObjectTreeDataWindowWidget({tab:'object_tree',objectTree:{...objectTree},dataWindow:{chart:null,dataset:objectTree.dataset,bars:[]} as any});
  expect(find(changed,ObjectTreePanel)).not.toBe(first);
 });
});
