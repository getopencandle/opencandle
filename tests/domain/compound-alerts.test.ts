import {describe,it,expect} from 'vitest';
import {COMPOUND_POLICY,CompoundAlertStore,compoundHistory,compoundPredicateMatches,parseCompoundDefinition,restoreCompoundDefinition,serializeCompoundDefinition,type CompoundBatch,type CompoundDefinition,type CompoundFrequency,type CompoundOperator} from '../../src/domain/compound-alerts';

// Scalar domain tests only. No DTO or fake callback is producer/native evidence.
const ctx={instrumentId:'SYNTHETIC:GME',sourceFamily:'synthetic-owned-cut',interval:'1m' as const,session:'regular' as const,basis:'raw-adjusted'};
const greater=(value:number):CompoundOperator=>({kind:'greater',value});
function definition(ops:readonly CompoundOperator[]=[greater(10),greater(20)],frequency:CompoundFrequency='every-time'):CompoundDefinition{
 return{kind:'compound',schemaVersion:1,policy:COMPOUND_POLICY,mode:'ordinary',id:'synthetic-compound',name:'Synthetic conjunction',message:'Synthetic local event',context:{...ctx},predicates:ops.map((operator,i)=>({id:'p'+i,source:i===0?{kind:'price' as const,field:'close' as const}:{kind:'indicator' as const,indicator:'sma',plot:'sma',snapshotId:'frozen-'+i,inputs:{length:i+2,source:'close'}},operator})),frequency,createdAt:0,expiresAt:null};
}
function observation(store:CompoundAlertStore,values:readonly(number|null)[],sequence:number,overrides:Partial<CompoundBatch>={}):CompoundBatch{
 const observedAt=overrides.observedAt??100+sequence,barTime=overrides.barTime??0,barId=overrides.barId??'bar-'+barTime;
 return{context:ctx,mode:'ordinary',sequence,observedAt,cutoffTime:observedAt,barId,barTime,barClosed:false,kind:'observation',samples:values.map((value,i)=>({predicateId:store.current.definition.predicates[i].id,value,sequence,time:barTime,availableAt:observedAt,barId,confirmed:overrides.barClosed??false})),...overrides};
}
function consume(store:CompoundAlertStore,values:readonly(number|null)[],sequence:number,overrides:Partial<CompoundBatch>={}){const prepared=store.prepare(observation(store,values,sequence,overrides));expect(prepared.commit()).toBe(true);return prepared;}
const cross=()=>new CompoundAlertStore(definition([{kind:'crossing-up',value:10},greater(0)]));

