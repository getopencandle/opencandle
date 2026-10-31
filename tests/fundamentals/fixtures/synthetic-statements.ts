// SYNTHETIC companyfacts fixture for statement tests. Not real filing data; every number is invented.
// Fiscal year ends January 31 (not calendar). FY2023 = 2023-02-01..2024-01-31 (365 days),
// FY2024 = 2024-02-01..2025-01-31 (366 days). Quarter/YTD durations are listed beside each row.
type Raw={start?:string;end:string;val:number;filed?:string;form?:string;accn?:string;fy?:number|null;fp?:string|null};
const k10=(filed:string,accn:string)=>({filed,form:'10-K',accn}),q10=(filed:string,accn:string)=>({filed,form:'10-Q',accn});
const FY22={start:'2022-02-01',end:'2023-01-31'},FY23={start:'2023-02-01',end:'2024-01-31'},FY24={start:'2024-02-01',end:'2025-01-31'};
const Q1={start:'2024-02-01',end:'2024-04-30'}/*90 d*/,Q2={start:'2024-05-01',end:'2024-07-31'}/*92 d*/,Q3={start:'2024-08-01',end:'2024-10-31'}/*92 d*/;
const YTD9={start:'2024-02-01',end:'2024-10-31'}/*274 d*/,YTD9P={start:'2023-02-01',end:'2023-10-31'}/*273 d*/;
const K23=k10('2024-03-20','0000009999-24-000001'),KA23={filed:'2024-06-10',form:'10-K/A',accn:'0000009999-24-000002'},K22=k10('2023-03-15','0000009999-23-000001'),K24=k10('2025-03-25','0000009999-25-000001');
const QA=q10('2024-06-05','0000009999-24-000003'),QB=q10('2024-09-05','0000009999-24-000004'),QC=q10('2024-12-05','0000009999-24-000005');
export function syntheticStatementFacts(){
 const usd=(rows:Raw[])=>({units:{USD:rows}}),inst=(end:string,val:number,f:object)=>({end,val,...f});
 return {cik:9999,entityName:'Synthetic Statement Co (SYNTHETIC)',facts:{'us-gaap':{
  // Revenue: FY2022 only under the fallback tag SalesRevenueNet; later years under ASC 606 tag.
  SalesRevenueNet:usd([{...FY22,val:900,...K22}]),
  RevenueFromContractWithCustomerExcludingAssessedTax:usd([
   {...FY23,val:1000,...K23},{...FY23,val:1020,...KA23}/*10-K/A restatement filed 2024-06-10*/,{...FY24,val:1200,...K24},
   {...Q1,val:280,...QA},{...Q2,val:300,...QB},{...Q3,val:320,...QC},{...YTD9,val:900,...QC},{...YTD9P,val:740,...QC}]),
  GrossProfit:usd([{...FY23,val:400,...K23},{...YTD9,val:360,...QC}/*nine-month YTD only, no standalone quarter*/]),
  // Operating income deliberately starts one day later (2023-02-02..2024-01-31, 364 days): a period mismatch.
  OperatingIncomeLoss:usd([{start:'2023-02-02',end:'2024-01-31',val:150,...K23}]),
  NetIncomeLoss:usd([{...FY22,val:90,...K22},{...FY23,val:100,...K23},{...Q1,val:20,...QA},{...Q2,val:25,...QB},{...Q3,val:30,...QC},{...YTD9,val:75,...QC},{...YTD9P,val:60,...QC}]),
  EarningsPerShareDiluted:{units:{'USD/shares':[{...FY23,val:1.25,...K23},{...Q3,val:0.3,...QC}]}},
  AssetsCurrent:usd([inst('2024-01-31',500,K23),inst('2023-01-31',450,K22),inst('2024-10-31',520,QC)]),
  LiabilitiesCurrent:usd([inst('2024-01-31',250,K23),inst('2023-01-31',0,K22)/*zero denominator*/,inst('2024-10-31',-10,QC)/*negative denominator*/]),
  Assets:usd([inst('2024-01-31',1500,K23),inst('2023-01-31',1400,K22)]),
  Liabilities:usd([inst('2024-01-31',600,K23)]),
  StockholdersEquity:usd([inst('2024-01-31',-50,K23)]),
  Goodwill:{units:{EUR:[inst('2024-01-31',70,K23)]}},
  NetCashProvidedByUsedInOperatingActivities:usd([{...FY22,val:250,...K22},{...FY23,val:300,...K23},{...YTD9,val:210,...QC},{...YTD9P,val:180,...QC}]),
  PaymentsToAcquirePropertyPlantAndEquipment:usd([{...FY23,val:80,...K23},{...YTD9,val:60,...QC},{...YTD9P,val:50,...QC}]),
 }}};
}
export const syntheticSource={kind:'synthetic' as const,label:'Synthetic statement fixture',retrievedAt:'2026-10-15T00:00:00Z',sourceUrl:null,sha256:null};
