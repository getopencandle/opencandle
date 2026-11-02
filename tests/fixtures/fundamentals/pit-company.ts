// SYNTHETIC companyfacts in the SEC JSON shape for point-in-time tests. Not real filing data; the entity, CIK,
// accession numbers and every number are invented. Calendar fiscal year: Q1 Jan-Mar (90 or 91 days), Q2 Apr-Jun (91),
// Q3 Jul-Sep (92), Q4 Oct-Dec (92). 10-Qs are filed on May 5, Aug 5 and Nov 5; the 10-K on Feb 20 of the next year.
// Quarterly income lines are reported as 3-month facts plus year-to-date facts; cash flow is reported year-to-date only.
// No Q4 is reported: the 10-K carries full-year facts.
import {newYorkWallTime,usSessionDay} from '../../../src/domain/us-market-hours';
export type RawFact={start?:string;end:string;val:number;filed:string;form:string;accn:string;fy?:number;fp?:string};
export type RawTags=Record<string,{units:Record<string,RawFact[]>}>;
export interface RawCompany {cik:number;entityName:string;facts:Record<string,RawTags>}
export interface QuarterValues {revenue:number;netIncome:number;eps:number;ocf:number;capex:number;dilutedShares:number}
export const CIK=9990001,ENTITY='Synthetic Point Co (SYNTHETIC)';
const pad=(n:number)=>String(n).padStart(2,'0');
export const accn=(year:number,n:number)=>'00099900'+'01-'+pad(year%100)+'-'+String(n).padStart(6,'0');
const lastDay=(y:number,m:number)=>new Date(Date.UTC(y,m,0)).getUTCDate();
export const quarterOf=(y:number,q:number)=>({start:y+'-'+pad(q*3-2)+'-01',end:y+'-'+pad(q*3)+'-'+pad(lastDay(y,q*3))});
export const ytdOf=(y:number,q:number)=>({start:y+'-01-01',end:quarterOf(y,q).end});
export const filedFor=(y:number,q:number)=>q===1?y+'-05-05':q===2?y+'-08-05':q===3?y+'-11-05':(y+1)+'-02-20';
export const accnFor=(y:number,q:number)=>q<4?accn(y,q):accn(y+1,4);
const add=(tags:RawTags,tag:string,unit:string,fact:RawFact)=>{(tags[tag]??={units:{}}).units[unit]??=[];tags[tag].units[unit].push(fact);};
/** One company over several calendar years. values[year][q-1] are the standalone quarter values. */
export function syntheticCompany(values:Record<number,QuarterValues[]>,options:{equity?:number;sharesOutstanding?:number}={}):RawCompany{
 const g:RawTags={},dei:RawTags={};
 for(const [ys,quarters] of Object.entries(values)){
  const y=Number(ys),sum=(k:keyof QuarterValues,n:number)=>quarters.slice(0,n).reduce((s,q)=>s+q[k],0);
  for(let q=1;q<=4;q++){
   const filed=filedFor(y,q),form=q<4?'10-Q':'10-K',a=accnFor(y,q),f={filed,form,accn:a,fy:y,fp:q<4?'Q'+q:'FY'};
   const period=q<4?quarterOf(y,q):{start:y+'-01-01',end:y+'-12-31'},ytd=ytdOf(y,q),v=quarters[q-1];
   const round2=(x:number)=>Math.round(x*100)/100;
   if(q<4){
    add(g,'RevenueFromContractWithCustomerExcludingAssessedTax','USD',{...period,val:v.revenue,...f});
    add(g,'NetIncomeLoss','USD',{...period,val:v.netIncome,...f});
    add(g,'EarningsPerShareDiluted','USD/shares',{...period,val:v.eps,...f});
    add(g,'WeightedAverageNumberOfDilutedSharesOutstanding','shares',{...period,val:v.dilutedShares,...f});
    if(q>1){
     add(g,'RevenueFromContractWithCustomerExcludingAssessedTax','USD',{...ytd,val:sum('revenue',q),...f});
     add(g,'NetIncomeLoss','USD',{...ytd,val:sum('netIncome',q),...f});
     add(g,'EarningsPerShareDiluted','USD/shares',{...ytd,val:round2(sum('eps',q)),...f});
    }
   }else{
    add(g,'RevenueFromContractWithCustomerExcludingAssessedTax','USD',{...period,val:sum('revenue',4),...f});
    add(g,'NetIncomeLoss','USD',{...period,val:sum('netIncome',4),...f});
    add(g,'EarningsPerShareDiluted','USD/shares',{...period,val:round2(sum('eps',4)),...f});
    add(g,'WeightedAverageNumberOfDilutedSharesOutstanding','shares',{...period,val:Math.round(sum('dilutedShares',4)/4),...f});
   }
   add(g,'NetCashProvidedByUsedInOperatingActivities','USD',{...ytd,val:sum('ocf',q),...f});
   add(g,'PaymentsToAcquirePropertyPlantAndEquipment','USD',{...ytd,val:sum('capex',q),...f});
   add(g,'StockholdersEquity','USD',{end:ytd.end,val:options.equity??5000,...f});
   if(q===4)add(g,'CommonStockSharesOutstanding','shares',{end:ytd.end,val:options.sharesOutstanding??100,...f});
   add(dei,'EntityCommonStockSharesOutstanding','shares',{end:filed.slice(0,8)+'01',val:options.sharesOutstanding??100,...f});
  }
 }
 return {cik:CIK,entityName:ENTITY,facts:{'us-gaap':g,dei}};
}
/** Same values every quarter of the given years. */
export function flatYears(years:number[],q:Partial<QuarterValues>={}):Record<number,QuarterValues[]>{
 const base:QuarterValues={revenue:1000,netIncome:100,eps:1,ocf:150,capex:50,dilutedShares:100,...q};
 return Object.fromEntries(years.map(y=>[y,[0,1,2,3].map(()=>({...base}))]));
}
/** Every fact of one tag and unit. */
export const factsOf=(raw:RawCompany,tag:string,unit='USD',ns='us-gaap')=>raw.facts[ns][tag].units[unit];
/** Daily bars (time = New York midnight) on NYSE trading days in [from, to]; close and open from a function of the date. */
export function dailyBars(from:string,to:string,price:number|((date:string,i:number)=>{open:number;close:number}|number)){
 const out:{time:number;open:number;close:number;date:string}[]=[];
 for(let t=Date.parse(from+'T00:00:00Z');t<=Date.parse(to+'T00:00:00Z');t+=86400000){
  const date=new Date(t).toISOString().slice(0,10),day=usSessionDay(date);if(day.weekend||day.holiday)continue;
  const p=typeof price==='number'?price:price(date,out.length),bar=typeof p==='number'?{open:p,close:p}:p;out.push({time:newYorkWallTime(date,0),...bar,date});
 }
 return out;
}
/** A company that splits p-for-q during 2022, between the Q1 10-Q (filed 2022-05-05) and the Q2 10-Q (2022-08-05).
 * Every fact filed from the Q2 10-Q on is on the new basis (EPS x q/p, share counts x p/q), and later filings restate
 * three earlier periods: Q2 2021 (in the Q2 2022 10-Q), FY2021 (in the FY2022 10-K) and Q1 2022 (in the Q1 2023 10-Q).
 * restatedQ2 overrides the restated Q2 2021 EPS (rounding in the issuer's own restatement). */