describe('compound scalar policy, not source admission',()=>{
 it('checks every five-condition Boolean vector without independent alert engines',()=>{
  for(let mask=0;mask<32;mask++){const store=new CompoundAlertStore(definition(Array.from({length:5},()=>greater(0)))),values=Array.from({length:5},(_,i)=>(mask>>i)&1),done=consume(store,values,1);expect(done.notification!==null,'mask '+mask).toBe(mask===31);expect(compoundHistory(store.current).length).toBe(mask===31?1:0);}
 });
 it('does not latch an earlier crossing while waiting for another condition',()=>{
  const store=cross();consume(store,[9,0],1);expect(consume(store,[10,0],2).notification).toBeNull();expect(consume(store,[10,1],3).notification).toBeNull();
  consume(store,[9,1],4);expect(consume(store,[10,1],5).notification?.values).toEqual([10,1]);
 });
 it('never joins a true operand from an obsolete complete cut to a newer cut',()=>{
  const store=new CompoundAlertStore(definition());expect(consume(store,[11,19],1).notification).toBeNull();expect(consume(store,[9,21],2).notification).toBeNull();
  const partial=observation(store,[11,21],3);expect(()=>store.prepare({...partial,samples:partial.samples.slice(0,1)})).toThrow(/array bounds/);expect(compoundHistory(store.current)).toEqual([]);
 });
 it.each([
  [{kind:'crossing-up',value:10},9,10,true],
  [{kind:'crossing-up',value:10},10,11,false],
  [{kind:'crossing-down',value:10},11,10,true],
  [{kind:'crossing',value:10},11,9,true],
  [{kind:'greater',value:10},9,10,false],
  [{kind:'less',value:10},11,10,false],
  [{kind:'inside',lower:10,upper:20},9,10,false],
  [{kind:'outside',lower:10,upper:20},9,20,false],
  [{kind:'entering',lower:10,upper:20},9,11,true],
  [{kind:'entering',lower:10,upper:20},10,11,false],
  [{kind:'exiting',lower:10,upper:20},11,21,true],
  [{kind:'exiting',lower:10,upper:20},20,21,false],
 ] as const)('uses literal V2 boundary rules for %j from %s to %s',(op,previous,current,expected)=>{
  const parsed=parseCompoundDefinition(definition([op,greater(0)]));expect(compoundPredicateMatches(parsed.predicates[0].operator,previous,current,true)).toBe(expected);
 });
 it('requires a new sample for a crossing pulse but not a state predicate',()=>{
  expect(compoundPredicateMatches({kind:'crossing-up',value:10},9,10,false)).toBe(false);expect(compoundPredicateMatches(greater(10),9,11,false)).toBe(true);
 });
 it('deduplicates per actual bar while allowing sustained levels in the next bar',()=>{
  const store=new CompoundAlertStore(definition(undefined,'once-per-bar'));
  expect(consume(store,[11,21],1).notification).not.toBeNull();expect(consume(store,[12,22],2).notification).toBeNull();
  expect(consume(store,[13,23],3,{barTime:60}).notification).not.toBeNull();expect(compoundHistory(store.current).map(n=>n.barId)).toEqual(['bar-0','bar-60']);
 });
 it('uses prior completed values even when an intrabar sample already crossed',()=>{
  const store=new CompoundAlertStore(definition([{kind:'crossing-up',value:10},greater(0)],'once-per-bar-close'));
  consume(store,[9,1],1,{observedAt:60,barClosed:true});
  expect(consume(store,[11,1],2,{observedAt:70,barTime:60}).notification).toBeNull();
  const closed=observation(store,[11,1],3,{observedAt:120,barTime:60,barClosed:true});
  // Genuine closure may retain the last numerical source sequence. Completion
  // is an observation in its own right; forming sampling must not consume it.
  const samples=closed.samples.map(v=>({...v,sequence:2}));
  expect(store.prepare({...closed,samples}).commit()).toBe(true);expect(compoundHistory(store.current).map(n=>n.values)).toEqual([[11,1]]);
  expect(consume(store,[12,1],4,{observedAt:121,barTime:60,barClosed:true}).notification).toBeNull();
 });
 it('once per minute uses local rolling sixty seconds, not minute buckets',()=>{
  const store=new CompoundAlertStore(definition(undefined,'once-per-minute'));
  expect(consume(store,[11,21],1,{observedAt:0}).notification?.at).toBe(0);
  expect(consume(store,[12,22],2,{observedAt:59}).notification).toBeNull();expect(consume(store,[13,23],3,{observedAt:60}).notification?.at).toBe(60);
 });
 it('every-time means distinct source observations, not render/clock pulses',()=>{
  const store=new CompoundAlertStore(definition());consume(store,[11,21],1);const repeated=observation(store,[11,21],2);const samples=repeated.samples.map(v=>({...v,sequence:1}));
  expect(store.prepare({...repeated,samples}).notification).toBeNull();expect(consume(store,[12,22],3).notification).not.toBeNull();expect(compoundHistory(store.current)).toHaveLength(2);
 });
 it('only-once stops and requires explicit revision rearm, retaining real history',()=>{
  const store=new CompoundAlertStore(definition(undefined,'only-once'));consume(store,[11,21],1);expect(store.current.status).toBe('stopped');store.resume(102);expect(store.current.status).toBe('stopped');
  expect(consume(store,[12,22],2).notification).toBeNull();store.rearm(103);expect(consume(store,[13,23],3,{observedAt:104}).notification?.revision).toBe(2);expect(compoundHistory(store.current).map(n=>n.revision)).toEqual([1,2]);
 });
 it('unavailable data clears all event baselines without a recovery crossing',()=>{
  const store=cross();consume(store,[9,1],1);consume(store,[11,null],2);expect(store.current.status).toBe('waiting-for-data');expect(store.current.previous).toEqual([null,null]);
  expect(consume(store,[11,1],3).notification).toBeNull();consume(store,[9,1],4);expect(consume(store,[10,1],5).notification).not.toBeNull();
 });
 it('known level predicates can match on the first actual recovery observation',()=>{
  const store=new CompoundAlertStore(definition());consume(store,[null,21],1);expect(consume(store,[11,21],2).notification?.values).toEqual([11,21]);
 });
 it('gaps clear crossings and corrections prime without inventing a market event',()=>{
  const store=cross();consume(store,[9,1],1);expect(consume(store,[11,1],2,{kind:'gap'}).notification).toBeNull();
  consume(store,[9,1],3);expect(consume(store,[11,1],4,{kind:'correction'}).notification).toBeNull();consume(store,[9,1],5);expect(consume(store,[10,1],6).notification?.values).toEqual([10,1]);
 });
 it('manual pause differs from invalidating uncommitted transaction work',()=>{
  const transaction=cross();consume(transaction,[9,1],1);const pending=transaction.prepare(observation(transaction,[11,1],2));transaction.invalidatePrepared();expect(pending.commit()).toBe(false);expect(transaction.current.previous).toEqual([9,1]);
  expect(consume(transaction,[11,1],2).notification).not.toBeNull();
  const manual=cross();consume(manual,[9,1],1);manual.pause(102);manual.resume(103);expect(manual.current.previous).toEqual([null,null]);expect(consume(manual,[11,1],2,{observedAt:104}).notification).toBeNull();
 });
 it('retains bar dedupe through manual pause/resume',()=>{
  const store=new CompoundAlertStore(definition(undefined,'once-per-bar'));consume(store,[11,21],1);store.pause(102);store.resume(103);expect(consume(store,[12,22],2,{observedAt:104}).notification).toBeNull();
 });
 it('expires before notification or resume, without requiring a price tick',()=>{
  const d={...definition(),expiresAt:105},store=new CompoundAlertStore(d);store.pause(102);store.advanceClock(105);store.resume(106);expect(store.current.status).toBe('expired');expect(consume(store,[11,21],1,{observedAt:107}).notification).toBeNull();expect(()=>store.rearm(108)).toThrow(/future expiry/);
  const event=new CompoundAlertStore(d);expect(consume(event,[11,21],1,{observedAt:105}).notification).toBeNull();expect(event.current.reason).toBe('expired');
 });
 it('rolls back a prepared crossing without consuming sequence or frequency',()=>{
  const store=cross();consume(store,[9,1],1);const base=store.current,pending=store.prepare(observation(store,[11,1],2));expect(pending.notification).not.toBeNull();expect(compoundHistory(store.current)).toEqual([]);expect(pending.rollback()).toBe(true);expect(pending.commit()).toBe(false);expect(store.current).toBe(base);expect(consume(store,[11,1],2).notification).not.toBeNull();
 });
 it('does not accept backwards lifecycle clocks or an older pending candidate',()=>{
  const store=cross(),pending=store.prepare(observation(store,[9,1],1));store.advanceClock(200);expect(pending.commit()).toBe(false);expect(()=>store.pause(199)).toThrow(/backwards/);expect(store.prepare(observation(store,[11,1],2)).next).toBe(store.current);expect(compoundHistory(store.current)).toEqual([]);
 });
 it.each([0,false,null,undefined])('preserves falsy publication failure %s without committing',(failure)=>{
  const store=cross();consume(store,[9,1],1);const base=store.current,pending=store.prepare(observation(store,[11,1],2));let caught:unknown=Symbol('not thrown');
  try{pending.commit(()=>{throw failure;});}catch(error){caught=error;}expect(Object.is(caught,failure)).toBe(true);expect(store.current).toBe(base);expect(pending.rollback()).toBe(false);expect(consume(store,[11,1],2).notification).not.toBeNull();
 });
 it('refused save is terminal only for that transaction; a fresh retry is possible',()=>{
  const store=cross();consume(store,[9,1],1);const pending=store.prepare(observation(store,[11,1],2));expect(pending.commit(()=>false)).toBe(false);expect(pending.commit()).toBe(false);expect(compoundHistory(store.current)).toEqual([]);expect(consume(store,[11,1],2).notification).not.toBeNull();
 });
 it('a stale outer publication cannot overwrite a reentrant newer lifecycle',()=>{
  const store=cross();consume(store,[9,1],1);const pending=store.prepare(observation(store,[11,1],2));expect(pending.commit(()=>{store.pause(103);return true;})).toBe(false);expect(store.current.status).toBe('paused');expect(compoundHistory(store.current)).toEqual([]);
 });
 it('keeps newer state even when the reentrant publisher then throws false',()=>{
  const store=cross();consume(store,[9,1],1);const pending=store.prepare(observation(store,[11,1],2));let caught:unknown;
  try{pending.commit(()=>{store.pause(103);throw false;});}catch(error){caught=error;}expect(caught).toBe(false);expect(store.current.status).toBe('paused');expect(compoundHistory(store.current)).toEqual([]);
 });
 it('does not duplicate full history on non-trigger batches or append',()=>{
  const store=new CompoundAlertStore(definition());consume(store,[11,21],1);const first=store.current.history;consume(store,[9,21],2);expect(store.current.history).toBe(first);consume(store,[12,22],3);expect(store.current.history?.previous).toBe(first);expect(compoundHistory(store.current).map(n=>n.values)).toEqual([[11,21],[12,22]]);expect(Object.isFrozen(store.current.history)).toBe(true);
 });
 it('rejects mixed intervals/replay/foreign families before any sample getter',()=>{
  const store=cross();let reads=0;const samples=[Object.defineProperty({},'value',{enumerable:true,get(){reads++;throw Error('must not read');}})];
  for(const patch of [{context:{...ctx,interval:'5m'}},{context:{...ctx,sourceFamily:'foreign'}},{mode:'replay'}])expect(()=>store.prepare({...observation(store,[9,1],1),...patch,samples})).toThrow(/context differs/);
  expect(reads).toBe(0);
 });
 it('refuses unavailable values promoted to zero, future data and incoherent membership',()=>{
  const store=cross(),b=observation(store,[9,1],1);
  for(const samples of [[{...b.samples[0],value:NaN},b.samples[1]],[{...b.samples[0],availableAt:1000},b.samples[1]],[b.samples[1],b.samples[0]],[{...b.samples[0],barId:'other'},b.samples[1]]])expect(()=>store.prepare({...b,samples})).toThrow();
  expect(store.current.lastSequence).toBeNull();
 });
 it('rejects duplicate/older batches and changed source values under reused sequences',()=>{
  const store=cross();consume(store,[9,1],1);const base=store.current;expect(store.prepare(observation(store,[11,1],1)).next).toBe(base);
  const b=observation(store,[11,1],2),samples=b.samples.map(v=>({...v,sequence:1}));expect(store.prepare({...b,samples}).next).toBe(base);expect(compoundHistory(store.current)).toEqual([]);
 });
 it('strictly roundtrips detached declarations, not executable authority or baselines',()=>{
  const original=definition(),parsed=parseCompoundDefinition(original);(original.predicates[1].source as any).inputs.length=999;expect((parsed.predicates[1].source as any).inputs.length).toBe(3);
  const json=serializeCompoundDefinition(parsed);expect(restoreCompoundDefinition(json)).toEqual(parsed);expect(json).not.toMatch(/lastSequence|previous|history|assertCurrent/);expect(Object.isFrozen(parsed.predicates[1].source)).toBe(true);
 });
 it('bounds declaration count/inputs and refuses deferred operators and source kinds',()=>{
  const d=definition(),clone=()=>JSON.parse(JSON.stringify(d));
  for(const change of [(v:any)=>v.predicates.pop(),(v:any)=>{v.predicates=Array.from({length:6},(_,i)=>({...v.predicates[0],id:String(i)}));},(v:any)=>v.predicates[1].id=v.predicates[0].id,(v:any)=>v.predicates[0].operator={kind:'moving-up',amount:1,bars:2},(v:any)=>v.predicates[0].source={kind:'drawing',tool:'line'},(v:any)=>v.predicates[0].timeframe='5m',(v:any)=>v.mode='replay',(v:any)=>v.predicates[1].source.inputs=Object.fromEntries(Array.from({length:33},(_,i)=>[String(i),i])),(v:any)=>v.hiddenPolicy=true]){const v=clone();change(v);expect(()=>parseCompoundDefinition(v)).toThrow();}
  expect(()=>restoreCompoundDefinition(' '.repeat(65537))).toThrow(/bounds/);
 });
 it('rejects accessor fields and coercion objects without running their getters',()=>{
  let reads=0;const d=definition(),bad=Object.defineProperty({...d},'name',{enumerable:true,get(){reads++;return'bad';}});expect(()=>parseCompoundDefinition(bad)).toThrow(/Accessor/);
  expect(()=>parseCompoundDefinition({...d,frequency:{toString(){reads++;return'every-time';}}})).toThrow(/policy/);expect(reads).toBe(0);
 });
 it('caps encoded declaration size so accepted frozen declarations can roundtrip',()=>{
  const d=definition(Array.from({length:5},()=>greater(0))),inputs=Object.fromEntries(Array.from({length:32},(_,i)=>[String(i),'\u0000'.repeat(200)]));
  const tooLarge={...d,predicates:d.predicates.map((p,i)=>({...p,source:{kind:'indicator',indicator:'sma',plot:'sma',snapshotId:'frozen-'+i,inputs}}))};
  expect(()=>parseCompoundDefinition(tooLarge)).toThrow(/Encoded declaration/);
 });
});

