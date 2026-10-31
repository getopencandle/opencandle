import {expect,it} from 'vitest';
import {ScriptBindingRuntime,type BindingStatus} from '../../src/ui/script-binding-runtime';
import {createAnalysisTransactionEngine} from '../../src/chart/analysis-transaction';
import type {ChartController} from '../../src/chart/adapter';
import type {ScriptBinding} from '../../src/ui/script-library';
import type {executeScriptOnBars,ScriptResult} from '../../src/ui/script-jobs';

const bars=[{time:100,open:10,high:12,low:9,close:11,volume:20}];
const binding=(id:string):ScriptBinding=>({id,documentId:'doc-'+id,version:1,name:id,source:'({onBar(){}})',pane:'price',visible:true,plots:{}});
const context=(bindings:ScriptBinding[])=>({bars,identity:'same-market-identity',fixture:true,bindings,ready:true});
const flush=()=>new Promise(resolve=>setTimeout(resolve,0));
function result(value:number):{result:ScriptResult;barIds:string[]}{return{barIds:['bar-0'],result:{plots:[{id:'literal',title:'Literal',color:'#123456',values:[{time:100,value}]}],orders:[],alerts:[],diagnostics:[],elapsedMs:0,provisional:false,state:null,provenance:{kind:'synthetic',label:'Synthetic reviewer fixture'}}};}
function setup(){
 const native=new Map<string,ScriptResult|{plots:[]} >(),pending:Array<{input:Parameters<typeof executeScriptOnBars>[0];resolve:(value:Awaited<ReturnType<typeof executeScriptOnBars>>)=>void}>=[],publications:BindingStatus[][]=[],executions:unknown[]=[],events:string[]=[];
 let failAdd:string|null=null,failRemove:string|null=null;
 const port={add:(value:ScriptResult,settings:{id:string})=>{events.push('add:'+settings.id);if(settings.id===failAdd)throw new Error('literal native add failure');native.set(settings.id,structuredClone(value));},update:(id:string,value:ScriptResult)=>{events.push('update:'+id);if(!native.has(id))throw new Error('Missing native identity');native.set(id,structuredClone(value));},remove:(id:string)=>{events.push('remove:'+id);if(id===failRemove)throw new Error('literal native remove failure');native.delete(id);},replaceStyles:()=>{},show:()=>{},place:()=>{},rename:()=>{}} as unknown as ChartController['scripts'];
 const execute:typeof executeScriptOnBars=input=>new Promise(resolve=>pending.push({input,resolve}));
 const runtime=new ScriptBindingRuntime(port,rows=>publications.push(structuredClone(rows)),value=>executions.push(value),execute,()=>events.push('request-context'));
 return{runtime,native,pending,publications,executions,events,failAdd:(id:string|null)=>{failAdd=id;},failRemove:(id:string|null)=>{failRemove=id;}};
}

it('recovers a partial native stage, preserves an accepted result, and restarts only the cancelled unfinished job',async()=>{
 const t=setup(),a=binding('accepted'),b=binding('unfinished'),original=context([a,b]);t.runtime.update(original);t.pending[0].resolve(result(11));await flush();
 const checkpoint=structuredClone([...t.native]),lease=t.runtime.prepareBindings([binding('replacement-one'),binding('replacement-two')],original),published=t.publications.length,releases:boolean[]=[],busy:boolean[]=[],broken:string[]=[];
 t.failAdd('replacement-two');
 const engine=createAnalysisTransactionEngine<null,typeof checkpoint>({exclusive:async operation=>operation({isCurrent:()=>true}),validate:()=>{},noOp:()=>false,capture:()=>structuredClone(checkpoint),hold:()=>({release:value=>releases.push(value)}),apply:async()=>{t.events.push('apply');},restore:async rows=>{t.events.push('restore-native');t.native.clear();for(const [id,value]of rows)t.native.set(id,structuredClone(value));},scripts:()=>lease,pending:value=>busy.push(value),broken:message=>broken.push(message)});
 await expect(engine.prepare(null)).rejects.toThrow('literal native add failure');
 expect([...t.native]).toEqual(checkpoint);expect(t.pending[1].input.signal?.aborted).toBe(true);expect(releases).toEqual([false]);expect(busy).toEqual([true,false]);expect(broken).toEqual([]);
 expect(t.publications).toHaveLength(published+1);expect(t.events.indexOf('restore-native')).toBeLessThan(t.events.lastIndexOf('request-context'));
 t.failAdd(null);t.runtime.update(original);expect(t.pending).toHaveLength(3);expect(t.pending[2].input.source).toBe(b.source);
 t.pending[1].resolve(result(999));t.pending[2].resolve(result(12));await flush();
 expect(t.executions).toHaveLength(2);expect(t.native.get(a.id)).toEqual(result(11).result);expect(t.native.get(b.id)).toEqual(result(12).result);t.runtime.dispose();
});

