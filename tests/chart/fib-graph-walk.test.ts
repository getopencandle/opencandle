import {expect,it} from 'vitest';
import {assertOwnedFibTargetGraph,composeOwnedFibTargetProof,registerOwnedFibTrendLine,type OwnedFibTrendLineTarget} from '../../src/chart/trendline-annotation';
import {statsPainterHarness} from './trendline-stats-painter-harness';
import {fibBaselineHarness,fibBaselineRecord} from './fib-trend-line-painter-harness';

type Harness=Awaited<ReturnType<typeof statsPainterHarness>>;
type Model={style:Record<PropertyKey,unknown>;levels:{ratio:number;color:string;enabled:boolean}[]};

// These are genuine frame-owned targets from the installed annotation route.
// Abort before delegation after each focused probe; the final case also runs
// the complete owned native painter. No copied verifier supplies an oracle.
async function withTarget(action:(target:OwnedFibTrendLineTarget,model:Model,f:Harness)=>void){
 const f=await statsPainterHarness([]),stop={};let entered=false,actionFailed=false,actionError:unknown;
 const registration=registerOwnedFibTrendLine(f.renderer,{paint(){},hit(){return undefined;},paintWithLevels(target){
  if(entered)throw stop;entered=true;
  try{action(target,f.controller.drawings[0] as Model,f);}catch(error){actionFailed=true;actionError=error;}
  throw stop;
 }});
 try{
  const row=fibBaselineRecord();
  if(!row.props)throw Error('SYNTHETIC graph fixture requires properties.');
  row.props.levels=Array.from({length:24},(_,index)=>({ratio:index/10,color:'#123456',enabled:index!==23}));
  let syncFailed=false,syncError:unknown;
  try{f.sync([row]);}catch(error){if(error!==stop){syncFailed=true;syncError=error;}}
  // The native painter can diagnose or swallow its callback's exception. Move
  // assertions back outside that boundary, including a thrown undefined.
  if(actionFailed)throw actionError;if(syncFailed)throw syncError;
  expect(entered).toBe(true);
 }finally{registration.dispose();f.cleanup();}
}

it.each([new Error('SYNTHETIC retained action failure'),undefined])('the owned probe relays an action failure outside native callback handling (%s)',async failure=>{
 await expect(withTarget(()=>{throw failure;})).rejects.toBe(failure);
});

const mutations:readonly {name:string;change:(model:Model)=>()=>void;message:RegExp}[]=[
 {name:'an accessor without evaluating its getter',message:/target data changed/,change(model){
  const before=Object.getOwnPropertyDescriptor(model.style,'lineWidth');
  if(!before)throw Error('SYNTHETIC line width is required.');
  Object.defineProperty(model.style,'lineWidth',{configurable:true,enumerable:before.enumerable,get(){throw Error('SYNTHETIC accessor must not execute.');}});
  return()=>Object.defineProperty(model.style,'lineWidth',before);
 }},
 {name:'an added symbol field',message:/target fields changed/,change(model){const key=Symbol('SYNTHETIC extra field');model.style[key]=7;return()=>{delete model.style[key];};}},
 {name:'changed own-key order with identical values and flags',message:/target fields changed/,change(model){
  const descriptors=Object.getOwnPropertyDescriptors(model.style),keys=Reflect.ownKeys(descriptors);
  if(keys.length<2)throw Error('SYNTHETIC style requires distinct keys.');
  const key=keys[0];Reflect.deleteProperty(model.style,key);Object.defineProperty(model.style,key,descriptors[key as string]);
  return()=>{for(const member of Reflect.ownKeys(model.style))Reflect.deleteProperty(model.style,member);Object.defineProperties(model.style,descriptors);};
 }},
 ...(['writable','enumerable','configurable'] as const).map(flag=>({name:`changed ${flag} descriptor flag`,message:/target data changed/,change(model:Model){
  const before=Object.getOwnPropertyDescriptor(model.style,'lineWidth');
  if(!before)throw Error('SYNTHETIC line width is required.');
  // Configurable=false cannot be restored. The retired fixture is discarded.
  Object.defineProperty(model.style,'lineWidth',{...before,[flag]:!before[flag]});
  return()=>{if(flag!=='configurable')Object.defineProperty(model.style,'lineWidth',before);};
 }})),
 {name:'changed style prototype',message:/target prototype changed/,change(model){const before=Object.getPrototypeOf(model.style);Object.setPrototypeOf(model.style,Object.create(before));return()=>Object.setPrototypeOf(model.style,before);}},
 {name:'a late disabled level value',message:/target data changed/,change(model){const level=model.levels[23];if(!level||level.enabled)throw Error('SYNTHETIC disabled level23 is required.');const before=level.ratio;level.ratio+=.01;return()=>{level.ratio=before;};}},
];

it.each(mutations)('full owned graph rejects $name and stays retired',async({change,message})=>{
 await withTarget((target,model)=>{
  const proof=composeOwnedFibTargetProof(target,()=>{},()=>{});proof.local();
  const restore=change(model);
  // The full graph walk moved from every local proof to the
  // once-per-frame completion walk; the walk itself is unchanged.
  try{expect(()=>assertOwnedFibTargetGraph(target)).toThrow(message);}finally{restore();}
  expect(()=>proof.local()).toThrow(/retired/);expect(()=>proof.check()).toThrow(/retired/);
 });
});

function sameKeys(value:readonly unknown[],expected:readonly PropertyKey[]):boolean{
 if(value.length!==expected.length)return false;
 for(let index=0;index<value.length;index++)if(value[index]!==expected[index])return false;
 return true;
}

