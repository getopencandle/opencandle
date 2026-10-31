import {expect,it,vi} from 'vitest';
import {ScriptBindingRuntime} from '../../src/ui/script-binding-runtime';
import type {ChartController} from '../../src/chart/adapter';
import type {ScriptBinding} from '../../src/ui/script-library';
import type {ScriptRenderSettings} from '../../src/chart/script-port';
import type {executeScriptOnBars} from '../../src/ui/script-jobs';
// Actual runtime on a controlled native configuration/placement port. Runtime
// content/run keys deliberately do not certify exact Grid bars-reference ownership.
const binding:ScriptBinding={id:'synthetic-review',documentId:'synthetic-document',version:1,name:'Synthetic configuration',source:'({onBar(){}})',pane:'price',visible:true,plots:{}},bars=[{time:1,open:4,high:6,low:3,close:5,volume:7}],context={bars,identity:'synthetic-candles-run-1',fixture:true,bindings:[binding],ready:true};
const output={barIds:['synthetic-bar'],result:{plots:[],orders:[],alerts:[],diagnostics:[],elapsedMs:0,provisional:false,state:null,provenance:{kind:'synthetic',label:'Synthetic configuration'}}};
const flush=async()=>{for(let i=0;i<5;i++)await Promise.resolve();};
function fixture(){
 const rows=new Map<string,ScriptRenderSettings>(),nativeCallbacks:Array<()=>void>=[],jobs:Array<{resolve:(value:any)=>void;reject:(error:Error)=>void;input:any}>=[],results:any[]=[];let placement=true,unsubscribeFails=false;
 const port={add:vi.fn((_result:any,settings:ScriptRenderSettings)=>{rows.set(settings.id,{...structuredClone(settings),paneId:settings.paneId??'price'});return settings.id;}),update:vi.fn(),remove:vi.fn((id:string)=>{rows.delete(id);}),replaceStyles:vi.fn((id:string,plots:any)=>{rows.get(id)!.plots=structuredClone(plots);}),show:vi.fn((id:string,visible:boolean)=>{rows.get(id)!.visible=visible;}),rename:vi.fn((id:string,title:string)=>{rows.get(id)!.title=title;}),place:vi.fn((id:string,value:any)=>{Object.assign(rows.get(id)!,value);}),configurationSnapshot:()=>structuredClone([...rows.values()]),placementStatus:()=>({ready:placement,diagnostics:placement?[]:['Synthetic delayed placement']}),subscribe:(callback:()=>void)=>{nativeCallbacks.push(callback);return()=>{if(unsubscribeFails)throw Error('Synthetic unsubscribe failure');};}};
 const execute:typeof executeScriptOnBars=input=>new Promise((resolve,reject)=>jobs.push({resolve,reject,input})),runtime=new ScriptBindingRuntime(port as unknown as ChartController['scripts'],()=>{},value=>results.push(value),execute);
 return{runtime,port,rows,jobs,results,nativeCallbacks,setPlacement:(value:boolean)=>{placement=value;},failUnsubscribe:()=>{unsubscribeFails=true;}};
}
it('staged actual empty handles can be configuration-ready while calculations remain pending or fail independently',async()=>{
 const s=fixture(),lease=s.runtime.prepareBindings([binding],context);try{lease.pauseAndCapture();lease.stage();expect(s.runtime.configurationStatus(context).state).toBe('pending');lease.resume(true);s.runtime.update(context);expect(s.rows.size).toBe(1);expect(s.runtime.configurationStatus(context)).toEqual({state:'ready',calculations:'pending',diagnostics:[]});s.jobs[0].reject(Error('Synthetic rejected calculation'));await flush();expect(s.runtime.configurationStatus(context)).toMatchObject({state:'ready',calculations:'error',diagnostics:['Synthetic rejected calculation']});}finally{s.runtime.dispose();}
});
it('content-equal arrays preserve accepted runtime calculations while run/style identities or changed content remain pending',async()=>{
 const s=fixture();try{s.runtime.update(context);s.jobs[0].resolve(output);await flush();const equal={...context,bars:bars.map(row=>({...row}))};expect(s.runtime.configurationStatus(equal).state).toBe('ready');s.runtime.update(equal);expect(s.jobs).toHaveLength(1);for(const changed of [{...context,identity:'synthetic-line-run-1'},{...context,identity:'synthetic-candles-run-2'},{...context,bars:[{...bars[0],close:4.5}]}])expect(s.runtime.configurationStatus(changed).state).toBe('pending');}finally{s.runtime.dispose();}
});
it('native placement and explicit logical-pane drift cannot be substituted by a completed calculation',async()=>{
 const s=fixture(),pinned={...binding,pane:'new' as const,paneId:'synthetic-logical-pane'},ctx={...context,bindings:[pinned]};try{s.runtime.update(ctx);s.jobs[0].resolve(output);await flush();s.setPlacement(false);expect(s.runtime.configurationStatus(ctx)).toMatchObject({state:'pending',calculations:'complete'});s.setPlacement(true);s.rows.get(binding.id)!.paneId='foreign-pane';expect(s.runtime.configurationStatus(ctx).state).toBe('error');}finally{s.runtime.dispose();}
});
it('a metadata replacement failure reports configuration error without relabeling an accepted calculation as numerical failure',async()=>{
 const s=fixture();try{s.runtime.update(context);s.jobs[0].resolve(output);await flush();s.port.replaceStyles.mockImplementation(()=>{throw Error('Synthetic native style failure');});s.runtime.update(context);expect(s.runtime.configurationStatus(context)).toMatchObject({state:'error',calculations:'complete'});expect(s.jobs).toHaveLength(1);}finally{s.runtime.dispose();}
});
it('a failed native unsubscribe retires that subscription before any replacement observer is registered',()=>{
 const s=fixture(),old=vi.fn(),next=vi.fn();try{const off=s.runtime.subscribeConfigurationStatus(old);s.failUnsubscribe();expect(()=>off()).toThrow('unsubscribe failure');s.runtime.subscribeConfigurationStatus(next);s.nativeCallbacks[0]();expect(next).not.toHaveBeenCalled();expect(old).not.toHaveBeenCalled();s.nativeCallbacks[1]();expect(next).toHaveBeenCalledOnce();}finally{s.runtime.dispose();}
});
it('throwing subscription cleanup and removals cannot prevent aborting all jobs or resurrect outputs after disposal',async()=>{
 const s=fixture(),second={...binding,id:'synthetic-second'};s.runtime.subscribeConfigurationStatus(vi.fn());s.failUnsubscribe();s.runtime.update({...context,bindings:[binding,second]});s.port.remove.mockImplementation(()=>{throw Error('Synthetic removal failure');});s.runtime.dispose();expect(s.jobs.every(job=>job.input.signal.aborted)).toBe(true);expect(s.port.remove).toHaveBeenCalledTimes(2);for(const job of s.jobs)job.resolve(output);await flush();expect(s.results).toEqual([]);expect(s.port.add).not.toHaveBeenCalled();expect(s.port.update).not.toHaveBeenCalled();expect(()=>s.runtime.subscribeConfigurationStatus(vi.fn())).toThrow('disposed');
});
