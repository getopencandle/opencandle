import {afterEach,expect,it,vi} from 'vitest';
import {NativeRenderer} from '@luxalgo/vela';
import {ownedSourceFixture,stamp} from '../fixtures/seasonality-calendar-owned-source';
import {createImportDraft,prepareImportDraft,exampleDraft} from '../../src/domain/data-setup';
import type {BarDataset} from '../../src/domain/types';
import * as builtin from '../../src/chart/builtin-presentation-proof';
import {newYorkWallTime} from '../../src/domain/us-market-hours';
import {commandCanvas} from './chart-paint-harness';

// SYNTHETIC original local input, actual adapter constructor wrapper/accepted
// observer, actual source/port/native emission. Geometry does not mint values.
type Fixture=Awaited<ReturnType<typeof ownedSourceFixture>>;
const fixtures:Fixture[]=[],restores:Array<()=>void>=[];
const inputs={startYear:2016,endYear:2017,calendar:'utc-continuous',session:'continuous',dateLabels:'utc-date',closedThrough:'2024-01-01T00:00:00Z'};
function february():BarDataset{
 const dates=['2015-12',...Array.from({length:12},(_,i)=>'2016-'+String(i+1).padStart(2,'0')),'2017-01','2017-02'],closes=[125,110,120,115,130,125,120,130,140,135,140,130,135,142,150];
 const text='date,symbol,open,high,low,close,volume,label\n'+dates.map((date,index)=>{const value=closes[index];return `${date}-01,SYNTHETIC,${value-10},${value+40},${value-20},${value},100,SYNTHETIC EXAMPLE - not market data`;}).join('\n');
 const result=prepareImportDraft({...createImportDraft(),text,symbol:'SYNTHETIC',exchange:'SYNTHETIC-EXAMPLE',resolution:'1M',adjustment:'raw',session:'unknown',sourceLabel:'SYNTHETIC monthly calendar geometry'},{now:stamp('2024-01-01')});
 if(!result.dataset)throw Error(result.preview.headline);return result.dataset;
}
async function own(){const f=await ownedSourceFixture({dataset:february()});fixtures.push(f);return f;}
async function ready(f:Fixture,id:string){for(let turn=0;turn<100;turn++){const view=f.port.captureReadout!(id);if(view.state==='ready')return view;await Promise.resolve();}throw Error('Actual calendar C publication did not settle: '+JSON.stringify(f.port.list().find(row=>row.id===id)));}
const record=(f:Fixture,id:string)=>f.records.get(f.port.list().find(row=>row.id===id)!.rendererId)!;
const model=(f:Fixture,id:string)=>f.instances.get(f.port.list().find(row=>row.id===id)!.rendererId)!;
const geometry=(f:Fixture)=>f.native.coords.timeToLogical(stamp('2017-03-01')*1000);
afterEach(()=>{const failures:unknown[]=[];for(const release of [...restores.splice(0).reverse(),...fixtures.splice(0).reverse().map(f=>()=>f.dispose())])try{release();}catch(error){failures.push(error);}vi.restoreAllMocks();if(failures.length)throw new AggregateError(failures,'Calendar publication fixture cleanup failed.');});

it('actual accepted February source paints its March boundary at one future slot and keeps literal causal values',async()=>{
 const f=await own(),id=f.port.add('seasonality',inputs),view=await ready(f,id),native=record(f,id).model;
 expect(f.raw()).toHaveLength(15);expect(f.core.bars).toHaveLength(15);expect(f.native.coords.barCount).toBe(15);
 expect(view.readAt(stamp('2017-01-01')).plots.map(row=>row.value)).toEqual([118.8,-12,0,1]);
 expect(view.readAt(stamp('2017-02-01')).plots[0].value).toBeCloseTo(1704/11,12);
 const box=native.boxes.find((box:any)=>box.left===stamp('2017-02-01')*1000);
 expect(box.right).toBe(stamp('2017-03-01')*1000);expect(geometry(f)).toBe(15);
 expect(f.native.coords.logicalToTime(15)).toBe(stamp('2017-03-01')*1000);
});

