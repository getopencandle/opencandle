import {expect,it} from 'vitest';
import {fibBaselineHarness,fibBaselineRecord} from '../chart/fib-trend-line-painter-harness';

it.each(['target','native','native-settings','layout','canonical','source'] as const)('withholds the new diagonal stroke after %s loss inside the final endpoint canvas callback',async kind=>{
 const f=await fibBaselineHarness();let previous:Function|undefined;
 try{
  const row=fibBaselineRecord();f.sync([row]);
  expect(f.top.commands.some(command=>command.op==='lineTo'&&command.values[0]===400&&command.values[1]===100.00000000000001)).toBe(true);
  const ctx=f.top.ctx as Record<string,any>;previous=ctx.lineTo;let injected=0;
  ctx.lineTo=function(...args:unknown[]){
   const result=Reflect.apply(previous!,this,args);
   if(args[0]===400&&args[1]===100.00000000000001&&!injected++){
    if(kind==='target')f.controller.drawings[0].anchors[1].price+=1;
    else if(kind==='native')f.core.controller.store.get(row.id)!.anchors[1].price+=1;
    else if(kind==='native-settings'){const model=f.core.controller.store.get(row.id)!;model.applySettings({anchors:model.anchors.map((anchor:any,index:number)=>({...anchor,price:anchor.price+(index===1?1:0)}))});}
    else if(kind==='layout')f.pane.scale.max+=1;
    else if(kind==='canonical'){const changed=structuredClone(row);changed.anchors[1].price+=1;f.document.load({version:1,drawings:[changed]});}
    else f.retireSource();
   }
   return result;
  };
  f.top.commands.length=0;let error:unknown;try{f.render();}catch(cause){error=cause;}
  expect(injected).toBeGreaterThan(0);
  let diagonal=false,strokes=0;for(const command of f.top.commands){if(command.op==='beginPath')diagonal=false;if(command.op==='lineTo'&&command.values[0]===400&&command.values[1]===100.00000000000001)diagonal=true;if(command.op==='stroke'&&diagonal)strokes++;}
  // A target-model mutation has no per-operation re-proof, so the stroke completes and the frame-end graph walk refuses the frame.
  expect(strokes).toBe(kind==='target'?1:0);if(kind==='target')expect(String(error)).toMatch(/target data changed/);
  if(kind==='source')expect(f.baseline.diagnostics()).toEqual([]);
  if(error)expect(error).toBeInstanceOf(Error);
 }finally{if(previous)f.top.ctx.lineTo=previous as typeof f.top.ctx.lineTo;f.cleanup();}
});
