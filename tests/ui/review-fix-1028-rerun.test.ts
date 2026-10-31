import {it,expect} from 'vitest';
import {ScriptBindingRuntime} from '../../src/ui/script-binding-runtime';
import type {ChartController} from '../../src/chart/adapter';
import type {ScriptBinding} from '../../src/ui/script-library';
import type {executeScriptOnBars,ScriptResult} from '../../src/ui/script-jobs';

// A suspension (autosave pauseAndCapture) that begins while a strategy rerun is in flight
// must not end the feedback with "stopped"; the rerun runs again on the restored calculation. A real recalculation still stops it.
// The stub executor rejects with AbortError when its signal aborts, like executeScriptOnBars. SYNTHETIC bars.
const binding:ScriptBinding={id:'bound',documentId:'doc',version:1,name:'Feedback',source:'({onBar(ctx){if(ctx.strategy.position===0)ctx.order({side:"buy",quantity:1});}})',pane:'price',visible:true,plots:{}};
const bars=[{time:1,open:1,high:2,low:1,close:2,volume:10}];
const context={bars,identity:'one',fixture:true,bindings:[binding],ready:true};
const wait=(ms=0)=>new Promise(resolve=>setTimeout(resolve,ms));
function setup(){const pending:{resolve:(value:any)=>void;input:any}[]=[];const port={add:()=>{},update:()=>{},remove:()=>{},replaceStyles:()=>{},show:()=>{},move:()=>{},place:()=>{},rename:()=>{}} as unknown as ChartController['scripts'];
 const execute:typeof executeScriptOnBars=input=>new Promise((resolve,reject)=>{pending.push({resolve,input});input.signal.addEventListener('abort',()=>reject(new DOMException('Script work was cancelled.','AbortError')),{once:true});});
 const results:any[]=[];const runtime=new ScriptBindingRuntime(port,()=>{},value=>results.push(value),execute);return{runtime,pending,results};}
function result():{result:ScriptResult;barIds:string[]}{return{barIds:['literal'],result:{plots:[],orders:[],alerts:[],diagnostics:[],elapsedMs:1,provisional:false,state:null,provenance:{kind:'synthetic',label:'Synthetic feedback'}}};}
const feed={positions:[null],fills:[]} as never;

it('a suspension that starts while the rerun runs: the rerun runs again after the rollback and resolves',async()=>{
 const t=setup();t.runtime.update(context);t.pending[0].resolve(result());await wait();const rerun=t.results[0].rerun;
 const running=rerun(feed,new AbortController().signal);await wait();expect(t.pending).toHaveLength(2);
 const lease=t.runtime.prepareBindings([binding]);lease.pauseAndCapture();// autosave suspension lands mid-rerun
 expect(t.pending[1].input.signal.aborted).toBe(true);await wait(60);expect(t.pending).toHaveLength(2);// waits out the hold
 lease.rollback();lease.resume(false);t.runtime.update(context);await wait(60);
 expect(t.pending).toHaveLength(3);expect(t.pending[2].input.signal.aborted).toBe(false);expect(t.pending[2].input.engine).toBe(feed);
 t.pending[2].resolve(result());await expect(running).resolves.toMatchObject({provenance:{label:'Synthetic feedback'}});
 t.runtime.dispose();
});
it('a recalculation while the rerun runs still stops it with an AbortError (no retry)',async()=>{
 const t=setup();t.runtime.update(context);t.pending[0].resolve(result());await wait();const rerun=t.results[0].rerun;
 const running=rerun(feed,new AbortController().signal);await wait();
 t.runtime.update({...context,identity:'two',bars:[{...bars[0],close:3}]});
 await expect(running).rejects.toMatchObject({name:'AbortError'});expect(t.pending.filter(row=>row.input.engine)).toHaveLength(1);
 t.runtime.dispose();
});
it('a suspension that commits a different calculation stops the rerun',async()=>{
 const t=setup();t.runtime.update(context);t.pending[0].resolve(result());await wait();const rerun=t.results[0].rerun;
 const running=rerun(feed,new AbortController().signal);await wait();
 const lease=t.runtime.prepareBindings([{...binding,source:binding.source+' '}]);lease.pauseAndCapture();lease.stage();lease.resume(true);
 await expect(running).rejects.toMatchObject({name:'AbortError'});expect(t.pending.filter(row=>row.input.engine)).toHaveLength(1);
 t.runtime.dispose();
});
it('dispose during the hold stops the rerun',async()=>{
 const t=setup();t.runtime.update(context);t.pending[0].resolve(result());await wait();const rerun=t.results[0].rerun;
 const running=rerun(feed,new AbortController().signal);await wait();
 const lease=t.runtime.prepareBindings([binding]);lease.pauseAndCapture();t.runtime.dispose();
 await expect(running).rejects.toMatchObject({name:'AbortError'});expect(t.pending.filter(row=>row.input.engine)).toHaveLength(1);void lease;
});
