import {expect,it} from 'vitest';
import {COMPOUND_POLICY,CompoundAlertStore,compoundHistory,type CompoundBatch,type CompoundDefinition,type CompoundFrequency,type CompoundOperator} from '../../src/domain/compound-alerts';

// Numerical domain transactions only. These invented DTOs are not genuine
// source observations, completion evidence or permission to publish an alert.
const context={instrumentId:'SYNTHETIC:PRIME',sourceFamily:'synthetic-priming-test',interval:'1m' as const,session:'regular' as const,basis:'raw'};
const frequencies:CompoundFrequency[]=['only-once','once-per-bar','once-per-bar-close','once-per-minute','every-time'];
function definition(frequency:CompoundFrequency='every-time',operators:readonly CompoundOperator[]=[{kind:'greater',value:10},{kind:'greater',value:20}]):CompoundDefinition{
 return{kind:'compound',schemaVersion:1,policy:COMPOUND_POLICY,mode:'ordinary',id:'synthetic-prime',name:'Synthetic priming',message:'Synthetic local condition',context,predicates:operators.map((operator,index)=>({id:'condition-'+index,source:index===0?{kind:'price' as const,field:'close' as const}:{kind:'indicator' as const,indicator:'sma',plot:'sma',snapshotId:'synthetic-frozen-sma',inputs:{length:2,source:'close'}},operator})),frequency,createdAt:0,expiresAt:null};
}
function observation(store:CompoundAlertStore,values:readonly(number|null)[],sequence:number,changes:Partial<CompoundBatch>={}):CompoundBatch{
 const barTime=changes.barTime??0,barId='synthetic-bar-'+barTime,observedAt=changes.observedAt??60,barClosed=changes.barClosed??true;
 return{context,mode:'ordinary',sequence,observedAt,cutoffTime:observedAt,barId,barTime,barClosed,kind:'observation',samples:values.map((value,index)=>({predicateId:store.current.definition.predicates[index].id,value,sequence,time:barTime,availableAt:observedAt,barId,confirmed:barClosed})),...changes};
}
const crossing=()=>new CompoundAlertStore(definition('once-per-bar-close',[{kind:'crossing-up',value:10},{kind:'greater',value:0}]));

it.each(frequencies)('confirmed numerical seed cannot replay a historical trigger or consume %s frequency',frequency=>{
 const store=new CompoundAlertStore(definition(frequency)),seed=store.prime(observation(store,[11,21],1));
 expect(seed.notification).toBeNull();expect(seed.commit()).toBe(true);expect(store.current.status).toBe('active');expect(store.current.previousClosed).toEqual([11,21]);expect(store.current.lastTriggeredBar).toBeNull();expect(store.current.lastTriggeredAt).toBeNull();expect(compoundHistory(store.current)).toEqual([]);
 const next=store.prepare(observation(store,[12,22],2,{observedAt:120,barTime:60}));expect(next.notification?.values).toEqual([12,22]);expect(next.commit()).toBe(true);expect(compoundHistory(store.current)).toHaveLength(1);
});
it('seeds the previous confirmed value so the next genuinely new close retains its first crossing',()=>{
 const store=crossing(),seed=store.prime(observation(store,[9,1],1));expect(seed.commit()).toBe(true);expect(seed.notification).toBeNull();expect(store.current.previousClosed).toEqual([9,1]);
 const next=store.prepare(observation(store,[11,1],2,{observedAt:120,barTime:60}));expect(next.notification?.values).toEqual([11,1]);expect(next.commit()).toBe(true);expect(compoundHistory(store.current).map(item=>item.sequence)).toEqual([2]);
});
it('retains existing frequency tokens and history while priming a usable forming observation',()=>{
 const store=new CompoundAlertStore(definition('once-per-bar')),first=store.prepare(observation(store,[11,21],1,{barClosed:false}));expect(first.commit()).toBe(true);const history=store.current.history;
 const seed=store.prime(observation(store,[12,22],2,{observedAt:61,barClosed:false}));expect(seed.commit()).toBe(true);expect(seed.notification).toBeNull();expect(store.current.history).toBe(history);expect(store.current.lastTriggeredBar).toBe('synthetic-bar-0');expect(store.current.lastTriggeredAt).toBe(60);
 const same=store.prepare(observation(store,[13,23],3,{observedAt:62,barClosed:false}));expect(same.notification).toBeNull();expect(same.commit()).toBe(true);
 expect(store.prepare(observation(store,[14,24],4,{observedAt:120,barTime:60,barClosed:false})).notification?.values).toEqual([14,24]);
});
it('refused or throwing seed publication leaves the old baseline intact and a fresh seed can retry',()=>{
 const store=crossing(),base=store.current,denied=store.prime(observation(store,[9,1],1));expect(denied.commit(()=>false)).toBe(false);expect(store.current).toBe(base);expect(denied.commit()).toBe(false);
 const failed=store.prime(observation(store,[9,1],1));let threw=false,error:unknown;try{failed.commit(()=>{throw 0;});}catch(value){threw=true;error=value;}expect(threw).toBe(true);expect(error).toBe(0);expect(store.current).toBe(base);
 expect(store.prime(observation(store,[9,1],1)).commit()).toBe(true);expect(store.prepare(observation(store,[11,1],2,{observedAt:120,barTime:60})).notification?.values).toEqual([11,1]);
});
it('an obsolete seed cannot overwrite a newer pause or a committed market observation',()=>{
 const paused=crossing(),old=paused.prime(observation(paused,[9,1],1));expect(old.commit(()=>{paused.pause(61);return true;})).toBe(false);expect(paused.current.status).toBe('paused');expect(paused.current.previousClosed).toEqual([null,null]);
 const store=new CompoundAlertStore(definition()),stale=store.prime(observation(store,[9,19],1)),market=store.prepare(observation(store,[11,21],2,{observedAt:120,barTime:60}));expect(market.commit()).toBe(true);const current=store.current;expect(stale.commit()).toBe(false);expect(store.current).toBe(current);expect(compoundHistory(current)).toHaveLength(1);
});
it('priming does not revive a stopped or paused alert and expiration still wins',()=>{
 const stopped=new CompoundAlertStore(definition('only-once'));expect(stopped.prepare(observation(stopped,[11,21],1)).commit()).toBe(true);expect(stopped.current.status).toBe('stopped');expect(stopped.prime(observation(stopped,[12,22],2,{observedAt:120,barTime:60})).next).toBe(stopped.current);
 const paused=crossing();paused.pause(1);expect(paused.prime(observation(paused,[9,1],1)).next).toBe(paused.current);expect(paused.current.previousClosed).toEqual([null,null]);
 const expired=new CompoundAlertStore({...definition(),expiresAt:100}),seed=expired.prime(observation(expired,[11,21],1,{observedAt:120,barTime:60}));expect(seed.notification).toBeNull();expect(seed.commit()).toBe(true);expect(expired.current.status).toBe('expired');expect(compoundHistory(expired.current)).toEqual([]);
});
it('priming preserves strict numerical, future-data, context and sequence refusal',()=>{
 const store=crossing(),base=store.current,batch=observation(store,[9,1],1);
 expect(()=>store.prime({...batch,context:{...context,instrumentId:'SYNTHETIC:FOREIGN'}})).toThrow();expect(()=>store.prime({...batch,samples:batch.samples.map((sample,index)=>index===0?{...sample,value:NaN}:sample)})).toThrow();expect(()=>store.prime({...batch,samples:batch.samples.map(sample=>({...sample,availableAt:61}))})).toThrow();expect(store.current).toBe(base);
 expect(store.prime(batch).commit()).toBe(true);const current=store.current;expect(store.prime(batch).next).toBe(current);expect(store.prime(observation(store,[11,1],0,{observedAt:59})).next).toBe(current);expect(compoundHistory(current)).toEqual([]);
});

