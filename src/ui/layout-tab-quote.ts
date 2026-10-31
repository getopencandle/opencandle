import type {BarDataset} from '../domain/types';
import {activeWatchList,type WatchBook,type WatchReference} from '../watchlists/model';
import {watchQuote} from '../watchlists/quotes';
import type {LayoutTabQuote} from './layout-tabs';

/** Owner request: the active tab's ticker and daily change. The change is the watchlist's Chg% for the active
 * chart's own source (the daily companion of a live feed when it is open); when that has no value, a watchlist row for the same
 * market supplies it. No change known: the ticker alone. */
export function layoutTabQuote(dataset:BarDataset|null|undefined,datasets:readonly BarDataset[],book?:WatchBook|null):LayoutTabQuote|null{
 if(!dataset)return null;const symbol=dataset.instrument.symbol;if(!symbol)return null;
 const own:WatchReference={symbol,exchange:dataset.instrument.exchange,datasetId:dataset.provenance.datasetId,dailyDatasetId:null,synthetic:!!dataset.provenance.fixture};
 let changePercent:number|null=null,last:number|null=null;
 try{const quote=watchQuote(own,datasets.includes(dataset)?datasets:[...datasets,dataset]);changePercent=quote.changePercent;last=quote.last;}catch{changePercent=null;last=null;}
 if(changePercent===null&&book){
  try{for(const row of activeWatchList(book).rows){if(row.kind!=='symbol'||row.reference.symbol!==symbol||row.reference.exchange!==dataset.instrument.exchange)continue;const quote=watchQuote(row.reference,datasets);if(quote.changePercent!==null){changePercent=quote.changePercent;last=quote.last??last;break;}}}catch{/* the ticker alone */}
 }
 // The last price sits between the ticker and the change, from the same quote as the change.
 return{symbol,changePercent,last,priceText:layoutTabPrice(last,dataset.instrument.tickSize)};
}
/** The tab price at the instrument's tick precision with digit grouping ("23.56", "67,850.00"). */
export function layoutTabPrice(value:number|null|undefined,tickSize:number):string|null{
 if(typeof value!=='number'||!Number.isFinite(value))return null;
 let decimals=2;if(Number.isFinite(tickSize)&&tickSize>0){for(decimals=0;decimals<8;decimals++){const scaled=tickSize*10**decimals;if(Math.abs(scaled-Math.round(scaled))<1e-9*Math.max(1,scaled))break;}}
 return value.toLocaleString('en-US',{minimumFractionDigits:decimals,maximumFractionDigits:decimals});
}