it('compatible genuine C owners share one installation and removing A does not detach B',async()=>{
 const install=vi.spyOn(NativeRenderer.prototype,'lvSetFutureTimeSpine'),f=await own(),a=f.port.add('seasonality',inputs);await ready(f,a);
 const b=f.port.add('seasonality',inputs),view=await ready(f,b);expect(install).toHaveBeenCalledTimes(1);
 f.port.remove(a);view.assertCurrent();expect(geometry(f)).toBe(15);expect(view.readAt(stamp('2017-01-01')).plots[0].value).toBe(118.8);
 f.port.remove(b);expect(f.native.coords.timeToLogical(stamp('2017-03-01')*1000)).toBeCloseTo(14+28/31,14);
});

it('conflicting product add update and restore refuse before native or accepted scene mutation',async()=>{
 const f=await own(),id=f.port.add('seasonality',inputs),view=await ready(f,id),before=f.port.serialize(),native=record(f,id).model;
 const add=vi.spyOn(f.chart,'addNativeIndicator'),conflict={...inputs,calendar:'nyse',session:'regular'};
 expect(()=>f.port.add('seasonality',conflict)).toThrow(/calendar|conflict/i);expect(add).not.toHaveBeenCalled();
 expect(f.port.serialize()).toEqual(before);
 const other=f.port.add('seasonality',inputs);await ready(f,other);const saved=f.port.serialize();
 expect(()=>f.port.update(other,{inputs:conflict})).toThrow(/calendar|conflict/i);
 expect(()=>f.port.restore(saved.map(row=>row.id===other?{...row,inputs:{...row.inputs,...conflict}}:row))).toThrow(/calendar|conflict/i);
 expect(f.port.serialize()).toEqual(saved);expect(record(f,id).model).toBe(native);view.assertCurrent();expect(geometry(f)).toBe(15);
});

it('actual core show conflict rolls a started hidden C handle back without changing the accepted cohort',async()=>{
 const f=await own(),b=f.port.add('seasonality',{...inputs,calendar:'nyse',session:'regular'});await ready(f,b);f.port.update(b,{visible:false});
 const a=f.port.add('seasonality',inputs),view=await ready(f,a),old=record(f,a).model,row=record(f,b),instance=model(f,b);
 expect(row.native.started).toBe(true);expect(row.hidden).toBe(true);
 expect(()=>f.core.setVisible(row.id,true)).toThrow(/calendar|conflict/i);
 expect(row.hidden).toBe(true);expect(instance.settings.visible).toBe(false);expect(record(f,a).model).toBe(old);view.assertCurrent();expect(geometry(f)).toBe(15);
});

it('actual core show of a never-started hidden C refuses before original start mutates context or emits',async()=>{
 const f=await own(),a=f.port.add('seasonality',inputs),view=await ready(f,a),b=f.port.add('seasonality',{...inputs,calendar:'nyse',session:'regular'},{visible:false}),row=record(f,b),instance=model(f,b);
 expect(row.native.started).toBe(false);expect(instance.ctx).toBeNull();const output=row.model;
 const errors:unknown[]=[],off=f.chart.on('indicator:error' as any,(event:any)=>errors.push(event.error));restores.push(off);vi.spyOn(console,'error').mockImplementation(()=>{});
 f.core.setVisible(row.id,true);for(let turn=0;turn<16;turn++)await Promise.resolve();
 expect(errors).toHaveLength(1);expect(String(errors[0])).toMatch(/calendar|conflict/i);expect(row.hidden).toBe(true);expect(instance.ctx).toBeNull();expect(row.model).toBe(output);expect(f.port.captureReadout!(b).state).toBe('unavailable');view.assertCurrent();expect(geometry(f)).toBe(15);
});

