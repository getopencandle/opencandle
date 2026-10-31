import {afterEach,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {logicalScriptFixture,logicalSourceRows} from '../fixtures/script-derived-position';
import {settle} from '../fixtures/script-presentation';
import {readScriptTables} from '../../src/chart/script-presentation-proof';

const SOURCE="({onBar(ctx){ctx.plot('Close',ctx.bar.close);if(ctx.index===0)ctx.state.t=ctx.table.new();ctx.table.cell(ctx.state.t,0,0,{text:'Accepted '+ctx.bar.close});}})";
const owned:Array<{close():Promise<void>}>=[];
afterEach(async()=>{const failures:unknown[]=[];for(const value of owned.splice(0).reverse())try{await value.close();}catch(error){failures.push(error);}if(failures.length)throw new AggregateError(failures,'Synthetic asynchronous native cleanup failed.');});

/** Original installed SDK data registry, verbatim in memory; no replacement native class or numerical receipt.
 * The existing fixture still owns its records Map/worker/adapter host/native arrays. Only the synchronous add fixture
 * is replaced with the actual core.addNativeIndicator -> await readyPromise -> startNativeIndicator path.
 */
function originalRegistry(records:Map<string,unknown>){
 const text=readFileSync(resolve('node_modules/@luxalgo/vela/dist/chunk-UNUVPQFW.js'),'utf8'),first=text.indexOf('var IndicatorRegistry = class {'),last=text.indexOf('\n};',first)+3;
 if(first<0||last<first)throw Error('Pinned original registry class boundary missing.');
 const source=text.slice(first,last),Registry=Function(source+';return IndicatorRegistry;')(),registry=new Registry();registry.records=records;
 return{registry,sourceSHA256:createHash('sha256').update(source).digest('hex')};
}
async function fixture(hidden=false){
 const f=await logicalScriptFixture({style:'candles'}),core=f.core,oldAdd=f.chart.addNativeIndicator,oldStart=core.startNativeIndicator;
 const starts=new Set<Promise<unknown>>(),errors:unknown[]=[];let ready=false,closed=false,resolveReady!:()=>void,off:(()=>void)|null=null;
 const gate=new Promise<void>(done=>{resolveReady=done;});
 const release=()=>{if(ready)return;ready=true;resolveReady();};
 const observeStart=function(this:unknown,...args:unknown[]){const task=Reflect.apply(oldStart,this,args) as Promise<unknown>;starts.add(task);task.then(()=>starts.delete(task),error=>{errors.push(error);starts.delete(task);});return task;};
 const actualAdd=(type:string)=>core.addNativeIndicator(type);
 const close=async()=>{if(closed)return;closed=true;const failures:unknown[]=[];
  // Remove before resolving the gate, so a failed test never paints a late owned start into a disposed fixture.
  if(f.chart.addNativeIndicator===actualAdd)f.chart.addNativeIndicator=oldAdd;
  try{f.dispose();}catch(error){failures.push(error);}release();
  const pending=await Promise.allSettled([...starts]);for(const row of pending)if(row.status==='rejected'&&!errors.includes(row.reason))failures.push(row.reason);
  try{await settle();}catch(error){failures.push(error);}try{off?.();}catch(error){failures.push(error);}off=null;
  if(core.startNativeIndicator===observeStart)core.startNativeIndicator=oldStart;
  failures.push(...errors);if(failures.length)throw new AggregateError(failures,'Original asynchronous SDK fixture failed.');
 };
 owned.push({close});
 try{
  const registry=originalRegistry(f.records);
  // Controlled synthetic native context only. All data/numbers/source permission remain the real existing fixture's.
  core.registry=registry.registry;core.config={market:{symbol:'SYNTHETIC',timeframe:'1m'},live:false};core.dataControl={};core.readyPromise=gate;
  core.startNativeIndicator=observeStart;f.chart.addNativeIndicator=actualAdd;
  off=f.chart.on('indicator:error',({error}:any)=>{errors.push(error);});f.binding.visible=!hidden;
  return{f,core,errors,close,release,registrySHA256:registry.sourceSHA256,async nativeReady(){release();await Promise.all([...starts]);await settle();}};
 }catch(error){try{await close();}catch(cleanup){throw new AggregateError([error,cleanup],'Async native fixture acquisition and cleanup failed.');}throw error;}
}
function unavailable(f:Awaited<ReturnType<typeof logicalScriptFixture>>){expect(f.port.captureReadout!(f.binding.id).state).toBe('unavailable');expect(()=>readScriptTables(f.port.captureTables!(f.binding.id))).toThrow();}

it('actual async SDK start binds the genuine accepted first result only after native publication',async()=>{
 const h=await fixture(),f=h.f;await f.start(SOURCE);const record=f.record(),calls=f.workerCalls();
 expect(record.native.started).not.toBe(true);expect(record.native.instance.ctx).toBeNull();unavailable(f);
 expect(()=>f.port.placeTables!(f.binding.id,'bottom')).toThrow();await h.nativeReady();
 expect(record.native.started).toBe(true);expect(f.port.captureReadout!(f.binding.id).state).toBe('ready');expect(f.view().readAt(160).plots[0].value).toBe(17);
 f.port.placeTables!(f.binding.id,'bottom');expect(readScriptTables(f.port.captureTables!(f.binding.id)).tables[0].cells[0].text).toBe('Accepted 17');
 expect(f.workerCalls()).toBe(calls);expect(h.errors).toEqual([]);
});
it('cancel/remove before actual SDK ready prevents late publication and first-result readout',async()=>{
 const h=await fixture(),f=h.f;await f.start(SOURCE);const record=f.record();unavailable(f);f.runtime.dispose();await h.nativeReady();
 expect(f.port.list()).toEqual([]);expect(h.core.registry.get(record.id)).toBeUndefined();expect(h.core.handles.has(record.id)).toBe(false);
 expect(f.native.scene.indicators.has(record.id)).toBe(false);unavailable(f);expect(h.errors).toEqual([]);
});
it('replacement accepted before actual SDK ready starts only current B and never exposes A',async()=>{
 const h=await fixture(),f=h.f;await f.start(SOURCE);const first=f.record().native.instance.result;
 await f.start(SOURCE.replace("'Accepted '","'Replacement '"));expect(f.record().native.instance.result).not.toBe(first);unavailable(f);
 await h.nativeReady();expect(f.view().readAt(160).plots[0].value).toBe(17);f.port.placeTables!(f.binding.id,'bottom');
 expect(readScriptTables(f.port.captureTables!(f.binding.id)).tables[0].cells[0].text).toBe('Replacement 17');expect(f.workerCalls()).toBe(2);expect(h.errors).toEqual([]);
});
it('hidden never-started result gains native/readout permission only through actual SDK show/start',async()=>{
 const h=await fixture(true),f=h.f;await f.start(SOURCE);await h.nativeReady();const record=f.record();
 expect(record.hidden).toBe(true);expect(record.native.started).not.toBe(true);unavailable(f);
 f.port.show(f.binding.id,true);await Promise.resolve();await settle();expect(record.native.started).toBe(true);expect(f.view().readAt(160).plots[0].value).toBe(17);
 f.port.placeTables!(f.binding.id,'bottom');expect(readScriptTables(f.port.captureTables!(f.binding.id)).tables[0].cells[0].text).toBe('Accepted 17');expect(h.errors).toEqual([]);
});
it('full fixture disposal before actual ready retires record/handle/model and settles the original start task',async()=>{
 const h=await fixture(),f=h.f;await f.start(SOURCE);const record=f.record();unavailable(f);await h.close();
 expect(h.core.registry.get(record.id)).toBeUndefined();expect(h.core.handles.has(record.id)).toBe(false);expect(f.native.scene.indicators.has(record.id)).toBe(false);
 unavailable(f);expect(h.errors).toEqual([]);
});
it('source retirement before actual native ready cannot promote the old accepted receipt',async()=>{
 const h=await fixture(),f=h.f;await f.start(SOURCE);f.stage(logicalSourceRows([10,18,19]));await h.nativeReady();unavailable(f);
 expect(()=>f.port.placeTables!(f.binding.id,'bottom')).toThrow();await f.apply();await f.start(SOURCE);
 expect(f.view().readAt(160).plots[0].value).toBe(19);f.port.placeTables!(f.binding.id,'bottom');
 expect(readScriptTables(f.port.captureTables!(f.binding.id)).tables[0].cells[0].text).toBe('Accepted 19');expect(h.errors).toEqual([]);
});

it('pending same-source transaction hold and rollback preserves its original origin until actual native start',async()=>{
 const h=await fixture(),f=h.f;await f.start(SOURCE);const calls=f.workerCalls(),lease=f.runtime.prepareBindings([f.binding]);
 lease.pauseAndCapture();unavailable(f);lease.rollback();lease.resume(false);await h.nativeReady();
 expect(f.view().readAt(160).plots[0].value).toBe(17);f.port.placeTables!(f.binding.id,'bottom');
 expect(readScriptTables(f.port.captureTables!(f.binding.id)).tables[0].cells[0].text).toBe('Accepted 17');expect(f.workerCalls()).toBe(calls);expect(h.errors).toEqual([]);
});
it('a retained pending checkpoint cannot resurrect the origin of its genuinely removed model',async()=>{
 const h=await fixture(),f=h.f;await f.start(SOURCE);const checkpoint=f.port.captureAcceptedResults!();f.port.remove(f.binding.id);
 f.port.restoreAcceptedResults!(checkpoint);await h.nativeReady();unavailable(f);expect(()=>f.port.placeTables!(f.binding.id,'bottom')).toThrow();expect(h.errors).toEqual([]);
});

it('an owned pending pane remount preserves the original lease until its actual replacement native start',async()=>{
 const h=await fixture(),f=h.f;await f.start(SOURCE);const first=f.record(),calls=f.workerCalls();f.port.place!(f.binding.id,{pane:'new',paneId:'pending-native-pane',ownScale:true});
 expect(f.record()).not.toBe(first);unavailable(f);await h.nativeReady();expect(f.record().native.started).toBe(true);expect(f.view().readAt(160).plots[0].value).toBe(17);
 f.port.placeTables!(f.binding.id,'bottom');expect(readScriptTables(f.port.captureTables!(f.binding.id)).tables[0].cells[0].text).toBe('Accepted 17');expect(f.workerCalls()).toBe(calls);expect(h.errors).toEqual([]);
});

it('removing a foreign binding made from genuine pending A output cannot retire A original source lease',async()=>{
 const h=await fixture(),f=h.f;await f.start(SOURCE);const record=f.record(),calls=f.workerCalls();
 const foreign=f.port.add(record.native.instance.result,{id:'foreign-pending-binding',title:'Synthetic foreign binding',pane:'price',visible:true});
 expect(f.port.captureReadout!(foreign).state).toBe('unavailable');f.port.remove(foreign);unavailable(f);await h.nativeReady();
 expect(record.native.started).toBe(true);expect(f.view().readAt(160).plots[0].value).toBe(17);f.port.placeTables!(f.binding.id,'bottom');
 expect(readScriptTables(f.port.captureTables!(f.binding.id)).tables[0].cells[0].text).toBe('Accepted 17');expect(f.workerCalls()).toBe(calls);expect(h.errors).toEqual([]);
});
