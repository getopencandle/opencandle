import {expect,it,vi} from 'vitest';
import {inspectSeasonalityFrontierResponse,SEASONALITY_FRONTIER_RESPONSE_COST,type SeasonalityFrontierSentRequest} from '../../src/domain/seasonality-frontier-response';
const start=Date.parse('2024-03-01T05:00:00Z')/1000,end=Date.parse('2024-03-11T13:30:00Z')/1000;
function sent(patch:Partial<SeasonalityFrontierSentRequest>={}):SeasonalityFrontierSentRequest{return{symbol:'SYNTHETIC',timeframe:'1Min',feed:'sip',adjustment:'split',start,end,...patch};}
function response(request=sent(),rows:unknown[]=[{time:end,label:'SYNTHETIC time-only response'}],next:string|null=null){
 const url=new URL('https://data.alpaca.markets/v2/stocks/'+encodeURIComponent(request.symbol)+'/bars');
 for(const [key,value]of Object.entries({timeframe:request.timeframe,feed:request.feed,adjustment:request.adjustment,start:new Date(request.start*1000).toISOString(),end:new Date(request.end*1000).toISOString(),...(request.pageToken?{page_token:request.pageToken}:{})}))url.searchParams.set(key,value);
 return{schemaVersion:1,symbol:request.symbol,timeframe:request.timeframe,seconds:request.timeframe==='1Min'?60:request.timeframe==='5Min'?300:900,feed:request.feed,bars:rows,nextPageToken:next,provenance:{feed:request.feed,sourceUrl:url.href}};
}
function changeURL(value:ReturnType<typeof response>,change:(url:URL)=>void){const url=new URL(value.provenance.sourceUrl);change(url);return{...value,provenance:{...value.provenance,sourceUrl:url.href}};}
it('returns only a fixed complete request envelope and original rows without reading price or time',()=>{
 const read=vi.fn(()=>{throw Error('SYNTHETIC row read forbidden');}),row={label:'SYNTHETIC'};for(const key of ['time','open','high','low','close','volume'])Object.defineProperty(row,key,{get:read});
 const value=response(sent(),[row]),echo=inspectSeasonalityFrontierResponse(value,sent());expect(Object.keys(echo)).toEqual(['from','through','requestPageToken','nextPageToken','rows']);expect(echo.rows).toBe(value.bars);expect(echo).toMatchObject({from:start,through:end,requestPageToken:null,nextPageToken:null});expect(Object.isFrozen(echo)).toBe(true);expect(Object.isFrozen(value.bars)).toBe(false);expect(read).not.toHaveBeenCalled();
});
it('derives real native seconds from each supported intraday timeframe',()=>{
 for(const timeframe of ['1Min','5Min','15Min'] as const){const request=sent({timeframe}),value=response(request);expect(inspectSeasonalityFrontierResponse(value,request).rows).toBe(value.bars);expect(()=>inspectSeasonalityFrontierResponse({...value,seconds:86400},request)).toThrow();}
});
it('price-neutral response identity still requires exact symbol timeframe and feed',()=>{
 const value=response();for(const patch of [{symbol:'OTHER'},{timeframe:'1Day'},{seconds:300},{feed:'iex'},{schemaVersion:2}])expect(()=>inspectSeasonalityFrontierResponse({...value,...patch},sent())).toThrow();
});
it('foreign endpoints credentials fragments and noncanonical URL text refuse',()=>{
 const value=response();for(const sourceUrl of [value.provenance.sourceUrl.replace('data.alpaca.markets','example.invalid'),value.provenance.sourceUrl.replace('/SYNTHETIC/bars','/OTHER/bars'),value.provenance.sourceUrl.replace('https://','https://someone@'),value.provenance.sourceUrl+'#fragment',value.provenance.sourceUrl+' '])expect(()=>inspectSeasonalityFrontierResponse({...value,provenance:{...value.provenance,sourceUrl}},sent())).toThrow();
});
it('duplicate known query parameters cannot masquerade as one genuine request',()=>{
 const value=response();for(const key of ['timeframe','feed','adjustment','start','end','page_token'])expect(()=>inspectSeasonalityFrontierResponse(changeURL(value,url=>url.searchParams.append(key,key==='page_token'?'extra':url.searchParams.get(key)!)),sent())).toThrow();
});
it('shortened and expanded response spans cannot prove a complete original prefix',()=>{
 const value=response();for(const [key,time]of [['start',start+60],['start',start-60],['end',end-60],['end',end+60]] as const)expect(()=>inspectSeasonalityFrontierResponse(changeURL(value,url=>url.searchParams.set(key,new Date(time*1000).toISOString())),sent())).toThrow();
});
it('page token echo and immediate advancement are exact, while cross-page cycles belong to the frontier counter',()=>{
 const request=sent({pageToken:'SYNTHETIC-A'}),value=response(request,[],'SYNTHETIC-B');expect(inspectSeasonalityFrontierResponse(value,request)).toMatchObject({requestPageToken:'SYNTHETIC-A',nextPageToken:'SYNTHETIC-B'});
 expect(()=>inspectSeasonalityFrontierResponse(changeURL(value,url=>url.searchParams.set('page_token','WRONG')),request)).toThrow();expect(()=>inspectSeasonalityFrontierResponse({...value,nextPageToken:'SYNTHETIC-A'},request)).toThrow();expect(()=>inspectSeasonalityFrontierResponse({...value,nextPageToken:''},request)).toThrow();
});
it('fixed row count inspection accepts10000 without touching rows and refuses10001 before traversal',()=>{
 const rows=new Array(10000),value=response(sent(),rows);expect(inspectSeasonalityFrontierResponse(value,sent()).rows).toBe(rows);expect(()=>inspectSeasonalityFrontierResponse(response(sent(),new Array(10001)),sent())).toThrow();
});
it('sent and response accessors are rejected without invoking them',()=>{
 const read=vi.fn();expect(()=>inspectSeasonalityFrontierResponse(Object.defineProperty(response(),'symbol',{get:read}),sent())).toThrow();expect(()=>inspectSeasonalityFrontierResponse(response(),Object.defineProperty(sent(),'feed',{get:read}))).toThrow();expect(read).not.toHaveBeenCalled();
});
it('request types invalid instants feed basis and missing token cannot broaden the inspector',()=>{
 for(const patch of [{timeframe:'1Day'},{feed:'unknown'},{adjustment:'raw'},{start:NaN},{end:start},{pageToken:''}])expect(()=>inspectSeasonalityFrontierResponse(response(),sent(patch as Partial<SeasonalityFrontierSentRequest>))).toThrow();
});
it('URL token and implicit-timezone echoes have explicit bounded refusals',()=>{
 const value=response();expect(()=>inspectSeasonalityFrontierResponse({...value,provenance:{...value.provenance,sourceUrl:'x'.repeat(8193)}},sent())).toThrow();expect(()=>inspectSeasonalityFrontierResponse({...value,nextPageToken:'x'.repeat(2049)},sent())).toThrow();expect(()=>inspectSeasonalityFrontierResponse(changeURL(value,url=>url.searchParams.set('end','2024-03-11T13:30:00')),sent())).toThrow();
});
it('inspection scratch is explicitly prepaid in addition to every retained response envelope',()=>{
 expect(SEASONALITY_FRONTIER_RESPONSE_COST).toEqual({operations:65536,numericSlots:65536});expect(SEASONALITY_FRONTIER_RESPONSE_COST.numericSlots).toBeLessThan(2000000);
});