it('falsy actual handle rollback failure reports both causes and cannot claim ready or alter A',async()=>{
 const f=await own(),b=f.port.add('seasonality',{...inputs,calendar:'nyse',session:'regular'});await ready(f,b);f.port.update(b,{visible:false});
 const a=f.port.add('seasonality',inputs),view=await ready(f,a),row=record(f,b),instance=model(f,b),handle=instance.handle;
 expect(row.native.started).toBe(true);const original=handle.setVisible;handle.setVisible=function(visible:boolean){if(!visible)throw 0;return original.call(this,visible);};restores.push(()=>{handle.setVisible=original;});
 let error:unknown;try{f.core.setVisible(row.id,true);}catch(cause){error=cause;}
 expect(error).toBeInstanceOf(AggregateError);expect((error as AggregateError).errors).toContain(0);expect(instance.recoveryError).toBeInstanceOf(AggregateError);expect(f.port.captureReadout!(b).state).toBe('unavailable');view.assertCurrent();expect(geometry(f)).toBe(15);
});

it('same-grid actual source replacement retires its old captured frame and accepts a fresh owned scene',async()=>{
 const f=await own(),id=f.port.add('seasonality',inputs),old=await ready(f,id),basis=f.host.capture()!,frame=f.host.accepted(basis.basis)!;
 expect(frame.calendar).toBeDefined();expect(geometry(f)).toBe(15);await f.apply(f.dataset);
 expect(()=>old.assertCurrent()).toThrow();expect(()=>frame.calendar!.install(new Float64Array([stamp('2017-03-01')*1000]),{lease:null,pending:false})).toThrow();
 const next=await ready(f,id);expect(next.readAt(stamp('2017-01-01')).plots[0].value).toBe(118.8);expect(geometry(f)).toBe(15);
});

it('actual native size theme and unchanged C recompute do not recapture or reinstall a valid calendar',async()=>{
 const capture=vi.spyOn(NativeRenderer.prototype,'lvCaptureTimeFrame'),install=vi.spyOn(NativeRenderer.prototype,'lvSetFutureTimeSpine'),f=await own(),id=f.port.add('seasonality',inputs),view=await ready(f,id),before={capture:capture.mock.calls.length,install:install.mock.calls.length};
 f.native.coords.setSize(600,220,1);f.renderer.applyConfig({layout:{background:'#ffffff',textColor:'#111111'}});expect(f.native.theme.background).toBe('#ffffff');f.port.recomputeInstance(id);view.assertCurrent();
 expect(capture).toHaveBeenCalledTimes(before.capture);expect(install).toHaveBeenCalledTimes(before.install);expect(geometry(f)).toBe(15);
});

it('rollback reentry replacing the logical id cannot hide or quarantine the new actual owner',async()=>{
 const f=await own(),b=f.port.add('seasonality',{...inputs,calendar:'nyse',session:'regular'});await ready(f,b);f.port.update(b,{visible:false});
 const a=f.port.add('seasonality',inputs),view=await ready(f,a),old=record(f,b),instance=model(f,b),handle=instance.handle,original=handle.setVisible;let replacement:string|undefined,armed=true;
 handle.setVisible=function(visible:boolean){if(!visible&&armed){armed=false;f.port.remove(b);replacement=f.port.add('seasonality',inputs,{id:b});}return original.call(this,visible);};
 restores.push(()=>{handle.setVisible=original;});
 expect(()=>f.core.setVisible(old.id,true)).toThrow(AggregateError);expect(replacement).toBe(b);
 const next=await ready(f,b),current=record(f,b);expect(current).not.toBe(old);expect(current.id).not.toBe(old.id);expect(current.hidden).toBe(false);expect(model(f,b).recoveryError).toBeUndefined();next.assertCurrent();view.assertCurrent();expect(geometry(f)).toBe(15);
});

