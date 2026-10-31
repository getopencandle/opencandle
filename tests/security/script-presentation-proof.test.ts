import {afterEach,expect,it} from 'vitest';
import {ScriptBindingRuntime} from '../../src/ui/script-binding-runtime';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {captureScriptPresentationJob,stageScriptPresentationResult,acceptScriptPresentationJob,createScriptPresentationPort,freezeScriptPresentationPlots,scriptPresentationNumber} from '../../src/chart/script-presentation-proof';
import {scriptPresentationFixture,SYNTHETIC_BINDING,syntheticRows,syntheticResult,settle} from '../fixtures/script-presentation';
const fixtures:ReturnType<typeof scriptPresentationFixture>[]=[];afterEach(()=>{for(const fixture of fixtures.splice(0))fixture.close();});
const fixture=()=>{const f=scriptPresentationFixture();fixtures.push(f);return f;};
async function accepted(){const f=fixture();f.runtime().update(f.context());f.complete();await settle();const view=f.port.captureReadout?.(SYNTHETIC_BINDING.id);expect(view?.state).toBe('ready');if(view?.state!=='ready')throw Error('Current synthetic readout unavailable.');return{f,view};}

it('UI plot budget matches existing worker emission units and accepts exactly two sets of5000 points',()=>{
 const worker=readFileSync(resolve('electron/script-runtime.cjs'),'utf8');expect(worker).toContain('OUTPUT_COUNT=10000');expect(worker).toContain('outputBytes:512*1024');expect(worker).toContain('name.length>128');expect(worker).toContain("Buffer.byteLength(JSON.stringify(output),'utf8')>LIMITS.outputBytes");
 const row=(id:string)=>({id,title:id,color:'#123456',values:Array.from({length:5000},(_,index)=>({time:index+1,value:index}))}),original=[row('First'),row('Second')],copied=freezeScriptPresentationPlots(original);
 expect(copied).not.toBeNull();expect(copied?.map(plot=>plot.values.length)).toEqual([5000,5000]);expect(Object.isFrozen(copied?.[1].values[4999])).toBe(true);expect(copied?.[1].values[4999].value).toBe(4999);
});
it('an over-ceiling array refuses before indexed descriptor traversal or scalar getters',()=>{
 let read=0;const values=new Array(10001);Object.defineProperty(values,'0',{get(){read++;throw Error('Over-budget indexed getter visited.');}});
 expect(freezeScriptPresentationPlots([{id:'Value',title:'Value',color:'#123456',values}])).toBeNull();expect(read).toBe(0);
 const plots=new Array(10001);Object.defineProperty(plots,'0',{get(){read++;throw Error('Over-budget plot getter visited.');}});expect(freezeScriptPresentationPlots(plots)).toBeNull();expect(read).toBe(0);
});
it('an incremental10001st emission cannot read its point after the first10000 were admitted',()=>{
 let read=0;const points=Array.from({length:10000},(_,index)=>({time:index+1,value:1})),last=new Array(1);Object.defineProperty(last,'0',{get(){read++;throw Error('Remaining point visited.');}});
 expect(freezeScriptPresentationPlots([{id:'First',title:'First',color:'#123456',values:points},{id:'Last',title:'Last',color:'#123456',values:last}])).toBeNull();expect(read).toBe(0);
});
it('an over-byte-budget UI envelope preserves the unchanged legacy calculation path without truncation',()=>{
 const f=fixture(),values=Array.from({length:10001},(_,index)=>({time:index+1,value:index})),result=syntheticResult();result.plots[0].values=values;
 expect(freezeScriptPresentationPlots(result.plots)).toBeNull();f.port.add(result,{id:SYNTHETIC_BINDING.id});expect(f.model().result.plots[0].values).toHaveLength(10001);expect(f.port.captureReadout?.(SYNTHETIC_BINDING.id).state).toBe('unavailable');
 const large=Array.from({length:1500},(_,index)=>({id:'lvplot:'+index,title:'界'.repeat(128),color:'#123456',values:[{time:1,value:1}]}));expect(freezeScriptPresentationPlots(large)).toBeNull();
});
it('numeric and envelope getters or coercion objects cannot execute through the owned numeric guard',()=>{
 let read=0;const point={time:1,get value(){read++;return 7;}},plot={id:'Value',title:'Value',color:'#123456',values:[point]};expect(freezeScriptPresentationPlots([plot])).toBeNull();expect(read).toBe(0);
 expect(freezeScriptPresentationPlots([{...plot,values:[{time:1,value:{valueOf(){read++;return 7;}}}]}])).toBeNull();expect(read).toBe(0);
 expect(()=>scriptPresentationNumber({time:1,get close(){read++;return 7;}},'close')).toThrow();expect(read).toBe(0);
});
it('a real port cannot be rebound to a public fake host or minted from matching source metadata',()=>{
 const f=fixture(),fakeHost={capture:()=>({isCurrent:()=>true})};expect(()=>createScriptPresentationPort(fakeHost,()=>f.port)).toThrow('already owned');
 const fake={input:{...f.input,bars:syntheticRows()},execution:'ordinary'},signal=new AbortController().signal;
 expect(captureScriptPresentationJob(f.port,fake,{})).toBeNull();
 stageScriptPresentationResult(f.port,{},syntheticResult());acceptScriptPresentationJob(f.port,{});f.port.add(syntheticResult(),{id:SYNTHETIC_BINDING.id});expect(f.port.captureReadout?.(SYNTHETIC_BINDING.id).state).toBe('unavailable');
});
it('a foreign private pipeline token cannot activate a genuine chart model',()=>{
 const f=fixture(),foreign=createScriptPresentationPort({capture:()=>({isCurrent:()=>true})},()=>({})),signal=new AbortController().signal;
 const token=captureScriptPresentationJob(foreign,{input:f.input,execution:'ordinary'},{}),result=syntheticResult();expect(token).toBeNull();
 stageScriptPresentationResult(f.port,token,result);f.port.add(result,{id:SYNTHETIC_BINDING.id});acceptScriptPresentationJob(f.port,token);expect(f.port.captureReadout?.(SYNTHETIC_BINDING.id).state).toBe('unavailable');
});
it('expected input/source accessors are rejected before their getter or a fake numeric producer can run',()=>{
 const f=fixture();let read=0;const source={...f.input.source};Object.defineProperty(source,'basisIdentity',{get(){read++;return f.input.source.basisIdentity;}});
 expect(captureScriptPresentationJob(f.port,{input:{...f.input,source},execution:'ordinary'},{})).toBeNull();expect(read).toBe(0);
});
it('retained views cannot invoke a new model/settings getter or revive after restoring old values',async()=>{
 const {f,view}=await accepted(),model=f.model(),settings=model.settings;let read=0;Object.defineProperty(model,'settings',{configurable:true,get(){read++;return settings;}});
 expect(()=>view.readAt(100)).toThrow();expect(read).toBe(0);Object.defineProperty(model,'settings',{configurable:true,writable:true,value:settings});expect(()=>view.assertCurrent()).toThrow();
});
it('owned numeric arrays are immutable and returned scalars expose no mutable historical aliases',async()=>{
 const {f,view}=await accepted(),value=view.readAt(100);expect(Object.isFrozen(value)).toBe(true);expect(Object.isFrozen(value.plots)).toBe(true);expect(Object.isFrozen(value.plots[0])).toBe(true);
 expect(()=>{f.model().result.plots[0].values[0].value=999;}).toThrow();expect(view.readAt(100).plots[0].value).toBe(7);
 expect(Reflect.ownKeys(view).sort()).toEqual(['assertCurrent','readAt','state']);
});
it('the one owned whole-result clone preserves numeric aliases without allocating a second graph',()=>{
 const f=fixture(),result=syntheticResult();(result.provenance as any).numeric=result.plots;f.port.add(result,{id:SYNTHETIC_BINDING.id});
 const owned=f.model().result;expect(owned.provenance.numeric).toBe(owned.plots);expect(owned.plots).not.toBe(result.plots);expect(owned.plots[0].values).not.toBe(result.plots[0].values);
 expect(Object.isFrozen(owned.provenance.numeric[0].values)).toBe(true);expect(Object.isFrozen(result.plots[0].values)).toBe(false);expect(f.port.captureReadout?.(SYNTHETIC_BINDING.id).state).toBe('unavailable');
});