it('a substituted some getter is read once per call and receives fresh retained node callbacks with the original receiver',async()=>{
 await withTarget((target,model)=>{
  const descriptor=Object.getOwnPropertyDescriptor(Array.prototype,'some');
  if(!descriptor||typeof descriptor.value!=='function')throw Error('SYNTHETIC standard some is required.');
  const original=descriptor.value,keys=Reflect.ownKeys(model.style),retained:{callback:Function;receiver:unknown[];extraArguments:number}[]=[];
  let reads=0,calls=0;
  const replacement=function(this:unknown[],callback:Function,...rest:unknown[]){calls++;if(sameKeys(this,keys))retained.push({callback,receiver:this,extraArguments:rest.length});return Reflect.apply(original,this,[callback,...rest]);};
  try{
   Object.defineProperty(Array.prototype,'some',{configurable:descriptor.configurable,enumerable:descriptor.enumerable,get(){reads++;return replacement;}});
   assertOwnedFibTargetGraph(target);assertOwnedFibTargetGraph(target);
  }finally{Object.defineProperty(Array.prototype,'some',descriptor);}
  expect(reads).toBe(calls);expect(calls).toBeGreaterThan(0);expect(retained).toHaveLength(2);
  expect(retained[0].callback).not.toBe(retained[1].callback);
  for(const row of retained){expect(row.receiver).toEqual(keys);expect(row.extraArguments).toBe(0);expect(row.callback(keys[0],0)).toBe(false);expect(row.callback(Symbol('SYNTHETIC mismatch'),0)).toBe(true);}
 });
});

it('the builtin path preserves live prototype, keys, method lookup and each descriptor observation in order',async()=>{
 await withTarget((target,model)=>{
  const some=Object.getOwnPropertyDescriptor(Array.prototype,'some'),ownKeys=Object.getOwnPropertyDescriptor(Reflect,'ownKeys'),prototype=Object.getOwnPropertyDescriptor(Object,'getPrototypeOf'),descriptor=Object.getOwnPropertyDescriptor(Object,'getOwnPropertyDescriptor');
  if(!some||!ownKeys||!prototype||!descriptor)throw Error('SYNTHETIC providers are required.');
  const keys=Reflect.ownKeys(model.style),events:unknown[]=[];
  try{
   Object.defineProperty(Object,'getPrototypeOf',{...prototype,value:function(this:typeof Object,value:object){if(value===model.style)events.push('prototype');return Reflect.apply(prototype.value,this,[value]);}});
   Object.defineProperty(Reflect,'ownKeys',{...ownKeys,value:function(this:typeof Reflect,value:object){if(value===model.style)events.push('keys');return Reflect.apply(ownKeys.value,this,[value]);}});
   Object.defineProperty(Object,'getOwnPropertyDescriptor',{...descriptor,value:function(this:typeof Object,value:object,key:PropertyKey){if(value===model.style)events.push(['descriptor',key]);return Reflect.apply(descriptor.value,this,[value,key]);}});
   Object.defineProperty(Array.prototype,'some',{configurable:some.configurable,enumerable:some.enumerable,get(this:unknown[]){if(sameKeys(this,keys))events.push('some lookup');return some.value;}});
   assertOwnedFibTargetGraph(target);
  }finally{Object.defineProperty(Array.prototype,'some',some);Object.defineProperty(Object,'getOwnPropertyDescriptor',descriptor);Object.defineProperty(Reflect,'ownKeys',ownKeys);Object.defineProperty(Object,'getPrototypeOf',prototype);}
  expect(events).toEqual(['prototype','keys','some lookup',...keys.map(key=>['descriptor',key])]);
 });
});

it('an ownKeys provider can replace some during the walk and the actual retrieved method still gets a fresh callback',async()=>{
 await withTarget((target,model)=>{
  const some=Object.getOwnPropertyDescriptor(Array.prototype,'some'),ownKeys=Object.getOwnPropertyDescriptor(Reflect,'ownKeys');
  if(!some||!ownKeys||typeof some.value!=='function'||typeof ownKeys.value!=='function')throw Error('SYNTHETIC provider descriptors are required.');
  const keys=Reflect.ownKeys(model.style),retained:Function[]=[];let changes=0;
  const replacement=function(this:unknown[],callback:Function,...rest:unknown[]){if(sameKeys(this,keys))retained.push(callback);return Reflect.apply(some.value,this,[callback,...rest]);};
  try{
   Object.defineProperty(Reflect,'ownKeys',{...ownKeys,value:function(this:typeof Reflect,value:object){const result=Reflect.apply(ownKeys.value,this,[value]);if(value===model.style){changes++;Object.defineProperty(Array.prototype,'some',{...some,value:replacement});}return result;}});
   assertOwnedFibTargetGraph(target);assertOwnedFibTargetGraph(target);
  }finally{Object.defineProperty(Reflect,'ownKeys',ownKeys);Object.defineProperty(Array.prototype,'some',some);}
  expect(changes).toBe(2);expect(retained).toHaveLength(2);expect(retained[0]).not.toBe(retained[1]);
  expect(retained[0](keys[0],0)).toBe(false);expect(retained[1](keys[0],0)).toBe(false);
 });
});

it('unchanged owned native painter frames retain the complete command sequence',async()=>{
 const f=await fibBaselineHarness();
 try{
  const row=fibBaselineRecord();f.top.commands.length=0;f.sync([row]);const before=structuredClone(f.top.commands);
  expect(before.some(command=>command.op==='stroke')).toBe(true);expect(before.some(command=>command.op==='fillText')).toBe(true);
  f.top.commands.length=0;f.sync([structuredClone(row)]);expect(f.top.commands).toStrictEqual(before);expect(f.baseline.diagnostics()).toEqual([]);
 }finally{f.cleanup();}
});