it('actual alias loss holds required source charge even on force dispose until native copy detachment is proved',async()=>{
 let observed:builtin.BuiltinPresentationControl|undefined;const original=builtin.createBuiltinPresentationPort;
 const observe:typeof builtin.createBuiltinPresentationPort=(chart,publication,inputBars,build)=>original(chart,publication,inputBars,control=>{observed=control;return build(control);});
 vi.spyOn(builtin,'createBuiltinPresentationPort').mockImplementation(observe);
 const install=vi.spyOn(NativeRenderer.prototype,'lvSetFutureTimeSpine'),foreign=await own(),f=await own(),id=f.port.add('seasonality',inputs);await ready(f,id);
 const result=install.mock.results[0];if(result.type!=='return'||!observed)throw Error('The genuine owned pipeline/lease was not observed.');const lease=result.value,control=observed;
 const retained=()=>Object.getOwnPropertyDescriptor(control,'sourceAcceptedU')!.value as number,before=retained();expect(before).toBeGreaterThan(0);
 const coords=f.native.coords;restores.push(()=>{f.native.coords=coords;});f.native.coords=foreign.native.coords;
 expect(lease.isCurrent()).toBe(false);expect(lease.isDetached()).toBe(false);control.dispose();expect(retained()).toBe(before);expect(f.port.captureReadout!(id).state).toBe('unavailable');
 f.native.coords=coords;const scheduler=f.native.scheduler,problem=Error('SYNTHETIC repaint after exact copy detach');let armed=true;
 f.native.scheduler={invalidate(...args:unknown[]){if(armed){armed=false;throw problem;}return scheduler.invalidate(...args);}};
 restores.push(()=>{f.native.scheduler=scheduler;});
 expect(()=>f.port.remove(id)).toThrow();expect(lease.isDetached()).toBe(true);control.dispose();expect(retained()).toBe(0);
});

it('genuine ordinary HA and ordinary transform completions reaccept calendar frames without stale-key installation',async()=>{
 const f=await own(),id=f.port.add('seasonality',inputs);let view=await ready(f,id);
 for(const style of ['heikinashi','candles']){
  const basis=f.host.capture()!,old=f.host.accepted(basis.basis)!;expect(old.calendar).toBeDefined();f.style(style);
  expect(()=>view.assertCurrent()).toThrow();expect(()=>old.calendar!.install(new Float64Array([stamp('2017-03-01')*1000]),{lease:null,pending:false})).toThrow();
  view=await ready(f,id);expect(view.readAt(stamp('2017-01-01')).plots[0].value).toBe(118.8);expect(geometry(f)).toBe(15);
 }
});

it('source postcheck retirement and falsy repaint failure leave no uncharged or accepted calendar copy',async()=>{
 const original=NativeRenderer.prototype.lvSetFutureTimeSpine;let installing=false,lease:ReturnType<typeof original>|undefined;
 vi.spyOn(NativeRenderer.prototype,'lvSetFutureTimeSpine').mockImplementation(function(this:NativeRenderer,frame,labels){installing=true;try{lease=original.call(this,frame,labels);return lease;}finally{installing=false;}});
 const f=await own(),scheduler=f.native.scheduler;let changed=false,repaintFailed=false;
 f.native.scheduler={invalidate(...args:unknown[]){if(installing&&!changed){changed=true;f.stage(f.dataset);}else if(changed&&!installing&&!repaintFailed){repaintFailed=true;throw 0;}return scheduler.invalidate(...args);}};
 restores.push(()=>{f.native.scheduler=scheduler;});const id=f.port.add('seasonality',inputs);
 for(let turn=0;turn<100;turn++)await Promise.resolve();
 expect(changed).toBe(true);expect(lease).toBeDefined();expect(repaintFailed).toBe(true);expect(lease!.isDetached()).toBe(true);expect(lease!.isCurrent()).toBe(false);expect(f.port.captureReadout!(id).state).toBe('unavailable');expect(f.port.values(id).series).toEqual([]);
});

