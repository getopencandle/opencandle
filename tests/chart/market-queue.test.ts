import {it,expect} from 'vitest';
import {createMarketQueue,type MarketInput} from '../../src/chart/market-queue';
const input=(id:string,value:number):MarketInput=>({bars:[{time:1,open:value,high:value,low:value,close:value,volume:1}],source:{datasetId:id,revision:'1',fixture:true,label:'Synthetic '+id}});
it('overlapping native updates run in order and callbacks always see matching bars and provenance',async()=>{
 let state=input('initial',1),release:()=>void=()=>{},started=0;const seen:Array<[number,string]>=[];
 const queue=createMarketQueue({read:()=>state,write:next=>{state=next;},disposed:()=>false,apply:async bars=>{seen.push([bars[0].close,state.source.datasetId]);if(++started===1)await new Promise<void>(resolve=>release=resolve);}});
 const a=input('A',2),b=input('B',3),first=queue.set(a.bars,a.source),second=queue.set(b.bars,b.source);a.bars[0].close=999;
 await Promise.resolve();expect(started).toBe(1);expect(state.source.datasetId).toBe('A');release();await Promise.all([first,second]);expect(seen).toEqual([[2,'A'],[3,'B']]);expect(state).toEqual(b);
});
it('failed native mutation restores data and provenance before rollback callbacks and later changes remain usable',async()=>{
 const initial=input('initial',1);let state=initial;const seen:string[]=[];
 const queue=createMarketQueue({read:()=>state,write:next=>{state=next;},disposed:()=>false,apply:async()=>{seen.push(state.source.datasetId);if(state.source.datasetId==='bad')throw new Error('Native failure');}});
 await expect(queue.set(input('bad',2).bars,input('bad',2).source)).rejects.toThrow('Native failure');expect(state).toEqual(initial);expect(seen).toEqual(['bad','initial']);
 const next=input('good',3);expect(await queue.set(next.bars,next.source)).toEqual({ok:true});expect(state).toEqual(next);
});
it('unavailable-volume validation and disposed queues do not mutate any source or invoke the renderer',async()=>{
 let state=input('initial',1),called=0,disposed=false;const queue=createMarketQueue({read:()=>state,write:next=>{state=next;},disposed:()=>disposed,apply:async()=>{called++;},validate:bars=>bars[0].volume<0?{code:'DATA_VOLUME_UNAVAILABLE',feature:'volume',severity:'unavailable',message:'Volume unavailable'}:null});
 const bad=input('bad',2);bad.bars[0].volume=-1;expect((await queue.set(bad.bars,bad.source)).ok).toBe(false);expect(state.source.datasetId).toBe('initial');disposed=true;expect((await queue.set(input('other',3).bars)).ok).toBe(false);expect(called).toBe(0);
});
it('declared resolution remains paired with each source transaction and rollback',async()=>{
 let state={...input('initial',1),source:{...input('initial',1).source,resolution:'1D'}};const seen:Array<string|undefined>=[],queue=createMarketQueue({read:()=>state,write:next=>{state=next as typeof state;},disposed:()=>false,apply:async()=>{seen.push(state.source.resolution);if(state.source.resolution==='5m')throw new Error('native');}});
 await expect(queue.set(input('new',2).bars,{...input('new',2).source,resolution:'5m'})).rejects.toThrow('native');expect(seen).toEqual(['5m','1D']);expect(state.source.resolution).toBe('1D');
});
it('one-shot trusted rollback retains pre-transaction content and identity without accepting replacement arguments',async()=>{
 const original=input('initial',1);original.source.inputIdentity='original-array';let state=original;const queue=createMarketQueue({read:()=>state,write:next=>{state=next;},disposed:()=>false,apply:async()=>{}}),transaction=queue.setWithRollback(input('new',2).bars,{...input('new',2).source,inputIdentity:'other-array'});await transaction.result;await transaction.rollback();expect(state.bars[0].close).toBe(1);expect(state.source.inputIdentity).toBe('original-array');await expect(transaction.rollback()).rejects.toThrow('already consumed');
});
it('rollback captures the committed boundary after an earlier pending input fails, not its uncommitted source',async()=>{
 let state=input('initial',1),release=()=>{};state.source.inputIdentity='initial-array';const queue=createMarketQueue({read:()=>state,write:next=>{state=next;},disposed:()=>false,apply:async()=>{if(state.source.datasetId==='failed'){await new Promise<void>(resolve=>release=resolve);throw new Error('failed');}}});
 const failed=queue.set(input('failed',2).bars,{...input('failed',2).source,inputIdentity:'failed-array'});await Promise.resolve();const rejection=failed.catch(()=>{}),transaction=queue.setWithRollback(input('owned',3).bars,{...input('owned',3).source,inputIdentity:'owned-array'});release();await rejection;await transaction.result;await transaction.rollback();expect(state.source).toMatchObject({datasetId:'initial',inputIdentity:'initial-array'});expect(state.bars[0].close).toBe(1);
});
it('rollback captures an earlier queued source that commits before its own transaction',async()=>{
 let state=input('initial',1);const queue=createMarketQueue({read:()=>state,write:next=>{state=next;},disposed:()=>false,apply:async()=>{}}),earlier=queue.set(input('earlier',2).bars,input('earlier',2).source),transaction=queue.setWithRollback(input('owned',3).bars,input('owned',3).source);await Promise.all([earlier,transaction.result]);await transaction.rollback();expect(state.source.datasetId).toBe('earlier');expect(state.bars[0].close).toBe(2);
});
it('a rollback queued behind any later commit, even the same array and source identity, cannot overwrite it',async()=>{
 let state=input('initial',1),release=()=>{};const bars=input('owned',2).bars,source={...input('owned',2).source,inputIdentity:'same-array'};let count=0;const queue=createMarketQueue({read:()=>state,write:next=>{state=next;},disposed:()=>false,apply:async()=>{if(++count===1)await new Promise<void>(resolve=>release=resolve);}}),transaction=queue.setWithRollback(bars,source);await Promise.resolve();const newer=queue.set(bars,source),rollback=transaction.rollback();release();await Promise.all([transaction.result,newer]);expect(await rollback).toMatchObject({ok:false,diagnostic:{code:'MARKET_ROLLBACK_SUPERSEDED'}});expect(state.source.datasetId).toBe('owned');expect(state.source.inputIdentity).toBe('same-array');
});
it('a source-write observer that throws after assignment rolls paired content and provenance back before native callbacks',async()=>{
 const initial=input('initial',1);let state=initial;const seen:string[]=[];const queue=createMarketQueue({read:()=>state,write:next=>{state=next;if(next.source.datasetId==='bad')throw new Error('write observer');},disposed:()=>false,apply:async()=>{seen.push(state.source.datasetId);}});
 await expect(queue.set(input('bad',2).bars,input('bad',2).source)).rejects.toThrow('write observer');expect(state).toEqual(initial);expect(seen).toEqual(['initial']);await queue.set(input('next',3).bars,input('next',3).source);expect(state.source.datasetId).toBe('next');
});
it('reservation blocks all source/analysis writers and release preserves source pairing',async()=>{let state=input('initial',1),calls=0;const queue=createMarketQueue({read:()=>state,write:next=>state=next,apply:async()=>{calls++;},disposed:()=>false}),lease=queue.reserve();expect(queue.isPending()).toBe(true);expect((await queue.set(input('new',2).bars,input('new',2).source)).ok).toBe(false);await expect(queue.exclusive(()=>{})).rejects.toThrow('suspended');expect(state.source.datasetId).toBe('initial');expect(calls).toBe(0);expect(lease.isCurrent()).toBe(true);lease.release();expect(lease.isCurrent()).toBe(false);expect(queue.isPending()).toBe(false);expect(await queue.set(input('new',2).bars,input('new',2).source)).toEqual({ok:true});expect(state.source.datasetId).toBe('new');expect(()=>lease.release()).toThrow('already released');});
