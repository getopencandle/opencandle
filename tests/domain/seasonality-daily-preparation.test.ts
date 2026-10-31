import {afterEach,expect,it} from 'vitest';
import {acquireAlpacaSeasonalityDailyDemand,captureAlpacaSeasonalityDailyPlan,releaseAlpacaSeasonalityDailyDemand,releaseAlpacaSeasonalityDailyWindow,createAlpacaSeasonalityPreparationGroup,runAlpacaSeasonalityPreparationGroup,releaseAlpacaSeasonalityPreparationGroup,alpacaSeasonalityPreparationGroupKnown,alpacaSeasonalityPreparationSettled,subscribeAlpacaSeasonalityPreparationSettled,alpacaSeasonalityDailyUsage,captureAlpacaSeasonalityFrozenHistoryOrigin,alpacaSeasonalityFrozenHistoryOriginCurrent,sealAlpacaSeasonalityFrozenHistoryOrigin,alpacaSeasonalityFrozenHistoryOriginFacts,releaseAlpacaSeasonalityFrozenHistoryOrigin} from '../../src/domain/alpaca-live';
import {publishedSource,response,fridayMonday,unix,flushMtf,type Request} from '../fixtures/qualified-nyse-mtf-source';
import type {Bar} from '../../src/domain/types';
import {acquireAlpacaSeasonalityFrozenHistoryHold,releaseAlpacaSeasonalityFrozenHistoryHold} from '../../src/domain/alpaca-live';
import {consumeAlpacaSeasonalityDailyWindow,alpacaSeasonalityPreparationWorkFacts} from '../../src/domain/alpaca-live';
import {revokeAlpacaSeasonalityFrozenHistoryOrigin,acquireAlpacaSeasonalityFrozenSelectionHold} from '../../src/domain/alpaca-live';

const cleanups:(()=>void|Promise<void>)[]=[];
afterEach(async()=>{const errors:unknown[]=[];for(const cleanup of cleanups.splice(0).reverse())try{await cleanup();}catch(error){errors.push(error);}if(errors.length)throw new AggregateError(errors,'SYNTHETIC preparation cleanup failed.');});
const daily:Bar[]=[{time:unix('2024-03-07T05:00:00Z'),open:100,high:100,low:100,close:100,volume:1},{time:unix('2024-03-08T05:00:00Z'),open:110,high:110,low:110,close:110,volume:1}];
function reply(sent:Request){const result=response(sent,daily);result.value.seconds=86400;return result;}
async function source(answer?:(sent:Request)=>ReturnType<typeof reply>|Promise<ReturnType<typeof reply>>){
 const producer=await publishedSource({reply:async sent=>sent.timeframe==='1Day'?(answer?answer(sent):reply(sent)):response(sent,fridayMonday().filter(row=>row.time>=sent.start&&row.time<=sent.end))});cleanups.push(()=>producer.dispose());return producer;
}
function demand(producer:Awaited<ReturnType<typeof source>>){
 const raw=producer.raw(),plan=captureAlpacaSeasonalityDailyPlan(raw,raw.bars,2024,2024)!;expect(plan).not.toBeNull();const key=acquireAlpacaSeasonalityDailyDemand(plan,new AbortController().signal);cleanups.push(()=>releaseAlpacaSeasonalityDailyDemand(key));return{key,plan};
}
function group(producer:Awaited<ReturnType<typeof source>>){const actual=demand(producer),key=createAlpacaSeasonalityPreparationGroup(actual.key,actual.plan,new AbortController().signal);cleanups.push(()=>releaseAlpacaSeasonalityPreparationGroup(key));return{...actual,group:key};}

