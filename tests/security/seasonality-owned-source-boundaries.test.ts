import {afterEach,expect,it} from 'vitest';
import {ownedSourceFixture,monthlyLocal,sourceRequest} from '../fixtures/seasonality-owned-source';
import {normalizePrimarySourceRequest} from '../../src/chart/seasonality-source';
import {sourceContextForDataset,sourceContextForInput,localCandleContextFacts,captureLocalCandleContext,localCandleSourceInputMatches} from '../../src/chart/source-context';
import {cloneProfileInputBars,localCandleCloneMatchesContext} from '../../src/chart/profile-input-clone';
import {stampLiveLineage} from '../../src/chart/bar-input-identity';
import {reconstructLocalCandleDataset} from '../../src/domain/local-candle-origin';
const fixtures:Awaited<ReturnType<typeof ownedSourceFixture>>[]=[];
async function fixture(options:Parameters<typeof ownedSourceFixture>[0]={}){const h=await ownedSourceFixture(options);fixtures.push(h);return h;}
afterEach(()=>{for(const h of fixtures.splice(0))h.dispose();});
it('copied contexts and hand-copied arrays cannot impersonate actual constructor input ancestry',()=>{
 const a=monthlyLocal(),b=monthlyLocal(),source=sourceContextForDataset(a),copy=cloneProfileInputBars(a.bars);expect(localCandleSourceInputMatches(source,a.bars)).toBe(true);expect(localCandleSourceInputMatches(source,b.bars)).toBe(false);expect(localCandleContextFacts({...source})).toBeNull();expect(localCandleCloneMatchesContext(copy,source,a.bars.length)).toBe(true);expect(localCandleCloneMatchesContext(a.bars.map(row=>({...row})),source,a.bars.length)).toBe(false);
});
it('a genuine selected prefix is pinned independently from a different equal-valued original',()=>{
 const a=monthlyLocal(),b=monthlyLocal(),prefix=a.bars.slice(0,5),source=sourceContextForDataset(a,prefix),copy=cloneProfileInputBars(prefix),other=sourceContextForDataset(b,b.bars.slice(0,5));expect(localCandleContextFacts(source)).toMatchObject({rows:14,inputRows:5,resolution:'1M'});expect(localCandleCloneMatchesContext(copy,source,5)).toBe(true);expect(localCandleCloneMatchesContext(copy,other,5)).toBe(false);expect(localCandleCloneMatchesContext(copy,source,5)).toBe(true);
});
it('own context constructors carry exact input membership while independent admitted leases dispose separately',()=>{
 const data=monthlyLocal(),source=sourceContextForDataset(data),current=sourceContextForInput(source,data.bars),a=captureLocalCandleContext(current,{externalNumericSlots:0,externalOperations:0})!,b=captureLocalCandleContext(current,{externalNumericSlots:0,externalOperations:0})!;expect(a.rows).toBe(14);a.dispose();expect(a.isCurrent()).toBe(false);expect(b.readRows(0,1)[0].close).toBe(125);b.assertCurrent();b.dispose();
});
it('numeric source mutation is observed terminally by an admitted context lease with zero accessor invocations',()=>{
 const data=monthlyLocal(),source=sourceContextForDataset(data),lease=captureLocalCandleContext(source,{externalNumericSlots:0,externalOperations:0})!,descriptor=Object.getOwnPropertyDescriptor(data.bars[1],'close')!;let reads=0;Object.defineProperty(data.bars[1],'close',{configurable:true,enumerable:true,get(){reads++;throw Error('Do not read');}});expect(()=>lease.assertCurrent()).toThrow();Object.defineProperty(data.bars[1],'close',descriptor);expect(lease.isCurrent()).toBe(false);expect(reads).toBe(0);expect(captureLocalCandleContext(source,{externalNumericSlots:0,externalOperations:0})).toBeNull();
});
it('an admitted original-row descriptor reentry cannot execute a newly installed context getter',()=>{
 const parsed=monthlyLocal();let context:ReturnType<typeof sourceContextForDataset>|undefined,armed=false,calls=0;const bars=new Proxy(parsed.bars,{getOwnPropertyDescriptor(target,key){if(armed&&key==='0'){armed=false;Object.defineProperty(context!,'resolution',{enumerable:true,configurable:true,get(){calls++;throw Error('No post-capture getter');}});}return Reflect.getOwnPropertyDescriptor(target,key);}}),data=reconstructLocalCandleDataset({...parsed,bars,provenance:{...parsed.provenance}});context=sourceContextForDataset(data);expect(localCandleContextFacts(context)).toMatchObject({rows:14});armed=true;expect(captureLocalCandleContext(context,{externalNumericSlots:0,externalOperations:0})).toBeNull();expect(calls).toBe(0);
});
it('context and request accessors refuse without invocation before numerical preparation',async()=>{
 const h=await fixture(),field=Object.getOwnPropertyDescriptor(h.source(),'basisIdentity')!;let calls=0;Object.defineProperty(h.source(),'basisIdentity',{enumerable:true,configurable:true,get(){calls++;throw Error('No context getter');}});await expect(h.primary.prepare(h.id,sourceRequest())).rejects.toThrow();Object.defineProperty(h.source(),'basisIdentity',field);const request=sourceRequest();Object.defineProperty(request,'calendar',{enumerable:true,get(){calls++;throw Error('No request getter');}});expect(()=>normalizePrimarySourceRequest(request)).toThrow();expect(calls).toBe(0);
});
it('nonprimitive year arithmetic and flags never call valueOf or retire an existing accepted source',async()=>{
 const h=await fixture(),view=await h.primary.prepare(h.id,sourceRequest());let calls=0;const fake={valueOf(){calls++;return 2016;},toString(){calls++;return '2016';}};await expect(h.primary.prepare(h.id,{...sourceRequest(),startYear:fake} as any)).rejects.toThrow();await expect(h.primary.prepare(h.id,{...sourceRequest(),endYear:fake} as any)).rejects.toThrow();await expect(h.primary.prepare(h.id,{...sourceRequest(),meanRow:fake} as any)).rejects.toThrow();expect(calls).toBe(0);view.assertCurrent();expect(view.read().status).toBe('ready');
});
it('unaffordable year/calendar demand refuses before touching source numerical accessors',async()=>{
 const h=await fixture(),field=Object.getOwnPropertyDescriptor(h.dataset.bars[1],'close')!;let calls=0;Object.defineProperty(h.dataset.bars[1],'close',{configurable:true,enumerable:true,get(){calls++;throw Error('No allocation first');}});await expect(h.primary.prepare(h.id,{...sourceRequest(),startYear:1,endYear:9999})).rejects.toThrow();expect(calls).toBe(0);Object.defineProperty(h.dataset.bars[1],'close',field);expect((await h.primary.prepare(h.id,sourceRequest())).read().status).toBe('ready');
});
it('forged signals and overridden signal methods cannot supply cancellation/current authority',()=>{
 const request=sourceRequest(),forged=Object.create(AbortSignal.prototype);expect(()=>normalizePrimarySourceRequest({...request,signal:forged})).toThrow();let calls=0;Object.defineProperty(request.signal,'aborted',{get(){calls++;throw Error('No overridden aborted getter');}});Object.defineProperty(request.signal,'addEventListener',{value(){calls++;throw Error('No caller method');}});expect(normalizePrimarySourceRequest(request).signal).toBe(request.signal);expect(calls).toBe(0);
});
it('a normal native calculation remains accepted when an unqualified original source service refuses',async()=>{
 const data=monthlyLocal(),copy={...data,provenance:{...data.provenance}},h=await fixture({dataset:copy});const prior=h.port.values(h.id);await expect(h.primary.prepare(h.id,sourceRequest())).rejects.toThrow();expect(h.port.values(h.id)).toEqual(prior);expect(h.port.captureReadout?.(h.id).state).toBe('ready');
});
it('known live ancestry cannot be relabeled into qualified local source ownership',async()=>{
 const data=monthlyLocal();stampLiveLineage(data.bars,'SYNTHETIC known-live lineage exercise',0);data.provenance={...data.provenance,providerId:'local-import',datasetId:'local:SYNTHETIC-relabeled',fixture:true};const h=await fixture({dataset:data});await expect(h.primary.prepare(h.id,sourceRequest())).rejects.toThrow();expect(h.port.values(h.id).series[0].values[1]).toBeCloseTo(117.5,12);
});
it('real accepted source reservations across instances eventually refuse without evicting an accepted builtin value',async()=>{
 const h=await fixture(),first=h.port.captureReadout!(h.id);expect(first.state).toBe('ready');const views=[];let refused=false;
 for(let index=0;index<60;index++){const id=index?h.port.add('ema',{length:2}):h.id;try{views.push(await h.primary.prepare(id,sourceRequest()));}catch{refused=true;break;}}
 expect(refused).toBe(true);expect(views.length).toBeGreaterThan(1);expect(views.length).toBeLessThan(60);expect(views[0].read().status).toBe('ready');if(first.state==='ready'){first.assertCurrent();expect(first.readAt(h.raw()[1].time).plots[0].value).toBeCloseTo(117.5,12);}
 for(const view of views)view.dispose();expect((await h.primary.prepare(h.id,sourceRequest())).read().status).toBe('ready');
});
it('pending reservations are charged before ready and abort frees them without old A cleanup clearing accepted B',async()=>{
 const h=await fixture({deferInitial:true}),controllers:AbortController[]=[],pending:Promise<unknown>[]=[];let refused=false;
 for(let index=0;index<60;index++){const id=index?h.port.add('ema',{length:2}):h.id,controller=new AbortController();controllers.push(controller);let failure:unknown;const next=h.primary.prepare(id,sourceRequest(controller.signal)).then(view=>view,error=>{failure=error;return error;});pending.push(next);for(let turn=0;turn<3;turn++)await Promise.resolve();if(failure instanceof Error){refused=true;break;}}
 expect(refused).toBe(true);expect(pending.length).toBeGreaterThan(1);for(const controller of controllers)controller.abort();await Promise.all(pending);h.initialDone();await Promise.resolve();await Promise.resolve();const b=await h.primary.prepare(h.id,sourceRequest());expect(b.read().status).toBe('ready');await Promise.all(pending);b.assertCurrent();
});
