import {afterEach,it,expect} from 'vitest';
import {getNativeIndicator,type Vela} from '@luxalgo/vela';
import {createScriptPort} from '../../src/chart/script-port';
import type {PaneRegistry} from '../../src/chart/pane-registry';
import {ScriptBindingRuntime} from '../../src/ui/script-binding-runtime';
import type {executeScriptOnBars,ScriptResult} from '../../src/ui/script-jobs';
import type {ScriptBinding} from '../../src/ui/script-library';
import {sourceContextForDataset} from '../../src/chart/source-context';
import {fixtureDataset} from '../../src/domain/fixtures';
import {captureScriptCsvJobProof,stageScriptCsvJobResult,acceptScriptCsvJobProof,assertScriptCsvJobModel,scriptCsvBindingKey,type ScriptCsvJobOwner} from '../../src/chart/script-csv-job-proof';

const disposals:Array<()=>void>=[];afterEach(()=>{for(const fn of disposals.splice(0).reverse())fn();});
const binding:ScriptBinding={id:'synthetic-script',documentId:'synthetic-document',version:1,name:'Synthetic study',source:'({onBar(){}})',pane:'price',visible:true,plots:{}};
const result=(value=7)=>({plots:[{id:'plot',title:'Literal',color:'#123456',values:[{time:100,value}]}],orders:[],alerts:[],diagnostics:[],elapsedMs:1,provisional:false,state:null,provenance:{kind:'synthetic',label:'Synthetic literal result'}} as ScriptResult);
const settle=()=>new Promise(resolve=>setTimeout(resolve,0));
function setup(){
 const data=fixtureDataset('GME',1);data.bars=[{time:100,open:10,high:15,low:9,close:12,volume:100}];const input={bars:data.bars,source:sourceContextForDataset(data),style:'heikinashi'};
 let alive=true,fail=false,sequence=0,activeBinding=structuredClone(binding);const live=new Map<string,any>(),events=new Map<string,Set<(value:any)=>void>>();
 const chart={on(event:string,callback:(value:any)=>void){const values=events.get(event)??new Set();values.add(callback);events.set(event,values);return()=>values.delete(callback);},addNativeIndicator(type:string){const descriptor=getNativeIndicator(type)!;const model=descriptor.create(),id='synthetic-native-'+(++sequence);live.set(id,model);model.start({bars:()=>input.bars.map(row=>({...row,time:row.time*1000})),emit(){if(fail){fail=false;throw Error('Synthetic emission failed');}}} as any,descriptor.defaultInputs());return {id,remove(){model.stop();live.delete(id);for(const callback of events.get('indicator:removed')??[])callback({id});},setVisible(value:boolean){value?model.resume():model.suspend();},moveTo(){}};}} as unknown as Vela;
 const port=createScriptPort(chart,{info:()=>undefined} as unknown as PaneRegistry);disposals.push(()=>port.dispose());
 const owner:ScriptCsvJobOwner={input,execution:'ordinary',assertCurrent(expected){if(!alive)throw Error('Synthetic job owner retired');if(scriptCsvBindingKey(expected)!==scriptCsvBindingKey(activeBinding))throw Error('Synthetic effective binding changed');}};
 const authorize=(value:ScriptResult)=>{const proof=captureScriptCsvJobProof(owner,binding,input.bars.map(row=>({...row})));stageScriptCsvJobResult(value,proof);return proof;};
 const model=()=>[...live.values()][0],assert=()=>assertScriptCsvJobModel(model(),model().result,input,'ordinary',binding.id);
 return {data,input,port,owner,authorize,model,assert,retire(){alive=false;},binding(value:ScriptBinding){activeBinding=value;},fail(){fail=true;}};
}
it('actual script port clones only privately proven accepted job results and rejects structural substitutes',()=>{
 const t=setup(),value=result(),proof=t.authorize(value);t.port.add(value,{id:binding.id});expect(t.assert).toThrow('accepted calculation input');acceptScriptCsvJobProof(proof);expect(t.assert).not.toThrow();
 const clone=structuredClone(value);t.port.update(binding.id,clone);expect(t.assert).toThrow('accepted calculation input');
});
it('native onBars re-emission cannot promote old result authority after a same-count source correction',()=>{
 const t=setup(),value=result(),proof=t.authorize(value);t.port.add(value,{id:binding.id});acceptScriptCsvJobProof(proof);expect(t.assert).not.toThrow();t.input.bars[0].close=13;t.model().onBars();expect(t.assert).toThrow('accepted calculation input');
});
it('binds actual raw source, consumed calculation values, style, execution and exact source basis',()=>{
 const t=setup(),consumed=t.input.bars.map(row=>({...row})),proof=captureScriptCsvJobProof(t.owner,binding,consumed),value=result();stageScriptCsvJobResult(value,proof);t.port.add(value,{id:binding.id});acceptScriptCsvJobProof(proof);
 expect(()=>assertScriptCsvJobModel(t.model(),t.model().result,t.input,'another-run',binding.id)).toThrow();const style=t.input.style;t.input.style='candles';expect(t.assert).toThrow();t.input.style=style;
 const source=t.input.source;t.input.source={...source,revision:'another-synthetic-revision'};expect(t.assert).toThrow();t.input.source=source;consumed[0].close=13;expect(t.assert).toThrow('accepted calculation input');
});
it('requires the exact effective binding and keeps proven results across a native placement remount',()=>{
 const t=setup(),value=result(),proof=t.authorize(value);t.port.add(value,{id:binding.id});acceptScriptCsvJobProof(proof);t.binding({...binding,inputs:{period:3}});expect(t.assert).toThrow('effective binding');t.binding(binding);t.port.place(binding.id,{pane:'new'});expect(t.assert).not.toThrow();
});
it('keeps normal calculation possible when source CSV affordability fails before proof allocation',()=>{
 const t=setup();t.owner.input={...t.input,bars:new Array(1000000),source:{...t.input.source,label:'\u754c'.repeat(4000)}};for(let index=0;index<2000;index++)(t.owner.input.bars as any)[index]={time:index,open:1,high:2,low:0,close:1,volume:1};let tail=0;Object.defineProperty(t.owner.input.bars,'2000',{get(){tail++;throw Error('Unaffordable tail visited');}});
 expect(captureScriptCsvJobProof(t.owner,binding,t.input.bars)).toBeNull();expect(tail).toBe(0);t.port.add(result(),{id:binding.id});expect(t.port.list()).toHaveLength(1);expect(t.assert).toThrow('accepted calculation input');
});
it('refuses malformed consumed scalar values without invoking numerical coercion',()=>{
 const t=setup(),consumed=t.input.bars.map(row=>({...row}));let invoked=0;consumed[0].close={valueOf(){invoked++;return 999;}} as unknown as number;
 expect(captureScriptCsvJobProof(t.owner,binding,consumed)).toBeNull();expect(invoked).toBe(0);
});
it('preserves private accepted pairs through native checkpoint restore and refuses a foreign token',()=>{
 const t=setup(),value=result(),proof=t.authorize(value);t.port.add(value,{id:binding.id});acceptScriptCsvJobProof(proof);const saved=t.port.captureAcceptedResults();t.port.remove(binding.id);t.port.restoreAcceptedResults(saved);expect(t.assert).not.toThrow();expect(()=>t.port.restoreAcceptedResults({count:1})).toThrow('Foreign');
});
it('restores the previous accepted result and its proof after failed native update',()=>{
 const t=setup(),value=result(),proof=t.authorize(value);t.port.add(value,{id:binding.id});acceptScriptCsvJobProof(proof);t.fail();expect(()=>t.port.update(binding.id,result(999))).toThrow('Synthetic emission failed');expect(t.assert).not.toThrow();expect(t.model().result.plots[0].values[0].value).toBe(7);
});
it('retires authority on invalidation, removal and owner disposal without reviving a detached model',()=>{
 const t=setup(),value=result(),proof=t.authorize(value);t.port.add(value,{id:binding.id});acceptScriptCsvJobProof(proof);const old=t.model();t.port.invalidateResults();expect(t.assert).toThrow('accepted calculation input');t.port.update(binding.id,value);expect(t.assert).not.toThrow();t.port.remove(binding.id);expect(()=>assertScriptCsvJobModel(old,old.result,t.input,'ordinary',binding.id)).toThrow();
 t.port.add(value,{id:binding.id});t.retire();expect(t.assert).toThrow('retired');
});
it('runtime refuses a late response whose actual source changed before acceptance',async()=>{
 const t=setup(),pending:Array<{input:any;resolve:(value:any)=>void}>=[],execute:typeof executeScriptOnBars=input=>new Promise(resolve=>pending.push({input,resolve})),runtime=new ScriptBindingRuntime(t.port,()=>{},()=>{},execute);disposals.push(()=>runtime.dispose());
 runtime.update({bars:t.input.bars,identity:'synthetic-job',fixture:true,bindings:[binding],ready:true,csvJobOwner:t.owner});t.input.bars[0].close=13;pending[0].resolve({result:result(),barIds:['synthetic-bar']});await settle();expect(t.port.list()).toEqual([]);
});
it('runtime installs authority only for the current job and rejects completion after removal or disposal',async()=>{
 const t=setup(),pending:Array<{input:any;resolve:(value:any)=>void}>=[],execute:typeof executeScriptOnBars=input=>new Promise(resolve=>pending.push({input,resolve})),runtime=new ScriptBindingRuntime(t.port,()=>{},()=>{},execute);disposals.push(()=>runtime.dispose());const context={bars:t.input.bars,identity:'synthetic-job',fixture:true,bindings:[binding],ready:true,csvJobOwner:t.owner};
 runtime.update(context);pending[0].resolve({result:result(),barIds:['synthetic-bar']});await settle();expect(t.assert).not.toThrow();runtime.update({...context,bindings:[]});expect(t.port.list()).toEqual([]);runtime.update(context);runtime.dispose();pending[1].resolve({result:result(999),barIds:['synthetic-bar']});await settle();expect(t.port.list()).toEqual([]);
});
