import {it,expect} from 'vitest';
import {ScriptBindingRuntime} from '../../src/ui/script-binding-runtime';
import type {ChartController} from '../../src/chart/adapter';
import type {ScriptBinding} from '../../src/ui/script-library';
import type {executeScriptOnBars,ScriptResult} from '../../src/ui/script-jobs';

// Found in the hidden GUI check. Any Strategy tester property change on a strategy that reads ctx.strategy
// left the report at "Strategy feedback stopped: the strategy script was recalculated or removed before it settled", and
// Recalculate did not help. Cause: a chart suspension (autosave, workspace transaction) aborts every binding job controller
// and its rollback keeps the accepted calculation under a new controller, while the result's rerun stayed linked to the
// aborted one. Same harness as script-binding-runtime.test.ts; the executor is a stub, SYNTHETIC bars.
const binding:ScriptBinding={id:'bound',documentId:'doc',version:1,name:'Feedback',source:'({onBar(ctx){if(ctx.strategy.position===0)ctx.order({side:"buy",quantity:1});}})',pane:'price',visible:true,plots:{}};
const bars=[{time:1,open:1,high:2,low:1,close:2,volume:10}];
const context={bars,identity:'one',fixture:true,bindings:[binding],ready:true};
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
function setup(){const pending:{resolve:(value:any)=>void;input:any}[]=[];const port={add:()=>{},update:()=>{},remove:()=>{},replaceStyles:()=>{},show:()=>{},move:()=>{},place:()=>{},rename:()=>{}} as unknown as ChartController['scripts'];const execute:typeof executeScriptOnBars=input=>new Promise(resolve=>pending.push({resolve,input}));const results:any[]=[];const runtime=new ScriptBindingRuntime(port,()=>{},value=>results.push(value),execute);return{runtime,pending,results};}
function result():{result:ScriptResult;barIds:string[]}{return{barIds:['literal'],result:{plots:[],orders:[],alerts:[],diagnostics:[],elapsedMs:1,provisional:false,state:null,provenance:{kind:'synthetic',label:'Synthetic feedback'}}};}
const feed={positions:[null],fills:[]} as never;
const suspend=(runtime:ScriptBindingRuntime)=>{const lease=runtime.prepareBindings([binding]);lease.pauseAndCapture();lease.rollback();lease.resume(false);};

it('a rerun after a suspension rollback runs on the same accepted calculation instead of aborting at once',async()=>{
 const t=setup();t.runtime.update(context);t.pending[0].resolve(result());await tick();
 expect(t.results).toHaveLength(1);const rerun=t.results[0].rerun;expect(typeof rerun).toBe('function');
 suspend(t.runtime);t.runtime.update(context);expect(t.pending).toHaveLength(1);// accepted: no recalculation
 const running=rerun(feed,new AbortController().signal);await tick();
 expect(t.pending).toHaveLength(2);expect(t.pending[1].input.signal.aborted).toBe(false);expect(t.pending[1].input.engine).toBe(feed);
 t.pending[1].resolve(result());await expect(running).resolves.toMatchObject({provenance:{label:'Synthetic feedback'}});
 t.runtime.dispose();
});
it('a rerun requested while the runtime is held waits for the hold to end',async()=>{
 const t=setup();t.runtime.update(context);t.pending[0].resolve(result());await tick();const rerun=t.results[0].rerun;
 const lease=t.runtime.prepareBindings([binding]);lease.pauseAndCapture();
 const running=rerun(feed,new AbortController().signal);await new Promise(resolve=>setTimeout(resolve,60));expect(t.pending).toHaveLength(1);
 lease.rollback();lease.resume(false);await new Promise(resolve=>setTimeout(resolve,60));
 expect(t.pending).toHaveLength(2);expect(t.pending[1].input.signal.aborted).toBe(false);t.pending[1].resolve(result());await expect(running).resolves.toBeTruthy();
 t.runtime.dispose();
});
it('a real recalculation, removal or dispose still stops the rerun (F2 unchanged)',async()=>{
 const t=setup();t.runtime.update(context);t.pending[0].resolve(result());await tick();const rerun=t.results[0].rerun;
 suspend(t.runtime);t.runtime.update(context);
 const running=rerun(feed,new AbortController().signal);await tick();expect(t.pending[1].input.signal.aborted).toBe(false);
 t.runtime.update({...context,identity:'two',bars:[{...bars[0],close:3}]});// new data: the calculation is replaced
 expect(t.pending[1].input.signal.aborted).toBe(true);
 const late=rerun(feed,new AbortController().signal);await tick();expect(t.pending.at(-1)!.input.signal.aborted).toBe(true);
 t.runtime.update({...context,bindings:[]});t.runtime.dispose();void running;void late;
 const own=new AbortController(),other=setup();other.runtime.update(context);other.pending[0].resolve(result());await tick();const again=other.results[0].rerun(feed,own.signal);await tick();own.abort();expect(other.pending[1].input.signal.aborted).toBe(true);other.runtime.dispose();void again;
});