export function splitCompany(p:number,q:number,eps0:number,shares0:number,restatedQ2?:number):RawCompany{
 const raw=syntheticCompany(flatYears([2021,2022,2023],{eps:eps0,dilutedShares:shares0}),{sharesOutstanding:shares0});
 const perShare=(v:number)=>Math.round(v*q/p*100)/100,count=(v:number)=>Math.round(v*p/q);
 for(const ns of Object.values(raw.facts))for(const concept of Object.values(ns))for(const [unit,rows] of Object.entries(concept.units))for(const r of rows){
  if(r.filed<='2022-05-05')continue;
  if(unit==='USD/shares')r.val=perShare(r.val);else if(unit==='shares')r.val=count(r.val);
 }
 const g=raw.facts['us-gaap'],eps=g.EarningsPerShareDiluted.units['USD/shares'],sh=g.WeightedAverageNumberOfDilutedSharesOutstanding.units.shares;
 const comparative=(period:{start:string;end:string},e:number,s:number,filed:string,form:string,accession:string)=>{eps.push({...period,val:e,filed,form,accn:accession});sh.push({...period,val:s,filed,form,accn:accession});};
 comparative(quarterOf(2021,2),restatedQ2??perShare(eps0),count(shares0),'2022-08-05','10-Q',accnFor(2022,2));
 comparative({start:'2021-01-01',end:'2021-12-31'},perShare(4*eps0),count(shares0),'2023-02-20','10-K',accnFor(2022,4));
 comparative(quarterOf(2022,1),perShare(eps0),count(shares0),'2023-05-05','10-Q',accnFor(2023,1));
 return raw;
}