it('authenticates fixed group membership without consulting copied or proxy fields',async()=>{
 const producer=await source(),actual=group(producer);let reads=0;const fake=new Proxy({},{get(){reads++;throw Error('foreign get');},getOwnPropertyDescriptor(){reads++;throw Error('foreign descriptor');}});
 expect(alpacaSeasonalityPreparationGroupKnown(actual.group)).toBe(true);expect(alpacaSeasonalityPreparationGroupKnown({...actual.group})).toBe(false);expect(alpacaSeasonalityPreparationGroupKnown(fake)).toBe(false);
 expect(alpacaSeasonalityPreparationSettled(fake as typeof actual.group)).toBe(false);expect(()=>subscribeAlpacaSeasonalityPreparationSettled(fake as typeof actual.group,()=>{})).toThrow();expect(reads).toBe(0);
});
it('idle cancellation is terminal and never starts an actual request',async()=>{
 const producer=await source(),actual=group(producer);expect(alpacaSeasonalityPreparationSettled(actual.group)).toBe(false);releaseAlpacaSeasonalityPreparationGroup(actual.group);
 expect(alpacaSeasonalityPreparationSettled(actual.group)).toBe(true);await expect(runAlpacaSeasonalityPreparationGroup(actual.group)).rejects.toThrow();expect(producer.requests.filter(row=>row.timeframe==='1Day')).toHaveLength(0);
 releaseAlpacaSeasonalityDailyDemand(actual.key);expect(alpacaSeasonalityDailyUsage(producer.provider)).toEqual({operations:0,numericSlots:0,pendingOwners:0});
});
it('retains physical response ownership after cancellation until the original invocation unwinds',async()=>{
 let settle!:(value:ReturnType<typeof reply>)=>void,sent!:Request;const producer=await source(request=>{sent=request;return new Promise(resolve=>{settle=resolve;});}),actual=group(producer);
 cleanups.push(async()=>{settle(reply(sent));await flushMtf();});const pending=runAlpacaSeasonalityPreparationGroup(actual.group).then(()=>false,()=>true);expect(alpacaSeasonalityDailyUsage(producer.provider)!.numericSlots).toBeGreaterThanOrEqual(100000);
 releaseAlpacaSeasonalityPreparationGroup(actual.group);expect(alpacaSeasonalityPreparationSettled(actual.group)).toBe(false);expect(alpacaSeasonalityDailyUsage(producer.provider)!.numericSlots).toBeGreaterThanOrEqual(100000);
 settle(reply(sent));expect(await pending).toBe(true);expect(alpacaSeasonalityPreparationSettled(actual.group)).toBe(true);
});
it('a cancelled A group cannot cancel a genuine B client sharing the pending history',async()=>{
 let settle!:(value:ReturnType<typeof reply>)=>void,sent!:Request;const producer=await source(request=>{sent=request;return new Promise(resolve=>{settle=resolve;});}),a=group(producer),b=group(producer);
 cleanups.push(async()=>{settle(reply(sent));await flushMtf();});const first=runAlpacaSeasonalityPreparationGroup(a.group).then(()=>false,()=>true),second=runAlpacaSeasonalityPreparationGroup(b.group);releaseAlpacaSeasonalityPreparationGroup(a.group);settle(reply(sent));
 expect(await first).toBe(true);const window=await second;cleanups.push(()=>releaseAlpacaSeasonalityDailyWindow(window));expect(alpacaSeasonalityPreparationSettled(a.group)).toBe(true);expect(alpacaSeasonalityPreparationSettled(b.group)).toBe(true);expect(producer.requests.filter(row=>row.timeframe==='1Day')).toHaveLength(1);
});
it('settlement notice is once only and its active callback remains funded through reentrant release',async()=>{
 const producer=await source(),actual=group(producer);let calls=0,inside=0;const wake=()=>{calls++;releaseAlpacaSeasonalityPreparationGroup(actual.group);inside=alpacaSeasonalityDailyUsage(producer.provider)!.numericSlots;};
 const off=subscribeAlpacaSeasonalityPreparationSettled(actual.group,wake);cleanups.push(off);const window=await runAlpacaSeasonalityPreparationGroup(actual.group);cleanups.push(()=>releaseAlpacaSeasonalityDailyWindow(window));await flushMtf();
 expect(calls).toBe(1);expect(inside).toBeGreaterThanOrEqual(alpacaSeasonalityDailyUsage(producer.provider)!.numericSlots+128);off();releaseAlpacaSeasonalityPreparationGroup(actual.group);await flushMtf();expect(calls).toBe(1);
});
it('completed group membership survives release as fixed dead metadata without restoring authority',async()=>{
 const producer=await source(),actual=group(producer),window=await runAlpacaSeasonalityPreparationGroup(actual.group);releaseAlpacaSeasonalityDailyWindow(window);releaseAlpacaSeasonalityPreparationGroup(actual.group);releaseAlpacaSeasonalityDailyDemand(actual.key);
 expect(alpacaSeasonalityPreparationGroupKnown(actual.group)).toBe(true);expect(alpacaSeasonalityPreparationSettled(actual.group)).toBe(true);await expect(runAlpacaSeasonalityPreparationGroup(actual.group)).rejects.toThrow();expect(alpacaSeasonalityDailyUsage(producer.provider)).toEqual({operations:0,numericSlots:0,pendingOwners:0});
});
it('origin capture reserves the full copy walk and keeps W until its actual constructor stack unwinds',async()=>{
 const producer=await source(),raw=producer.raw(),origin=captureAlpacaSeasonalityFrozenHistoryOrigin(raw,raw.bars)!;expect(origin).not.toBeNull();cleanups.push(()=>releaseAlpacaSeasonalityFrozenHistoryOrigin(origin));
 expect(alpacaSeasonalityDailyUsage(producer.provider)).toEqual({operations:512*raw.bars.length+32768,numericSlots:16*raw.bars.length+1024,pendingOwners:0});expect(alpacaSeasonalityFrozenHistoryOriginCurrent(origin,raw,raw.bars)).toBe(true);expect(sealAlpacaSeasonalityFrozenHistoryOrigin(origin)).toBe(true);
 expect(alpacaSeasonalityDailyUsage(producer.provider)!.operations).toBe(512*raw.bars.length+32768);await flushMtf();expect(alpacaSeasonalityDailyUsage(producer.provider)!.operations).toBe(0);expect(alpacaSeasonalityDailyUsage(producer.provider)!.numericSlots).toBe(16*raw.bars.length+1024);
});
it('sealed origin cutoff remains fixed across real ticks and cannot borrow a newly observed clock',async()=>{
 const producer=await source(),raw=producer.raw(),origin=captureAlpacaSeasonalityFrozenHistoryOrigin(raw,raw.bars)!;expect(origin).not.toBeNull();cleanups.push(()=>releaseAlpacaSeasonalityFrozenHistoryOrigin(origin));expect(sealAlpacaSeasonalityFrozenHistoryOrigin(origin)).toBe(true);const facts=alpacaSeasonalityFrozenHistoryOriginFacts(origin)!;
 expect(facts).toMatchObject({informationTime:unix('2024-03-11T20:00:00Z'),observedThrough:unix('2024-03-11T20:00:00Z'),sourceRows:raw.bars.length,resolution:'30m',symbol:'GME',feed:'sip',adjustment:'split'});
 producer.setNow(unix('2024-03-12T20:00:00Z'));producer.emit({schemaVersion:1,kind:'batch',bars:[],trades:[{symbol:'GME',time:unix('2024-03-11T19:59:30Z'),price:140,high:140,low:140,size:1}],receivedAt:''});await flushMtf();
 expect(alpacaSeasonalityFrozenHistoryOriginFacts(origin)).toBe(facts);expect(alpacaSeasonalityFrozenHistoryOriginCurrent(origin,raw,raw.bars)).toBe(false);expect(sealAlpacaSeasonalityFrozenHistoryOrigin(origin)).toBe(false);
});
it('a changed original before sealing refuses the C origin and releases only after unwind',async()=>{
 const producer=await source(),raw=producer.raw(),origin=captureAlpacaSeasonalityFrozenHistoryOrigin(raw,raw.bars)!;expect(origin).not.toBeNull();cleanups.push(()=>releaseAlpacaSeasonalityFrozenHistoryOrigin(origin));producer.emit({schemaVersion:1,kind:'batch',bars:[],trades:[{symbol:'GME',time:unix('2024-03-11T19:59:30Z'),price:140,high:140,low:140,size:1}],receivedAt:''});await flushMtf();
 expect(sealAlpacaSeasonalityFrozenHistoryOrigin(origin)).toBe(false);expect(alpacaSeasonalityFrozenHistoryOriginFacts(origin)).toBeNull();expect(alpacaSeasonalityDailyUsage(producer.provider)!.numericSlots).toBeGreaterThan(0);await flushMtf();expect(alpacaSeasonalityDailyUsage(producer.provider)).toEqual({operations:0,numericSlots:0,pendingOwners:0});
});
it('unknown origin copies are rejected without fields and actual drop clears the frozen debit once',async()=>{
 const producer=await source(),raw=producer.raw(),origin=captureAlpacaSeasonalityFrozenHistoryOrigin(raw,raw.bars)!;expect(origin).not.toBeNull();let reads=0;const fake=new Proxy({},{get(){reads++;throw Error('foreign get');},getOwnPropertyDescriptor(){reads++;throw Error('foreign descriptor');}});
 expect(captureAlpacaSeasonalityFrozenHistoryOrigin(fake as typeof raw,raw.bars)).toBeNull();expect(sealAlpacaSeasonalityFrozenHistoryOrigin(fake as typeof origin)).toBe(false);expect(alpacaSeasonalityFrozenHistoryOriginFacts({...origin})).toBeNull();releaseAlpacaSeasonalityFrozenHistoryOrigin(fake as typeof origin);expect(reads).toBe(0);
 releaseAlpacaSeasonalityFrozenHistoryOrigin(origin);expect(alpacaSeasonalityDailyUsage(producer.provider)!.numericSlots).toBeGreaterThan(0);await flushMtf();releaseAlpacaSeasonalityFrozenHistoryOrigin(origin);expect(alpacaSeasonalityDailyUsage(producer.provider)).toEqual({operations:0,numericSlots:0,pendingOwners:0});
});
it('revocation hides frozen facts immediately while two real borrowed stacks retain the complete graph',async()=>{
 const producer=await source(),raw=producer.raw(),origin=captureAlpacaSeasonalityFrozenHistoryOrigin(raw,raw.bars)!;expect(origin).not.toBeNull();expect(sealAlpacaSeasonalityFrozenHistoryOrigin(origin)).toBe(true);await flushMtf();
 const a=acquireAlpacaSeasonalityFrozenHistoryHold(origin)!,b=acquireAlpacaSeasonalityFrozenHistoryHold(origin)!;expect(a).not.toBeNull();expect(b).not.toBeNull();cleanups.push(()=>releaseAlpacaSeasonalityFrozenHistoryHold(a),()=>releaseAlpacaSeasonalityFrozenHistoryHold(b),()=>releaseAlpacaSeasonalityFrozenHistoryOrigin(origin));
 releaseAlpacaSeasonalityFrozenHistoryOrigin(origin);expect(alpacaSeasonalityFrozenHistoryOriginFacts(origin)).toBeNull();expect(acquireAlpacaSeasonalityFrozenHistoryHold(origin)).toBeNull();
 expect(alpacaSeasonalityDailyUsage(producer.provider)).toEqual({operations:2048,numericSlots:16*raw.bars.length+1024+256,pendingOwners:0});
 releaseAlpacaSeasonalityFrozenHistoryHold(a);expect(alpacaSeasonalityDailyUsage(producer.provider)!.operations).toBe(2048);await flushMtf();expect(alpacaSeasonalityDailyUsage(producer.provider)).toEqual({operations:1024,numericSlots:16*raw.bars.length+1024+128,pendingOwners:0});
 releaseAlpacaSeasonalityFrozenHistoryHold(b);expect(alpacaSeasonalityDailyUsage(producer.provider)!.numericSlots).toBeGreaterThan(128);await flushMtf();expect(alpacaSeasonalityDailyUsage(producer.provider)).toEqual({operations:0,numericSlots:0,pendingOwners:0});
});
it('foreign borrow keys inspect no fields and cannot refund another actual stack',async()=>{
 const producer=await source(),raw=producer.raw(),origin=captureAlpacaSeasonalityFrozenHistoryOrigin(raw,raw.bars)!;expect(sealAlpacaSeasonalityFrozenHistoryOrigin(origin)).toBe(true);await flushMtf();const hold=acquireAlpacaSeasonalityFrozenHistoryHold(origin)!;expect(hold).not.toBeNull();
 cleanups.push(()=>releaseAlpacaSeasonalityFrozenHistoryHold(hold),()=>releaseAlpacaSeasonalityFrozenHistoryOrigin(origin));let reads=0;const fake=new Proxy({},{get(){reads++;throw Error('foreign get');},getOwnPropertyDescriptor(){reads++;throw Error('foreign descriptor');}}),before=alpacaSeasonalityDailyUsage(producer.provider);
 expect(acquireAlpacaSeasonalityFrozenHistoryHold(fake as typeof origin)).toBeNull();releaseAlpacaSeasonalityFrozenHistoryHold(fake as typeof hold);releaseAlpacaSeasonalityFrozenHistoryHold({...hold});expect(alpacaSeasonalityDailyUsage(producer.provider)).toEqual(before);expect(reads).toBe(0);
});
it('provider disposal revokes a sealed origin without pretending its external frozen graph detached',async()=>{
 const producer=await source(),raw=producer.raw(),origin=captureAlpacaSeasonalityFrozenHistoryOrigin(raw,raw.bars)!;expect(sealAlpacaSeasonalityFrozenHistoryOrigin(origin)).toBe(true);await flushMtf();const hold=acquireAlpacaSeasonalityFrozenHistoryHold(origin)!;expect(hold).not.toBeNull();
 cleanups.push(()=>releaseAlpacaSeasonalityFrozenHistoryHold(hold),()=>releaseAlpacaSeasonalityFrozenHistoryOrigin(origin));producer.dispose();expect(alpacaSeasonalityFrozenHistoryOriginFacts(origin)).toBeNull();expect(acquireAlpacaSeasonalityFrozenHistoryHold(origin)).toBeNull();
 expect(alpacaSeasonalityDailyUsage(producer.provider)).toEqual({operations:1024,numericSlots:16*raw.bars.length+1024+128,pendingOwners:0});releaseAlpacaSeasonalityFrozenHistoryHold(hold);await flushMtf();
 expect(alpacaSeasonalityDailyUsage(producer.provider)).toEqual({operations:0,numericSlots:16*raw.bars.length+1024,pendingOwners:0});releaseAlpacaSeasonalityFrozenHistoryOrigin(origin);expect(alpacaSeasonalityDailyUsage(producer.provider)).toEqual({operations:0,numericSlots:0,pendingOwners:0});
});
const choices={startYear:2024,endYear:2024,excludedMonths:'',includeDevelopingInSummaries:false,meanRow:false,deviationRow:false,positiveFrequencyRow:false,projectionGeometry:false};
it('genuine window work facts wait for computation unwind while keeping every live result slot',async()=>{
 const producer=await source(),actual=group(producer),window=await runAlpacaSeasonalityPreparationGroup(actual.group);cleanups.push(()=>releaseAlpacaSeasonalityDailyWindow(window));const raw=producer.raw(),times=raw.bars.map(row=>row.time),before=alpacaSeasonalityDailyUsage(producer.provider)!;
 const result=consumeAlpacaSeasonalityDailyWindow(window,{times,firstObservedTime:times[0]},choices);expect(result.status).toBe('ready');const first=alpacaSeasonalityPreparationWorkFacts(actual.group,result)!;
 expect(first).not.toBeNull();expect(first.unwound).toBe(false);expect(first.computationOperations).toBeGreaterThan(0);expect(alpacaSeasonalityDailyUsage(producer.provider)!.operations).toBe(before.operations+first.computationOperations);
 const resultSlots=alpacaSeasonalityDailyUsage(producer.provider)!.numericSlots;await flushMtf();expect(alpacaSeasonalityPreparationWorkFacts(actual.group,result)!.unwound).toBe(true);expect(alpacaSeasonalityDailyUsage(producer.provider)!.operations).toBe(before.operations);expect(alpacaSeasonalityDailyUsage(producer.provider)!.numericSlots).toBe(resultSlots);
 expect(alpacaSeasonalityPreparationWorkFacts({...actual.group},result)).toBeNull();expect(alpacaSeasonalityPreparationWorkFacts(actual.group,{...result})).toBeNull();
});
it('reentrant source disposal keeps the borrowed cache/window charge until the failing consume stack unwinds',async()=>{
 const producer=await source(),actual=group(producer),window=await runAlpacaSeasonalityPreparationGroup(actual.group);cleanups.push(()=>releaseAlpacaSeasonalityDailyWindow(window));const times=producer.raw().bars.map(row=>row.time);let invalidated=false,inside=0;
 const supplied=new Proxy(choices,{getOwnPropertyDescriptor(target,key){if(!invalidated){invalidated=true;producer.dispose();inside=alpacaSeasonalityDailyUsage(producer.provider)!.numericSlots;}return Reflect.getOwnPropertyDescriptor(target,key);}});
 expect(()=>consumeAlpacaSeasonalityDailyWindow(window,{times,firstObservedTime:times[0]},supplied)).toThrow();expect(inside).toBeGreaterThan(100002);expect(alpacaSeasonalityDailyUsage(producer.provider)!.numericSlots).toBeGreaterThan(100002);
 await flushMtf();expect(alpacaSeasonalityDailyUsage(producer.provider)).toEqual({operations:0,numericSlots:0,pendingOwners:0});
});
it('reentrant observer off and group cancellation keep the complete group fee through the active callback',async()=>{
 const producer=await source(),actual=group(producer);let off=()=>{},insideW=0,insideU=0,calls=0;const wake=()=>{calls++;off();releaseAlpacaSeasonalityPreparationGroup(actual.group);const usage=alpacaSeasonalityDailyUsage(producer.provider)!;insideW=usage.operations;insideU=usage.numericSlots;};off=subscribeAlpacaSeasonalityPreparationSettled(actual.group,wake);cleanups.push(off);
 const window=await runAlpacaSeasonalityPreparationGroup(actual.group);cleanups.push(()=>releaseAlpacaSeasonalityDailyWindow(window));await flushMtf();const after=alpacaSeasonalityDailyUsage(producer.provider)!;
 expect(calls).toBe(1);expect(insideW).toBe(after.operations+4096+1024);expect(insideU).toBe(after.numericSlots+1024+128);
});
it('pre-copy graph hold is resource-only and survives logical revoke until its actual release',async()=>{
 const producer=await source(),raw=producer.raw(),origin=captureAlpacaSeasonalityFrozenHistoryOrigin(raw,raw.bars)!;expect(origin).not.toBeNull();const hold=acquireAlpacaSeasonalityFrozenHistoryHold(origin)!;expect(hold).not.toBeNull();cleanups.push(()=>releaseAlpacaSeasonalityFrozenHistoryHold(hold),()=>releaseAlpacaSeasonalityFrozenHistoryOrigin(origin));
 expect(acquireAlpacaSeasonalityFrozenSelectionHold(origin)).toBeNull();expect(alpacaSeasonalityFrozenHistoryOriginFacts(origin)).toBeNull();revokeAlpacaSeasonalityFrozenHistoryOrigin(origin);expect(alpacaSeasonalityFrozenHistoryOriginCurrent(origin,raw,raw.bars)).toBe(false);expect(sealAlpacaSeasonalityFrozenHistoryOrigin(origin)).toBe(false);releaseAlpacaSeasonalityFrozenHistoryOrigin(origin);
 await flushMtf();expect(alpacaSeasonalityDailyUsage(producer.provider)).toEqual({operations:1024,numericSlots:16*raw.bars.length+1024+128,pendingOwners:0});releaseAlpacaSeasonalityFrozenHistoryHold(hold);expect(alpacaSeasonalityDailyUsage(producer.provider)!.numericSlots).toBeGreaterThan(0);await flushMtf();expect(alpacaSeasonalityDailyUsage(producer.provider)).toEqual({operations:0,numericSlots:0,pendingOwners:0});
});

