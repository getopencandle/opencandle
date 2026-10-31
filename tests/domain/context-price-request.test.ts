import {expect,it,vi} from 'vitest';
import {assertContextPriceRequest,buildContextPriceRequestData,contextPriceText,contextPriceLabel,type ContextPriceRequestInput} from '../../src/ui/context-price-request';
import {fixtureDataset} from '../../src/domain/fixtures';

const input=():ContextPriceRequestInput=>({id:'clicked',action:'price-alert',price:100.005,instrument:fixtureDataset('GME',2).instrument,chartId:'chart',sourceKey:'exact-synthetic-source',style:'candles',executionIdentity:'ordinary',pointIndex:null,pointTime:null,paperOwner:null});
it('seeds the clicked price rounded to the instrument precision, null coordinate time, and detaches metadata',()=>{
 const source=input(),result=buildContextPriceRequestData(source);expect(result.priceText).toBe('100.01');expect(result.price).toBe(100.01);expect(result.pointTime).toBeNull();expect(result.pointIndex).toBeNull();expect(Object.isFrozen(result)).toBe(true);expect(Object.isFrozen(result.instrument)).toBe(true);expect(result.instrument).not.toBe(source.instrument);
 (source.instrument as any).symbol='CHANGED';expect(result.instrument.symbol).toBe('GME');expect(contextPriceText(1e-8)).toBe('0.00000001');expect(contextPriceText(1e15)).toBe('1000000000000000');
});
it('seeds the value rounded to the displayed precision and equal to the menu label',()=>{
 for(const [raw,text] of [[23.3681234,'23.37'],[23.364,'23.36'],[150.999,'151.00'],[0.126,'0.13']] as const){const r=buildContextPriceRequestData({...input(),price:raw});expect(r.priceText).toBe(text);expect(r.price).toBe(Number(text));expect(contextPriceLabel(raw,r.instrument.tickSize)).toBe(r.priceText);}
});
it('rejects nonpositive, nonfinite, excessively small and large prices',()=>{for(const value of [NaN,Infinity,-Infinity,-0,0,-1,1e16,1e-100])expect(()=>contextPriceText(value)).toThrow();});
it('rejects accessors, hidden/symbol/unknown fields before invoking user code',()=>{
 const getter=vi.fn(()=>100),source=input();Object.defineProperty(source,'price',{get:getter,enumerable:true});expect(()=>buildContextPriceRequestData(source)).toThrow(/accessors/);expect(getter).not.toHaveBeenCalled();
 const hidden=input();Object.defineProperty(hidden,'chartId',{value:'chart',enumerable:false});expect(()=>buildContextPriceRequestData(hidden)).toThrow();
 const symbol=input();(symbol as any)[Symbol('private')]='x';expect(()=>buildContextPriceRequestData(symbol)).toThrow();
 expect(()=>buildContextPriceRequestData({...input(),toJSON:getter} as any)).toThrow();expect(getter).not.toHaveBeenCalled();
 const nested=input();Object.defineProperty(nested.instrument,'tickSize',{get:getter,enumerable:true});expect(()=>buildContextPriceRequestData(nested)).toThrow();expect(getter).not.toHaveBeenCalled();
});
it('enforces UTF-8 source bounds and matching nullable loaded-bar fields',()=>{
 expect(()=>buildContextPriceRequestData({...input(),sourceKey:'é'.repeat(8192)})).not.toThrow();expect(()=>buildContextPriceRequestData({...input(),sourceKey:'é'.repeat(8193)})).toThrow(/16 KiB/);
 for(const change of [{pointTime:1},{pointIndex:1},{pointTime:1,pointIndex:-1},{pointTime:253402300800,pointIndex:0},{pointTime:1,pointIndex:1000000}])expect(()=>buildContextPriceRequestData({...input(),...change})).toThrow();
 expect(buildContextPriceRequestData({...input(),pointTime:-62135596800,pointIndex:0}).pointTime).toBe(-62135596800);
});
it('requires exact virtual account identity for paper only and never grants copied-request authority',()=>{
 const paper=buildContextPriceRequestData({...input(),action:'paper-ticket',paperOwner:{id:'replay-account',mode:'replay-paper',runId:'replay'}});expect(paper.paperOwner).toEqual({id:'replay-account',mode:'replay-paper',runId:'replay'});
 expect(()=>buildContextPriceRequestData({...input(),action:'paper-ticket'})).toThrow();expect(()=>buildContextPriceRequestData({...input(),paperOwner:paper.paperOwner})).toThrow();
 const guard=vi.fn(),complete=vi.fn(),props={contextRequest:paper,assertContextCurrent:guard,onContextComplete:complete};assertContextPriceRequest(props,paper,'paper-ticket',paper.instrument,'seed');expect(guard).toHaveBeenCalledExactlyOnceWith(paper,'seed');expect(complete).not.toHaveBeenCalled();
 expect(()=>assertContextPriceRequest(props,{...paper},'paper-ticket',paper.instrument)).toThrow(/replaced/);expect(guard).toHaveBeenCalledOnce();
});
it('builds a clicked-price alert on a crypto chart; a virtual ticket still needs a stock or ETF',()=>{
 const crypto={...fixtureDataset('GME',2).instrument,id:'coinbase:BTC-USD',symbol:'BTC-USD',exchange:'COINBASE',name:'Bitcoin / US Dollar',assetClass:'crypto' as const};
 const alert=buildContextPriceRequestData({...input(),instrument:crypto,price:76364.123});expect(alert.priceText).toBe('76364.12');expect(alert.instrument.assetClass).toBe('crypto');
 const guard=vi.fn(),props={contextRequest:alert,assertContextCurrent:guard,onContextComplete:vi.fn()};expect(()=>assertContextPriceRequest(props,alert,'price-alert',{...crypto},'seed')).not.toThrow();
 expect(()=>assertContextPriceRequest(props,alert,'price-alert',{...crypto,symbol:'ETH-USD'})).toThrow(/instrument changed/);
 expect(()=>buildContextPriceRequestData({...input(),instrument:crypto,action:'paper-ticket',paperOwner:{id:'a',mode:'paper',runId:'r'}})).toThrow(/execution instrument/);
});