it('manual resume can prime the same latest close without a new price revision or historical trigger',()=>{
 const store=crossing();expect(store.prepare(observation(store,[9,1],1)).commit()).toBe(true);store.pause(61);store.resume(62);expect(store.current.previousClosed).toEqual([null,null]);
 const batch=observation(store,[9,1],2,{observedAt:63}),seed=store.prime({...batch,samples:batch.samples.map(sample=>({...sample,sequence:1}))});expect(seed.commit()).toBe(true);expect(seed.notification).toBeNull();expect(store.current.previousClosed).toEqual([9,1]);expect(compoundHistory(store.current)).toEqual([]);
 const market=store.prepare(observation(store,[11,1],3,{observedAt:120,barTime:60}));expect(market.notification?.values).toEqual([11,1]);expect(market.commit()).toBe(true);const current=store.current;
 expect(store.prime(observation(store,[9,1],4,{observedAt:121,barTime:0})).next).toBe(current);expect(compoundHistory(current)).toHaveLength(1);
});


it('manual resume primes an unchanged forming observation without a new numerical ordinal',()=>{
 const store=new CompoundAlertStore(definition('every-time',[{kind:'crossing-up',value:10},{kind:'greater',value:0}]));
 expect(store.prime(observation(store,[9,1],1,{barClosed:false})).commit()).toBe(true);store.pause(61);store.resume(62);expect(store.current.previous).toEqual([null,null]);
 const batch=observation(store,[9,1],2,{observedAt:63,barClosed:false}),unchanged={...batch,samples:batch.samples.map(sample=>({...sample,sequence:1}))};
 const base=store.current;expect(store.prepare(unchanged).next).toBe(base);
 const changed={...unchanged,samples:unchanged.samples.map((sample,index)=>index===0?{...sample,value:10}:sample)};expect(store.prime(changed).next).toBe(base);
 const seed=store.prime(unchanged);expect(seed.notification).toBeNull();expect(seed.commit()).toBe(true);expect(store.current.previous).toEqual([9,1]);expect(store.current.samples.map(sample=>sample?.sequence)).toEqual([1,1]);expect(compoundHistory(store.current)).toEqual([]);
 const next=store.prepare(observation(store,[11,1],3,{observedAt:64,barClosed:false}));expect(next.notification?.values).toEqual([11,1]);expect(next.commit()).toBe(true);expect(compoundHistory(store.current)).toHaveLength(1);
 const same=observation(store,[11,1],4,{observedAt:65,barClosed:false});expect(store.prepare({...same,samples:same.samples.map(sample=>({...sample,sequence:3}))}).next).toBe(store.current);
});
