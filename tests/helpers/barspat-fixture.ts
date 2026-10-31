// SYNTHETIC data for the Bars pattern lane tests (deterministic, original, no market data).
// One 24/7 SYNTHETIC instrument: a 1-minute series for days 0..29 from Monday 2026-03-02 (UTC); daily bars are aggregated
// from the same minutes, so 1D and 1m agree exactly. The supplied 1m dataset covers only days 5..14.
import type {Bar,BarDataset} from '../../src/domain/types';

export const DAY=86_400;
/** Monday 2026-03-02 00:00 UTC (DEFAULT_AGGREGATION_POLICY weeks start on Monday). */
export const D0=Date.UTC(2026,2,2)/1000;
export const day=(index:number)=>D0+index*DAY;
export const INSTRUMENT='SYNTHETIC:BARSPAT';

const round=(value:number)=>Math.round(value*100)/100;
function minute(index:number):Bar{
 const base=100+20*Math.sin(index/2000)+3*Math.sin(index/37),open=round(base),close=round(base+Math.sin(index/5)),high=round(Math.max(open,close)+0.25+0.1*(index%7)),low=round(Math.min(open,close)-0.25-0.1*(index%5));
 return{time:D0+index*60,open,high,low,close,volume:100+(index%50)};
}
let minutes:Bar[]|null=null;
export function allMinutes():Bar[]{return minutes??=Array.from({length:30*1440},(_,i)=>minute(i));}
export function minuteBars(fromDay:number,toDay:number):Bar[]{return allMinutes().slice(fromDay*1440,toDay*1440).map(bar=>({...bar}));}
export function dailyBars(fromDay:number,toDay:number):Bar[]{
 const out:Bar[]=[];
 for(let d=fromDay;d<toDay;d++){const rows=allMinutes().slice(d*1440,(d+1)*1440);out.push({time:day(d),open:rows[0].open,high:Math.max(...rows.map(r=>r.high)),low:Math.min(...rows.map(r=>r.low)),close:rows[rows.length-1].close,volume:rows.reduce((sum,r)=>sum+r.volume,0)});}
 return out;
}
export function secondBars(dayIndex:number):Bar[]{
 return Array.from({length:DAY},(_,i)=>{const p=round(100+Math.sin(i/300));return{time:day(dayIndex)+i,open:p,high:round(p+0.05),low:round(p-0.05),close:p,volume:1};});
}
export function dataset(datasetId:string,resolution:string,bars:Bar[],options:{fixture?:boolean;instrumentId?:string;providerId?:string}={}):BarDataset{
 const fixture=options.fixture??true;
 return{
  instrument:{id:options.instrumentId??INSTRUMENT,symbol:'BARSPAT',name:'BARSPAT synthetic instrument',exchange:'SYNTHETIC',currency:'USD',assetClass:'crypto',tickSize:0.01,lotSize:1,timezone:'UTC'},
  bars,resolution,
  provenance:{providerId:options.providerId??'lv-synthetic',providerName:fixture?'LV synthetic fixture generator':'Local import',datasetId,fixture,coverage:'SYNTHETIC test coverage',asOf:0,delaySeconds:null,adjustment:'raw',session:'all',timezone:'UTC',state:'ready',license:'synthetic',revision:'r1',notes:['SYNTHETIC']},
 };
}
export const daily=()=>dataset('syn-1d','1D',dailyBars(0,30));
export const oneMinute=()=>dataset('syn-1m','1m',minuteBars(5,15));