it('a genuine compatible never-started hidden core show becomes visible and publishes its owned calendar and values',async()=>{
 const f=await own(),id=f.port.add('seasonality',inputs,{visible:false}),row=record(f,id),instance=model(f,id);
 expect(row.native.started).toBe(false);expect(row.hidden).toBe(true);expect(instance.ctx).toBeNull();expect(f.port.captureReadout!(id).state).toBe('unavailable');
 f.core.setVisible(row.id,true);const view=await ready(f,id);
 expect(row.native.started).toBe(true);expect(row.hidden).toBe(false);expect(instance.settings.visible).toBe(true);expect(view.readAt(stamp('2017-01-01')).plots[0].value).toBe(118.8);expect(geometry(f)).toBe(15);
});

it('real scheduler force-disposal cannot discharge the supplied label and native install reservation mid-call',async()=>{
 let control:builtin.BuiltinPresentationControl|undefined;const create=builtin.createBuiltinPresentationPort;
 const observe:typeof builtin.createBuiltinPresentationPort=(chart,publication,inputBars,build)=>create(chart,publication,inputBars,owner=>{control=owner;return build(owner);});
 vi.spyOn(builtin,'createBuiltinPresentationPort').mockImplementation(observe);
 const retained=()=>control?Object.getOwnPropertyDescriptor(control,'sourceAcceptedU')!.value as number:NaN;
 const install=NativeRenderer.prototype.lvSetFutureTimeSpine;let installing=false,forced=false,before=NaN,mid=NaN,returned=NaN,lease:ReturnType<typeof install>|undefined;
 vi.spyOn(NativeRenderer.prototype,'lvSetFutureTimeSpine').mockImplementation(function(this:NativeRenderer,frame,labels){installing=true;try{lease=install.call(this,frame,labels);returned=retained();return lease;}finally{installing=false;}});
 const f=await own(),scheduler=f.native.scheduler;
 f.native.scheduler={invalidate(...args:unknown[]){if(installing&&!forced){forced=true;before=retained();control!.dispose();mid=retained();}return scheduler.invalidate(...args);}};
 restores.push(()=>{f.native.scheduler=scheduler;});const id=f.port.add('seasonality',inputs);
 for(let turn=0;turn<100;turn++)await Promise.resolve();
 expect(forced).toBe(true);expect(before).toBeGreaterThan(0);expect(mid).toBe(before);expect(returned).toBe(before);expect(lease).toBeDefined();expect(lease!.isDetached()).toBe(true);expect(retained()).toBe(0);expect(f.port.captureReadout!(id).state).toBe('unavailable');expect(f.port.values(id).series).toEqual([]);
});