describe('health batches do not invent price revisions',()=>{
 it('clears a crossing baseline when health is lost under unchanged sample ordinals',()=>{
  const store=cross();consume(store,[9,1],1);const pins=store.current.samples,b=observation(store,[9,null],2),samples=b.samples.map(v=>({...v,sequence:1}));
  const unknown=store.prepare({...b,samples});expect(unknown.commit()).toBe(true);expect(store.current.status).toBe('waiting-for-data');expect(store.current.previous).toEqual([null,null]);expect(store.current.samples).toBe(pins);
  expect(consume(store,[11,1],3).notification).toBeNull();consume(store,[9,1],4);expect(consume(store,[10,1],5).notification?.values).toEqual([10,1]);
 });
 it('does not adopt regressed numerical pins during health loss or recovery',()=>{
  const store=cross();consume(store,[9,1],2);const pins=store.current.samples,b=observation(store,[9,null],3),old=b.samples.map(v=>({...v,sequence:1}));expect(store.prepare({...b,samples:old}).commit()).toBe(true);expect(store.current.samples).toBe(pins);
  const recovery=observation(store,[11,1],4),regressed=recovery.samples.map(v=>({...v,sequence:1}));expect(store.prepare({...recovery,samples:regressed}).notification).toBeNull();expect(store.prepare({...recovery,samples:regressed}).next).toBe(store.current);expect(store.current.status).toBe('waiting-for-data');
  expect(consume(store,[11,1],5).notification).toBeNull();expect(store.current.previous).toEqual([11,1]);
 });
 it('records health loss after a close and permits same-price health recovery to prime',()=>{
  const store=cross();consume(store,[9,1],1);const b=observation(store,[9,null],2),samples=b.samples.map(v=>({...v,sequence:1}));expect(store.prepare({...b,samples}).commit()).toBe(true);
  const recovery=observation(store,[9,1],3),same=recovery.samples.map(v=>({...v,sequence:1}));const ready=store.prepare({...recovery,samples:same});expect(ready.commit()).toBe(true);expect(ready.notification).toBeNull();expect(store.current.status).toBe('active');expect(store.current.previous).toEqual([9,1]);
  const closed=cross();consume(closed,[9,1],1,{observedAt:60,barClosed:true});const health=observation(closed,[9,null],2,{observedAt:61,barClosed:true});expect(closed.prepare({...health,samples:health.samples.map(v=>({...v,sequence:1}))}).commit()).toBe(true);expect(closed.current.status).toBe('waiting-for-data');expect(closed.current.previousClosed).toEqual([null,null]);
 });
});

