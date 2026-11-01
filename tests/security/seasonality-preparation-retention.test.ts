import {afterEach,expect,it,vi} from 'vitest';
import {createBuiltinPresentationPort,BUILTIN_SEASONALITY_PREPARATION_COST,type BuiltinPresentationControl,type BuiltinSourceReservation,type BuiltinSourceCost} from '../../src/chart/builtin-presentation-proof';
import {captureAlpacaSeasonalityDailyPlan,acquireAlpacaSeasonalityDailyDemand,releaseAlpacaSeasonalityDailyDemand,createAlpacaSeasonalityPreparationGroup,runAlpacaSeasonalityPreparationGroup,releaseAlpacaSeasonalityPreparationGroup,alpacaSeasonalityPreparationSettled,subscribeAlpacaSeasonalityPreparationSettled} from '../../src/domain/alpaca-live';
import {publishedSource,response,fridayMonday,flushMtf,type Request} from '../fixtures/qualified-nyse-mtf-source';
import {INDICATOR_BATCH_OUTPUT_LIMIT} from '../../src/chart/indicator-settings';

// Actual constructor-owned opaque groups and uncancellable synthetic bridge
// promises. No network, key, native scene, price or source grant is fabricated.
const cleanups:(()=>void|Promise<void>)[]=[];
afterEach(async()=>{const errors:unknown[]=[];for(const close of cleanups.splice(0).reverse())try{await close();}catch(error){errors.push(error);}if(errors.length)throw new AggregateError(errors,'Preparation retention cleanup failed.');});
const COST=Object.freeze({operations:BUILTIN_SEASONALITY_PREPARATION_COST.operations,numericSlots:100000,pendingSlots:BUILTIN_SEASONALITY_PREPARATION_COST.numericSlots});
const EMPTY=Object.freeze({operations:0,numericSlots:0});
function pipeline(){let control!:BuiltinPresentationControl;createBuiltinPresentationPort({},undefined,undefined,value=>{control=value;return{};});cleanups.push(()=>control.dispose());return control;}
function reserve(control:BuiltinPresentationControl,model:object={},owned=()=>true,cost:BuiltinSourceCost=COST):BuiltinSourceReservation{const token=control.reserveSource(model,owned,EMPTY,cost);expect(token).not.toBeNull();return token!;}
function armed(control:BuiltinPresentationControl,model:object,token:BuiltinSourceReservation){const scene=control.armSeasonalityPreparation(model,token);cleanups.push(()=>scene.retire());return scene;}
async function pendingSource(){
 let resolve!:(value:any)=>void,request!:Request;const producer=await publishedSource({reply:async sent=>{if(sent.timeframe!=='1Day')return response(sent,fridayMonday().filter(row=>row.time>=sent.start&&row.time<=sent.end));request=sent;return new Promise(done=>{resolve=done;});}});cleanups.push(()=>producer.dispose());
 const raw=producer.raw(),plan=captureAlpacaSeasonalityDailyPlan(raw,raw.bars,2024,2024);expect(plan).not.toBeNull();const demandController=new AbortController(),demand=acquireAlpacaSeasonalityDailyDemand(plan!,demandController.signal);cleanups.push(()=>releaseAlpacaSeasonalityDailyDemand(demand));let resolved=false;
 // A shared synthetic transport failure settles both genuine waiters. Only
 // physical settlement is under test; no numerical output is fabricated.
 const settle=()=>{if(!resolved&&resolve){resolved=true;resolve({ok:false,error:{code:'SYNTHETIC_TRANSPORT_FAILURE',message:'SYNTHETIC shared daily response failed.'}});}};cleanups.push(async()=>{settle();await flushMtf();});
 return{producer,plan:plan!,demand,demandController,settle,group(){const signal=new AbortController();const key=createAlpacaSeasonalityPreparationGroup(demand,plan!,signal.signal);cleanups.push(()=>releaseAlpacaSeasonalityPreparationGroup(key));return{key,signal};}};
}
it('declares the literal complete group, observer and pipeline metadata fee',()=>{
 expect(BUILTIN_SEASONALITY_PREPARATION_COST).toEqual({operations:7168,numericSlots:1408});expect(Object.isFrozen(BUILTIN_SEASONALITY_PREPARATION_COST)).toBe(true);
});
it('arming invokes no supplied owner callback and preserves the scene publication interface',()=>{
 const control=pipeline(),model={},owned=vi.fn(()=>true),token=reserve(control,model,owned);owned.mockClear();const scene=armed(control,model,token);
 expect(owned).not.toHaveBeenCalled();expect(Reflect.ownKeys(scene).sort()).toEqual(['accepted','assertCurrent','enter','prepared','retainCalendar','retire','returned']);expect(Object.isFrozen(scene)).toBe(true);scene.retire();token.release();
});
it('an armed unpublished stack stays funded until its retirement microtask unwinds',async()=>{
 const control=pipeline(),model={},token=reserve(control,model),scene=armed(control,model,token),budget={operations:0,numericSlots:INDICATOR_BATCH_OUTPUT_LIMIT-COST.numericSlots-COST.pendingSlots};
 // The budget leaves room under the shared batch slot cap (INDICATOR_BATCH_OUTPUT_LIMIT) for exactly one reservation.
 token.release();expect(token.signal.aborted).toBe(false);expect(control.reserveSource({},()=>true,budget,COST)).toBeNull();scene.retire();expect(token.signal.aborted).toBe(false);await flushMtf();expect(token.signal.aborted).toBe(true);expect(control.reserveSource({},()=>true,budget,COST)).not.toBeNull();
});
it.each([{operations:7167,numericSlots:100000,pendingSlots:1408},{operations:7168,numericSlots:1000,pendingSlots:407},{operations:7168,numericSlots:1407,pendingSlots:100000}])('refuses an underfunded required preparation before a group can be born %j',cost=>{
 const control=pipeline(),model={},token=reserve(control,model,()=>true,cost);expect(()=>armed(control,model,token)).toThrow();token.release();expect(token.signal.aborted).toBe(true);
});
it('a copied reservation or foreign model cannot arm an actual reservation',()=>{
 const control=pipeline(),model={},token=reserve(control,model);expect(()=>armed(control,model,{...token})).toThrow();expect(()=>armed(control,{},token)).toThrow();token.release();expect(token.signal.aborted).toBe(true);
});
it('forged consumed results cannot promote the actual armed record',()=>{
 const control=pipeline(),model={},token=reserve(control,model),scene=armed(control,model,token);token.accept();expect(()=>control.pinSeasonalityScene(model,{status:'ready'} as any,token)).toThrow();scene.retire();token.release();
});
it('unknown and proxy preparation groups are rejected without executing supplied properties',async()=>{
 const control=pipeline(),model={},token=reserve(control,model),scene=armed(control,model,token),trap=vi.fn(()=>{throw Error('Untrusted preparation property.');}),foreign=new Proxy({},{get:trap,getOwnPropertyDescriptor:trap,getPrototypeOf:trap});
 expect(()=>control.attachSeasonalityPreparationGroup(model,token,foreign as any)).toThrow();expect(trap).not.toHaveBeenCalled();scene.retire();token.release();await flushMtf();expect(token.signal.aborted).toBe(true);
});
it('actual uncancellable daily work remains funded after cancellation until physical settlement',async()=>{
 const source=await pendingSource(),group=source.group(),control=pipeline(),model={},token=reserve(control,model),scene=armed(control,model,token);control.attachSeasonalityPreparationGroup(model,token,group.key);
 const pending=runAlpacaSeasonalityPreparationGroup(group.key).then(()=>false,()=>true);await flushMtf();expect(source.producer.requests.filter(row=>row.timeframe==='1Day')).toHaveLength(1);scene.retire();token.release();await flushMtf();expect(alpacaSeasonalityPreparationSettled(group.key)).toBe(false);expect(token.signal.aborted).toBe(false);
 source.settle();expect(await pending).toBe(true);await flushMtf();expect(alpacaSeasonalityPreparationSettled(group.key)).toBe(true);expect(token.signal.aborted).toBe(true);
});
it('forced disposal retains an active preparation until both actual request and retired stack unwind',async()=>{
 const source=await pendingSource(),group=source.group(),control=pipeline(),model={},token=reserve(control,model),scene=armed(control,model,token);control.attachSeasonalityPreparationGroup(model,token,group.key);const pending=runAlpacaSeasonalityPreparationGroup(group.key).then(()=>false,()=>true);await flushMtf();control.dispose();expect(token.signal.aborted).toBe(false);
 source.settle();expect(await pending).toBe(true);await flushMtf();expect(token.signal.aborted).toBe(false);scene.retire();await flushMtf();expect(token.signal.aborted).toBe(true);
});
it('settlement of cancelled A never cancels or refunds current B sharing the same actual daily response',async()=>{
 const source=await pendingSource(),a=source.group(),b=source.group(),control=pipeline(),modelA={},modelB={},one=reserve(control,modelA),two=reserve(control,modelB),first=armed(control,modelA,one),second=armed(control,modelB,two);control.attachSeasonalityPreparationGroup(modelA,one,a.key);control.attachSeasonalityPreparationGroup(modelB,two,b.key);
 const pa=runAlpacaSeasonalityPreparationGroup(a.key).then(()=>false,()=>true),pb=runAlpacaSeasonalityPreparationGroup(b.key).then(()=>false,()=>true);await flushMtf();expect(source.producer.requests.filter(row=>row.timeframe==='1Day')).toHaveLength(1);first.retire();one.release();await flushMtf();expect(two.signal.aborted).toBe(false);source.settle();expect(await pa).toBe(true);expect(await pb).toBe(true);await flushMtf();expect(one.signal.aborted).toBe(true);expect(two.signal.aborted).toBe(false);second.retire();two.release();await flushMtf();expect(two.signal.aborted).toBe(true);
});
it('one genuine preparation invocation cannot fund two pipeline reservations',async()=>{
 const source=await pendingSource(),group=source.group(),a=pipeline(),b=pipeline(),modelA={},modelB={},one=reserve(a,modelA),two=reserve(b,modelB),first=armed(a,modelA,one),second=armed(b,modelB,two);a.attachSeasonalityPreparationGroup(modelA,one,group.key);expect(()=>b.attachSeasonalityPreparationGroup(modelB,two,group.key)).toThrow();second.retire();two.release();first.retire();one.release();await flushMtf();expect(two.signal.aborted).toBe(true);expect(one.signal.aborted).toBe(true);
});
it('cancelled unstarted actual preparation cannot issue a later bridge request',async()=>{
 const source=await pendingSource(),group=source.group(),control=pipeline(),model={},token=reserve(control,model),scene=armed(control,model,token);control.attachSeasonalityPreparationGroup(model,token,group.key);scene.retire();token.release();await flushMtf();await expect(runAlpacaSeasonalityPreparationGroup(group.key)).rejects.toThrow();expect(source.producer.requests.filter(row=>row.timeframe==='1Day')).toHaveLength(0);expect(token.signal.aborted).toBe(true);
});

it('failed observer admission cancels the authentic unstarted group and keeps the armed stack funded until unwind',async()=>{
 const source=await pendingSource(),group=source.group(),wakes=Array.from({length:1000},()=>()=>{}),offs=wakes.map(wake=>subscribeAlpacaSeasonalityPreparationSettled(group.key,wake));cleanups.push(()=>{for(const off of offs)off();});
 const control=pipeline(),model={},token=reserve(control,model),scene=armed(control,model,token);expect(()=>control.attachSeasonalityPreparationGroup(model,token,group.key)).toThrow('observer cannot be admitted');expect(alpacaSeasonalityPreparationSettled(group.key)).toBe(true);token.release();expect(token.signal.aborted).toBe(false);scene.retire();await flushMtf();expect(token.signal.aborted).toBe(true);expect(source.producer.requests.filter(row=>row.timeframe==='1Day')).toHaveLength(0);expect(wakes).toHaveLength(1000);
});
