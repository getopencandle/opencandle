import {expect,it,vi} from 'vitest';
import {ScriptBindingRuntime,type BindingStatus} from '../../src/ui/script-binding-runtime';
import {createNotificationBatch} from '../../src/chart/notification-batch';
import type {ChartController} from '../../src/chart/adapter';
import type {ScriptBinding} from '../../src/ui/script-library';
import type {executeScriptOnBars,ScriptResult} from '../../src/ui/script-jobs';
import type {ScriptRenderResult,ScriptRenderSettings} from '../../src/chart/script-port';

// Real runtime and notification batching with deferred execution and a controlled
// committing/rolling-back native port. This does not instantiate Electron or a
// native renderer, and does not prove unrelated code cannot mutate the port.
const binding:ScriptBinding={id:'SYNTHETIC binding',documentId:'SYNTHETIC document',version:1,name:'SYNTHETIC A',source:'({onBar(){}})',pane:'price',visible:true,plots:{}};
const bars=[{time:1,open:1,high:2,low:1,close:2,volume:10}];
const context={bars,identity:'SYNTHETIC A',fixture:true,bindings:[binding],ready:true};
const nextContext={...context,identity:'SYNTHETIC B',bindings:[{...binding,name:'SYNTHETIC B',source:'({onBar(ctx){ctx.plot("SYNTHETIC B",1)}})'}]};
function output(value:number):{result:ScriptResult;barIds:string[]}{return{barIds:['SYNTHETIC bar'],result:{plots:[{id:'SYNTHETIC plot',title:'SYNTHETIC value',color:'#123456',values:[{time:1,value}]}],orders:[],alerts:[],diagnostics:[],elapsedMs:0,provisional:false,state:null,provenance:{kind:'synthetic',label:'SYNTHETIC deferred result'}}};}
const flush=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};
type Event={operation:string;result?:ScriptRenderResult};
function setup(batched=true){
 const models=new Map<string,{settings:ScriptRenderSettings;result:ScriptRenderResult}>(),states:BindingStatus[][]=[],results:any[]=[],events:Event[]=[],listeners=new Set<()=>void>();
 const pending:Array<{input:Parameters<typeof executeScriptOnBars>[0];resolve:(value:ReturnType<typeof output>)=>void;reject:(cause:unknown)=>void}>=[];
 let currentEvent:Event={operation:'none'},hook:{operation:string;run:()=>void;when:(event:Event)=>boolean}|null=null,beforeAdd:(()=>void)|null=null,onStatus:((rows:BindingStatus[])=>void)|null=null,onResult:((value:any)=>void)|null=null;
 const notifications=createNotificationBatch(()=>{if(hook?.operation===currentEvent.operation&&hook.when(currentEvent)){const selected=hook;hook=null;selected.run();}for(const listener of [...listeners])listener();});
 const changed=(operation:string,result?:ScriptRenderResult)=>{currentEvent={operation,result};events.push(currentEvent);notifications.changed();};
 const model=(id:string)=>{const value=models.get(id);if(!value)throw Error('SYNTHETIC unknown native handle');return value;};
 const port={
  ...(batched?{beginExternalTransaction:notifications.beginExternalTransaction}:{}),
  add:(result:ScriptRenderResult,settings:ScriptRenderSettings)=>notifications.transaction(()=>{if(models.has(settings.id))throw Error('SYNTHETIC duplicate native ID');const action=beforeAdd;beforeAdd=null;action?.();models.set(settings.id,{settings:structuredClone(settings),result:structuredClone(result)});changed('add',result);return settings.id;}),
  update:(id:string,result:ScriptRenderResult)=>{const value=model(id),prior=value.result;value.result=structuredClone(result);try{changed('update',result);}catch(error){value.result=prior;try{changed('rollback',prior);}catch(rollback){throw new AggregateError([error,rollback],'SYNTHETIC update rollback failure');}throw error;}},
  remove:(id:string)=>notifications.transaction(()=>{if(!models.has(id))return;models.delete(id);changed('remove');}),
  replaceStyles:(id:string,plots:ScriptRenderSettings['plots'])=>notifications.transaction(()=>{model(id).settings.plots=structuredClone(plots);changed('styles');}),
  show:(id:string,visible:boolean)=>notifications.transaction(()=>{model(id).settings.visible=visible;changed('show');}),
  rename:(id:string,title:string)=>notifications.transaction(()=>{model(id).settings.title=title;changed('rename');}),
  place:(id:string,value:Partial<ScriptRenderSettings>)=>notifications.transaction(()=>{Object.assign(model(id).settings,value);changed('place');}),
  subscribe:(listener:()=>void)=>{listeners.add(listener);return()=>{listeners.delete(listener);};},
  configurationSnapshot:()=>[...models.values()].map(value=>structuredClone(value.settings)),
  placementStatus:()=>({ready:true,diagnostics:[]})
 } as unknown as ChartController['scripts'];
 const execute:typeof executeScriptOnBars=input=>new Promise((resolve,reject)=>pending.push({input,resolve,reject}));
 const runtime=new ScriptBindingRuntime(port,rows=>{states.push(rows);onStatus?.(rows);},value=>{results.push(value);onResult?.(value);},execute);
 return{runtime,port,models,pending,states,results,events,listeners,
  after(operation:string,run:()=>void,when=(event:Event)=>true){hook={operation,run,when};},
  beforeAdd(run:()=>void){beforeAdd=run;},onStatus(run:(rows:BindingStatus[])=>void){onStatus=run;},onResult(run:(value:any)=>void){onResult=run;}};
}
const full=(event:Event)=>!!event.result?.plots.length;