describe('captured declaration tags stay in their validated shape',()=>{
 it('refuses actual descriptor-flip scalar and channel operator tags',()=>{
  for(const op of [greater(10),{kind:'inside',lower:10,upper:20} as const]){
   let reads=0;const flipped=new Proxy(op,{getOwnPropertyDescriptor(target,key){const d=Reflect.getOwnPropertyDescriptor(target,key);return key==='kind'&&d?{...d,value:++reads===1?d.value:'moving-up'}:d;}});
   expect(()=>parseCompoundDefinition(definition([flipped,greater(0)]))).toThrow('Operator tag changed during capture.');expect(reads).toBe(2);
  }
 });
 it('refuses actual descriptor-flip price and frozen-indicator source tags',()=>{
  for(const which of [0,1]){
   const d=definition();let reads=0;const original=d.predicates[which].source,flipped=new Proxy(original,{getOwnPropertyDescriptor(target,key){const p=Reflect.getOwnPropertyDescriptor(target,key);return key==='kind'&&p?{...p,value:++reads===1?p.value:'drawing'}:p;}});
   const predicates=d.predicates.map((p,i)=>i===which?{...p,source:flipped}:p);
   expect(()=>parseCompoundDefinition({...d,predicates})).toThrow('Source tag changed during capture.');expect(reads).toBe(2);
  }
 });
});


