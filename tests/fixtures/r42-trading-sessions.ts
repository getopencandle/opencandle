import type {Bar} from '../../src/domain/types';
import type {TradingWindow,TradingSessionsSource} from '../../src/domain/indicators-ext/trading-sessions';
export const stamp=(text:string)=>Date.parse(text)/1000;
export const observed=(text:string,close:number):Bar=>({time:stamp(text),open:close,high:close+1,low:close-1,close,volume:10});
export const syntheticSource:TradingSessionsSource={resolution:'1m',exchangeZone:'UTC',style:'candles',tickSize:1};
export function windows(...enabled:Partial<TradingWindow>[]):TradingWindow[]{return Array.from({length:3},(_,index)=>({enabled:index<enabled.length,name:`SYNTHETIC window ${index+1}`,start:'13:00',end:'14:00',zone:'UTC',color:'#2962ff',...enabled[index]}));}
export const inputs={session1Enabled:true,session1Name:'SYNTHETIC afternoon',session1Start:'13:00',session1End:'14:00',session1Zone:'UTC',session1Color:'#2962ff'};
export const bars=[observed('2024-06-03T12:59:00Z',1),observed('2024-06-03T13:00:00Z',10),observed('2024-06-03T13:01:00Z',14),observed('2024-06-03T14:00:00Z',99)];
