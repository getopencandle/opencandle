import {expect,it,vi} from 'vitest';
import {createContextPriceAuthority} from '../../src/ui/context-price-ownership';
import type {ContextPriceRequest,ContextPriceRequestInput} from '../../src/ui/context-price-request';
import {fixtureDataset} from '../../src/domain/fixtures';
const input=():ContextPriceRequestInput=>({id:'local-test',action:'price-alert',price:99.5,instrument:fixtureDataset('GME',3).instrument,chartId:'cell-1',sourceKey:'literal-supplied-source',style:'candles',executionIdentity:'ordinary',pointTime:null,pointIndex:null,paperOwner:null});
it('accepts only its own exact request and separates initial geometry from later ownership',()=>{
 const authority=createContextPriceAuthority(),check=vi.fn(),request=authority.mint(input(),check);
 expect(request.price).toBe(99.5);expect(request.priceText).toBe('99.50');expect(Object.isFrozen(request)).toBe(true);
 expect(check.mock.calls).toEqual([['seed'],['seed']]);authority.assert(request);authority.assert(request,'seed');expect(check.mock.calls.slice(2)).toEqual([['use'],['seed']]);
 expect(()=>authority.assert({...request})).toThrow('not issued');expect(()=>createContextPriceAuthority().assert(request)).toThrow('not issued');
});
it('retiring a request cannot retire its replacement and retained uses reject',()=>{
 const authority=createContextPriceAuthority(),first=authority.mint(input(),()=>{});
 expect(()=>authority.mint(input(),()=>{})).toThrow('Finish');expect(authority.retire(first)).toBe(true);const next=authority.mint({...input(),id:'next'},()=>{});
 expect(authority.retire(first)).toBe(false);expect(()=>authority.assert(first)).toThrow('closed');expect(()=>authority.assert(next)).not.toThrow();
});
it('failed initial checks do not issue a capability and recursive creation rejects',()=>{
 const authority=createContextPriceAuthority();let checks=0;
 expect(()=>authority.mint(input(),()=>{if(++checks===2)throw Error('Geometry changed');})).toThrow('Geometry changed');
 expect(()=>authority.mint(input(),()=>{authority.mint(input(),()=>{});})).toThrow('Finish');
 expect(()=>authority.assert(authority.mint(input(),()=>{}))).not.toThrow();
});
it('a reentrant retirement during owner validation cannot complete a retained use',()=>{
 const authority=createContextPriceAuthority();let request:ContextPriceRequest|null=null;
 request=authority.mint(input(),phase=>{if(phase==='use'&&request)authority.retire(request);});
 expect(()=>authority.assert(request!)).toThrow('closed');expect(authority.retire(request)).toBe(false);
});