function nyseDaily(through:string):BarDataset{
 const draft=exampleDraft('seasonality-equity-csv');
 const text=draft.text.trim().split('\n').filter((line,index)=>index===0||line.slice(0,10)<=through).map(line=>line.replace(/^(\d{4}-\d{2}-\d{2})(?=,)/,date=>new Date(newYorkWallTime(date,0)*1000).toISOString())).join('\n');
 const parsed=prepareImportDraft({...draft,text,sourceLabel:'SYNTHETIC NYSE calendar append '+through},{now:stamp('2024-01-01')});if(!parsed.dataset)throw Error(parsed.preview.headline);return parsed.dataset;
}
function paintMarch(f:Fixture,box:any){
 const coords=f.native.coords,pane=f.native.scene.panes.get('price');coords.setSize(800,200,1);coords.setViewport({barSpacing:3,rightOffset:0});pane.bounds={top:0,height:200};pane.scale={min:100,max:150,log:false,invert:false};
 const painter=f.native.indicatorSlices.drawScene,recording=commandCanvas();painter.setDeps({timeToLogical:(ms:number)=>coords.timeToLogical(ms),barAt:()=>null,theme:f.native.theme});painter.setSet({boxes:[box],lines:[],labels:[],polylines:[],linefills:[]});painter.drawBoxes(recording.ctx,800,200,(logical:number)=>coords.logicalToX(logical),(price:number)=>coords.priceToY(price,pane.scale,pane.bounds));return recording.commands.find(row=>row.op==='strokeRect')!.values;
}
it('genuine NYSE daily Friday-to-Monday full-source acceptance preserves the projected April edge and causal native paint',async()=>{
 const f=await ownedSourceFixture({dataset:nyseDaily('2017-03-31')});fixtures.push(f);
 const id=f.port.add('seasonality',{...inputs,calendar:'nyse',session:'regular',dateLabels:'calendar-midnight'}),view=await ready(f,id),count=f.raw().length,tail=count-1;
 const march1=Date.UTC(2017,2,1,5),friday=Date.UTC(2017,2,31,4),april1=Date.UTC(2017,3,1,4),monday=Date.UTC(2017,3,3,4),first=f.raw().findIndex(row=>row.time*1000===march1);
 expect(f.raw().at(-1)!.time*1000).toBe(friday);expect(tail-first).toBe(22);expect(f.native.coords.barCount).toBe(count);expect(f.core.bars).toHaveLength(count);
 const box=record(f,id).model.boxes.find((row:any)=>row.left===march1);expect(box.right).toBe(april1);expect(box.top).toBe(130);expect(box.bottom).toBeCloseTo(1495/12,12);
 const before=f.native.coords.timeToLogical(april1);expect(before).toBeCloseTo(tail+1/3,12);expect(f.native.coords.logicalToTime(tail+1/3)).toBeCloseTo(april1,3);
 expect(view.readAt(friday/1000).plots[0].value).toBeCloseTo(1495/12,12);expect(view.readAt(friday/1000).plots[3].value).toBe(1);
 const painted=paintMarch(f,box);expect(painted[2]).toBeCloseTo(67,10);expect(painted[3]).toBeCloseTo(65/3,10);
 // This is an actual owned full setMarket replacement with ONE real observation,
 // not direct applyBar/live growth, a projected source row or a fake date spine.
 const appended=nyseDaily('2017-04-03');expect(appended.bars).toHaveLength(count+1);expect(appended.bars.at(-1)!.time*1000).toBe(monday);await f.apply(appended);
 expect(()=>view.assertCurrent()).toThrow();const next=await ready(f,id);expect(f.raw()).toHaveLength(count+1);expect(f.native.coords.barCount).toBe(count+1);expect(f.core.bars).toHaveLength(count+1);
 expect(f.native.coords.timeToLogical(april1)).toBeCloseTo(before,12);expect(next.readAt(friday/1000).plots[0].value).toBeCloseTo(1495/12,12);expect(next.readAt(monday/1000).plots[0].value).toBeCloseTo(3250/23,12);expect(next.readAt(monday/1000).plots[3].value).toBe(1);
 const updated=record(f,id).model.boxes.find((row:any)=>row.left===march1);expect(paintMarch(f,updated)[2]).toBeCloseTo(67,10);expect(paintMarch(f,updated)[3]).toBeCloseTo(65/3,10);
});

it('same-model genuine source reentry and falsy old rollback failure cannot quarantine the replacement source',async()=>{
 const f=await own(),b=f.port.add('seasonality',{...inputs,calendar:'nyse',session:'regular'});await ready(f,b);f.port.update(b,{visible:false});
 const a=f.port.add('seasonality',inputs),oldView=await ready(f,a),row=record(f,b),instance=model(f,b),handle=instance.handle,original=handle.setVisible;
 const prior={entry:instance,settings:instance.settings,generation:instance.editGeneration,ctx:instance.ctx,handle,raw:f.raw()},next=february();let staged=false;
 handle.setVisible=function(visible:boolean){if(!visible){f.stage(next);staged=true;throw 0;}return original.call(this,visible);};restores.push(()=>{handle.setVisible=original;});
 let error:unknown;try{f.core.setVisible(row.id,true);}catch(cause){error=cause;}
 expect(staged).toBe(true);expect(error).toBeInstanceOf(AggregateError);expect((error as AggregateError).errors).toContain(0);
 expect(model(f,b)).toBe(prior.entry);expect(instance.settings).toBe(prior.settings);expect(instance.editGeneration).toBe(prior.generation);expect(instance.ctx).toBe(prior.ctx);expect(instance.handle).toBe(prior.handle);
 expect(f.raw()).not.toBe(prior.raw);expect(f.host.capture()?.phase).toBe('pending');expect(instance.recoveryError).toBeUndefined();expect(()=>oldView.assertCurrent()).toThrow();expect(f.port.captureReadout!(b).state).toBe('unavailable');
});

