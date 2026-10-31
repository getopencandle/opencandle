import {expect,it,vi} from 'vitest';
import {fixtureInstrument} from '../../src/domain/fixtures';
import {createContextPriceAuthority} from '../../src/ui/context-price-ownership';
import {assertContextPriceRequest,buildContextPriceRequestData,contextPriceText,type ContextPriceProps,type ContextPriceRequest,type ContextPriceRequestInput} from '../../src/ui/context-price-request';

const input=():ContextPriceRequestInput=>({id:'synthetic-review',action:'price-alert',price:100.005,instrument:fixtureInstrument('GME'),chartId:'first-cell',sourceKey:'SYNTHETIC:local-source:revision-7',style:'candles',executionIdentity:'ordinary',pointTime:null,pointIndex:null,paperOwner:null});

it('public construction, serialization and same-ID copies grant no root capability',()=>{
 const authority=createContextPriceAuthority(),data=buildContextPriceRequestData(input()),owned=authority.mint(input(),()=>{});
 for(const candidate of [data,JSON.parse(JSON.stringify(owned)),{...owned},createContextPriceAuthority().mint(input(),()=>{})])expect(()=>authority.assert(candidate)).toThrow();
 expect(authority.retire(data)).toBe(false);expect(()=>authority.assert(owned)).not.toThrow();
 expect(Object.isFrozen(data)).toBe(true);expect(Object.isFrozen(data.instrument)).toBe(true);
 const original={...input(),instrument:fixtureInstrument('GME')},detached=buildContextPriceRequestData(original);original.instrument.symbol='SPY';original.sourceKey='replaced';
 expect(detached.instrument.symbol).toBe('GME');expect(detached.sourceKey).toBe('SYNTHETIC:local-source:revision-7');
});

it('rejects getters, hidden or symbol fields and serialization hooks without reading them',()=>{
 let reads=0;const own=input();Object.defineProperty(own,'price',{enumerable:true,get(){reads++;return 100.005;}});
 const nested=input();Object.defineProperty(nested.instrument,'tickSize',{enumerable:true,get(){reads++;return 0.01;}});
 const hidden=input();Object.defineProperty(hidden,'chartId',{enumerable:false,value:'hidden'});
 const symbol={...input(),[Symbol('hidden')]:true};const hook={...input(),toJSON(){reads++;return input();}};
 const account={...input(),action:'paper-ticket',paperOwner:{id:'paper',mode:'paper',runId:'run'}};Object.defineProperty(account.paperOwner,'runId',{enumerable:true,get(){reads++;return 'run';}});
 const nestedValue={...input(),instrument:fixtureInstrument('GME')};nestedValue.instrument.tickSize={valueOf(){reads++;return 0.01;}} as unknown as number;
 for(const candidate of [own,nested,hidden,symbol,hook,account,nestedValue,Object.create(input()),[],null])expect(()=>buildContextPriceRequestData(candidate as ContextPriceRequestInput)).toThrow();
 expect(reads).toBe(0);
});

it('keeps exact unrounded decimal levels and explicitly rejects unsupported ranges',()=>{
 expect(contextPriceText(100.005)).toBe('100.005');expect(contextPriceText(1e-7)).toBe('0.0000001');
 expect(contextPriceText(1e-78)).toBe('0.'+'0'.repeat(77)+'1');expect(contextPriceText(1e15)).toBe('1000000000000000');
 for(const price of [1e-79,Number.MIN_VALUE,1e15+1,0,-0,-1,NaN,Infinity,-Infinity,'100.005',null])expect(()=>contextPriceText(price as number)).toThrow();
 // ContextPriceText stays exact (above); the request seeds the clicked price rounded half-up to the instrument's display precision (tickSize 0.01), pinned in tests/domain/context-price-request.test.ts.
 expect(buildContextPriceRequestData(input()).priceText).toBe('100.01');
});

it('bounds actual UTF-8 source bytes and escaped compact request bytes without truncation',()=>{
 const sourceKey='é'.repeat(8192);expect(buildContextPriceRequestData({...input(),sourceKey}).sourceKey).toBe(sourceKey);
 expect(()=>buildContextPriceRequestData({...input(),sourceKey:sourceKey+'é'})).toThrow('16 KiB');
 expect(()=>buildContextPriceRequestData({...input(),sourceKey:'x'.repeat(16385)})).toThrow();
 expect(()=>buildContextPriceRequestData({...input(),sourceKey:'\n'.repeat(16383)+'x'})).toThrow('32 KiB');
 for(const field of ['id','chartId'] as const)expect(()=>buildContextPriceRequestData({...input(),[field]:'x'.repeat(201)})).toThrow();
 expect(()=>buildContextPriceRequestData({...input(),executionIdentity:'x'.repeat(2049)})).toThrow();
});

