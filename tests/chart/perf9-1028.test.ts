import {afterEach,beforeEach,describe,expect,it} from 'vitest';
import {deferNativeStarts} from '../../src/chart/adapter';

// A prepend's native restarts run one per task with the renderer paint held until the last one.
// MessageChannel is replaced by a manual one so each task boundary is explicit.
const RealChannel=globalThis.MessageChannel;
let outbox:Array<()=>void>=[];
class ManualChannel{port1:{onmessage:((event:unknown)=>void)|null;close():void};port2:{postMessage(value:unknown):void};
 constructor(){const port1={onmessage:null as ((event:unknown)=>void)|null,close(){}};this.port1=port1;this.port2={postMessage:()=>{outbox.push(()=>port1.onmessage?.({data:0}));}};}}
const flush=async()=>{for(let index=0;index<50;index++)await Promise.resolve();};
const deliver=async()=>{const next=outbox.shift();expect(next).toBeDefined();next!();await flush();};
beforeEach(()=>{outbox=[];(globalThis as {MessageChannel:unknown}).MessageChannel=ManualChannel;});
afterEach(()=>{(globalThis as {MessageChannel:unknown}).MessageChannel=RealChannel;});

interface Record_ {id:string;hidden:boolean;native:{started:boolean;instance:{starts:number}}}
class FakeRenderer{
 calls:string[]=[];statuses:Array<[string,string]>=[];scheduler={levels:[] as number[],invalidate:(level:number)=>{this.scheduler.levels.push(level);}};
 renderFrame(level:number){this.calls.push('frame'+level);}
 paintData(){this.calls.push('paint');}
 renderCrosshairLayer(){this.calls.push('crosshair');}
 updateLegendValues(){this.calls.push('legend');}
 setIndicatorStatus(handle:{id:string},status:string){this.statuses.push([handle.id,status]);}
}
/** The shape of vela's Orchestrator that the deferral reads: restart inside setMarket, async start after readyPromise. */
class FakeCore{
 generation=0;readyPromise=Promise.resolve();order:string[]=[];
 registry:{get:(id:string)=>Record_|undefined;all:()=>Record_[]};handles=new Map<string,{id:string}>();
 constructor(public renderer:FakeRenderer,ids:string[]){const records=new Map(ids.map(id=>[id,{id,hidden:false,native:{started:false,instance:{starts:0}}}]));for(const id of ids)this.handles.set(id,{id});this.registry={get:id=>records.get(id),all:()=>[...records.values()]};}
 async startNativeIndicator(id:string,handle:{id:string}){await this.readyPromise;const record=this.registry.get(id);if(!record?.native||record.hidden)return;record.native.instance.starts++;record.native.started=true;this.order.push(id);this.renderer.setIndicatorStatus(handle,'idle');this.renderer.scheduler.invalidate(3);}
 async setMarket(){this.generation++;await Promise.resolve();for(const record of this.registry.all()){record.native.started=false;this.renderer.setIndicatorStatus(this.handles.get(record.id)!,'loading');}this.renderer.renderFrame(4);this.renderer.paintData();
  for(const record of this.registry.all())this.startNativeIndicator(record.id,this.handles.get(record.id)!);}
}
function rig(ids=['bb','rsi','macd','volume']){const renderer=new FakeRenderer(),core=new FakeCore(renderer,ids),chart={orchestrator:core};return{renderer,core,chart};}