it('rejects foreign post-commit props even when their identity string matches but body, fixture, or binding settings differ',async()=>{
 const t=setup(),before=binding('before'),after=binding('after'),expected={...context([after]),bars:[{...bars[0],close:12}]};t.runtime.update(context([before]));
 const lease=t.runtime.prepareBindings([after],expected);lease.pauseAndCapture();lease.stage();lease.resume(true);
 t.runtime.update(context([after]));t.runtime.update({...expected,fixture:false});t.runtime.update({...expected,bindings:[{...after,name:'stale name'}]});
 expect(t.pending).toHaveLength(1);t.pending[0].resolve(result(999));await flush();expect(t.executions).toEqual([]);
 t.runtime.update({...expected,bars:expected.bars.map(row=>({...row}))});expect(t.pending).toHaveLength(2);t.pending[1].resolve(result(12));await flush();expect(t.executions).toHaveLength(1);expect(t.native.get(after.id)).toEqual(result(12).result);t.runtime.dispose();
});

it('treats a corrected bar body as new information even without an identity-string change',async()=>{
 const t=setup(),a=binding('same'),original=context([a]);t.runtime.update(original);t.pending[0].resolve(result(11));await flush();
 t.runtime.update({...original,bars:[{...bars[0],close:10,volume:21}]});expect(t.pending).toHaveLength(2);expect(t.pending[1].input.bars).toEqual([{...bars[0],close:10,volume:21}]);expect(t.native.get(a.id)).toEqual({plots:[]});
 t.pending[1].resolve(result(10));await flush();expect(t.native.get(a.id)).toEqual(result(10).result);t.runtime.dispose();
});

it('reports a true no-op without cancelling accepted work, but does not hide pending native retirement',async()=>{
 const t=setup(),a=binding('same');t.runtime.update(context([a]));t.pending[0].resolve(result(11));await flush();
 const unchanged=t.runtime.prepareBindings([{...a,paneId:null,ownScale:false}]),renamed=t.runtime.prepareBindings([{...a,name:'New title'}]),version=t.runtime.prepareBindings([{...a,version:2}]);
 expect(unchanged.changed).toBe(false);expect(renamed.changed).toBe(true);expect(version.changed).toBe(true);expect(t.pending[0].input.signal?.aborted).toBe(false);expect(t.native.get(a.id)).toEqual(result(11).result);
 t.failRemove(a.id);t.runtime.update(context([]));expect(t.runtime.prepareBindings([]).changed).toBe(true);t.failRemove(null);t.runtime.update(context([]));expect(t.runtime.prepareBindings([]).changed).toBe(false);t.runtime.dispose();
});

it('marks failed native recovery unavailable and abandons the paused runtime without reviving old accepted output',async()=>{
 const t=setup(),a=binding('old');t.runtime.update(context([a]));t.pending[0].resolve(result(11));await flush();const lease=t.runtime.prepareBindings([binding('next')]),broken:string[]=[],releases:boolean[]=[];
 const engine=createAnalysisTransactionEngine<null,null>({exclusive:async operation=>operation({isCurrent:()=>true}),validate:()=>{},noOp:()=>false,capture:()=>null,hold:()=>({release:value=>releases.push(value)}),apply:async()=>{throw new Error('literal apply failure');},restore:async()=>{throw new Error('literal restore failure');},scripts:()=>lease,pending:()=>{},broken:message=>broken.push(message)});
 await expect(engine.prepare(null)).rejects.toThrow('rollback was incomplete');expect(broken).toHaveLength(1);expect(releases).toEqual([false]);expect(t.publications.at(-1)?.[0].status).toBe('error');expect(()=>lease.rollback()).toThrow('owns');
 t.runtime.update({...context([a]),identity:'new owned context'});expect(t.pending).toHaveLength(2);t.runtime.dispose();t.pending[1].resolve(result(999));await flush();expect(t.executions).toHaveLength(1);
});
