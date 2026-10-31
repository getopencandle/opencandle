import {AlpacaLiveProvider,type AlpacaBridge,type AlpacaEvent,type AlpacaBarsValue} from '../../src/domain/alpaca-live';
import {cellSessionDataset} from '../../src/chart/cell-session';
import type {Bar} from '../../src/domain/types';
export const unix=(value:string)=>Date.parse(value)/1000;
export const flushMtf=async()=>{for(let index=0;index<40;index++)await Promise.resolve();};
/** Invented prices carried by the real provider, not a provider/snapshot registrar. */
export function syntheticSession(open:string,count:number,price:number,step=900):Bar[]{return Array.from({length:count},(_,index)=>({time:unix(open)+index*step,open:price-2,high:price+3,low:price-4,close:price,volume:10}));}
export const fridayMonday=()=>[...syntheticSession('2024-03-08T14:30:00Z',26,110),...syntheticSession('2024-03-11T13:30:00Z',26,130)];
export type Request=Parameters<AlpacaBridge['fetchAlpacaBars']>[0];
export function response(request:Request,bars:Bar[],options:{end?:number;next?:string|null}={}):{ok:true;value:AlpacaBarsValue}{
 const url=new URL('https://data.alpaca.markets/v2/stocks/'+encodeURIComponent(request.symbol)+'/bars');for(const [key,value]of Object.entries({timeframe:request.timeframe,start:new Date(request.start*1000).toISOString(),end:new Date((options.end??request.end)*1000).toISOString(),feed:request.feed,adjustment:request.adjustment,sort:'asc'}))url.searchParams.set(key,String(value));
 return {ok:true,value:{schemaVersion:1,symbol:request.symbol,timeframe:request.timeframe,seconds:request.timeframe==='1Min'?60:request.timeframe==='5Min'?300:900,feed:request.feed,bars,nextPageToken:options.next??null,provenance:{provider:'SYNTHETIC test bridge',kind:'owner-key',feed:request.feed,delaySeconds:0,sourceUrl:url.href,retrievedAt:'2024-03-11T20:00:05Z',bytes:0,license:'Invented test prices; no network/key used.'}}};
}
export async function publishedSource(options:{bars?:Bar[];now?:number;resolution?:string;reply?:(request:Request,call:number)=>ReturnType<AlpacaBridge['fetchAlpacaBars']>;plan?:'paid'|'free';cache?:object}={}){
 let now=options.now??unix('2024-03-11T20:00:00Z'),listener:((event:AlpacaEvent)=>void)|null=null,calls=0;const bars=options.bars??fridayMonday(),requests:Request[]=[];
 const bridge={fetchAlpacaBars:async(request:Request)=>{requests.push(request);const call=++calls;return options.reply?options.reply(request,call):response(request,bars.filter(row=>row.time>=request.start&&row.time<=request.end).map(row=>({...row})));},subscribeAlpaca:async()=>({ok:true,value:{schemaVersion:1,state:'ready',symbols:['GME'],attempt:0,lastMessageAt:null,liveMessages:false,lastError:null,counters:{}}}),unsubscribeAlpaca:async()=>({ok:true,value:null}),onAlpacaEvent(callback:(event:AlpacaEvent)=>void){listener=callback;return()=>{listener=null;};},...options.cache} as unknown as AlpacaBridge;
 const provider=new AlpacaLiveProvider(bridge,{now:()=>now*1000,plan:options.plan??'paid'}),handle=provider.open('GME',options.resolution??'30m');await flushMtf();
 return{provider,handle,requests,raw:()=>handle.dataset(),regular:()=>cellSessionDataset(handle.dataset(),{session:'regular'}),setNow(value:number){now=value;},emit(event:AlpacaEvent){listener?.(event);},dispose(){handle.close();provider.dispose();}};
}
