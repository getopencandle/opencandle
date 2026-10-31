import {afterEach,expect,it,vi} from 'vitest';
import type {NativeIndicatorOutput} from '@luxalgo/vela';
import {monthlyLocal,ownedSourceFixture,stamp} from '../fixtures/seasonality-c-owned-source';
import {defaultPlotStyle} from '../../src/chart/indicator-rendering';
import {SEASONALITY_PLOTS} from '../../src/domain/indicators-ext/seasonality-catalog';

// SYNTHETIC local observations, real source factory, real port and original pinned native core.
// These wrappers observe/interrupt actual publication; none supplies a source/native receipt.
type Fixture=Awaited<ReturnType<typeof ownedSourceFixture>>;
const fixtures:Fixture[]=[];
const restore:Array<()=>void>=[];
const inputs={startYear:2016,endYear:2017,calendar:'utc-continuous',session:'continuous',dateLabels:'utc-date',closedThrough:'2024-01-01T00:00:00Z'};
async function fixture(){const h=await ownedSourceFixture();fixtures.push(h);return h;}
function add(h:Fixture,styled=false){
 const saved=styled?{plots:Object.fromEntries(SEASONALITY_PLOTS.map((id,index)=>[id,defaultPlotStyle('seasonality',id,index)]))}:undefined;
 const id=h.port.add('seasonality',inputs,saved),row=h.port.list().find(row=>row.id===id);
 if(!row?.rendererId)throw Error('The actual native Seasonality owner was not created.');
 const model=h.instances.get(row.rendererId),record=h.records.get(row.rendererId);
 if(!model?.ctx||!record)throw Error('The actual native model/context is missing.');
 return{id,rendererId:row.rendererId,model,record,ctx:model.ctx};
}
async function ready(h:Fixture,id:string){await vi.waitFor(()=>expect(h.port.values(id).series).toHaveLength(4));}
async function drained(){for(let turn=0;turn<24;turn++)await Promise.resolve();}
afterEach(()=>{
 vi.restoreAllMocks();const failures:unknown[]=[];
 for(const release of [...restore.splice(0).reverse(),...fixtures.splice(0).reverse().map(h=>()=>h.dispose())])try{release();}catch(error){failures.push(error);}
 if(failures.length)throw new AggregateError(failures,'Synthetic publication fixture cleanup failed.');
});

it('publishes the genuine four-series source model and literal January projection before exposing a scalar',async()=>{
 const h=await fixture(),entry=add(h);await ready(h,entry.id);
 const value=h.port.values(entry.id),native=entry.record.model;
 expect(value.series).toHaveLength(4);
 expect(native.tables).toHaveLength(1);expect(native.series).toHaveLength(4);
 const january=native.boxes.find((row:{left:number})=>row.left===stamp('2017-01-01')*1000);
 // Jan2016:110/125-1=-12%; Jan2017 opening baseline135 =>118.8.
 expect(january).toMatchObject({top:135,right:stamp('2017-02-01')*1000});expect(january.bottom).toBeCloseTo(118.8,12);
 expect(native.series.every((row:{points:readonly unknown[]})=>row.points.length===14)).toBe(true);
 const view=h.port.captureReadout!(entry.id);expect(view.state).toBe('ready');
 if(view.state!=='ready')throw Error(view.message);
 expect(view.readAt(h.raw()[13].time).plots[0].value).toBeCloseTo(118.8,12);view.assertCurrent();
});

for(const failure of [undefined,0])it(`does not settle an actual native emission that then throws ${String(failure)}`,async()=>{
 const h=await fixture(),entry=add(h),emit=entry.ctx.emit;let attempts=0;
 entry.ctx.emit=function(this:typeof entry.ctx,output:NativeIndicatorOutput){const returned=emit.call(this,output);if(output.tables?.length){attempts++;throw failure;}return returned;};
 restore.push(()=>{entry.ctx.emit=emit;});
 await vi.waitFor(()=>expect(attempts).toBe(1));await drained();
 // Delegation proves the source/numerics/native paint path ran before the failure.
 expect(entry.record.model.tables).toHaveLength(1);
 expect(h.port.values(entry.id).series).toHaveLength(0);
 expect(h.port.captureReadout!(entry.id).state).toBe('unavailable');
 expect(h.port.list().find(row=>row.id===entry.id)?.diagnostics.join(' ')).toContain('rollback was incomplete');
});