describe('same latest closed-bar health recovery',()=>{
 it('primes the latest close without a historical notification, then preserves the next real crossing',()=>{
  const store=new CompoundAlertStore(definition([{kind:'crossing-up',value:10},greater(0)],'once-per-bar-close'));
  consume(store,[9,1],1,{observedAt:60,barClosed:true});
  const health=observation(store,[9,null],2,{observedAt:61,barClosed:true});expect(store.prepare({...health,samples:health.samples.map(v=>({...v,sequence:1}))}).commit()).toBe(true);
  const recovery=observation(store,[9,1],3,{observedAt:62,barClosed:true}),ready=store.prepare({...recovery,samples:recovery.samples.map(v=>({...v,sequence:1}))});
  expect(ready.commit()).toBe(true);expect(ready.notification).toBeNull();expect(store.current.status).toBe('active');expect(store.current.previousClosed).toEqual([9,1]);expect(compoundHistory(store.current)).toEqual([]);
  expect(consume(store,[11,1],4,{observedAt:120,barTime:60,barClosed:true}).notification?.values).toEqual([11,1]);const current=store.current;
  expect(store.prepare(observation(store,[9,1],5,{observedAt:121,barTime:0,barClosed:true})).next).toBe(current);expect(compoundHistory(store.current)).toHaveLength(1);
  const level=new CompoundAlertStore(definition(undefined,'once-per-bar-close'));consume(level,[9,21],1,{observedAt:60,barClosed:true});
  const lost=observation(level,[9,null],2,{observedAt:61,barClosed:true});expect(level.prepare({...lost,samples:lost.samples.map(v=>({...v,sequence:1}))}).commit()).toBe(true);
  expect(consume(level,[11,21],3,{observedAt:62,barClosed:true}).notification).toBeNull();expect(level.current.lastTriggeredBar).toBeNull();expect(compoundHistory(level.current)).toEqual([]);
  expect(consume(level,[12,22],4,{observedAt:120,barTime:60,barClosed:true}).notification?.values).toEqual([12,22]);
 });
});