import {alpacaSeasonalityFrozenHistoryHasMonths,captureAlpacaSeasonalityFrozenMonthLease,consumeAlpacaSeasonalityFrozenMonthLease,releaseAlpacaSeasonalityFrozenMonthLease} from '../../src/domain/alpaca-live';
it('a genuine freeze captures only an already-qualified immutable F cache once',async()=>{
 const producer=await source(),actual=group(producer),window=await runAlpacaSeasonalityPreparationGroup(actual.group);cleanups.push(()=>releaseAlpacaSeasonalityDailyWindow(window));const raw=producer.raw(),origin=captureAlpacaSeasonalityFrozenHistoryOrigin(raw,raw.bars)!;cleanups.push(()=>releaseAlpacaSeasonalityFrozenHistoryOrigin(origin));
 expect(origin).not.toBeNull();expect(alpacaSeasonalityFrozenHistoryHasMonths(origin)).toBe(true);expect(captureAlpacaSeasonalityFrozenMonthLease(origin,2024,2024)).toBeNull();expect(sealAlpacaSeasonalityFrozenHistoryOrigin(origin)).toBe(true);await flushMtf();
 const before=alpacaSeasonalityDailyUsage(producer.provider)!,lease=captureAlpacaSeasonalityFrozenMonthLease(origin,2024,2024)!;cleanups.push(()=>releaseAlpacaSeasonalityFrozenMonthLease(lease));expect(lease).not.toBeNull();const cache=consumeAlpacaSeasonalityFrozenMonthLease(lease);
 expect(Object.isFrozen(cache)).toBe(true);expect(Object.isFrozen(cache.months)).toBe(true);expect(cache.months.find(row=>row.month==='2024-02')!.close).toBeNull();expect(()=>consumeAlpacaSeasonalityFrozenMonthLease(lease)).toThrow();expect(producer.requests.filter(row=>row.timeframe==='1Day')).toHaveLength(1);
 releaseAlpacaSeasonalityFrozenMonthLease(lease);expect(alpacaSeasonalityDailyUsage(producer.provider)!.numericSlots).toBeGreaterThan(before.numericSlots);await flushMtf();expect(alpacaSeasonalityDailyUsage(producer.provider)).toEqual(before);
});
it('a freeze without F stays unavailable even after a later genuine cache completes',async()=>{
 const producer=await source(),raw=producer.raw(),origin=captureAlpacaSeasonalityFrozenHistoryOrigin(raw,raw.bars)!;cleanups.push(()=>releaseAlpacaSeasonalityFrozenHistoryOrigin(origin));expect(sealAlpacaSeasonalityFrozenHistoryOrigin(origin)).toBe(true);expect(alpacaSeasonalityFrozenHistoryHasMonths(origin)).toBe(false);
 const actual=group(producer),window=await runAlpacaSeasonalityPreparationGroup(actual.group);cleanups.push(()=>releaseAlpacaSeasonalityDailyWindow(window));expect(producer.requests.filter(row=>row.timeframe==='1Day')).toHaveLength(1);expect(alpacaSeasonalityFrozenHistoryHasMonths(origin)).toBe(false);expect(captureAlpacaSeasonalityFrozenMonthLease(origin,2024,2024)).toBeNull();
});
it('frozen F lease rejects foreign keys and unsupported years, and survives revoke only as a paid stack',async()=>{
 const producer=await source(),actual=group(producer),window=await runAlpacaSeasonalityPreparationGroup(actual.group);cleanups.push(()=>releaseAlpacaSeasonalityDailyWindow(window));const raw=producer.raw(),origin=captureAlpacaSeasonalityFrozenHistoryOrigin(raw,raw.bars)!;cleanups.push(()=>releaseAlpacaSeasonalityFrozenHistoryOrigin(origin));expect(sealAlpacaSeasonalityFrozenHistoryOrigin(origin)).toBe(true);await flushMtf();
 expect(captureAlpacaSeasonalityFrozenMonthLease({...origin},2024,2024)).toBeNull();expect(captureAlpacaSeasonalityFrozenMonthLease(origin,2016,2024)).toBeNull();expect(captureAlpacaSeasonalityFrozenMonthLease(origin,2024,2029)).toBeNull();const lease=captureAlpacaSeasonalityFrozenMonthLease(origin,2024,2024)!;expect(lease).not.toBeNull();cleanups.push(()=>releaseAlpacaSeasonalityFrozenMonthLease(lease));expect(()=>consumeAlpacaSeasonalityFrozenMonthLease({...lease})).toThrow();
 const held=alpacaSeasonalityDailyUsage(producer.provider)!;revokeAlpacaSeasonalityFrozenHistoryOrigin(origin);releaseAlpacaSeasonalityFrozenHistoryOrigin(origin);expect(alpacaSeasonalityFrozenHistoryHasMonths(origin)).toBe(false);expect(()=>consumeAlpacaSeasonalityFrozenMonthLease(lease)).toThrow();expect(alpacaSeasonalityDailyUsage(producer.provider)).toEqual(held);
 releaseAlpacaSeasonalityFrozenMonthLease(lease);expect(alpacaSeasonalityDailyUsage(producer.provider)).toEqual(held);await flushMtf();expect(alpacaSeasonalityDailyUsage(producer.provider)!.numericSlots).toBeLessThan(held.numericSlots);
});

