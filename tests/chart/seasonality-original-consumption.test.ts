import {afterEach,expect,it,vi} from 'vitest';
import {ownedSourceFixture,monthlyLocal,sourceRequest} from '../fixtures/seasonality-owned-source';
import {normalizePrimarySourceRequest,planPrimarySource} from '../../src/chart/seasonality-source';

// SYNTHETIC actual closed factory/native/queue fixture. No public source registrar or UI/hover authority.
const fixtures:Awaited<ReturnType<typeof ownedSourceFixture>>[]=[];
async function fixture(options:Parameters<typeof ownedSourceFixture>[0]={}){const h=await ownedSourceFixture(options);fixtures.push(h);return h;}
afterEach(()=>{vi.restoreAllMocks();for(const h of fixtures.splice(0).reverse())h.dispose();});
function watchInteriorCloses(h:Awaited<ReturnType<typeof fixture>>,onRead?:()=>void){
 const rows=new Set<object>(h.dataset.bars.slice(1,-1)),original=Object.getOwnPropertyDescriptor;let reads=0;
 vi.spyOn(Object,'getOwnPropertyDescriptor').mockImplementation((target:object,key:PropertyKey)=>{if(rows.has(target)&&key==='close'){reads++;onRead?.();}return original(target,key);});
 return{get reads(){return reads;},get expected(){return rows.size;},reset(){reads=0;}};
}
it('accepted ordinary consumption rejects an interior original correction while its private native frame is unchanged',async()=>{
 const h=await fixture(),view=await h.primary.prepare(h.id,sourceRequest()),row=h.dataset.bars[1],tail=h.dataset.bars.at(-1)!;
 expect(row.close).toBe(110);expect(tail.close).toBe(142);expect(h.raw()[1]).not.toBe(row);expect(h.core.rawBars[1].close).toBe(110);
 row.close=111;expect(h.raw()[1].close).toBe(110);expect(h.core.rawBars[1].close).toBe(110);expect(h.dataset.bars.at(-1)).toBe(tail);expect(tail.close).toBe(142);
 expect(()=>view.read()).toThrow();row.close=110;expect(()=>view.read()).toThrow();
});
it('accepted HA consumption refuses an original interior accessor without invoking it or borrowing unchanged HA rows',async()=>{
 const h=await fixture({style:'heikinashi'}),view=await h.primary.prepare(h.id,sourceRequest()),row=h.dataset.bars[1],descriptor=Object.getOwnPropertyDescriptor(row,'close')!;let calls=0;
 expect(h.core.rawBars[1].close).toBe(110);expect(h.core.bars[1].close).toBe(112.5);
 Object.defineProperty(row,'close',{configurable:true,enumerable:true,get(){calls++;throw Error('Original accessor must not execute');}});
 try{expect(()=>view.read()).toThrow();expect(calls).toBe(0);expect(h.raw()[1].close).toBe(110);expect(h.core.bars[1].close).toBe(112.5);}finally{Object.defineProperty(row,'close',descriptor);}
});
it('one whole-model read between separate owner assertions performs one original pass and returns literal immutable values',async()=>{
 const h=await fixture(),view=await h.primary.prepare(h.id,sourceRequest()),seen=watchInteriorCloses(h);
 view.assertCurrent();expect(seen.reads).toBe(0);const result=view.read();view.assertCurrent();expect(seen.reads).toBe(seen.expected);expect(result.status).toBe('ready');if(result.status!=='ready')throw Error(result.diagnostic);
 expect(result.scene.years[0].cells[0].value).toBeCloseTo(-12,12);expect(result.scene.projections.find(row=>row.month==='2017-01')).toMatchObject({baseline:135,price:118.8});expect(Object.isFrozen(result.scene)).toBe(true);expect(Object.isFrozen(result.scene.series[0])).toBe(true);
});
it('reentrant and repeated consumption refuse before another pass without retiring the accepted owner or immutable output',async()=>{
 const h=await fixture(),view=await h.primary.prepare(h.id,sourceRequest());let reentered=false,nested:unknown;
 const seen=watchInteriorCloses(h,()=>{if(!reentered){reentered=true;try{view.read();}catch(error){nested=error;}}});
 const result=view.read();expect(reentered).toBe(true);expect(String(nested)).toContain('being consumed');expect(seen.reads).toBe(seen.expected);seen.reset();
 expect(()=>view.read()).toThrow('already consumed');view.assertCurrent();expect(seen.reads).toBe(0);expect(result.status).toBe('ready');if(result.status!=='ready')throw Error(result.diagnostic);
 for(let count=0;count<1000;count++)expect(result.scene.years[0].cells[0].value).toBeCloseTo(-12,12);expect(seen.reads).toBe(0);
});
it('settling refusal does not burn the admitted pass and a genuine queue release enables one consumption',async()=>{
 const h=await fixture(),hold=h.queue.reserve(),view=await h.primary.prepare(h.id,sourceRequest()),seen=watchInteriorCloses(h);
 expect(()=>view.read()).toThrow('settling');expect(()=>view.read()).toThrow('settling');expect(seen.reads).toBe(0);view.assertCurrent();hold.release();await Promise.resolve();
 const result=view.read();expect(result.status).toBe('ready');expect(seen.reads).toBe(seen.expected);expect(()=>view.read()).toThrow('already consumed');view.assertCurrent();
});
it('an observed invalid A remains terminal while fresh constructor B survives late A disposal',async()=>{
 const h=await fixture(),a=await h.primary.prepare(h.id,sourceRequest());h.dataset.bars[1].close=111;expect(()=>a.read()).toThrow();h.dataset.bars[1].close=110;
 await h.apply(monthlyLocal());const b=await h.primary.prepare(h.id,sourceRequest());a.dispose();expect(()=>a.read()).toThrow();const result=b.read();expect(result.status).toBe('ready');if(result.status!=='ready')throw Error(result.diagnostic);expect(result.scene.years[0].cells[0].value).toBeCloseTo(-12,12);b.assertCurrent();
});
it('the real fourteen-row plan reserves the literal consumption work and retained guard storage before allocation',async()=>{
 const h=await fixture(),basis=h.host.capture()!;expect(basis.rows).toBe(14);const plan=planPrimarySource(basis,normalizePrimarySourceRequest(sourceRequest()));
 // N=M14,25 frames,78 cells: oldW171144 +30720; oldU106483 +16; pendingK512 unchanged.
 expect(plan.cost).toEqual({operations:201864,numericSlots:106499,pendingSlots:512});
});
it('an unaffordable whole-source plan reads no original numeric accessor and preserves the ordinary accepted model',async()=>{
 const h=await fixture(),row=h.dataset.bars[1],descriptor=Object.getOwnPropertyDescriptor(row,'close')!,prior=h.port.values(h.id);let calls=0;
 Object.defineProperty(row,'close',{configurable:true,enumerable:true,get(){calls++;throw Error('No numerical allocation before admission');}});
 try{await expect(h.primary.prepare(h.id,{...sourceRequest(),startYear:1,endYear:9999})).rejects.toThrow();expect(calls).toBe(0);expect(h.port.values(h.id)).toEqual(prior);expect(h.port.captureReadout?.(h.id).state).toBe('ready');}finally{Object.defineProperty(row,'close',descriptor);}
});