it('exact publicly available controller input cannot mint a runtime dispatch or arbitrary accepted result',()=>{
 const f=fixture(),result=syntheticResult(),ticket={},fake={input:f.input,consumed:f.context().bars,current:()=>true,settled:()=>true,signal:new AbortController().signal};
 expect(fake.input).toBe(f.input);
 const legacyForgery=Reflect.apply(captureScriptPresentationJob,undefined,[f.port,{input:f.input,execution:'ordinary'},f.context().bars.map(row=>({...row})),()=>true,()=>true,fake.signal]);expect(legacyForgery).toBeNull();
 expect(captureScriptPresentationJob(f.port,fake,ticket)).toBeNull();
 expect(captureScriptPresentationJob(f.port,Object.create(ScriptBindingRuntime.prototype),ticket)).toBeNull();
 const runtime=f.runtime();expect(captureScriptPresentationJob(f.port,runtime,ticket)).toBeNull();
 stageScriptPresentationResult(f.port,ticket,result);f.port.add(result,{id:SYNTHETIC_BINDING.id});acceptScriptPresentationJob(f.port,ticket);
 expect(f.pending).toHaveLength(0);expect(f.port.list()).toHaveLength(1);expect(f.port.captureReadout?.(SYNTHETIC_BINDING.id).state).toBe('unavailable');
});

it('replacing a public static verifier cannot mint an actual private pipeline dispatch',()=>{
 const f=fixture(),ticket={},result=syntheticResult(),issuer=ScriptBindingRuntime as unknown as Record<string,unknown>,previous=Object.getOwnPropertyDescriptor(issuer,'presentationDispatch');
 const forged={bindingId:SYNTHETIC_BINDING.id,expected:{input:f.input,execution:'ordinary'},consumed:f.context().bars.map(row=>Object.freeze({...row})),current:()=>true,settled:()=>true,signal:new AbortController().signal};
 Object.defineProperty(issuer,'presentationDispatch',{configurable:true,writable:true,value:()=>forged});
 try{const token=captureScriptPresentationJob(f.port,{},ticket);expect(token).toBeNull();stageScriptPresentationResult(f.port,token,result);f.port.add(result,{id:SYNTHETIC_BINDING.id});acceptScriptPresentationJob(f.port,token);expect(f.pending).toHaveLength(0);expect(f.port.captureReadout?.(SYNTHETIC_BINDING.id).state).toBe('unavailable');}
 finally{if(previous)Object.defineProperty(issuer,'presentationDispatch',previous);else delete issuer.presentationDispatch;}
});