it('rejects native-array replacement during optional scalar preparation even when that scalar refuses',async()=>{
 const h=await fixture(),entry=add(h,true),status=entry.ctx.setStatus,descriptor=Object.getOwnPropertyDescriptor;
 let armed=false,replaced=false,colorReads=0;const restoreColors:Array<()=>void>=[];
 entry.ctx.setStatus=function(this:typeof entry.ctx,...args:unknown[]){const result=status.apply(this,args);if(entry.record.model?.tables?.length)armed=true;return result;};
 restore.push(()=>{entry.ctx.setStatus=status;});
 vi.spyOn(Object,'getOwnPropertyDescriptor').mockImplementation((target:object,key:PropertyKey)=>{
  // This is the scalar's admitted settings lookup, after mandatory output acceptance.
  // The replacement is an actual owned native model edit, never an invented receipt.
  if(armed&&!replaced&&target===entry.model.settings.plots&&entry.model.result.series.some((plot:{id:string})=>plot.id===key)){
   replaced=true;const plot=entry.model.result.series.find((plot:{id:string})=>plot.id===key)!;
   const style=entry.model.settings.plots[plot.id];
   if(!style)throw Error('An actual owned plot style is required by this boundary case.');
   const color=descriptor(style,'color')!;const restoreColor=()=>Object.defineProperty(style,'color',color);restoreColors.push(restoreColor);restore.push(restoreColor);
   Object.defineProperty(style,'color',{configurable:true,enumerable:true,get(){colorReads++;throw Error('A style accessor must not execute.');}});
   entry.ctx.emit({...entry.model.acceptedOutput,series:[...entry.model.acceptedOutput.series]});
  }
  return descriptor(target,key);
 });
 await vi.waitFor(()=>expect(replaced).toBe(true));await drained();
 expect(colorReads).toBe(0);expect(h.port.captureReadout!(entry.id).state).toBe('unavailable');
 for(const release of restoreColors)release();
 expect(h.port.values(entry.id).series).toHaveLength(0);
 expect(entry.model.acceptedOutput.series).not.toBe(entry.record.model.series);
 expect(h.port.list().find(row=>row.id===entry.id)?.diagnostics.join(' ')).toContain('rollback was incomplete');
});

it('a source write during actual emission cannot settle old source metadata or expose its scalar',async()=>{
 const h=await fixture(),entry=add(h),emit=entry.ctx.emit,replacement=monthlyLocal();let switched=false;
 entry.ctx.emit=function(this:typeof entry.ctx,output:NativeIndicatorOutput){const result=emit.call(this,output);if(output.tables?.length&&!switched){switched=true;h.stage(replacement);}return result;};
 restore.push(()=>{entry.ctx.emit=emit;});
 await vi.waitFor(()=>expect(switched).toBe(true));await drained();
 expect(h.source().datasetId).toBe(replacement.provenance.datasetId);
 expect(h.port.captureReadout!(entry.id).state).toBe('unavailable');
 expect(entry.model.result.series).toHaveLength(0);expect(entry.model.informationBars).toBe(0);
 // The native call really happened, but its old result never became the current accepted model.
 expect(entry.record.model.tables).toHaveLength(1);expect(entry.model.acceptedOutput.tables??[]).toHaveLength(0);
});

it('attempts every original-source unsubscribe and native removal when the first C cleanup throws',async()=>{
 const h=await fixture(),subscribe=h.host.subscribeSettled,live=new Set<number>(),released:number[]=[];
 let serial=0,armed=false,thrown=false;const failure=Error('First actual host unsubscription failed.');
 h.host.subscribeSettled=function(this:Fixture['host'],listener){const off=subscribe.call(this,listener),id=++serial;live.add(id);return()=>{if(!live.delete(id))return;released.push(id);off();if(armed&&!thrown){thrown=true;throw failure;}};};
 restore.push(()=>{h.host.subscribeSettled=subscribe;});
 const a=add(h),b=add(h);await ready(h,a.id);await ready(h,b.id);const before=[...live];
 expect(before.length).toBeGreaterThanOrEqual(2);armed=true;
 let error:unknown;try{h.port.dispose();}catch(cause){error=cause;}
 expect(thrown).toBe(true);expect(error).toBeInstanceOf(AggregateError);
 expect(live.size).toBe(0);for(const id of before)expect(released).toContain(id);
 expect(h.records.has(a.rendererId)).toBe(false);expect(h.records.has(b.rendererId)).toBe(false);
 expect(h.core.handles.has(a.rendererId)).toBe(false);expect(h.core.handles.has(b.rendererId)).toBe(false);
 expect(h.port.captureReadout!(a.id).state).toBe('unavailable');expect(h.port.captureReadout!(b.id).state).toBe('unavailable');
});