describe('PERF9-1028 deferred native restarts after a prepend',()=>{
 it('queues every restart during setMarket and starts one per task, in order, exactly once',async()=>{
  const {renderer,core,chart}=rig(),deferred=deferNativeStarts(chart,renderer)!;expect(deferred).not.toBeNull();
  await core.setMarket();deferred.stop();await flush();
  expect(core.order).toEqual([]);
  const done=deferred.run();await flush();expect(core.order).toEqual([]);
  for(const [index,id] of ['bb','rsi','macd','volume'].entries()){await deliver();expect(core.order).toEqual(['bb','rsi','macd','volume'].slice(0,index+1));expect(core.order.at(-1)).toBe(id);}
  await done;expect(core.registry.all().map(record=>record.native.instance.starts)).toEqual([1,1,1,1]);expect(outbox).toEqual([]);
 });
 it('holds frames, direct paints, crosshair, legend values and status until the last start, then repaints once in full',async()=>{
  const {renderer,core,chart}=rig(['a','b']),deferred=deferNativeStarts(chart,renderer)!;
  await core.setMarket();deferred.stop();const done=deferred.run();
  renderer.renderFrame(3);renderer.renderCrosshairLayer();renderer.updateLegendValues();
  expect(renderer.calls).toEqual([]);expect(renderer.statuses).toEqual([]);
  await deliver();expect(renderer.calls).toEqual([]);expect(renderer.statuses).toEqual([]);expect(renderer.scheduler.levels).toEqual([3]);
  await deliver();await done;
  for(const name of ['renderFrame','paintData','renderCrosshairLayer','updateLegendValues','setIndicatorStatus'])expect(Object.hasOwn(renderer,name)).toBe(false);
  // The last status of each row wins, and the release asks for one full repaint.
  expect(renderer.statuses).toEqual([['a','idle'],['b','idle']]);expect(renderer.scheduler.levels).toEqual([3,3,4]);
  renderer.paintData();expect(renderer.calls).toEqual(['paint']);expect(Object.hasOwn(core,'startNativeIndicator')).toBe(false);
 });
 it('drops the remaining starts when a newer market supersedes the prepend, and still releases the paint',async()=>{
  const {renderer,core,chart}=rig(),deferred=deferNativeStarts(chart,renderer)!;
  await core.setMarket();deferred.stop();const done=deferred.run();
  await deliver();expect(core.order).toEqual(['bb']);
  await core.setMarket();await flush();// the newer setMarket restarts every native itself (not deferred: the override is gone)
  expect(core.order).toEqual(['bb','bb','rsi','macd','volume']);
  await deliver();await done;expect(core.order).toEqual(['bb','bb','rsi','macd','volume']);
  expect(Object.hasOwn(renderer,'renderFrame')).toBe(false);expect(renderer.scheduler.levels.at(-1)).toBe(4);
 });
 it('skips a record that started meanwhile, a removed record and a hidden one',async()=>{
  const {renderer,core,chart}=rig(['a','b','c']),deferred=deferNativeStarts(chart,renderer)!;
  await core.setMarket();deferred.stop();const done=deferred.run();
  const [a,,c]=core.registry.all();a.native.started=true;c.hidden=true;
  await deliver();await deliver();await deliver();await done;
  expect(core.order).toEqual(['b']);expect(a.native.instance.starts).toBe(0);expect(c.native.instance.starts).toBe(0);
 });
 it('runs with nothing queued, and run is memoized',async()=>{
  const {renderer,chart}=rig([]),deferred=deferNativeStarts(chart,renderer)!;deferred.stop();deferred.stop();
  const first=deferred.run();expect(deferred.run()).toBe(first);await first;expect(renderer.scheduler.levels).toEqual([4]);expect(Object.hasOwn(renderer,'paintData')).toBe(false);
 });
 it('defers nothing without the vela internals or when a method is already shadowed',()=>{
  const {renderer,core}=rig();
  expect(deferNativeStarts(null,renderer)).toBeNull();
  expect(deferNativeStarts({orchestrator:{...core,generation:undefined}},renderer)).toBeNull();
  expect(deferNativeStarts({orchestrator:core},null)).toBeNull();
  expect(deferNativeStarts({orchestrator:core},{scheduler:renderer.scheduler})).toBeNull();
  const shadowed=new FakeRenderer();shadowed.paintData=()=>{};expect(deferNativeStarts({orchestrator:core},shadowed)).toBeNull();
  const own=new FakeCore(renderer,['a']);own.startNativeIndicator=async()=>{};expect(deferNativeStarts({orchestrator:own},renderer)).toBeNull();
  expect(Object.hasOwn(renderer,'renderFrame')).toBe(false);
 });
 it('ends with the same starts, statuses and records as the undeferred restart',async()=>{
  const plain=rig();await plain.core.setMarket();await flush();
  const held=rig(),deferred=deferNativeStarts(held.chart,held.renderer)!;await held.core.setMarket();deferred.stop();const done=deferred.run();for(let index=0;index<4;index++)await deliver();await done;
  expect(held.core.order).toEqual(plain.core.order);
  expect(held.core.registry.all()).toEqual(plain.core.registry.all());
  const last=(statuses:Array<[string,string]>)=>Object.fromEntries(statuses);
  expect(last(held.renderer.statuses)).toEqual(last(plain.renderer.statuses));
 });
});
