import {it,expect} from 'vitest';
import {createRequire} from 'node:module';
import {ScriptBindingRuntime} from '../../src/ui/script-binding-runtime';
import {ScriptJobQueue,executeScriptOnBars} from '../../src/ui/script-jobs';
import type {LVBridge} from '../../electron/bridge';
import type {ChartController} from '../../src/chart/adapter';
import type {ScriptBinding} from '../../src/ui/script-library';
const require=createRequire(import.meta.url),{ScriptJobs}=require('../../electron/script-jobs.cjs');
const source='({onBar(ctx){ctx.plot("Synthetic close",ctx.bar.close,"#123456");}})';
const binding:ScriptBinding={id:'synthetic-instance',documentId:'synthetic-document',version:1,name:'Synthetic integration',source,pane:'price',visible:true,plots:{}};
const bars=[2,4,8,10].map((close,index)=>({time:1000+index,open:close,high:close+1,low:close-1,close,volume:1}));
async function until(check:()=>boolean){const deadline=Date.now()+5000;while(!check()){if(Date.now()>deadline)throw new Error('Synthetic integration did not settle.');await new Promise(resolve=>setTimeout(resolve,10));}}
function setup(){
 const jobs=new ScriptJobs(),results:any[]=[],rendered:any[]=[];
 const bridge:Pick<LVBridge,'executeScript'|'cancel'>={executeScript:input=>jobs.run(input),cancel:async({requestId})=>({ok:true,value:{cancelled:jobs.cancel(requestId)}})};
 const queue=new ScriptJobQueue(2,10);
 const port={add:(result:any,settings:any)=>{rendered.push({operation:'add',result,settings});return settings.id;},update:(id:string,result:any)=>rendered.push({operation:'update',id,result}),remove:()=>{},replaceStyles:()=>{},show:()=>{},move:()=>{},rename:()=>{}} as unknown as ChartController['scripts'];
 const runtime=new ScriptBindingRuntime(port,()=>{},value=>results.push(value),input=>executeScriptOnBars({...input,bridge,queue}));
 return{jobs,runtime,results,rendered,queue,port};
}
it('executes saved source through the actual restricted Node worker against only the supplied prefix',async()=>{
 const t=setup();try{
  t.runtime.update({bars:bars.slice(0,2),identity:'synthetic-prefix',fixture:true,bindings:[binding],ready:true});
  await until(()=>t.results.length===1);
  expect(t.results[0].result.plots[0].values.map((point:any)=>point.value)).toEqual([2,4]);expect(t.results[0].bars).toEqual(bars.slice(0,2));expect(t.results[0].barIds).toHaveLength(2);expect(t.results[0].result.provenance.kind).toBe('synthetic');
  const firstIds=t.results[0].barIds;
  t.runtime.update({bars,identity:'synthetic-prefix',fixture:true,bindings:[binding],ready:true});await until(()=>t.results.length===2);
  expect(t.results[1].result.plots[0].values.map((point:any)=>point.value)).toEqual([2,4,8,10]);expect(t.results[1].barIds.slice(0,2)).toEqual(firstIds);expect(t.rendered.filter(row=>row.operation==='add')).toHaveLength(1);
 }finally{t.runtime.dispose();t.jobs.close();}
},15000);
it('aborts all actual workers even when native removal throws for every owned instance',async()=>{
 const t=setup();let removals=0;
 try{
  const infinite={...binding,source:'({onBar(){while(true){}}})'};
  t.runtime.update({bars,identity:'synthetic-dispose',fixture:true,bindings:[infinite,{...infinite,id:'synthetic-second-instance'}],ready:true});
  await until(()=>t.jobs.active.size===2);
  t.port.remove=()=>{removals++;throw new Error('Synthetic native removal failure');};
  expect(()=>t.runtime.dispose()).not.toThrow();expect(removals).toBe(2);
  await until(()=>t.jobs.active.size===0&&t.queue.counts().running===0);
  expect(t.results).toEqual([]);expect(t.rendered).toEqual([]);
 }finally{t.runtime.dispose();t.jobs.close();}
},15000);
it('cancels actual running infinite source on replacement without committing its output or leaking a slot',async()=>{
 const t=setup();try{
  t.runtime.update({bars,identity:'synthetic-run',fixture:true,bindings:[{...binding,source:'({onBar(ctx){ctx.plot("Never committed",99);while(true){}}})'}],ready:true});
  await until(()=>t.jobs.active.size===1);
  t.runtime.update({bars,identity:'synthetic-run',fixture:true,bindings:[binding],ready:true});
  await until(()=>t.results.length===1);await until(()=>t.jobs.active.size===0&&t.queue.counts().running===0);
  expect(t.results[0].sourceCode).toBe(source);expect(t.results[0].result.plots.map((plot:any)=>plot.title)).toEqual(['Synthetic close']);expect(t.results[0].result.plots[0].values.map((point:any)=>point.value)).toEqual([2,4,8,10]);
  expect(t.rendered.filter(row=>row.operation==='add')).toHaveLength(1);
 }finally{t.runtime.dispose();t.jobs.close();}
},15000);
it('a template transaction aborts actual old work and executes only after the exact new context is committed',async()=>{
 const t=setup();try{
  const old={...binding,source:'({onBar(ctx){ctx.plot("Uncommitted synthetic",99);while(true){}}})'},replacement={...binding,id:'synthetic-template-instance'},committed={bars:bars.slice(0,2),identity:'synthetic-template-committed',fixture:true,bindings:[replacement],ready:true};
  t.runtime.update({bars,identity:'synthetic-before-template',fixture:true,bindings:[old],ready:true});await until(()=>t.jobs.active.size===1);
  const lease=t.runtime.prepareBindings([replacement],committed);lease.pauseAndCapture();lease.stage();
  t.runtime.update(committed);await until(()=>t.jobs.active.size===0&&t.queue.counts().running===0);expect(t.results).toEqual([]);expect(t.rendered.every(row=>row.result.plots.length===0)).toBe(true);
  lease.resume(true);t.runtime.update({...committed,identity:'synthetic-old-props'});await new Promise(resolve=>setTimeout(resolve,10));expect(t.jobs.active.size).toBe(0);expect(t.results).toEqual([]);
  t.runtime.update(committed);await until(()=>t.results.length===1);expect(t.results[0].bindingId).toBe(replacement.id);expect(t.results[0].identity).toBe(committed.identity);expect(t.results[0].result.plots[0].values.map((point:any)=>point.value)).toEqual([2,4]);expect(t.results[0].result.plots.map((plot:any)=>plot.title)).toEqual(['Synthetic close']);
  await until(()=>t.jobs.active.size===0&&t.queue.counts().running===0);
 }finally{t.runtime.dispose();t.jobs.close();}
},15000);
it('rollback keeps an actual accepted worker result without publishing it or compiling it again',async()=>{
 const t=setup();try{
  const original={bars,identity:'synthetic-accepted-before-template',fixture:true,bindings:[binding],ready:true};t.runtime.update(original);await until(()=>t.results.length===1&&t.jobs.active.size===0&&t.queue.counts().running===0);
  const accepted=t.results[0],lease=t.runtime.prepareBindings([]);lease.pauseAndCapture();lease.stage();
  // The caller owns native accepted-result restoration. This test covers worker
  // ownership after that external checkpoint, not a Vela/native restoration.
  lease.rollback();lease.resume(false);t.runtime.update(original);await new Promise(resolve=>setTimeout(resolve,25));expect(t.jobs.active.size).toBe(0);expect(t.queue.counts().running).toBe(0);expect(t.results).toEqual([accepted]);
 }finally{t.runtime.dispose();t.jobs.close();}
},15000);