it('requires paired supported coordinates and an account owner only for virtual ticket actions',()=>{
 expect(buildContextPriceRequestData({...input(),pointTime:-62135596800,pointIndex:0}).pointIndex).toBe(0);
 expect(buildContextPriceRequestData({...input(),pointTime:253402300799,pointIndex:999999}).pointTime).toBe(253402300799);
 const malformed=[{pointTime:0,pointIndex:null},{pointTime:null,pointIndex:0},{pointTime:0.5,pointIndex:0},{pointTime:253402300800,pointIndex:0},{pointTime:0,pointIndex:1000000},{pointTime:0,pointIndex:-1},{action:'price-alert',paperOwner:{id:'paper',mode:'paper',runId:'run'}},{action:'paper-ticket',paperOwner:null},{action:'paper-ticket',paperOwner:{id:'paper',mode:'real',runId:'run'}},{action:'submit-live'}];
 for(const patch of malformed)expect(()=>buildContextPriceRequestData({...input(),...patch} as ContextPriceRequestInput)).toThrow();
 const original={...input(),action:'paper-ticket' as const,paperOwner:{id:'paper',mode:'paper' as const,runId:'run'}};const request=buildContextPriceRequestData(original);original.paperOwner.runId='changed';expect(request.paperOwner?.runId).toBe('run');expect(Object.isFrozen(request.paperOwner)).toBe(true);
});

it('failed geometry seed and malformed data leave no partially issued request or creation lock',()=>{
 const authority=createContextPriceAuthority();let checks=0;
 expect(()=>authority.mint(input(),()=>{if(++checks===2)throw Error('Resize invalidated seed');})).toThrow('Resize invalidated seed');
 expect(()=>authority.mint({...input(),pointTime:0,pointIndex:null},()=>{})).toThrow();
 const check=vi.fn(),request=authority.mint(input(),check);expect(check.mock.calls).toEqual([['seed'],['seed']]);expect(()=>authority.assert(request)).not.toThrow();
});

it('a reentrant replacement during use cannot complete or retire the newer request',()=>{
 const authority=createContextPriceAuthority();let first:ContextPriceRequest,second:ContextPriceRequest|undefined;
 first=authority.mint(input(),phase=>{if(phase==='use'){expect(authority.retire(first)).toBe(true);second=authority.mint({...input(),id:'replacement'},()=>{});}});
 expect(()=>authority.assert(first)).toThrow();expect(second?.id).toBe('replacement');expect(authority.retire(first)).toBe(false);expect(()=>authority.assert(second!)).not.toThrow();
});

it('owner failure preserves explicit failure rather than creating an ordinary fallback',()=>{
 const authority=createContextPriceAuthority();let valid=true;
 const request=authority.mint(input(),()=>{if(!valid)throw Error('Source correction or account replacement');});valid=false;
 expect(()=>authority.assert(request)).toThrow('Source correction or account replacement');expect(()=>authority.assert(request,'seed')).toThrow('Source correction or account replacement');
 expect(()=>authority.mint(input(),()=>{})).toThrow('Finish');expect(authority.retire(request)).toBe(true);
});

it('child guards reject mismatched action, public copies and every instrument identity field',()=>{
 const authority=createContextPriceAuthority(),request=authority.mint(input(),()=>{}),complete=vi.fn();
 const props:ContextPriceProps={contextRequest:request,assertContextCurrent:(value,phase)=>authority.assert(value,phase),onContextComplete:complete};
 expect(()=>assertContextPriceRequest(props,request,'price-alert',fixtureInstrument('GME'),'seed')).not.toThrow();
 expect(()=>assertContextPriceRequest(props,request,'paper-ticket',fixtureInstrument('GME'))).toThrow();
 const copy=buildContextPriceRequestData(input());expect(()=>assertContextPriceRequest({...props,contextRequest:copy},copy,'price-alert',fixtureInstrument('GME'))).toThrow();
 for(const patch of [{id:'SYNTHETIC:OTHER'},{symbol:'SPY'},{exchange:'OTHER'},{currency:'EUR'},{assetClass:'etf' as const},{tickSize:0.05},{lotSize:2},{timezone:'America/Phoenix'},{name:'different'}])expect(()=>assertContextPriceRequest(props,request,'price-alert',{...fixtureInstrument('GME'),...patch})).toThrow();
 expect(()=>assertContextPriceRequest({...props,onContextComplete:undefined},request,'price-alert',fixtureInstrument('GME'))).toThrow();expect(complete).not.toHaveBeenCalled();
});

it('child validation detects an instrument changed reentrantly during private ownership validation',()=>{
 const authority=createContextPriceAuthority(),request=authority.mint(input(),()=>{}),instrument=fixtureInstrument('GME');
 const props:ContextPriceProps={contextRequest:request,assertContextCurrent:value=>{authority.assert(value);instrument.tickSize=0.05;},onContextComplete:()=>{}};
 expect(()=>assertContextPriceRequest(props,request,'price-alert',instrument)).toThrow('instrument changed');
});
