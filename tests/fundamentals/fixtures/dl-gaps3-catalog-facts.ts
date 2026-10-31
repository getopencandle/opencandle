// SYNTHETIC companyfacts fixture for the metric catalog. Not real filing data; every
// number is invented and round so expected values can be worked out by hand.
// Calendar fiscal years: FY2024 = 2024-01-01..2024-12-31 (366 days), FY2023 = 2023-01-01..2023-12-31.
type Raw={start?:string;end:string;val:number;filed:string;form:string;accn:string};
const K24={filed:'2025-02-20',form:'10-K',accn:'0000007777-25-000001'},K23={filed:'2024-02-20',form:'10-K',accn:'0000007777-24-000001'},K22={filed:'2023-02-20',form:'10-K',accn:'0000007777-23-000001'},K21={filed:'2022-02-20',form:'10-K',accn:'0000007777-22-000001'};
const Y24={start:'2024-01-01',end:'2024-12-31',...K24},Y23={start:'2023-01-01',end:'2023-12-31',...K23},Y22={start:'2022-01-01',end:'2022-12-31',...K22},Y21={start:'2021-01-01',end:'2021-12-31',...K21};
const I24={end:'2024-12-31',...K24},I23={end:'2023-12-31',...K23};
const usd=(rows:Raw[])=>({units:{USD:rows}}),flow=(a:number,b?:number)=>usd(b===undefined?[{...Y24,val:a}]:[{...Y24,val:a},{...Y23,val:b}]),inst=(a:number,b?:number)=>usd(b===undefined?[{...I24,val:a}]:[{...I24,val:a},{...I23,val:b}]);
export function catalogFacts(){
 return {cik:7777,entityName:'Synthetic Catalog Co (SYNTHETIC)',facts:{'us-gaap':{
  Revenues:flow(1000,800),CostOfRevenue:flow(600,500),GrossProfit:flow(400,300),SellingGeneralAndAdministrativeExpense:flow(100,90),ResearchAndDevelopmentExpense:flow(50),
  OperatingIncomeLoss:flow(200,150),OperatingExpenses:flow(150),InterestExpense:flow(20),IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest:flow(180),IncomeTaxExpenseBenefit:flow(36),NetIncomeLoss:flow(144,100),
  CurrentFederalTaxExpenseBenefit:flow(20),CurrentStateAndLocalTaxExpenseBenefit:flow(4),
  EarningsPerShareDiluted:{units:{'USD/shares':[{...Y24,val:1.44},{...Y23,val:1}]}},EarningsPerShareBasic:{units:{'USD/shares':[{...Y24,val:1.5},{...Y23,val:1.05}]}},
  WeightedAverageNumberOfDilutedSharesOutstanding:{units:{shares:[{...Y24,val:100},{...Y23,val:100}]}},
  CommonStockSharesOutstanding:{units:{shares:[{...I24,val:100}]}},
  CashAndCashEquivalentsAtCarryingValue:inst(100),ShortTermInvestments:inst(50),AccountsReceivableNetCurrent:inst(80,70),InventoryNet:inst(60),AssetsCurrent:inst(300,250),
  PropertyPlantAndEquipmentNet:inst(400,380),Goodwill:inst(50),IntangibleAssetsNetExcludingGoodwill:inst(30),Assets:inst(1000,900),AccountsPayableCurrent:inst(40),
  LiabilitiesCurrent:inst(150,150),LongTermDebtNoncurrent:inst(200,220),LongTermDebtCurrent:inst(20),ShortTermBorrowings:inst(30),Liabilities:inst(500,480),StockholdersEquity:inst(500,420),RetainedEarningsAccumulatedDeficit:inst(300),
  NetCashProvidedByUsedInOperatingActivities:flow(220,150),DepreciationDepletionAndAmortization:flow(50,40),PaymentsToAcquirePropertyPlantAndEquipment:flow(70,60),NetCashProvidedByUsedInInvestingActivities:flow(-100),
  PaymentsOfDividends:flow(40),PaymentsForRepurchaseOfCommonStock:flow(30),ProceedsFromIssuanceOfCommonStock:flow(5),
  CommonStockDividendsPerShareDeclared:{units:{'USD/shares':[{...Y24,val:0.4},{...Y23,val:0.36},{...Y22,val:0.3},{...Y21,val:0.3}]}},
 }}};
}