import {acquireAlpacaSeasonalityFrozenFrameHold,finishAlpacaSeasonalityFrozenFrameConstruction,releaseAlpacaSeasonalityFrozenFrameHold} from '../../src/domain/alpaca-live';
it('qualified-frame resource hold retires construction W only and keeps frame plus origin U until release',async()=>{
 const producer=await source(),raw=producer.raw(),origin=captureAlpacaSeasonalityFrozenHistoryOrigin(raw,raw.bars)!;cleanups.push(()=>releaseAlpacaSeasonalityFrozenHistoryOrigin(origin));expect(sealAlpacaSeasonalityFrozenHistoryOrigin(origin)).toBe(true);await flushMtf();const before=alpacaSeasonalityDailyUsage(producer.provider)!,hold=acquireAlpacaSeasonalityFrozenFrameHold(origin)!;cleanups.push(()=>releaseAlpacaSeasonalityFrozenFrameHold(hold));expect(hold).not.toBeNull();const during=alpacaSeasonalityDailyUsage(producer.provider)!;
 expect(during.operations-before.operations).toBe(1024*raw.bars.length+32768);expect(during.numericSlots-before.numericSlots).toBe(raw.bars.length+256);finishAlpacaSeasonalityFrozenFrameConstruction(hold);expect(alpacaSeasonalityDailyUsage(producer.provider)).toEqual(during);await flushMtf();expect(alpacaSeasonalityDailyUsage(producer.provider)).toEqual({...before,numericSlots:during.numericSlots});
 revokeAlpacaSeasonalityFrozenHistoryOrigin(origin);releaseAlpacaSeasonalityFrozenHistoryOrigin(origin);expect(alpacaSeasonalityDailyUsage(producer.provider)!.numericSlots).toBe(during.numericSlots);releaseAlpacaSeasonalityFrozenFrameHold(hold);expect(alpacaSeasonalityDailyUsage(producer.provider)!.numericSlots).toBe(during.numericSlots);await flushMtf();expect(alpacaSeasonalityDailyUsage(producer.provider)).toEqual({operations:0,numericSlots:0,pendingOwners:0});
});
it('frame holds authenticate both origin keys before reading caller fields and never mint source facts',async()=>{
 const producer=await source(),raw=producer.raw(),origin=captureAlpacaSeasonalityFrozenHistoryOrigin(raw,raw.bars)!;cleanups.push(()=>releaseAlpacaSeasonalityFrozenHistoryOrigin(origin));expect(sealAlpacaSeasonalityFrozenHistoryOrigin(origin)).toBe(true);await flushMtf();let reads=0;const fake=new Proxy({},{get(){reads++;throw Error('foreign get');},getOwnPropertyDescriptor(){reads++;throw Error('foreign descriptor');}}),before=alpacaSeasonalityDailyUsage(producer.provider);
 expect(acquireAlpacaSeasonalityFrozenFrameHold(fake as typeof origin)).toBeNull();expect(acquireAlpacaSeasonalityFrozenFrameHold(origin,fake as typeof origin)).toBeNull();expect(acquireAlpacaSeasonalityFrozenFrameHold(origin,origin)).toBeNull();finishAlpacaSeasonalityFrozenFrameConstruction(fake as never);releaseAlpacaSeasonalityFrozenFrameHold(fake as never);expect(reads).toBe(0);expect(alpacaSeasonalityDailyUsage(producer.provider)).toEqual(before);
});
it('a finer resource borrower lasts only through construction unwind while the parent remains held',async()=>{
 const producer=await source(),raw=producer.raw(),parent=captureAlpacaSeasonalityFrozenHistoryOrigin(raw,raw.bars)!,fine=captureAlpacaSeasonalityFrozenHistoryOrigin(raw,raw.bars)!;cleanups.push(()=>releaseAlpacaSeasonalityFrozenHistoryOrigin(parent),()=>releaseAlpacaSeasonalityFrozenHistoryOrigin(fine));expect(sealAlpacaSeasonalityFrozenHistoryOrigin(parent)).toBe(true);expect(sealAlpacaSeasonalityFrozenHistoryOrigin(fine)).toBe(true);await flushMtf();const before=alpacaSeasonalityDailyUsage(producer.provider)!,hold=acquireAlpacaSeasonalityFrozenFrameHold(parent,fine)!;cleanups.push(()=>releaseAlpacaSeasonalityFrozenFrameHold(hold));expect(hold).not.toBeNull();expect(alpacaSeasonalityDailyUsage(producer.provider)!.operations-before.operations).toBe(1024*(2*raw.bars.length)+32768);
 releaseAlpacaSeasonalityFrozenHistoryOrigin(fine);releaseAlpacaSeasonalityFrozenHistoryOrigin(parent);const held=alpacaSeasonalityDailyUsage(producer.provider)!;finishAlpacaSeasonalityFrozenFrameConstruction(hold);expect(alpacaSeasonalityDailyUsage(producer.provider)).toEqual(held);await flushMtf();expect(alpacaSeasonalityDailyUsage(producer.provider)).toEqual({operations:0,numericSlots:16*raw.bars.length+1024+raw.bars.length+256,pendingOwners:0});releaseAlpacaSeasonalityFrozenFrameHold(hold);await flushMtf();expect(alpacaSeasonalityDailyUsage(producer.provider)).toEqual({operations:0,numericSlots:0,pendingOwners:0});
});