it('shares only deeply frozen scalar output in the public C summary while ordinary values remain independent mutable clones',async()=>{
 const h=await fixture(),entry=add(h);await ready(h,entry.id);
 const summary=h.port.values(entry.id),plot=summary.series[0],view=h.port.captureReadout!(entry.id);
 expect(Object.keys(summary).sort()).toEqual(['diagnostics','id','policies','series']);
 for(const value of [summary,summary.series,summary.diagnostics,summary.policies,...summary.series,...summary.series.map(row=>row.values)])expect(Object.isFrozen(value)).toBe(true);
 expect(plot.values).toBe(entry.model.result.series[0].values);expect(plot.values[13]).toBeCloseTo(118.8,12);
 expect(Reflect.set(plot.values,'13',999)).toBe(false);expect(Reflect.deleteProperty(plot.values,'13')).toBe(false);
 expect(Reflect.set(plot,'values',[])).toBe(false);expect(Reflect.set(summary,'series',[])).toBe(false);
 expect(Reflect.set(summary.diagnostics,'0','Forged diagnostic')).toBe(false);
 expect(h.port.values(entry.id)).toBe(summary);expect(entry.model.result.series[0].values[13]).toBeCloseTo(118.8,12);
 expect(view.state).toBe('ready');if(view.state!=='ready')throw Error(view.message);
 expect(view.readAt(h.raw()[13].time).plots[0].value).toBeCloseTo(118.8,12);view.assertCurrent();
 const ordinary=h.port.values(h.id);expect(Object.isFrozen(ordinary)).toBe(false);expect(Object.isFrozen(ordinary.series[0].values)).toBe(false);
 ordinary.series[0].values[1]=999;expect(h.port.values(h.id).series[0].values[1]).toBeCloseTo(117.5,12);
});

it('a source replacement and reentrant loading read cannot borrow the old cached C scalar arrays',async()=>{
 const h=await fixture(),entry=add(h);await ready(h,entry.id);
 const previous=h.port.values(entry.id),oldView=h.port.captureReadout!(entry.id),oldSource=h.source(),oldRaw=h.raw(),replacement=monthlyLocal(),emit=entry.ctx.emit;
 let gapReads=0,gapValues:ReturnType<Fixture['port']['values']>|undefined,armed=true;
 entry.ctx.emit=function(this:typeof entry.ctx,output:NativeIndicatorOutput){const result=emit.call(this,output);if(armed&&(output.series?.length??0)===0){armed=false;gapReads++;gapValues=h.port.values(entry.id);}return result;};
 restore.push(()=>{entry.ctx.emit=emit;});
 h.stage(replacement);expect(h.source()).not.toBe(oldSource);expect(h.raw()).not.toBe(oldRaw);
 expect(h.port.values(entry.id).series).toHaveLength(0);expect(h.port.captureReadout!(entry.id).state).toBe('unavailable');
 h.port.recomputeInstance(entry.id);expect(gapReads).toBe(1);expect(gapValues?.series).toHaveLength(0);
 await drained();expect(h.port.values(entry.id).series).toHaveLength(0);
 await h.applyStaged();await ready(h,entry.id);
 const current=h.port.values(entry.id);expect(current).not.toBe(previous);
 expect(current.series[0].values).toBe(entry.model.result.series[0].values);expect(current.series[0].values[13]).toBeCloseTo(118.8,12);
 if(oldView.state!=='ready')throw Error('The initial accepted scalar was not established.');
 expect(()=>oldView.assertCurrent()).toThrow();
 const fresh=h.port.captureReadout!(entry.id);expect(fresh.state).toBe('ready');if(fresh.state!=='ready')throw Error(fresh.message);
 expect(fresh.readAt(h.raw()[13].time).plots[0].value).toBeCloseTo(118.8,12);fresh.assertCurrent();
});

it('C Remove still detaches its actual native model and source subscriptions when the first host unsubscribe fails',async()=>{
 const h=await fixture(),subscribe=h.host.subscribeSettled,live=new Set<number>();let serial=0,armed=false,thrown=false;
 const failure=Error('First Remove source unsubscription failed.');
 h.host.subscribeSettled=function(this:Fixture['host'],listener){const off=subscribe.call(this,listener),id=++serial;live.add(id);return()=>{if(!live.delete(id))return;off();if(armed&&!thrown){thrown=true;throw failure;}};};
 restore.push(()=>{h.host.subscribeSettled=subscribe;});
 const entry=add(h);await ready(h,entry.id);expect(live.size).toBeGreaterThan(0);armed=true;
 let error:unknown;try{h.port.remove(entry.id);}catch(cause){error=cause;}
 expect(thrown).toBe(true);expect(error).toBeInstanceOf(AggregateError);
 const failures:unknown[]=[],pending:unknown[]=[error];while(pending.length&&failures.length<16){const next=pending.shift();failures.push(next);if(next instanceof AggregateError)pending.push(...next.errors);}
 expect(failures).toContain(failure);expect(live.size).toBe(0);
 expect(h.records.has(entry.rendererId)).toBe(false);expect(h.port.list().some(row=>row.id===entry.id)).toBe(false);
 expect(h.core.handles.has(entry.rendererId)).toBe(false);
 expect(()=>h.port.values(entry.id)).toThrow('Unknown indicator instance');
 expect(h.port.values(h.id).series[0].values[1]).toBeCloseTo(117.5,12);expect(h.port.captureReadout!(h.id).state).toBe('ready');
});