it.each([true,false])('disposal during committed add notification leaves no handle/result/ready feedback (batch=%s)',async batched=>{
 const f=setup(batched);f.runtime.update(context);const count=f.states.length;f.after('add',()=>f.runtime.dispose());f.pending[0].resolve(output(1));await flush();
 expect(f.models.size).toBe(0);expect(f.results).toEqual([]);expect(f.states.slice(count).some(rows=>rows.some(row=>row.status==='ready'))).toBe(false);expect(f.events.filter(row=>row.operation==='remove')).toHaveLength(1);
});
it.each([true,false])('same-context notification preserves the one valid job without duplicate execution (batch=%s)',async batched=>{
 const f=setup(batched);try{f.runtime.update(context);f.after('add',()=>{f.runtime.update({...context,bindings:structuredClone(context.bindings)});f.runtime.update(context);});f.pending[0].resolve(output(1));await flush();expect(f.pending).toHaveLength(1);expect(f.pending[0].input.signal?.aborted).toBe(false);expect(f.results).toHaveLength(1);expect(f.models.size).toBe(1);expect(f.events.filter(row=>row.operation==='add')).toHaveLength(1);}finally{f.runtime.dispose();}
});
it('reconciles changed source after add commits and adopts the existing owned ID exactly once',async()=>{
 const f=setup();try{f.runtime.update(context);f.after('add',()=>f.runtime.update(nextContext));f.pending[0].resolve(output(99));await flush();expect(f.pending[0].input.signal?.aborted).toBe(true);expect(f.results).toEqual([]);expect(f.pending).toHaveLength(2);expect(f.models.size).toBe(1);expect(f.models.get(binding.id)!.result.plots).toEqual([]);f.pending[1].resolve(output(2));await flush();expect(f.results.map(row=>row.identity)).toEqual([nextContext.identity]);expect(f.events.filter(row=>row.operation==='add')).toHaveLength(1);expect(f.models.get(binding.id)!.result.plots[0].values[0].value).toBe(2);}finally{f.runtime.dispose();}
});
it('observed source A to B to A permanently retires the first A job and requeues its cleared key',async()=>{
 const f=setup();try{f.runtime.update(context);f.after('add',()=>{f.runtime.update(nextContext);f.runtime.update(context);});f.pending[0].resolve(output(99));await flush();expect(f.results).toEqual([]);expect(f.pending).toHaveLength(2);expect(f.pending[0].input.signal?.aborted).toBe(true);f.pending[1].resolve(output(3));await flush();expect(f.results).toHaveLength(1);expect(f.results[0].identity).toBe(context.identity);expect(f.results[0].result.plots[0].values[0].value).toBe(3);}finally{f.runtime.dispose();}
});
it('defers replacement even for a controlled pre-commit add callback so no untracked handle survives',async()=>{
 const f=setup(false);try{f.runtime.update(context);f.beforeAdd(()=>f.runtime.update(nextContext));f.pending[0].resolve(output(99));await flush();expect(f.results).toEqual([]);expect(f.pending).toHaveLength(2);expect(f.models.size).toBe(1);f.pending[1].resolve(output(4));await flush();expect(f.results.map(row=>row.identity)).toEqual([nextContext.identity]);expect(f.events.filter(row=>row.operation==='add')).toHaveLength(1);}finally{f.runtime.dispose();}
});
it('pre-commit disposal removes only the reserved ID after the add unwinds',async()=>{
 const f=setup(false);f.runtime.update(context);f.beforeAdd(()=>f.runtime.dispose());f.pending[0].resolve(output(99));await flush();expect(f.models.size).toBe(0);expect(f.results).toEqual([]);expect(f.events.map(row=>row.operation)).toEqual(['add','remove']);
});
it('removed-entry replacement cannot be deleted by an older completion cleanup',async()=>{
 const f=setup(false);try{f.runtime.update(context);f.beforeAdd(()=>{f.runtime.interact({kind:'removed',id:binding.id});f.runtime.update(nextContext);});f.pending[0].resolve(output(99));await flush();expect(f.results).toEqual([]);expect(f.models.size).toBe(0);expect(f.pending).toHaveLength(2);f.pending[1].resolve(output(5));await flush();expect(f.models.size).toBe(1);expect(f.results).toHaveLength(1);expect(f.models.get(binding.id)!.result.plots[0].values[0].value).toBe(5);expect(f.events.filter(row=>row.operation==='remove')).toHaveLength(1);}finally{f.runtime.dispose();}
});
it('a committed add notification failure cleans its owned reservation and permits explicit retry',async()=>{
 const f=setup();try{f.runtime.update(context);f.after('add',()=>{throw Error('SYNTHETIC committed notification failure');});f.pending[0].resolve(output(99));await flush();expect(f.models.size).toBe(0);expect(f.results).toEqual([]);expect(f.states.at(-1)?.[0]).toMatchObject({status:'error'});f.runtime.retry();f.runtime.update(context);expect(f.pending).toHaveLength(2);f.pending[1].resolve(output(6));await flush();expect(f.models.size).toBe(1);expect(f.results).toHaveLength(1);}finally{f.runtime.dispose();}
});
it('disposal during result update suppresses its old result and post-native ready state',async()=>{
 const f=setup();f.runtime.update(context);f.pending[0].resolve(output(1));await flush();f.runtime.update(nextContext);const count=f.states.length;f.after('update',()=>f.runtime.dispose(),full);f.pending[1].resolve(output(99));await flush();expect(f.models.size).toBe(0);expect(f.results).toHaveLength(1);expect(f.states.slice(count).some(rows=>rows.some(row=>row.status==='ready'))).toBe(false);
});
it('source replacement during a synchronous update failure and rollback cannot publish the failed old result',async()=>{
 const f=setup(false),third={...nextContext,identity:'SYNTHETIC C'};try{f.runtime.update(context);f.pending[0].resolve(output(1));await flush();f.runtime.update(nextContext);f.after('update',()=>{f.runtime.update(third);throw Error('SYNTHETIC native update fault');},full);f.pending[1].resolve(output(99));await flush();expect(f.events.some(row=>row.operation==='rollback')).toBe(true);expect(f.results.map(row=>row.identity)).toEqual([context.identity]);expect(f.pending).toHaveLength(3);f.pending[2].resolve(output(7));await flush();expect(f.results.map(row=>row.identity)).toEqual([context.identity,third.identity]);expect(f.models.get(binding.id)!.result.plots[0].values[0].value).toBe(7);expect(f.states.flat().some(row=>row.message.includes('SYNTHETIC native update fault'))).toBe(false);}finally{f.runtime.dispose();}
});
it('rename notification disposal stops later placement and old ready/result publication',async()=>{
 const f=setup();f.runtime.update(context);f.pending[0].resolve(output(1));await flush();const count=f.events.length;f.after('rename',()=>f.runtime.dispose());f.runtime.update({...context,bindings:[{...binding,name:'SYNTHETIC renamed',pane:'new'}]});expect(f.models.size).toBe(0);expect(f.results).toHaveLength(1);expect(f.pending).toHaveLength(1);expect(f.events.slice(count).some(row=>row.operation==='place')).toBe(false);
});
it('a paused transaction blocks stale completion and stage refuses reentry without consuming the paused phase',async()=>{
 const f=setup(),lease=f.runtime.prepareBindings([binding],context);try{f.runtime.update(context);f.after('add',()=>{lease.pauseAndCapture();expect(()=>lease.stage()).toThrow('native script callback');});f.pending[0].resolve(output(99));await flush();expect(f.results).toEqual([]);lease.stage();lease.resume(true);f.runtime.update(context);expect(f.pending).toHaveLength(2);f.pending[1].resolve(output(8));await flush();expect(f.results).toHaveLength(1);}finally{f.runtime.dispose();}
});
it('rollback and same-context resume notification requeue the aborted job instead of losing its key',async()=>{
 const f=setup(),lease=f.runtime.prepareBindings([binding],context);try{f.runtime.update(context);f.after('add',()=>{lease.pauseAndCapture();lease.rollback();lease.resume(false);f.runtime.update(context);});f.pending[0].resolve(output(99));await flush();expect(f.results).toEqual([]);expect(f.pending).toHaveLength(2);f.pending[1].resolve(output(9));await flush();expect(f.results).toHaveLength(1);expect(f.models.size).toBe(1);}finally{f.runtime.dispose();}
});
it('onResult source replacement stops old ready feedback and starts the next exact context',async()=>{
 const f=setup();try{f.runtime.update(context);const count=f.states.length;f.onResult(value=>{if(value.identity===context.identity)f.runtime.update(nextContext);});f.pending[0].resolve(output(1));await flush();expect(f.results.map(row=>row.identity)).toEqual([context.identity]);expect(f.states.slice(count).some(rows=>rows.some(row=>row.status==='ready'))).toBe(false);expect(f.pending).toHaveLength(2);f.pending[1].resolve(output(10));await flush();expect(f.results.map(row=>row.identity)).toEqual([context.identity,nextContext.identity]);}finally{f.runtime.dispose();}
});
it('ready publisher disposal prevents later readiness-observer callbacks',async()=>{
 const f=setup(),observer=vi.fn();f.runtime.subscribeConfigurationStatus(observer);f.runtime.update(context);observer.mockClear();f.onStatus(rows=>{if(rows.some(row=>row.status==='ready'))f.runtime.dispose();});f.pending[0].resolve(output(1));await flush();expect(f.models.size).toBe(0);expect(observer).toHaveBeenCalledTimes(1);expect(f.listeners.size).toBe(0);
});
it('an old rejected executor cannot publish error feedback into the replacement job',async()=>{
 const f=setup();try{f.runtime.update(context);f.runtime.update(nextContext);const count=f.states.length;f.pending[0].reject(Error('SYNTHETIC stale error'));await flush();expect(f.states.slice(count).flat().some(row=>row.message.includes('stale error'))).toBe(false);f.pending[1].resolve(output(11));await flush();expect(f.results.map(row=>row.identity)).toEqual([nextContext.identity]);}finally{f.runtime.dispose();}
});