it('stale cohort disposal keeps the new genuine source reservation held through scheduler force-disposal and stops before labels',async()=>{
 const reservations:Array<{owner:object;slots:number}>=[];let control:builtin.BuiltinPresentationControl|undefined;
 const create=builtin.createBuiltinPresentationPort;
 const observe:typeof builtin.createBuiltinPresentationPort=(chart,publication,inputBars,build)=>create(chart,publication,inputBars,owner=>{
  control=owner;const reserve=owner.reserveSource;
  vi.spyOn(owner,'reserveSource').mockImplementation(function(this:builtin.BuiltinPresentationControl,model,owned,budget,cost){const reservation=reserve.call(this,model,owned,budget,cost);if(reservation)reservations.push({owner:model,slots:cost.numericSlots});return reservation;});
  return build(owner);
 });
 vi.spyOn(builtin,'createBuiltinPresentationPort').mockImplementation(observe);
 const axis=await import('../../src/chart/seasonality-calendar-axis'),spine=vi.spyOn(axis,'seasonalityCalendarSpine'),install=vi.spyOn(NativeRenderer.prototype,'lvSetFutureTimeSpine');
 const retained=()=>control?Object.getOwnPropertyDescriptor(control,'sourceAcceptedU')!.value as number:NaN;
 const foreign=await own(),f=await own(),a=f.port.add('seasonality',inputs);await ready(f,a);
 const first=install.mock.results[0];if(first.type!=='return'||!control)throw Error('The genuine accepted calendar lease/pipeline was not observed.');
 const lease=first.value,aSlots=reservations.find(row=>row.owner===model(f,a))!.slots;expect(retained()).toBe(aSlots);expect(lease.isCurrent()).toBe(true);expect(lease.isDetached()).toBe(false);
 const coords=f.native.coords,scheduler=f.native.scheduler;let forced=false,before=NaN,mid=NaN;
 restores.push(()=>{f.native.coords=coords;});
 f.native.scheduler={invalidate(...args:unknown[]){if(!forced&&lease.isDetached()){forced=true;before=retained();control!.dispose();mid=retained();}return scheduler.invalidate(...args);}};
 restores.push(()=>{f.native.scheduler=scheduler;});
 // add() prepares the real accepted source synchronously; its async continuation
 // has not consumed/pinned B's scene yet. No source notification occurs here.
 const b=f.port.add('seasonality',inputs),bSlots=reservations.find(row=>row.owner===model(f,b))!.slots;
 expect(bSlots).toBeGreaterThan(0);expect(retained()).toBe(aSlots+bSlots);expect(lease.isCurrent()).toBe(true);expect(install).toHaveBeenCalledTimes(1);expect(spine).toHaveBeenCalledTimes(1);
 f.native.coords=foreign.native.coords;expect(lease.isCurrent()).toBe(false);expect(lease.isDetached()).toBe(false);
 for(let turn=0;turn<100;turn++)await Promise.resolve();
 expect(forced).toBe(true);expect(before).toBe(aSlots+bSlots);
 // A's copy is already detached and its charge may discharge. B's actual
 // admitted reservation must stay covered until B's pending branch unwinds.
 expect(mid).toBeGreaterThanOrEqual(bSlots);expect(mid).toBeLessThanOrEqual(before);
 expect(lease.isDetached()).toBe(true);expect(spine).toHaveBeenCalledTimes(1);expect(install).toHaveBeenCalledTimes(1);expect(retained()).toBe(0);expect(f.port.captureReadout!(b).state).toBe('unavailable');expect(f.port.values(b).series).toEqual([]);
});
