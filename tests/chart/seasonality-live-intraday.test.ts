import {afterEach,expect,it,vi} from 'vitest';
import {ownedSourceFixture} from '../fixtures/seasonality-live-owned-source';
import {publishedSource,response,fridayMonday,syntheticSession,unix,flushMtf,type Request} from '../fixtures/qualified-nyse-mtf-source';
import type {Bar} from '../../src/domain/types';
import * as builtin from '../../src/chart/builtin-presentation-proof';

// SYNTHETIC actual provider transport, adapter constructor and canonical SDK.
// No caller/source registrar, fake result, budget override or native proof.
const cleanups:(()=>void|Promise<void>)[]=[];
afterEach(async()=>{const errors:unknown[]=[];for(const cleanup of cleanups.splice(0).reverse())try{await cleanup();}catch(error){errors.push(error);}vi.restoreAllMocks();if(errors.length)throw new AggregateError(errors,'Live C fixture cleanup failed.');});
const inputs={startYear:2023,endYear:2024,projectionGeometry:true,meanRow:true,deviationRow:true,positiveFrequencyRow:true};
const daily:Bar[]=[['2023-02-28T05:00:00Z',100],['2023-03-31T04:00:00Z',125],['2024-02-29T05:00:00Z',100],['2024-03-07T05:00:00Z',110],['2024-03-08T05:00:00Z',110]].map(([time,close])=>({time:unix(time as string),open:close as number,high:close as number,low:close as number,close:close as number,volume:1}));
function reply(sent:Request){const dailyCall=sent.timeframe==='1Day',frontier=sent.timeframe==='15Min'&&sent.start===unix('2024-03-01T05:00:00Z')&&sent.end===unix('2024-03-08T14:30:00Z'),bars=(dailyCall?daily:frontier?[...syntheticSession('2024-03-01T14:30:00Z',26,100),...fridayMonday()]:fridayMonday()).filter(row=>row.time>=sent.start&&row.time<=sent.end),value=response(sent,bars);if(dailyCall)value.value.seconds=86400;return value;}
async function own(style='candles'){
 const producer=await publishedSource({resolution:'30m',reply:async sent=>reply(sent)});cleanups.push(()=>producer.dispose());
 const f=await ownedSourceFixture({dataset:producer.raw(),style});cleanups.push(()=>f.dispose());return{f,producer};
}
type Fixture=Awaited<ReturnType<typeof own>>['f'];
async function ready(f:Fixture,id:string){for(let turn=0;turn<300;turn++){const value=f.port.captureReadout!(id);if(value.state==='ready')return value;await Promise.resolve();}throw Error('Actual live C did not settle: '+JSON.stringify(f.port.list().find(row=>row.id===id)));}
const record=(f:Fixture,id:string)=>f.records.get(f.port.list().find(row=>row.id===id)!.rendererId)!;

