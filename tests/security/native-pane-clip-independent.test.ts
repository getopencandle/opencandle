import {expect,it} from 'vitest';
import {fibBaselineHarness,fibBaselineRecord} from '../chart/fib-trend-line-painter-harness';
import {nativeFibTrendLineDefaults} from '../../src/chart/fib-level-format-native';

it('actual installed annotation clip and Fib band each close their acquired ordinal after source loss, then a fresh owned frame paints',async()=>{
 const f=await fibBaselineHarness();
 const ctx=f.top.ctx,save=ctx.save,restore=ctx.restore,clip=ctx.clip,setTransform=ctx.setTransform,alphaDescriptor=Object.getOwnPropertyDescriptor(ctx,'globalAlpha');
 let alpha=.8,next=0,clipState='SYNTHETIC outer clip',transform:unknown[]=[];
 const active:number[]=[],closed:number[]=[],saved:{id:number;clip:string;transform:unknown[]}[]=[];
 let armed=false,injected=0,cut=0;let faultOrdinals:number[]=[];
 ctx.save=function(){const id=++next;active.push(id);saved.push({id,clip:clipState,transform:transform.slice()});return Reflect.apply(save,this,[]);};
 ctx.restore=function(){const result=Reflect.apply(restore,this,[]),prior=saved.pop();if(prior){if(active.pop()!==prior.id)throw Error('SYNTHETIC ordinal tracker mismatch');closed.push(prior.id);clipState=prior.clip;transform=prior.transform;}return result;};
 ctx.clip=function(...args:unknown[]){const result=Reflect.apply(clip,this,args);clipState='SYNTHETIC native pane clip';return result;};
 ctx.setTransform=function(...args:unknown[]){const result=Reflect.apply(setTransform,this,args);transform=args.slice();return result;};
 Object.defineProperty(ctx,'globalAlpha',{configurable:true,enumerable:true,get(){return alpha;},set(value){alpha=value;if(armed&&value===.4&&!injected++){faultOrdinals=active.slice(-3);cut=f.top.commands.length;f.retireSource();}}});
 try{
  const row=fibBaselineRecord();row.props={...row.props,lvFibTrendLine:{...nativeFibTrendLineDefaults(),enabled:false},lvFibBackground:{schemaVersion:1,opacity:50},lvFibText:{schemaVersion:1,enabled:true,position:'center'}};
  f.sync([row]);expect(f.top.commands.filter(command=>command.op==='fillRect')).toHaveLength(1);expect(f.top.commands.filter(command=>command.op==='stroke')).toHaveLength(2);expect(active).toStrictEqual([]);
  const initial={alpha,clip:clipState,transform:transform.slice()};ctx.save();const outer=active[0];
  armed=true;f.top.commands.length=0;let failed=false,error:unknown;try{f.render();}catch(cause){failed=true;error=cause;}
  expect(injected).toBe(1);expect(failed).toBe(true);expect(error).toBeInstanceOf(Error);expect(faultOrdinals).toHaveLength(3);
  expect(f.top.commands.slice(cut).filter(command=>['fillRect','stroke','fillText'].includes(command.op))).toStrictEqual([]);
  // The positive original fails here: band and clip close, annotation remains.
  // No extra compensating restore occurs before these ownership assertions.
  expect(active).toStrictEqual([outer]);
  for(const id of faultOrdinals)expect(closed.filter(value=>value===id)).toHaveLength(1);
  expect({alpha,clip:clipState,transform}).toStrictEqual(initial);
  armed=false;f.top.commands.length=0;f.sync([structuredClone(row)]);
  expect(f.top.commands.filter(command=>command.op==='fillRect')).toHaveLength(1);expect(f.top.commands.filter(command=>command.op==='stroke')).toHaveLength(2);expect(f.top.commands.filter(command=>command.op==='fillText')).toHaveLength(3);
  expect(active).toStrictEqual([outer]);expect({alpha,clip:clipState,transform}).toStrictEqual(initial);ctx.restore();expect(active).toStrictEqual([]);
  // Synthetic state/ordinal context with actual installed native/annotation/Fib
  // bodies. No pixels, highlights, below-series slices or arbitrary inner leak
  // recovery is inferred from this deliberately bounded path.
 }finally{
  ctx.save=save;ctx.restore=restore;ctx.clip=clip;ctx.setTransform=setTransform;if(alphaDescriptor)Object.defineProperty(ctx,'globalAlpha',alphaDescriptor);f.cleanup();
 }
});
