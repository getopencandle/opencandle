import {dateDay,type CompanyFacts} from './company-facts';
import {buildStatement,type StatementBasis,type StatementCell,type StatementKind} from './statements';
/** Price-based ratios from the last loaded close. Every output is either a number with its inputs or
 * null with a reason. Nothing is estimated, converted between currencies or invented. */
export interface PriceInput {close:number;date:string;currency:string|null;symbol:string;source:string}
export interface RatioInput {label:string;value:string;detail:string}
export interface RatioResult {id:'market_cap'|'price_earnings'|'price_sales'|'price_book'|'eps_yield';label:string;value:number|null;unit:string;formula:string;catalogId:string|null;reason:string|null;inputs:RatioInput[]}
export const STALE_PRICE_DAYS=7;
const M='AN.FUND.METRIC.';
const SPECS:{id:RatioResult['id'];label:string;unit:'currency'|'x'|'%';formula:string;catalogId:string|null}[]=[
 {id:'market_cap',label:'Market capitalization',unit:'currency',formula:'Last loaded close * Shares outstanding',catalogId:M+'43000597015'},
 {id:'price_earnings',label:'Price to earnings ratio',unit:'x',formula:'Last loaded close / Twelve-month diluted EPS',catalogId:M+'43000597017'},
 {id:'price_sales',label:'Price to sales ratio',unit:'x',formula:'Market capitalization / TTM total revenue',catalogId:M+'43000597019'},
 {id:'price_book',label:'Price to book ratio',unit:'x',formula:"Market capitalization / Shareholders' equity (parent)",catalogId:M+'43000597016'},
 {id:'eps_yield',label:'EPS yield %',unit:'%',formula:'Twelve-month diluted EPS / Last loaded close * 100',catalogId:null},
];
export const PRICE_RATIO_IDS:readonly string[]=SPECS.map(row=>row.id);
export interface RatioQuery {facts:CompanyFacts;currency:string;asOf:string|null;price:PriceInput|null;today:string}
interface Picked {value:number;end:string;cell:StatementCell}
function latest(facts:CompanyFacts,statement:StatementKind,basis:StatementBasis,rowId:string,query:RatioQuery):Picked|null{
 const table=buildStatement(facts,{statement,basis,currency:query.currency,asOf:query.asOf,revisions:'latest',columns:8}),row=table.rows.find(r=>r.id===rowId);
 if(!row)return null;
 for(let i=0;i<table.columns.length;i++){const cell=row.cells[i];if(cell&&cell.value!==null)return {value:cell.value,end:table.columns[i],cell};}
 return null;
}
interface Shares {value:number;end:string;tag:string;filed:string|null}
/** Shares outstanding: the cover-page dei count first, else the balance-sheet count. Latest period end wins; the filing cutoff applies. */
function shares(facts:CompanyFacts,asOf:string|null):Shares|null{
 for(const tag of ['dei:EntityCommonStockSharesOutstanding','us-gaap:CommonStockSharesOutstanding']){
  const concept=facts.concepts.find(c=>c.id===tag);if(!concept)continue;
  let best:Shares|null=null;
  for(const row of concept.observations){
   if(row.unit!=='shares'||!(row.value>0))continue;
   if(asOf!==null&&(row.filed===null||row.filed>asOf))continue;
   if(!best||row.end>best.end||row.end===best.end&&(row.filed??'')>(best.filed??''))best={value:row.value,end:row.end,tag,filed:row.filed};
  }
  if(best)return best;
 }
 return null;
}
const money=(v:number,c:string)=>v.toLocaleString('en-US',{maximumFractionDigits:2})+' '+c;
export function computePriceRatios(query:RatioQuery):RatioResult[]{
 const {facts,currency,price}=query,out=new Map<string,RatioResult>();
 const make=(id:RatioResult['id'],value:number|null,reason:string|null,used:RatioInput[]=[])=>{
  const spec=SPECS.find(s=>s.id===id)!;out.set(id,{id,label:spec.label,value:reason?null:value,unit:spec.unit==='currency'?currency:spec.unit,formula:spec.formula,catalogId:spec.catalogId,reason,inputs:reason?[]:used});
 };
 const failAll=(reason:string)=>{for(const spec of SPECS)make(spec.id,null,reason);return SPECS.map(spec=>out.get(spec.id)!);};
 if(!price)return failAll('No loaded price. Load a dataset for the chart symbol; OpenCandle does not fetch a price for this.');
 if(!(price.close>0)||!Number.isFinite(price.close))return failAll('The loaded close is not a positive number.');
 let age:number;try{age=dateDay(query.today)-dateDay(price.date);}catch{return failAll('The loaded price date is not a valid calendar date.');}
 if(age<0)return failAll('The loaded close is dated '+price.date+', after '+query.today+'. OpenCandle will not use a future-dated price.');
 if(age>STALE_PRICE_DAYS)return failAll('The loaded close is from '+price.date+', '+age+' days before '+query.today+'. Ratios need a price within '+STALE_PRICE_DAYS+' days; OpenCandle does not use an old price against current filings.');
 if(!price.currency)return failAll('The loaded dataset does not state a currency, so it cannot be matched to the '+currency+' filing values. OpenCandle never guesses a currency.');
 if(price.currency!==currency)return failAll('The loaded price is in '+price.currency+' but the filing values are in '+currency+'. OpenCandle does not convert currencies.');
 const priceInput:RatioInput={label:'Last loaded close',value:money(price.close,currency),detail:price.symbol+' on '+price.date+'; '+price.source};
 let eps:Picked|null=null,epsKind='diluted',revenue:Picked|null,equity:Picked|null,count:Shares|null;
 try{
  eps=latest(facts,'income','TTM','eps_diluted',query);if(!eps){eps=latest(facts,'income','TTM','eps_basic',query);epsKind='basic';}
  revenue=latest(facts,'income','TTM','revenue',query);
  const fq=latest(facts,'balance','FQ','total_equity',query),fy=latest(facts,'balance','FY','total_equity',query);
  equity=fq&&fy?(fq.end>=fy.end?fq:fy):fq??fy;count=shares(facts,query.asOf);
 }catch(e){return failAll('Filing values could not be read: '+(e instanceof Error?e.message:String(e)));}
 const epsInput:RatioInput|null=eps&&{label:'Twelve-month '+epsKind+' EPS',value:eps.value+' '+currency+'/share',detail:'reported twelve-month period ending '+eps.end+(eps.cell.tag?', '+eps.cell.tag:'')};
 const shareInput:RatioInput|null=count&&{label:'Shares outstanding',value:count.value.toLocaleString('en-US'),detail:count.tag+' as of '+count.end+(count.filed?', filed '+count.filed:'')};
 const revInput:RatioInput|null=revenue&&{label:'TTM total revenue',value:money(revenue.value,currency),detail:'period ending '+revenue.end+(revenue.cell.tag?', '+revenue.cell.tag:'')};
 const eqInput:RatioInput|null=equity&&{label:"Shareholders' equity (parent)",value:money(equity.value,currency),detail:'balance sheet at '+equity.end};
 const cap=count?price.close*count.value:null;
 make('market_cap',cap,count?null:'No shares outstanding count was filed on or before the cutoff in this document (dei:EntityCommonStockSharesOutstanding or us-gaap:CommonStockSharesOutstanding).',[priceInput,shareInput!]);
 if(!eps||!epsInput)for(const id of ['price_earnings','eps_yield'] as const)make(id,null,'No twelve-month EPS is available in '+currency+'. OpenCandle does not add quarterly per-share values; it needs a reported annual EPS.');
 else if(!(eps.value>0))for(const id of ['price_earnings','eps_yield'] as const)make(id,null,'Twelve-month EPS is '+eps.value+', zero or negative, so the ratio is not meaningful.');
 else {make('price_earnings',price.close/eps.value,null,[priceInput,epsInput]);make('eps_yield',eps.value/price.close*100,null,[epsInput,priceInput]);}
 if(cap===null)for(const id of ['price_sales','price_book'] as const)make(id,null,'Needs market capitalization, which needs a shares outstanding count.');
 else {
  if(!revenue||!revInput)make('price_sales',null,'No TTM revenue is available: it needs four reported quarters of revenue in '+currency+'.');
  else if(!(revenue.value>0))make('price_sales',null,'TTM revenue is zero or negative.');
  else make('price_sales',cap/revenue.value,null,[priceInput,shareInput!,revInput]);
  if(!equity||!eqInput)make('price_book',null,"No shareholders' equity (parent) is available in "+currency+'.');
  else if(!(equity.value>0))make('price_book',null,"Shareholders' equity is zero or negative, so price to book is not meaningful.");
  else make('price_book',cap/equity.value,null,[priceInput,shareInput!,eqInput]);
 }
 return SPECS.map(spec=>out.get(spec.id)!);
}
export function formatRatio(result:RatioResult):string{
 if(result.value===null)return 'Not available';
 if(result.id==='market_cap'){const v=result.value,abs=Math.abs(v),[d,s]=abs>=1e12?[1e12,'T']:abs>=1e9?[1e9,'B']:abs>=1e6?[1e6,'M']:[1,''];return (v/d).toLocaleString('en-US',{maximumFractionDigits:2})+s+' '+result.unit;}
 return result.value.toLocaleString('en-US',{maximumFractionDigits:2})+(result.unit==='%'?'%':'x');
}