it('actual D history aligns literal March statistics and logical boxes to genuine loaded M/native time',async()=>{
 const {f,producer}=await own(),id=f.port.add('seasonality',inputs),view=await ready(f,id),time=f.raw().at(-1)!.time;
 expect(view.readAt(time).plots.map(row=>row.value)).toEqual([125,25,0,1]);
 const mounted=record(f,id).model,box=mounted.boxes.find((value:any)=>value.text==='25.00%');expect(box).toBeDefined();expect(box.xloc).toBe('bar_index');expect(box.left).toBeLessThan(0);expect(box.right).toBeGreaterThan(f.raw().length-1);expect(box.top).toBe(125);expect(box.bottom).toBe(100);
 expect(f.native.coords.timeToLogical(unix('2024-04-01T04:00:00Z')*1000)).toBe(box.right);expect(f.core.bars.length).toBe(f.raw().length);expect(producer.requests.some(sent=>sent.timeframe==='1Day'&&sent.start<unix('2023-03-01T00:00:00Z'))).toBe(true);
 expect(f.port.list().find(row=>row.id===id)!.policies.join(' ')).toContain('provider');
});
it('the actual HA view uses the same pre-HA daily statistics and accepted M output times',async()=>{
 const {f}=await own('heikinashi'),id=f.port.add('seasonality',inputs),view=await ready(f,id),time=f.raw().at(-1)!.time;
 expect(view.readAt(time).plots.map(row=>row.value)).toEqual([125,25,0,1]);expect(f.core.bars[0].close).not.toBe(f.raw()[0].close);expect(f.native.coords.times).toEqual(f.raw().map(row=>row.time*1000));
});
it('genuine accepted A blocks B before unwind and admits it only after authenticated peak-minus-retained work',async()=>{
 let pipeline:builtin.BuiltinPresentationControl|null=null;
 const original=builtin.createBuiltinPresentationPort;
 const instrument:typeof original=(chart,publication,bars,build)=>original(chart,publication,bars,control=>{pipeline=control;return build(control);});vi.spyOn(builtin,'createBuiltinPresentationPort').mockImplementation(instrument);
 const {f}=await own();expect(pipeline).not.toBeNull();const actual=pipeline! as builtin.BuiltinPresentationControl,retire=actual.retireSeasonalityPreparationWork.bind(actual),B={...inputs,startYear:2016};let b:string|null=null,beforeW=0,afterW=0,attempts=0;
 // Read actual ledger values only. Every reservation/group/ack still executes
 // the original implementation; the observer supplies no arithmetic or credit.
 vi.spyOn(actual,'retireSeasonalityPreparationWork').mockImplementation((model,result,reservation)=>{
  if(!attempts++){beforeW=(actual as unknown as {sourceAcceptedW:number}).sourceAcceptedW;b=f.port.add('seasonality',B);}
  retire(model,result,reservation);
 });
 const a=f.port.add('seasonality',inputs),first=await ready(f,a);await flushMtf();expect(b).not.toBeNull();expect(beforeW).toBeGreaterThan(15000000);expect(f.port.captureReadout!(b!).state).toBe('unavailable');expect(f.port.list().find(row=>row.id===b)!.diagnostics.join(' ')).toMatch(/budget/);
 afterW=(actual as unknown as {sourceAcceptedW:number}).sourceAcceptedW;expect(afterW).toBeLessThan(beforeW);first.assertCurrent();f.port.update(b!,{visible:false});f.port.update(b!,{visible:true});const second=await ready(f,b!);expect(second.readAt(f.raw().at(-1)!.time).plots.map(row=>row.value)).toEqual([125,25,0,1]);first.assertCurrent();
});

import {alpacaSeasonalityDailyUsage} from '../../src/domain/alpaca-live';
it('real Hide/Show retires the old numeric/native receipt and recomputes genuine live history',async()=>{
 const {f}=await own(),id=f.port.add('seasonality',inputs),before=await ready(f,id);expect(before.readAt(f.raw().at(-1)!.time).plots[0].value).toBe(125);f.port.update(id,{visible:false});expect(f.port.captureReadout!(id).state).toBe('unavailable');expect(()=>before.assertCurrent()).toThrow();await flushMtf();f.port.update(id,{visible:true});const after=await ready(f,id);expect(after.readAt(f.raw().at(-1)!.time).plots.map(row=>row.value)).toEqual([125,25,0,1]);
});
it('removing the actual pending C cannot refund uncancellable D response ownership before settlement',async()=>{
 let settle!:(value:ReturnType<typeof reply>)=>void,sent!:Request;const producer=await publishedSource({resolution:'30m',reply:async request=>{if(request.timeframe==='1Day'){sent=request;return new Promise(resolve=>{settle=resolve;});}return reply(request);}});cleanups.push(()=>producer.dispose());const f=await ownedSourceFixture({dataset:producer.raw()});cleanups.push(()=>f.dispose());cleanups.push(async()=>{if(settle){settle(reply(sent));await flushMtf();}});
 const id=f.port.add('seasonality',inputs);await flushMtf();expect(sent.timeframe).toBe('1Day');expect(f.port.captureReadout!(id).state).toBe('unavailable');f.port.remove(id);await flushMtf();expect(alpacaSeasonalityDailyUsage(producer.provider)!.numericSlots).toBeGreaterThanOrEqual(100000);settle(reply(sent));await flushMtf();expect(f.port.list().some(row=>row.id===id)).toBe(false);expect(alpacaSeasonalityDailyUsage(producer.provider)).toEqual({operations:0,numericSlots:0,pendingOwners:0});
});
