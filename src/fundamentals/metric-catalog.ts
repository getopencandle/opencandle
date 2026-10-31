import {dateDay,type CompanyFacts} from './company-facts';
import {resolveCatalogCells,statementPeriodEnds,STATEMENT_LINES,type StatementBasis,type StatementCell,type StatementLineSpec,type StatementRevisions,type StatementScale} from './statements';
import {computePriceRatios,type PriceInput} from './price-ratios';
/** Fundamentals metric catalog. One table drives every line item and ratio:
 *  - catalog lines map SEC companyfacts XBRL concepts (ordered tag preferences) to catalog rows;
 *  - catalog formulas compute standard published accounting ratios from lines and other formulas.
 * Every value lists its inputs. A missing input makes the value unavailable with a reason, never 0.
 * Where a definition is ambiguous the choice is recorded as in `basis` and `note`. */
export type CatalogGroup='income'|'balance'|'cashflow'|'profitability'|'liquidity'|'leverage'|'efficiency'|'per-share'|'growth'|'dividends'|'scores'|'valuation';
export type CatalogMeasure='currency'|'per-share'|'shares'|'percent'|'ratio'|'days'|'years'|'score';
export const CATALOG_GROUPS:readonly [CatalogGroup,string][]=[['income','Income statement items'],['balance','Balance sheet items'],['cashflow','Cash flow items'],['profitability','Profitability'],['liquidity','Liquidity'],['leverage','Debt and coverage'],['efficiency','Efficiency'],['per-share','Per share'],['growth','Growth (year over year)'],['dividends','Dividends'],['scores','Scores'],['valuation','Valuation (last loaded close)']];
interface Base {id:string;label:string;group:CatalogGroup;catalogIds:readonly string[];note:string|null}
export interface CatalogLine extends Base {kind:'line';spec:StatementLineSpec;measure:CatalogMeasure}
export interface CatalogFormula extends Base {kind:'formula';measure:CatalogMeasure;formula:string;basis:'standard'|'LV-DEFINED';price:boolean;compute:(x:FormulaContext)=>number}
export type CatalogEntry=CatalogLine|CatalogFormula;
export interface CatalogUnavailable {id:string;label:string;catalogIds:readonly string[];reason:string}
const M='AN.FUND.METRIC.',ids=(list:string)=>list?list.split(' ').map(n=>M+n):[];
const tag=(t:string)=>t.includes(':')?t:'us-gaap:'+t;
function L(statement:StatementLineSpec['statement'],id:string,label:string,tags:string,catalog:string,note:string|null=null,measure:'currency'|'per-share'|'shares'='currency'):CatalogLine{
 const group:CatalogGroup=statement;
 return {kind:'line',id,label,group,catalogIds:ids(catalog),note,measure,spec:{id,statement,label,tags:tags.split(' ').map(tag),measure,kind:statement==='balance'?'stock':'flow',additive:measure==='currency',catalogId:null}};
}
interface FOpts {price?:boolean;note?:string|null}
function F(group:CatalogGroup,id:string,label:string,catalog:string,measure:CatalogMeasure,formula:string,basis:'standard'|'LV-DEFINED',compute:(x:FormulaContext)=>number,opts:FOpts={}):CatalogFormula{
 return {kind:'formula',id,label,group,catalogIds:ids(catalog),measure,formula,basis,price:!!opts.price,note:opts.note??null,compute};
}
/** What a formula can read at its period end. v() throws when an input is unavailable, so the result
 * becomes unavailable with that input's reason; sum() adds the reported components (at least one). */
export interface FormulaContext {
 v(id:string):number;o(id:string):number|null;sum(...ids:string[]):number;
 div(a:number,b:number,what:string):number;pos(value:number,what:string):number;
 prior(id:string,years?:number):number;priorOpt(id:string,years?:number):number|null;
 growth(id:string):number;days():number;cap():number;
}
class Unavailable extends Error {}
const pct=(n:number)=>n*100;
// ---- Lines: SEC us-gaap concepts. Values are as reported under the tag's own sign convention. ----
const SIGN='Shown with the SEC tag sign (an increase in the balance is positive).';
export const CATALOG_LINES:readonly CatalogLine[]=[
 // income statement
 L('income','depreciation','Depreciation','Depreciation DepreciationNonproduction','43000683905 43000564142','OpenCandle-defined: the income statement and cash flow depreciation rows read the same SEC depreciation tags.'),
 L('income','amortization_intangibles','Amortization of intangibles','AmortizationOfIntangibleAssets','43000683922 43000564143'),
 L('income','amortization_deferred','Amortization of deferred charges','AmortizationOfDeferredCharges AmortizationOfFinancingCosts AmortizationOfDebtIssuanceCosts','43000683926'),
 L('income','other_cogs','Other cost of revenue','OtherCostOfOperatingRevenue OtherCostOfServices','43000563478'),
 L('income','sga_other','Other selling, general and administrative','OtherSellingGeneralAndAdministrativeExpense','43000553614'),
 L('income','other_operating_expenses','Other operating expenses','OtherCostAndExpenseOperating','43000563483'),
 L('income','costs_and_expenses','Total costs and expenses (as tagged)','CostsAndExpenses',''),
 L('income','other_income_expense','Other non-operating income (expense)','OtherNonoperatingIncomeExpense','43000563479'),
 L('income','nonoperating_income','Non-operating income, total','NonoperatingIncomeExpense','43000563465'),
 L('income','interest_expense_debt','Interest expense on debt','InterestExpenseDebt','43000563467'),
 L('income','interest_capitalized','Interest capitalized','InterestCostsCapitalized InterestCostsCapitalizedAdjustment','43000563468'),
 L('income','interest_income','Non-operating interest income','InvestmentIncomeInterest InvestmentIncomeInterestAndDividend InterestAndOtherIncome','43000563473'),
 L('income','equity_earnings','Income from equity method investments','IncomeLossFromEquityMethodInvestments','43000563474 43000563487','OpenCandle-defined: US GAAP has one standard tag for equity method income, so the pretax and after-tax catalog rows show the same reported value.'),
 L('income','restructuring','Restructuring charges','RestructuringCharges RestructuringCosts','43000684053'),
 L('income','impairments','Impairments','AssetImpairmentCharges GoodwillImpairmentLoss ImpairmentOfLongLivedAssetsHeldForUse','43000683927'),
 L('income','legal_expense','Legal claim expense','LossContingencyLossInPeriod LitigationSettlementExpense','43000684055'),
 L('income','unrealized_gain','Unrealized gain (loss) on investments','UnrealizedGainLossOnInvestments EquitySecuritiesFvNiUnrealizedGainLoss','43000684056'),
 L('income','other_exceptional','Other nonrecurring income (expense)','OtherNonrecurringIncomeExpense OtherNonrecurringExpense','43000684058','The two tags use opposite signs; the method line names the tag that was used.'),
 L('income','noncontrolling_income','Net income attributable to non-controlling interest','NetIncomeLossAttributableToNoncontrollingInterest','43000563495'),
 L('income','continuing_income','Income from continuing operations','IncomeLossFromContinuingOperations','43000563500 43000779894'),
 L('income','discontinued','Discontinued operations, net of tax','IncomeLossFromDiscontinuedOperationsNetOfTax IncomeLossFromDiscontinuedOperationsNetOfTaxAttributableToReportingEntity','43000563502'),
 L('income','preferred_dividends','Preferred dividends','PreferredStockDividendsIncomeStatementImpact DividendsPreferredStock','43000563506'),
 L('income','ni_common_diluted','Diluted net income available to common stockholders','NetIncomeLossAvailableToCommonStockholdersDiluted','43000563516'),
 L('income','ni_common_basic','Net income available to common stockholders, basic','NetIncomeLossAvailableToCommonStockholdersBasic',''),
 L('income','tax_current','Income tax, current','CurrentIncomeTaxExpenseBenefit','43000684059'),
 L('income','tax_current_federal','Current federal tax','CurrentFederalTaxExpenseBenefit',''),
 L('income','tax_current_state','Current state and local tax','CurrentStateAndLocalTaxExpenseBenefit',''),
 L('income','tax_current_foreign','Income tax, current, foreign','CurrentForeignTaxExpenseBenefit','43000684064'),
 L('income','tax_deferred','Income tax, deferred','DeferredIncomeTaxExpenseBenefit DeferredIncomeTaxesAndTaxCredits','43000684066 43000564144','OpenCandle-defined: the cash flow deferred taxes row reads the same deferred tax tags.'),
 L('income','tax_deferred_federal','Deferred federal tax','DeferredFederalIncomeTaxExpenseBenefit',''),
 L('income','tax_deferred_state','Deferred state and local tax','DeferredStateAndLocalIncomeTaxExpenseBenefit',''),
 L('income','tax_deferred_foreign','Income tax, deferred, foreign','DeferredForeignIncomeTaxExpenseBenefit','43000684068'),
 L('income','tax_credits','Income tax credits','IncomeTaxReconciliationTaxCredits','43000684069'),
 L('income','net_revenue','Net revenue (net of interest expense)','RevenuesNetOfInterestExpense','43000779892'),
 L('income','credit_provision','Provision for credit losses','ProvisionForLoanLeaseAndOtherLosses ProvisionForLoanAndLeaseLosses ProvisionForCreditLosses',''),
 // balance sheet
 L('balance','cash_sti_reported','Cash, equivalents and short-term investments (as tagged)','CashCashEquivalentsAndShortTermInvestments',''),
 L('balance','marketable_current','Marketable securities, current','MarketableSecuritiesCurrent AvailableForSaleSecuritiesDebtSecuritiesCurrent',''),
 L('balance','receivables_total','Receivables, net (as tagged)','ReceivablesNetCurrent',''),
 L('balance','other_receivables','Other receivables','OtherReceivablesNetCurrent OtherReceivables','43000563741'),
 L('balance','inventory_wip','Inventories, work in process','InventoryWorkInProcessNetOfReserves InventoryWorkInProcess','43000563746'),
 L('balance','inventory_other','Inventories, progress payments and other','OtherInventory OtherInventorySupplies ProgressPaymentsNettedAgainstInventoryForLongTermContractsOrPrograms','43000563748'),
 L('balance','inventory_finished','Inventories, finished goods','InventoryFinishedGoodsNetOfReserves InventoryFinishedGoods','43000563749'),
 L('balance','inventory_raw','Inventories, raw materials','InventoryRawMaterialsNetOfReserves InventoryRawMaterials','43000563753'),
 L('balance','prepaid','Prepaid expenses','PrepaidExpenseCurrent PrepaidExpenseAndOtherAssetsCurrent','43000563757'),
 L('balance','other_current_assets','Other current assets','OtherAssetsCurrent','43000563761'),
 L('balance','noncurrent_assets_reported','Non-current assets (as tagged)','AssetsNoncurrent',''),
 L('balance','long_term_investments','Long-term investments','LongTermInvestments','43000563639'),
 L('balance','notes_receivable_lt','Notes receivable, long term','NotesAndLoansReceivableNetNoncurrent NotesReceivableNetNoncurrent','43000563641'),
 L('balance','equity_method_investments','Investments in unconsolidated subsidiaries','EquityMethodInvestments','43000563645'),
 L('balance','other_investments','Other long-term investments','OtherLongTermInvestments','43000563649'),
 L('balance','ppe_gross','Gross property, plant and equipment','PropertyPlantAndEquipmentGross','43000563667'),
 L('balance','accumulated_depreciation','Accumulated depreciation','AccumulatedDepreciationDepletionAndAmortizationPropertyPlantAndEquipment','43000563673'),
 L('balance','deferred_tax_assets','Deferred tax assets','DeferredIncomeTaxAssetsNet DeferredTaxAssetsNetNoncurrent','43000563683'),
 L('balance','intangibles_incl_goodwill','Intangible assets including goodwill (as tagged)','IntangibleAssetsNetIncludingGoodwill',''),
 L('balance','other_intangibles','Intangible assets excluding goodwill','IntangibleAssetsNetExcludingGoodwill FiniteLivedIntangibleAssetsNet','43000563689'),
 L('balance','other_lt_assets','Other long-term assets','OtherAssetsNoncurrent','43000563693'),
 L('balance','debt_current_reported','Debt, current (as tagged)','DebtCurrent',''),
 L('balance','ltd_current','Current portion of long-term debt','LongTermDebtCurrent','43000563557'),
 L('balance','short_term_borrowings','Short-term borrowings','ShortTermBorrowings','43000563563'),
 L('balance','notes_payable','Notes payable, current','NotesPayableCurrent','43000563600'),
 L('balance','other_short_debt','Other short-term borrowings','OtherShortTermBorrowings','43000563614'),
 L('balance','tax_payable','Income tax payable','AccruedIncomeTaxesCurrent TaxesPayableCurrent','43000563621'),
 L('balance','dividends_payable','Dividends payable','DividendsPayableCurrent','43000563624'),
 L('balance','accrued_payroll','Accrued payroll and employee liabilities','EmployeeRelatedLiabilitiesCurrent','43000563628'),
 L('balance','deferred_income_current','Deferred income, current','ContractWithCustomerLiabilityCurrent DeferredRevenueCurrent','43000563631'),
 L('balance','other_current_liabilities','Other current liabilities','OtherLiabilitiesCurrent','43000563635'),
 L('balance','noncurrent_liabilities_reported','Non-current liabilities (as tagged)','LiabilitiesNoncurrent',''),
 L('balance','finance_lease_lt','Capitalized (finance) lease obligations','FinanceLeaseLiabilityNoncurrent CapitalLeaseObligationsNoncurrent','43000563527'),
 L('balance','operating_lease_lt','Operating lease liabilities','OperatingLeaseLiabilityNoncurrent','43000563532'),
 L('balance','deferred_tax_liabilities','Deferred tax liabilities','DeferredIncomeTaxLiabilitiesNet DeferredTaxLiabilitiesNoncurrent','43000563536'),
 L('balance','deferred_income_noncurrent','Deferred income, non-current','ContractWithCustomerLiabilityNoncurrent DeferredRevenueNoncurrent','43000563540'),
 L('balance','other_noncurrent_liabilities','Other non-current liabilities','OtherLiabilitiesNoncurrent','43000563545'),
 L('balance','equity_incl_nci_reported','Equity including non-controlling interest (as tagged)','StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest',''),
 L('balance','retained_earnings','Retained earnings','RetainedEarningsAccumulatedDeficit','43000563867'),
 L('balance','paid_in_reported','Common stock and paid-in capital (as tagged)','CommonStocksIncludingAdditionalPaidInCapital',''),
 L('balance','common_stock_value','Common stock, par or carrying value','CommonStockValue','43000563873'),
 L('balance','apic','Additional paid-in capital','AdditionalPaidInCapitalCommonStock AdditionalPaidInCapital','43000563874'),
 L('balance','treasury_stock','Treasury stock','TreasuryStockValue TreasuryStockCommonValue','43000563875','Reported as a positive amount that reduces equity.'),
 L('balance','aoci','Accumulated other comprehensive income','AccumulatedOtherComprehensiveIncomeLossNetOfTax','43000563877','OpenCandle-defined: other common equity is accumulated other comprehensive income.'),
 L('balance','preferred_stock','Preferred stock, carrying value','PreferredStockValue','43000563879'),
 L('balance','minority_interest','Minority (non-controlling) interest','MinorityInterest','43000563884'),
 L('balance','shares_outstanding','Common shares outstanding','CommonStockSharesOutstanding','43000670331','Balance-sheet share count at the period end.','shares'),
 L('balance','receivables_gross','Accounts receivable, gross','AccountsReceivableGrossCurrent','43000684070'),
 L('balance','doubtful_accounts','Allowance for doubtful accounts','AllowanceForDoubtfulAccountsReceivableCurrent AccountsReceivableAllowanceForCreditLossCurrent','43000684071'),
 // cash flow
 L('cashflow','profit_loss','Net income including non-controlling interest','ProfitLoss NetIncomeLoss','43000563888','OpenCandle-defined: the cash flow starting line is ProfitLoss when tagged, else NetIncomeLoss.'),
 L('cashflow','other_noncash','Other non-cash items','OtherNoncashIncomeExpense','43000564146'),
 L('cashflow','extraordinary','Extraordinary item','ExtraordinaryItemNetOfTax','43000564145','US GAAP removed extraordinary items in 2015, so recent filings rarely report it.'),
 L('cashflow','change_operating_capital','Increase in operating capital','IncreaseDecreaseInOperatingCapital','',SIGN),
 L('cashflow','change_receivables','Change in accounts receivable','IncreaseDecreaseInAccountsReceivable','43000564148',SIGN),
 L('cashflow','change_taxes_payable','Change in taxes payable','IncreaseDecreaseInAccruedIncomeTaxesPayable IncreaseDecreaseInIncomeTaxesPayable','43000564149',SIGN),
 L('cashflow','change_payables','Change in accounts payable','IncreaseDecreaseInAccountsPayable','43000564150',SIGN),
 L('cashflow','change_accrued','Change in accrued expenses','IncreaseDecreaseInAccruedLiabilities','43000564151',SIGN),
 L('cashflow','change_inventories','Change in inventories','IncreaseDecreaseInInventories','43000564153',SIGN),
 L('cashflow','change_other_assets','Change in other operating assets','IncreaseDecreaseInOtherOperatingAssets','',SIGN),
 L('cashflow','change_other_liabilities','Change in other operating liabilities','IncreaseDecreaseInOtherOperatingLiabilities','',SIGN),
 L('cashflow','acquisitions','Purchase or acquisition of businesses','PaymentsToAcquireBusinessesNetOfCashAcquired','43000564159','Payments are reported as positive amounts.'),
 L('cashflow','divestitures','Proceeds from divestiture of businesses','ProceedsFromDivestitureOfBusinesses',''),
 L('cashflow','sale_ppe','Proceeds from sale of property, plant and equipment','ProceedsFromSaleOfPropertyPlantAndEquipment',''),
 L('cashflow','investment_proceeds','Sale or maturity of investments','ProceedsFromSaleMaturityAndCollectionsOfInvestments','43000564161'),
 L('cashflow','investment_purchases','Purchase of investments','PaymentsToAcquireInvestments','43000564162','Payments are reported as positive amounts.'),
 L('cashflow','other_investing','Other investing payments (proceeds)','PaymentsForProceedsFromOtherInvestingActivities','43000564163','A positive value is a net payment.'),
 L('cashflow','capex_intangibles','Payments for intangible assets','PaymentsToAcquireIntangibleAssets',''),
 L('cashflow','capex_other_productive','Payments for other productive assets','PaymentsToAcquireOtherProductiveAssets',''),
 L('cashflow','common_issued','Proceeds from issuing common stock','ProceedsFromIssuanceOfCommonStock',''),
 L('cashflow','preferred_issued','Proceeds from issuing preferred stock','ProceedsFromIssuanceOfPreferredStockAndPreferenceStock',''),
 L('cashflow','preferred_repurchased','Repurchase of preferred stock','PaymentsForRepurchaseOfPreferredStockAndPreferenceStock',''),
 L('cashflow','short_debt_net','Issuance (retirement) of short-term debt','ProceedsFromRepaymentsOfShortTermDebt ProceedsFromRepaymentsOfCommercialPaper','43000564173'),
 L('cashflow','ltd_issued','Issuance of long-term debt','ProceedsFromIssuanceOfLongTermDebt ProceedsFromIssuanceOfDebt','43000564176'),
 L('cashflow','ltd_repaid','Reduction of long-term debt','RepaymentsOfLongTermDebt RepaymentsOfDebt','43000564177','Repayments are reported as positive amounts.'),
 L('cashflow','other_debt_net','Issuance (retirement) of other debt','ProceedsFromRepaymentsOfOtherDebt','43000564178'),
 L('cashflow','other_financing','Other financing items','ProceedsFromPaymentsForOtherFinancingActivities','43000564179'),
 L('cashflow','common_dividends_paid','Common dividends paid','PaymentsOfDividendsCommonStock','43000564185'),
 L('cashflow','preferred_dividends_paid','Preferred dividends paid','PaymentsOfDividendsPreferredStockAndPreferenceStock','43000564186'),
 L('cashflow','dps','Dividends declared per common share','CommonStockDividendsPerShareDeclared CommonStockDividendsPerShareCashPaid','',null,'per-share'),
];
// ---- Formulas. Inputs named by id: built-in statement lines, catalog lines or other formulas. ----
const LV='LV-DEFINED',STD='standard',P={price:true};
const sumNote='Sum of the reported components; a component that is not reported is left out, and at least one must be reported.';
export const CATALOG_FORMULAS:readonly CatalogFormula[]=[
 // income
 F('income','ebit','EBIT','43000670329','currency','Pretax income + Interest expense',LV,x=>x.v('pretax_income')+x.v('interest_expense'),{note:'OpenCandle-defined: EBIT is built up from pretax income, not taken from operating income.'}),
 F('income','ebitda','EBITDA','43000553610','currency','Operating income + Depreciation and amortization',LV,x=>x.v('operating_income')+x.v('depreciation_amortization'),{note:'OpenCandle-defined: depreciation and amortization from the cash flow statement.'}),
 F('income','dilution_adjustment','Dilution adjustment','43000563504','currency','Diluted net income to common - Basic net income to common',STD,x=>x.v('ni_common_diluted')-x.v('ni_common_basic')),
 F('income','opex_total','Total operating expenses','43000553615','currency','Costs and expenses (as tagged), else Cost of goods sold + Operating expenses',LV,x=>x.o('costs_and_expenses')??x.v('cost_of_revenue')+x.v('operating_expenses')),
 F('income','nonop_excl_interest','Non-operating income, excluding interest expense','43000563471','currency','Non-operating income, total + Interest expense',LV,x=>x.v('nonoperating_income')+x.v('interest_expense'),{note:'OpenCandle-defined: assumes the reported non-operating total is net of interest expense.'}),
 F('income','unusual_expenses','Unusual expenses','43000563476','currency','Restructuring + Impairments + Legal claim expense',LV,x=>x.sum('restructuring','impairments','legal_expense'),{note:sumNote}),
 F('income','tax_current_domestic','Income tax, current, domestic','43000684062','currency','Current federal + Current state and local',LV,x=>x.sum('tax_current_federal','tax_current_state'),{note:'OpenCandle-defined: domestic means US federal plus state and local. '+sumNote}),
 F('income','tax_deferred_domestic','Income tax, deferred, domestic','43000684067','currency','Deferred federal + Deferred state and local',LV,x=>x.sum('tax_deferred_federal','tax_deferred_state'),{note:'OpenCandle-defined: domestic means US federal plus state and local. '+sumNote}),
 F('income','reported_eps','Reported EPS','43000744068','per-share','Diluted EPS, else basic EPS',LV,x=>x.o('eps_diluted')??x.v('eps_basic')),
 F('income','net_revenue_after_provisions','Net revenue after provisions','43000779893','currency','Net revenue - Provision for credit losses',STD,x=>x.v('net_revenue')-x.v('credit_provision')),
 // balance
 F('balance','cash_sti','Cash and short-term investments','43000563702','currency','Tagged total, else Cash and equivalents + Short-term investments',LV,x=>x.o('cash_sti_reported')??x.sum('cash','short_term_investments','marketable_current'),{note:sumNote}),
 F('balance','receivables_net_total','Total receivables, net','43000563738','currency','Tagged receivables total, else Accounts receivable + Other receivables',LV,x=>x.o('receivables_total')??x.sum('receivables','other_receivables'),{note:sumNote}),
 F('balance','noncurrent_assets','Total non-current assets','43000557440','currency','Tagged total, else Total assets - Total current assets',STD,x=>x.o('noncurrent_assets_reported')??x.v('total_assets')-x.v('current_assets')),
 F('balance','intangibles_net','Net intangible assets (including goodwill)','43000563686','currency','Tagged total, else Goodwill + Other intangible assets',LV,x=>x.o('intangibles_incl_goodwill')??x.sum('goodwill','other_intangibles'),{note:sumNote}),
 F('balance','short_term_debt','Short-term debt','43000563554','currency','Debt, current (as tagged), else Short-term borrowings + Current portion of long-term debt',LV,x=>x.o('debt_current_reported')??x.sum('short_term_borrowings','ltd_current','notes_payable'),{note:sumNote}),
 F('balance','lease_obligations','Capital and operating lease obligations','43000563522','currency','Finance lease obligations + Operating lease liabilities',STD,x=>x.sum('finance_lease_lt','operating_lease_lt'),{note:sumNote}),
 F('balance','long_term_debt_total','Long-term debt including leases','43000553621','currency','Long-term debt + Lease obligations',LV,x=>x.sum('long_term_debt','finance_lease_lt','operating_lease_lt'),{note:'OpenCandle-defined: long-term debt includes non-current lease liabilities. '+sumNote}),
 F('balance','total_debt','Total debt','43000553622','currency','Short-term debt + Long-term debt including leases',LV,x=>x.sum('short_term_debt','long_term_debt_total'),{note:'OpenCandle-defined. '+sumNote}),
 F('balance','net_debt','Net debt','43000665310','currency','Total debt - Cash and short-term investments',STD,x=>x.v('total_debt')-x.v('cash_sti')),
 F('balance','noncurrent_liabilities','Total non-current liabilities','43000557436','currency','Tagged total, else Total liabilities - Total current liabilities',STD,x=>x.o('noncurrent_liabilities_reported')??x.v('total_liabilities')-x.v('current_liabilities')),
 F('balance','equity_total','Total equity (including non-controlling interest)','43000553625','currency',"Tagged total, else Shareholders' equity + Minority interest",LV,x=>x.o('equity_incl_nci_reported')??x.v('total_equity')+(x.o('minority_interest')??0),{note:'OpenCandle-defined: an unreported minority interest is treated as none.'}),
 F('balance','common_equity','Common equity, total','43000563866','currency',"Shareholders' equity - Preferred stock",LV,x=>x.v('total_equity')-(x.o('preferred_stock')??0),{note:'OpenCandle-defined: an unreported preferred stock line is treated as none.'}),
 F('balance','paid_in_capital','Paid-in capital','43000563871','currency','Tagged total, else Common stock + Additional paid-in capital',LV,x=>x.o('paid_in_reported')??x.sum('common_stock_value','apic'),{note:sumNote}),
 F('balance','tangible_equity','Tangible common equity','','currency','Common equity - Net intangible assets',STD,x=>x.v('common_equity')-x.v('intangibles_net')),
 F('balance','working_capital','Working capital','','currency','Total current assets - Total current liabilities',STD,x=>x.v('current_assets')-x.v('current_liabilities')),
 // cash flow
 F('cashflow','da_cashflow','Depreciation and amortization (cash flow)','43000563892','currency','Depreciation and amortization',STD,x=>x.v('depreciation_amortization')),
 F('cashflow','working_capital_change','Changes in working capital (cash effect)','43000564147','currency','- Increase in operating capital',LV,x=>-x.v('change_operating_capital'),{note:'OpenCandle-defined: shown as the cash effect, the negative of the SEC increase tag.'}),
 F('cashflow','funds_from_operations','Funds from operations','43000563886','currency','Cash from operating activities + Increase in operating capital',LV,x=>x.v('operating_cash_flow')+x.v('change_operating_capital'),{note:'OpenCandle-defined: operating cash flow before working capital changes.'}),
 F('cashflow','change_other_net','Change in other operating assets and liabilities (cash effect)','43000564154','currency','Change in other liabilities - Change in other assets',LV,x=>{const a=x.o('change_other_assets'),l=x.o('change_other_liabilities');if(a===null&&l===null)throw new Unavailable('Neither other operating assets nor other operating liabilities changes are reported.');return (l??0)-(a??0);},{note:sumNote}),
 F('cashflow','business_net','Purchase or sale of business, net','43000564156','currency','Divestiture proceeds - Acquisition payments',LV,x=>{const d=x.o('divestitures'),a=x.o('acquisitions');if(d===null&&a===null)throw new Unavailable('No business acquisition or divestiture is reported.');return (d??0)-(a??0);},{note:sumNote}),
 F('cashflow','sale_fixed_and_business','Sale of fixed assets and businesses','43000564158','currency','Sale of property, plant and equipment + Divestiture proceeds',STD,x=>x.sum('sale_ppe','divestitures'),{note:sumNote}),
 F('cashflow','investments_net','Purchase or sale of investments, net','43000564160','currency','Sale or maturity of investments - Purchase of investments',STD,x=>x.v('investment_proceeds')-x.v('investment_purchases')),
 F('cashflow','capex_other','Capital expenditures, other assets','43000564168','currency','Payments for intangible + other productive assets',LV,x=>x.sum('capex_intangibles','capex_other_productive'),{note:sumNote}),
 F('cashflow','capex_total','Capital expenditures, total','43000564166','currency','Fixed asset capital expenditures + Other asset capital expenditures',LV,x=>x.sum('capital_expenditures','capex_intangibles','capex_other_productive'),{note:'Payments are positive amounts. '+sumNote}),
 F('cashflow','stock_issued','Sale of common and preferred stock','43000564170','currency','Common stock issued + Preferred stock issued',STD,x=>x.sum('common_issued','preferred_issued'),{note:sumNote}),
 F('cashflow','stock_repurchased','Repurchase of common and preferred stock','43000564171','currency','Common repurchases + Preferred repurchases',STD,x=>x.sum('share_repurchases','preferred_repurchased'),{note:'Payments are positive amounts. '+sumNote}),
 F('cashflow','stock_net','Issuance (retirement) of stock, net','43000564169','currency','Stock issued - Stock repurchased',LV,x=>{const i=x.o('stock_issued'),r=x.o('stock_repurchased');if(i===null&&r===null)throw new Unavailable('No stock issuance or repurchase is reported.');return (i??0)-(r??0);},{note:sumNote}),
 F('cashflow','ltd_net','Issuance (retirement) of long-term debt','43000564175','currency','Long-term debt issued - Long-term debt repaid',LV,x=>{const i=x.o('ltd_issued'),r=x.o('ltd_repaid');if(i===null&&r===null)throw new Unavailable('No long-term debt issuance or repayment is reported.');return (i??0)-(r??0);},{note:sumNote}),
 F('cashflow','debt_net','Issuance (retirement) of debt, net','43000564172','currency','Short-term debt net + Long-term debt net + Other debt net',LV,x=>x.sum('short_debt_net','ltd_net','other_debt_net'),{note:sumNote}),
 // profitability
 F('profitability','roe','Return on equity %','43000597021','percent',"Net income / Shareholders' equity * 100",LV,x=>pct(x.div(x.v('net_income'),x.pos(x.v('total_equity'),"Shareholders' equity"),"Shareholders' equity")),{note:'OpenCandle-defined: period-end equity, not an average; quarterly values are not annualized.'}),
 F('profitability','roce_common','Return on common equity %','43000656797','percent','(Net income - Preferred dividends) / Common equity * 100',LV,x=>pct(x.div(x.v('net_income')-(x.o('preferred_dividends')??0),x.pos(x.v('common_equity'),'Common equity'),'Common equity')),{note:'OpenCandle-defined: period-end balance; unreported preferred dividends are treated as none.'}),
 F('profitability','roa','Return on assets %','43000597054','percent','Net income / Total assets * 100',LV,x=>pct(x.div(x.v('net_income'),x.v('total_assets'),'Total assets')),{note:'OpenCandle-defined: period-end assets, not an average.'}),
 F('profitability','rota','Return on tangible assets %','43000597052','percent','Net income / (Total assets - Net intangible assets) * 100',LV,x=>pct(x.div(x.v('net_income'),x.pos(x.v('total_assets')-x.v('intangibles_net'),'Tangible assets'),'Tangible assets'))),
 F('profitability','rote','Return on tangible equity %','43000597053','percent','Net income / Tangible common equity * 100',LV,x=>pct(x.div(x.v('net_income'),x.pos(x.v('tangible_equity'),'Tangible common equity'),'Tangible common equity'))),
 F('profitability','roic','Return on invested capital %','43000597056','percent','EBIT * (1 - Income tax / Pretax income) / (Total debt + Total equity) * 100',LV,x=>{const tax=x.div(x.v('income_tax'),x.pos(x.v('pretax_income'),'Pretax income'),'Pretax income');return pct(x.div(x.v('ebit')*(1-tax),x.pos(x.v('total_debt')+x.v('equity_total'),'Invested capital'),'Invested capital'));},{note:'OpenCandle-defined: NOPAT uses the effective tax rate; invested capital is total debt plus total equity at the period end.'}),
 F('profitability','rotc','Return on total capital %','43000734787','percent','EBIT / (Total debt + Total equity) * 100',LV,x=>pct(x.div(x.v('ebit'),x.pos(x.v('total_debt')+x.v('equity_total'),'Total capital'),'Total capital'))),
 F('profitability','roce','Return on capital employed %','43000734818','percent','EBIT / (Total assets - Total current liabilities) * 100',STD,x=>pct(x.div(x.v('ebit'),x.pos(x.v('total_assets')-x.v('current_liabilities'),'Capital employed'),'Capital employed'))),
 F('profitability','ebitda_margin','EBITDA margin %','43000597075','percent','EBITDA / Total revenue * 100',STD,x=>pct(x.div(x.v('ebitda'),x.pos(x.v('revenue'),'Total revenue'),'Total revenue'))),
 F('profitability','cogs_to_revenue','COGS to revenue %','43000597026','percent','Cost of goods sold / Total revenue * 100',STD,x=>pct(x.div(x.v('cost_of_revenue'),x.pos(x.v('revenue'),'Total revenue'),'Total revenue'))),
 F('profitability','sga_ratio','Selling, general and admin expenses ratio %','43000734958','percent','SG&A / Total revenue * 100',STD,x=>pct(x.div(x.v('sga'),x.pos(x.v('revenue'),'Total revenue'),'Total revenue'))),
 F('profitability','rd_ratio','Research and development to revenue %','43000597739','percent','R&D / Total revenue * 100',STD,x=>pct(x.div(x.v('research_development'),x.pos(x.v('revenue'),'Total revenue'),'Total revenue'))),
 F('profitability','gross_profit_to_assets','Gross profit to assets %','43000597087','percent','Gross profit / Total assets * 100',STD,x=>pct(x.div(x.v('gross_profit'),x.v('total_assets'),'Total assets'))),
 F('profitability','accruals','Accruals','43000597073','currency','Net income - Cash from operating activities',LV,x=>x.v('net_income')-x.v('operating_cash_flow'),{note:'OpenCandle-defined: cash flow accruals.'}),
 F('profitability','sloan_ratio','Sloan ratio %','43000597058','percent','(Net income - Operating cash flow - Investing cash flow) / Total assets * 100',STD,x=>pct(x.div(x.v('net_income')-x.v('operating_cash_flow')-x.v('investing_cash_flow'),x.v('total_assets'),'Total assets'))),
 F('profitability','quality_ratio','Quality ratio','43000597086','ratio','Cash from operating activities / Net income',STD,x=>x.div(x.v('operating_cash_flow'),x.pos(x.v('net_income'),'Net income'),'Net income')),
 F('profitability','sustainable_growth','Sustainable growth rate %','43000597736','percent','Return on equity * (1 - Dividends paid / Net income)',LV,x=>x.v('roe')*(1-x.div(x.o('dividends_paid')??0,x.pos(x.v('net_income'),'Net income'),'Net income')),{note:'OpenCandle-defined: retention ratio from cash dividends paid; unreported dividends are treated as none.'}),
 // liquidity
 F('liquidity','quick_ratio','Quick ratio','43000597050','ratio','(Cash and short-term investments + Receivables) / Total current liabilities',STD,x=>x.div(x.v('cash_sti')+x.v('receivables_net_total'),x.pos(x.v('current_liabilities'),'Total current liabilities'),'Total current liabilities')),
 F('liquidity','cash_ratio','Cash ratio','43000734957','ratio','Cash and short-term investments / Total current liabilities',STD,x=>x.div(x.v('cash_sti'),x.pos(x.v('current_liabilities'),'Total current liabilities'),'Total current liabilities')),
 F('liquidity','cash_to_debt','Cash to debt ratio','43000597023','ratio','Cash and short-term investments / Total debt',STD,x=>x.div(x.v('cash_sti'),x.v('total_debt'),'Total debt')),
 // leverage
 F('leverage','debt_to_equity','Debt to equity ratio','43000597078','ratio',"Total debt / Shareholders' equity",STD,x=>x.div(x.v('total_debt'),x.pos(x.v('total_equity'),"Shareholders' equity"),"Shareholders' equity")),
 F('leverage','debt_to_assets','Debt to assets ratio','43000597031','ratio','Total debt / Total assets',STD,x=>x.div(x.v('total_debt'),x.v('total_assets'),'Total assets')),
 F('leverage','ltd_to_assets','Long-term debt to total assets','43000597048','ratio','Long-term debt including leases / Total assets',STD,x=>x.div(x.v('long_term_debt_total'),x.v('total_assets'),'Total assets')),
 F('leverage','debt_to_revenue','Debt to revenue ratio','43000597033','ratio','Total debt / Total revenue',STD,x=>x.div(x.v('total_debt'),x.pos(x.v('revenue'),'Total revenue'),'Total revenue')),
 F('leverage','debt_to_ebitda','Debt to EBITDA ratio','43000597032','ratio','Total debt / EBITDA',STD,x=>x.div(x.v('total_debt'),x.pos(x.v('ebitda'),'EBITDA'),'EBITDA')),
 F('leverage','net_debt_to_ebitda','Net debt to EBITDA','43000734809','ratio','Net debt / EBITDA',STD,x=>x.div(x.v('net_debt'),x.pos(x.v('ebitda'),'EBITDA'),'EBITDA')),
 F('leverage','debt_to_capital','Total debt to capital','43000734790','ratio','Total debt / (Total debt + Total equity)',STD,x=>x.div(x.v('total_debt'),x.pos(x.v('total_debt')+x.v('equity_total'),'Total capital'),'Total capital')),
 F('leverage','equity_to_assets','Equity to assets ratio','43000597035','ratio',"Shareholders' equity / Total assets",STD,x=>x.div(x.v('total_equity'),x.v('total_assets'),'Total assets')),
 F('leverage','assets_to_equity','Assets to equity ratio','43000734788','ratio',"Total assets / Shareholders' equity",STD,x=>x.div(x.v('total_assets'),x.pos(x.v('total_equity'),"Shareholders' equity"),"Shareholders' equity")),
 F('leverage','goodwill_to_assets','Goodwill to assets ratio','43000597036','ratio','Goodwill / Total assets',STD,x=>x.div(x.v('goodwill'),x.v('total_assets'),'Total assets')),
 F('leverage','tce_ratio','Tangible common equity ratio','43000597079','ratio','Tangible common equity / (Total assets - Net intangible assets)',STD,x=>x.div(x.v('tangible_equity'),x.pos(x.v('total_assets')-x.v('intangibles_net'),'Tangible assets'),'Tangible assets')),
 F('leverage','interest_coverage','Interest coverage','43000597037','ratio','EBIT / Interest expense',STD,x=>x.div(x.v('ebit'),x.pos(x.v('interest_expense'),'Interest expense'),'Interest expense')),
 F('leverage','ebitda_coverage','EBITDA interest coverage','43000734816','ratio','EBITDA / Interest expense',STD,x=>x.div(x.v('ebitda'),x.pos(x.v('interest_expense'),'Interest expense'),'Interest expense')),
 F('leverage','ebitda_capex_coverage','EBITDA less capex interest coverage','43000734817','ratio','(EBITDA - Capital expenditures) / Interest expense',STD,x=>x.div(x.v('ebitda')-x.v('capital_expenditures'),x.pos(x.v('interest_expense'),'Interest expense'),'Interest expense')),
 F('leverage','effective_interest_rate','Effective interest rate on debt %','43000597034','percent','Interest expense / Total debt * 100 * 365 / period days',LV,x=>pct(x.div(x.v('interest_expense'),x.pos(x.v('total_debt'),'Total debt'),'Total debt'))*365/x.days(),{note:'OpenCandle-defined: annualized by period length; period-end debt.'}),
 F('leverage','cash_dividend_coverage','Cash dividend coverage ratio','43000734793','ratio','Cash from operating activities / Dividends paid',LV,x=>x.div(x.v('operating_cash_flow'),x.pos(x.v('dividends_paid'),'Dividends paid'),'Dividends paid')),
 // efficiency (quarterly turnover is per quarter, never annualized)
 F('efficiency','asset_turnover','Asset turnover','43000597022','ratio','Total revenue / Total assets',LV,x=>x.div(x.v('revenue'),x.v('total_assets'),'Total assets'),{note:'OpenCandle-defined: period-end balance; quarterly values are not annualized.'}),
 F('efficiency','fixed_asset_turnover','Fixed assets turnover','43000734822','ratio','Total revenue / Net property, plant and equipment',LV,x=>x.div(x.v('revenue'),x.pos(x.v('ppe_net'),'Net PP&E'),'Net PP&E')),
 F('efficiency','receivables_turnover','Total receivables turnover','43000734821','ratio','Total revenue / Total receivables',LV,x=>x.div(x.v('revenue'),x.pos(x.v('receivables_net_total'),'Total receivables'),'Total receivables')),
 F('efficiency','inventory_turnover','Inventory turnover','43000597046','ratio','Cost of goods sold / Inventories',LV,x=>x.div(x.v('cost_of_revenue'),x.pos(x.v('inventory'),'Inventories'),'Inventories')),
 F('efficiency','inventory_to_revenue','Inventory to revenue ratio','43000597047','ratio','Inventories / Total revenue',STD,x=>x.div(x.v('inventory'),x.pos(x.v('revenue'),'Total revenue'),'Total revenue')),
 F('efficiency','days_inventory','Days inventory','43000597028','days','Inventories / Cost of goods sold * period days',LV,x=>x.div(x.v('inventory'),x.pos(x.v('cost_of_revenue'),'Cost of goods sold'),'Cost of goods sold')*x.days(),{note:'OpenCandle-defined: period-end inventory; period days are the reported period length.'}),
 F('efficiency','days_payable','Days payable','43000597029','days','Accounts payable / Cost of goods sold * period days',LV,x=>x.div(x.v('accounts_payable'),x.pos(x.v('cost_of_revenue'),'Cost of goods sold'),'Cost of goods sold')*x.days()),
 F('efficiency','days_sales','Days sales outstanding','43000597030','days','Accounts receivable / Total revenue * period days',LV,x=>x.div(x.v('receivables'),x.pos(x.v('revenue'),'Total revenue'),'Total revenue')*x.days()),
 F('efficiency','cash_conversion_cycle','Cash conversion cycle','43000597089','days','Days inventory + Days sales outstanding - Days payable',STD,x=>x.v('days_inventory')+x.v('days_sales')-x.v('days_payable')),
 F('efficiency','buyback_ratio','Shares buyback ratio %','43000597057','percent','(Prior-year diluted shares - Diluted shares) / Prior-year diluted shares * 100',LV,x=>{const prior=x.prior('shares_diluted');return pct(x.div(prior-x.v('shares_diluted'),x.pos(prior,'Prior-year diluted shares'),'Prior-year diluted shares'));},{note:'OpenCandle-defined: weighted diluted shares, same period one year earlier.'}),
 // per share
 F('per-share','bvps','Book value per share','43000670330','per-share',"Shareholders' equity / Common shares outstanding",STD,x=>x.div(x.v('total_equity'),x.pos(x.v('shares_outstanding'),'Shares outstanding'),'Shares outstanding')),
 F('per-share','tbvps','Tangible book value per share','43000597072','per-share','Tangible common equity / Common shares outstanding',STD,x=>x.div(x.v('tangible_equity'),x.pos(x.v('shares_outstanding'),'Shares outstanding'),'Shares outstanding')),
 F('per-share','wcps','Working capital per share','43000761667','per-share','Working capital / Common shares outstanding',STD,x=>x.div(x.v('working_capital'),x.pos(x.v('shares_outstanding'),'Shares outstanding'),'Shares outstanding')),
 F('per-share','ncavps','Net current asset value per share','43000597085','per-share','(Total current assets - Total liabilities) / Common shares outstanding',STD,x=>x.div(x.v('current_assets')-x.v('total_liabilities'),x.pos(x.v('shares_outstanding'),'Shares outstanding'),'Shares outstanding')),
 F('per-share','graham_number','Graham number','43000597084','per-share','Square root of (22.5 * Diluted EPS * Book value per share)',STD,x=>Math.sqrt(22.5*x.pos(x.v('reported_eps'),'EPS')*x.pos(x.v('bvps'),'Book value per share')),{note:'Needs positive EPS and book value per share for the same period. In TTM view the EPS must be a reported twelve-month value.'}),
 // growth
 F('growth','revenue_growth','Revenue growth %','43000597068 43000734976','percent','(Revenue - Prior-year revenue) / |Prior-year revenue| * 100',LV,x=>x.growth('revenue'),{note:'OpenCandle-defined: compares with the same kind of period ending about one year earlier (365 +/- 20 days).'}),
 F('growth','eps_basic_growth','EPS basic growth %','43000597069','percent','(Basic EPS - Prior-year basic EPS) / |Prior-year basic EPS| * 100',LV,x=>x.growth('eps_basic')),
 F('growth','eps_diluted_growth','EPS diluted growth %','43000597071 43000734975','percent','(Diluted EPS - Prior-year diluted EPS) / |Prior-year diluted EPS| * 100',LV,x=>x.growth('eps_diluted')),
 F('growth','ebitda_growth','EBITDA growth %','43000734968','percent','Year-over-year change in EBITDA',LV,x=>x.growth('ebitda')),
 F('growth','fcf_growth','Free cash flow growth %','43000734969','percent','Year-over-year change in free cash flow',LV,x=>x.growth('free_cash_flow')),
 F('growth','gross_profit_growth','Gross profit growth %','43000734970','percent','Year-over-year change in gross profit',LV,x=>x.growth('gross_profit')),
 F('growth','net_income_growth','Net income growth %','43000734971','percent','Year-over-year change in net income',LV,x=>x.growth('net_income')),
 F('growth','total_assets_growth','Total assets growth %','43000734972','percent','Year-over-year change in total assets',LV,x=>x.growth('total_assets')),
 F('growth','total_debt_growth','Total debt growth %','43000734785','percent','Year-over-year change in total debt',LV,x=>x.growth('total_debt')),
 F('growth','capex_growth','Capital expenditures growth %','43000734806','percent','Year-over-year change in capital expenditures',LV,x=>x.growth('capital_expenditures')),
 F('growth','dps_growth','Dividends per share growth %','43000734974','percent','Year-over-year change in dividends declared per share',LV,x=>x.growth('dps')),
 // dividends
 F('dividends','continuous_dividend_growth','Continuous dividend growth','43000734823','years','Consecutive prior years in which dividends per share rose',LV,x=>{let n=0;for(let k=0;k<60;k++){const a=x.priorOpt('dps',k),b=x.priorOpt('dps',k+1);if(a===null||b===null||!(a>b))break;n++;}if(x.priorOpt('dps',0)===null)throw new Unavailable('Dividends per share are not reported for this period.');return n;},{note:'OpenCandle-defined: counts back from this period while each year is higher than the year before; a gap in reported data ends the count.'}),
 F('dividends','continuous_dividend_payout','Continuous dividend payout','43000734824','years','Consecutive years with dividends per share above zero',LV,x=>{let n=0;for(let k=0;k<60;k++){const a=x.priorOpt('dps',k);if(a===null||!(a>0))break;n++;}if(x.priorOpt('dps',0)===null)throw new Unavailable('Dividends per share are not reported for this period.');return n;},{note:'OpenCandle-defined: a gap in reported data ends the count.'}),
 // scores
 F('scores','piotroski','Piotroski F-score','43000597734','score','Nine pass/fail tests on profitability, leverage and efficiency versus the prior year',STD,x=>{
  const roa=(k:number)=>x.div(k?x.prior('net_income',k):x.v('net_income'),k?x.prior('total_assets',k):x.v('total_assets'),'Total assets');
  const cr=(k:number)=>x.div(k?x.prior('current_assets',k):x.v('current_assets'),k?x.prior('current_liabilities',k):x.v('current_liabilities'),'Total current liabilities');
  const lev=(k:number)=>x.div(k?x.prior('long_term_debt_total',k):x.v('long_term_debt_total'),k?x.prior('total_assets',k):x.v('total_assets'),'Total assets');
  const gm=(k:number)=>x.div(k?x.prior('gross_profit',k):x.v('gross_profit'),k?x.prior('revenue',k):x.v('revenue'),'Total revenue');
  const at=(k:number)=>x.div(k?x.prior('revenue',k):x.v('revenue'),k?x.prior('total_assets',k):x.v('total_assets'),'Total assets');
  const ocf=x.v('operating_cash_flow'),ni=x.v('net_income');
  return [roa(0)>0,ocf>0,roa(0)>roa(1),ocf>ni,lev(0)<lev(1),cr(0)>cr(1),x.v('shares_diluted')<=x.prior('shares_diluted'),gm(0)>gm(1),at(0)>at(1)].filter(Boolean).length;
 },{note:'Period-end balances; every input for both years must be reported, else no score.'}),
 F('scores','beneish','Beneish M-score','43000597835','score','-4.84 + 0.920 DSRI + 0.528 GMI + 0.404 AQI + 0.892 SGI + 0.115 DEPI - 0.172 SGAI + 4.679 TATA - 0.327 LVGI',LV,x=>{
  const at=(id:string,k:number)=>k?x.prior(id,k):x.v(id);
  const s0=x.pos(at('revenue',0),'Total revenue'),s1=x.pos(at('revenue',1),'Prior-year revenue'),ta0=at('total_assets',0),ta1=at('total_assets',1);
  const dsri=x.div(at('receivables',0)/s0,at('receivables',1)/s1,'Prior-year receivables');
  const gm=(k:number,s:number)=>(s-at('cost_of_revenue',k))/s,gmi=x.div(gm(1,s1),gm(0,s0),'Gross margin');
  const aq=(k:number,ta:number)=>1-x.div(at('current_assets',k)+at('ppe_net',k),ta,'Total assets'),aqi=x.div(aq(0,ta0),aq(1,ta1),'Prior-year asset quality');
  const dep=(k:number)=>{const d=at('depreciation_amortization',k);return x.div(d,d+at('ppe_net',k),'Depreciation plus PP&E');},depi=x.div(dep(1),dep(0),'Depreciation rate');
  const sgai=x.div(at('sga',0)/s0,at('sga',1)/s1,'Prior-year SG&A');
  const lv=(k:number,ta:number)=>x.div(at('current_liabilities',k)+at('long_term_debt_total',k),ta,'Total assets'),lvgi=x.div(lv(0,ta0),lv(1,ta1),'Prior-year leverage');
  const tata=x.div(x.v('net_income')-x.v('operating_cash_flow'),ta0,'Total assets');
  return -4.84+0.92*dsri+0.528*gmi+0.404*aqi+0.892*s0/s1+0.115*depi-0.172*sgai+4.679*tata-0.327*lvgi;
 },{note:'OpenCandle-defined: asset quality leaves out securities; TATA uses net income; leverage uses long-term debt including leases.'}),
 F('scores','springate','Springate score','43000597848','score','1.03 A + 3.07 B + 0.66 C + 0.4 D (A working capital, B EBIT, D revenue, each over total assets; C pretax income over current liabilities)',STD,x=>{const ta=x.pos(x.v('total_assets'),'Total assets');return 1.03*x.v('working_capital')/ta+3.07*x.v('ebit')/ta+0.66*x.div(x.v('pretax_income'),x.pos(x.v('current_liabilities'),'Total current liabilities'),'Total current liabilities')+0.4*x.v('revenue')/ta;}),
 F('scores','zmijewski','Zmijewski score','43000597850','score','-4.336 - 4.513 (Net income / Total assets) + 5.679 (Total liabilities / Total assets) + 0.004 (Current assets / Current liabilities)',STD,x=>{const ta=x.pos(x.v('total_assets'),'Total assets');return -4.336-4.513*x.v('net_income')/ta+5.679*x.v('total_liabilities')/ta+0.004*x.div(x.v('current_assets'),x.pos(x.v('current_liabilities'),'Total current liabilities'),'Total current liabilities');}),
 F('scores','fulmer','Fulmer H factor','43000597847','score','5.528 V1 + 0.212 V2 + 0.073 V3 + 1.270 V4 - 0.120 V5 + 2.335 V6 + 0.575 V7 + 1.083 V8 + 0.894 V9 - 6.075',LV,x=>{
  const ta=x.pos(x.v('total_assets'),'Total assets'),debt=x.pos(x.v('total_debt'),'Total debt'),tangible=x.pos(ta-x.v('intangibles_net'),'Tangible assets'),ebit=x.pos(x.v('ebit'),'EBIT'),interest=x.pos(x.v('interest_expense'),'Interest expense');
  const v=[x.v('retained_earnings')/ta,x.v('revenue')/ta,x.div(x.v('pretax_income'),x.pos(x.v('total_equity'),"Shareholders' equity"),"Shareholders' equity"),x.v('operating_cash_flow')/debt,debt/ta,x.v('current_liabilities')/ta,Math.log10(tangible),x.div(x.v('working_capital'),x.pos(x.v('total_liabilities'),'Total liabilities'),'Total liabilities'),Math.log10(ebit/interest)];
  return 5.528*v[0]+0.212*v[1]+0.073*v[2]+1.27*v[3]-0.12*v[4]+2.335*v[5]+0.575*v[6]+1.083*v[7]+0.894*v[8]-6.075;
 },{note:'OpenCandle-defined: V7 is log10 of tangible assets in reported currency units; V9 is log10(EBIT / interest expense); V4 uses operating cash flow.'}),
 // valuation (last loaded close; latest period only)
 F('valuation','enterprise_value','Enterprise value','43000597077','currency','Market capitalization + Total debt + Preferred stock + Minority interest - Cash and short-term investments',LV,x=>x.cap()+x.v('total_debt')+(x.o('preferred_stock')??0)+(x.o('minority_interest')??0)-x.v('cash_sti'),{...P,note:'OpenCandle-defined: unreported preferred stock or minority interest counts as none.'}),
 F('valuation','ev_ebit','Enterprise value to EBIT','43000597063','ratio','Enterprise value / EBIT',STD,x=>x.div(x.v('enterprise_value'),x.pos(x.v('ebit'),'EBIT'),'EBIT'),P),
 F('valuation','ev_revenue','Enterprise value to revenue','43000597065','ratio','Enterprise value / Total revenue',STD,x=>x.div(x.v('enterprise_value'),x.pos(x.v('revenue'),'Total revenue'),'Total revenue'),P),
 F('valuation','ev_fcf','Enterprise value to free cash flow','43000734825','ratio','Enterprise value / Free cash flow',STD,x=>x.div(x.v('enterprise_value'),x.pos(x.v('free_cash_flow'),'Free cash flow'),'Free cash flow'),P),
 F('valuation','ev_gross_profit','Enterprise value to gross profit','43000734826','ratio','Enterprise value / Gross profit',STD,x=>x.div(x.v('enterprise_value'),x.pos(x.v('gross_profit'),'Gross profit'),'Gross profit'),P),
 F('valuation','price_fcf','Price to free cash flow','43000597814','ratio','Market capitalization / Free cash flow',STD,x=>x.div(x.cap(),x.pos(x.v('free_cash_flow'),'Free cash flow'),'Free cash flow'),P),
 F('valuation','price_cash_flow','Price to cash flow','43000597816','ratio','Market capitalization / Cash from operating activities',STD,x=>x.div(x.cap(),x.pos(x.v('operating_cash_flow'),'Operating cash flow'),'Operating cash flow'),P),
 F('valuation','price_tangible_book','Price to tangible book','43000597815','ratio','Market capitalization / Tangible common equity',STD,x=>x.div(x.cap(),x.pos(x.v('tangible_equity'),'Tangible common equity'),'Tangible common equity'),P),
 F('valuation','price_cash','Price to cash ratio','43000734829','ratio','Market capitalization / Cash and short-term investments',STD,x=>x.div(x.cap(),x.pos(x.v('cash_sti'),'Cash and short-term investments'),'Cash and short-term investments'),P),
 F('valuation','price_nwc','Price to net working capital','43000734956','ratio','Market capitalization / Working capital',STD,x=>x.div(x.cap(),x.pos(x.v('working_capital'),'Working capital'),'Working capital'),P),
 F('valuation','operating_earnings_yield','Operating earnings yield %','43000684072','percent','Operating income / Enterprise value * 100',LV,x=>pct(x.div(x.v('operating_income'),x.pos(x.v('enterprise_value'),'Enterprise value'),'Enterprise value')),P),
 F('valuation','roe_adjusted_book','Return on equity adjusted to book value %','43000597055','percent','Return on equity / Price to book',LV,x=>x.div(x.v('roe'),x.div(x.cap(),x.pos(x.v('total_equity'),"Shareholders' equity"),"Shareholders' equity"),'Price to book'),P),
 F('valuation','buyback_yield','Buyback yield %','43000597088','percent','-(Net stock issuance) / Market capitalization * 100',LV,x=>pct(x.div(-x.v('stock_net'),x.cap(),'Market capitalization')),{...P,note:'OpenCandle-defined: net of stock issued; a positive yield means net repurchases.'}),
 F('valuation','tobins_q','Tobin Q (approximate)','43000597834','ratio','(Market capitalization + Total liabilities) / Total assets',STD,x=>x.div(x.cap()+x.v('total_liabilities'),x.v('total_assets'),'Total assets'),P),
 F('valuation','altman_z','Altman Z-score','43000597092','score','1.2 A + 1.4 B + 3.3 C + 0.6 D + 1.0 E (working capital, retained earnings, EBIT and revenue over total assets; market capitalization over total liabilities)',STD,x=>{const ta=x.pos(x.v('total_assets'),'Total assets');return 1.2*x.v('working_capital')/ta+1.4*x.v('retained_earnings')/ta+3.3*x.v('ebit')/ta+0.6*x.div(x.cap(),x.pos(x.v('total_liabilities'),'Total liabilities'),'Total liabilities')+x.v('revenue')/ta;},P),
 F('valuation','kz_index','KZ index','43000597844','score','-1.002 CF/K + 0.283 Q + 3.139 Debt/Capital - 39.368 Dividends/K - 1.315 Cash/K (K = prior-year net PP&E)',LV,x=>{
  const k=x.pos(x.prior('ppe_net'),'Prior-year net PP&E'),ta=x.pos(x.v('total_assets'),'Total assets'),q=(x.cap()+ta-x.v('total_equity'))/ta;
  return -1.001909*(x.v('net_income')+x.v('depreciation_amortization'))/k+0.2826389*q+3.139193*x.div(x.v('total_debt'),x.pos(x.v('total_debt')+x.v('total_equity'),'Total capital'),'Total capital')-39.3678*(x.o('dividends_paid')??0)/k-1.314759*x.v('cash_sti')/k;
 },{...P,note:'OpenCandle-defined: Q = (market capitalization + total assets - equity) / total assets; unreported dividends count as none.'}),
];
/** Catalog rows that need data LV has no local source for. They are listed so the gap is explicit. */
const VENDOR='Needs licensed vendor data (consensus estimates, ratings or targets). Not available from local sources.';
const FUND='Needs fund or ETF data that SEC companyfacts does not carry. Not available from local sources.';
export const CATALOG_UNAVAILABLE:readonly CatalogUnavailable[]=[
 {id:'estimates',label:'EPS and revenue estimates, forward ratios',catalogIds:ids('43000597066 43000597067 43000597831 43000597832 43000734827 43000699489 43000699498'),reason:VENDOR},
 {id:'ratings',label:'Analyst rating and target price',catalogIds:ids('43000747299 43000734804 43000734805'),reason:VENDOR},
 {id:'employees',label:'Number of employees and per-employee ratios',catalogIds:ids('43000597080 43000597081 43000597082 43000734962 43000734963 43000734964 43000734965 43000734966 43000734967'),reason:'SEC companyfacts rarely carries an employee count. Not available from local sources.'},
 {id:'float',label:'Free float',catalogIds:ids('43000670341'),reason:'No float source is connected. OpenCandle does not infer float from shares outstanding.'},
 {id:'segments',label:'Revenue breakdown by source or country',catalogIds:ids('43000699487 43000699497'),reason:'Segment revenue is dimensional XBRL, which companyfacts leaves out. Not available from local sources.'},
 {id:'ownership',label:'Ownership',catalogIds:ids('43000699479'),reason:'Holder data is vendor data. Not available from local sources.'},
 {id:'funds',label:'ETF and fund metrics',catalogIds:[],reason:FUND},
 {id:'ipo',label:'IPO offer details',catalogIds:[],reason:'No IPO calendar source is connected. Not available from local sources.'},
];
export const CATALOG_ENTRIES:readonly CatalogEntry[]=[...CATALOG_LINES,...CATALOG_FORMULAS];
export const catalogEntryById=new Map<string,CatalogEntry>(CATALOG_ENTRIES.map(e=>[e.id,e]));
/** Overview sections: named groupings of catalog and statement rows. */
export const CATALOG_SECTIONS:readonly {id:string;label:string;catalogIds:readonly string[];rows:readonly string[]}[]=[
 {id:'valuation',label:'Valuation',catalogIds:ids('43000699484 43000699495'),rows:['enterprise_value','ev_ebit','ev_revenue','ev_fcf','price_fcf','price_cash_flow','price_tangible_book','tobins_q']},
 {id:'growth_profitability',label:'Growth and profitability',catalogIds:ids('43000699485'),rows:['revenue_growth','net_income_growth','eps_diluted_growth','gross_margin','operating_margin','net_margin','roe','roa']},
 {id:'conversion',label:'Revenue to profit conversion',catalogIds:ids('43000699496 43000713861'),rows:['revenue','net_revenue','gross_profit','operating_income','pretax_income','net_income']},
 {id:'dividends',label:'Dividend summary and history',catalogIds:ids('43000699500 43000699501'),rows:['dps','dps_growth','dividends_paid','cash_dividend_coverage','continuous_dividend_growth','continuous_dividend_payout']},
 {id:'debt',label:'Debt level and coverage',catalogIds:ids('43000699502'),rows:['total_debt','net_debt','cash_sti','debt_to_equity','debt_to_ebitda','interest_coverage','free_cash_flow']},
];
/** Built-in statement rows a section may show (labels come from the statements module). */
const BASE_IDS=STATEMENT_LINES.map(s=>s.id);
export interface CatalogInput {label:string;end:string;value:number|null}
export interface CatalogCell {end:string;value:number|null;reason:string|null;inputs:CatalogInput[];method:string|null}
export interface CatalogRow {id:string;label:string;group:CatalogGroup|'statement';measure:CatalogMeasure;unit:string;catalogIds:readonly string[];formula:string|null;basis:'reported'|'standard'|'LV-DEFINED';note:string|null;price:boolean;cells:CatalogCell[]}
export interface CatalogOptions {basis:StatementBasis;currency:string;asOf:string|null;revisions:StatementRevisions;columns:number;price:PriceInput|null;today:string}
export interface CatalogTable {options:CatalogOptions;columns:string[];rows:CatalogRow[];notices:string[];priceNote:string|null}
export function catalogUnit(measure:CatalogMeasure,currency:string):string{return measure==='currency'?currency:measure==='per-share'?currency+'/shares':measure==='shares'?'shares':measure==='percent'?'%':measure==='ratio'?'x':measure==='days'?'days':measure==='years'?'years':'score';}
const labelFor=(id:string)=>catalogEntryById.get(id)?.label??STATEMENT_LINES.find(s=>s.id===id)?.label??(id==='free_cash_flow'?'Free cash flow':id);
/** Build the catalog for one company. Values at the newest `columns` period ends; year-over-year
 * inputs may come from older periods. Price-based rows use the last loaded close at the newest end only. */
export function buildMetricCatalog(facts:CompanyFacts,options:CatalogOptions):CatalogTable{
 const statementOptions={statement:'statistics' as const,basis:options.basis,currency:options.currency,asOf:options.asOf,revisions:options.revisions,columns:20};
 const allEnds=statementPeriodEnds(facts,statementOptions),columns=allEnds.slice(0,Math.max(1,Math.min(options.columns,20))),notices:string[]=[];
 const lineIds=[...BASE_IDS,'free_cash_flow',...CATALOG_LINES.map(l=>l.id)];
 // Year-over-year lookups may also reach period ends that only catalog lines report (dividends per share).
 const lookupEnds=[...new Set([...allEnds,...catalogFlowEnds(facts,options)])].sort().reverse();
 const cells=resolveCatalogCells(facts,statementOptions,CATALOG_LINES.map(l=>l.spec),lineIds,lookupEnds);
 // Market capitalization from the existing price-ratio rules (stale, currency and share-count checks).
 let cap:{value:number|null;reason:string|null;inputs:CatalogInput[]}={value:null,reason:'No loaded price. Load a dataset for the chart symbol; OpenCandle does not fetch a price.',inputs:[]};
 if(options.price){const r=computePriceRatios({facts,currency:options.currency,asOf:options.asOf,price:options.price,today:options.today}).find(x=>x.id==='market_cap')!;cap={value:r.value,reason:r.reason,inputs:r.inputs.map(i=>({label:i.label+' ('+i.value+')',end:options.price!.date,value:null}))};}
 const memo=new Map<string,CatalogCell>();
 const dayOf=(end:string)=>dateDay(end);
 const priorEnd=(end:string,years:number)=>years===0?end:lookupEnds.find(e=>Math.abs(dayOf(end)-dayOf(e)-365.25*years)<=20)??null;
 function evalAt(id:string,end:string,stack:string[]):CatalogCell{
  const key=id+'|'+end,hit=memo.get(key);if(hit)return hit;
  const entry=catalogEntryById.get(id);let out:CatalogCell;
  if(!entry||entry.kind==='line'){const c=cells.get(key);out=c?fromStatement(c):{end,value:null,reason:'Unknown input '+id+'.',inputs:[],method:null};}
  else out=evalFormula(entry,end,stack);
  memo.set(key,out);return out;
 }
 function fromStatement(c:StatementCell):CatalogCell{return {end:c.end,value:c.value,reason:c.reason,inputs:c.inputs.map(i=>({label:i.label+(i.tag?' ['+i.tag+']':''),end:i.end,value:i.sign*i.value})),method:c.value===null?null:c.method==='derived'?'derived':c.tag?'Reported under '+c.tag:c.method};}
 function evalFormula(f:CatalogFormula,end:string,stack:string[]):CatalogCell{
  if(stack.includes(f.id))return {end,value:null,reason:'Circular definition.',inputs:[],method:null};
  if(f.price&&end!==columns[0])return {end,value:null,reason:'Price-based values use the last loaded close and are shown for the newest period only.',inputs:[],method:null};
  const used:CatalogInput[]=[],seen=new Set<string>(),next=[...stack,f.id];let days:number|null=null;
  const record=(id:string,at:string,c:CatalogCell)=>{const k=id+'|'+at;if(c.value!==null&&!seen.has(k)){seen.add(k);used.push({label:labelFor(id),end:at,value:c.value});}if(days===null){const s=cells.get(k);if(s&&s.value!==null&&s.start)days=dateDay(s.end)-dateDay(s.start)+1;}};
  const read=(id:string,at:string)=>{const c=evalAt(id,at,next);record(id,at,c);return c;};
  const need=(id:string,at:string)=>{const c=read(id,at);if(c.value===null)throw new Unavailable(labelFor(id)+(at===end?'':' ending '+at)+' is unavailable: '+c.reason);return c.value;};
  const priorAt=(years:number)=>{const e=priorEnd(end,years);if(!e)throw new Unavailable('No '+options.basis+' period ends about '+years+' year'+(years===1?'':'s')+' before '+end+'.');return e;};
  const x:FormulaContext={
   v:id=>need(id,end),o:id=>read(id,end).value,
   sum:(...list)=>{const vals=list.map(id=>read(id,end).value).filter((n):n is number=>n!==null);if(!vals.length)throw new Unavailable('None of '+list.map(labelFor).join(', ')+' is reported for this period.');return vals.reduce((a,b)=>a+b,0);},
   div:(a,b,what)=>{if(b===0)throw new Unavailable(what+' is zero for this period.');return a/b;},
   pos:(n,what)=>{if(!(n>0))throw new Unavailable(what+' is zero or negative, so the result is not meaningful.');return n;},
   prior:(id,years=1)=>need(id,priorAt(years)),
   priorOpt:(id,years=1)=>{const e=priorEnd(end,years);return e?read(id,e).value:null;},
   growth:id=>{const now=need(id,end),before=need(id,priorAt(1));if(before===0)throw new Unavailable('The prior-year value is zero, so growth is undefined.');return (now-before)/Math.abs(before)*100;},
   days:()=>days??(options.basis==='FQ'?91:365),
   cap:()=>{if(cap.value===null)throw new Unavailable('Market capitalization is unavailable: '+cap.reason);for(const i of cap.inputs)if(!used.some(u=>u.label===i.label))used.push(i);used.push({label:'Market capitalization',end:options.price!.date,value:cap.value});return cap.value;},
  };
  try{const value=f.compute(x);if(!Number.isFinite(value))return {end,value:null,reason:'The result is not a finite number.',inputs:[],method:null};return {end,value,reason:null,inputs:used,method:'formula'};}
  catch(e){if(e instanceof Unavailable)return {end,value:null,reason:e.message,inputs:[],method:null};throw e;}
 }
 if(!allEnds.length)notices.push('No reported periods were found for this basis and filing cutoff.');
 const rows:CatalogRow[]=CATALOG_ENTRIES.map(entry=>({id:entry.id,label:entry.label,group:entry.group,measure:entry.measure,unit:catalogUnit(entry.measure,options.currency),catalogIds:entry.catalogIds,formula:entry.kind==='formula'?entry.formula:null,basis:entry.kind==='line'?'reported':entry.basis,note:entry.note,price:entry.kind==='formula'&&entry.price,cells:columns.map(end=>{const c=evalAt(entry.id,end,[]);return entry.kind==='line'&&c.value===null&&!c.reason?{...c,reason:'Not reported.'}:c;})}));
 const priceNote=options.price?'Price: '+options.price.symbol+' close '+options.price.close+' on '+options.price.date+' ('+options.price.source+'), loaded data, not a live quote.'+(cap.value===null?' Market capitalization is unavailable: '+cap.reason:''):'No loaded price, so valuation rows are unavailable.';
 return {options,columns,rows,notices,priceNote};
}
/** Period ends of catalog flow lines that fit the basis (same day bands as the statements). */
function catalogFlowEnds(facts:CompanyFacts,options:CatalogOptions):string[]{
 const tags=new Set(CATALOG_LINES.filter(l=>l.spec.kind==='flow').flatMap(l=>l.spec.tags)),ends=new Set<string>();
 for(const concept of facts.concepts)if(tags.has(concept.id))for(const row of concept.observations){
  if(row.start===null||options.asOf!==null&&(row.filed===null||row.filed>options.asOf))continue;
  const days=dateDay(row.end)-dateDay(row.start)+1,fits=options.basis==='FY'?days>=300&&days<=400:options.basis==='FQ'?days>=60&&days<=120:days>=60&&days<=400;
  if(fits)ends.add(row.end);
 }
 return [...ends];
}
/** Rows for a section, mixing catalog rows with built-in statement rows built from the same cells. */
export function sectionRows(table:CatalogTable,section:typeof CATALOG_SECTIONS[number],baseRows:readonly CatalogRow[]):CatalogRow[]{
 return section.rows.flatMap(id=>table.rows.find(r=>r.id===id)??baseRows.find(r=>r.id===id)??[]);
}
/** Built-in statement lines and derived metrics as catalog rows (for sections). */
export function baseCatalogRows(facts:CompanyFacts,options:CatalogOptions,columns:readonly string[]):CatalogRow[]{
 if(!columns.length)return [];
 const statementOptions={statement:'statistics' as const,basis:options.basis,currency:options.currency,asOf:options.asOf,revisions:options.revisions,columns:20};
 const extra=['free_cash_flow','gross_margin','operating_margin','net_margin'],list=[...BASE_IDS,...extra],cells=resolveCatalogCells(facts,statementOptions,[],list,columns);
 return list.map(id=>{const spec=STATEMENT_LINES.find(s=>s.id===id),measure:CatalogMeasure=spec?spec.measure:id==='free_cash_flow'?'currency':'percent';return {id,label:spec?.label??({free_cash_flow:'Free cash flow',gross_margin:'Gross margin %',operating_margin:'Operating margin %',net_margin:'Net margin %'} as Record<string,string>)[id],group:'statement' as const,measure,unit:catalogUnit(measure,options.currency),catalogIds:[],formula:null,basis:'reported' as const,note:null,price:false,cells:columns.map(end=>{const c=cells.get(id+'|'+end)!;return {end,value:c.value,reason:c.reason,inputs:[],method:c.tag?'Reported under '+c.tag:c.method};})};});
}
export function formatCatalogValue(value:number|null,measure:CatalogMeasure,scale:Exclude<StatementScale,'auto'>='millions'):string{
 if(value===null)return 'Unavailable';
 const fixed=(n:number,d:number)=>n.toLocaleString('en-US',{minimumFractionDigits:d,maximumFractionDigits:d});
 if(measure==='percent')return fixed(value,2)+'%';
 if(measure==='ratio')return fixed(value,2)+'x';
 if(measure==='per-share'||measure==='score')return fixed(value,2);
 if(measure==='days')return fixed(value,1)+' days';
 if(measure==='years')return String(value)+(value===1?' year':' years');
 const div={units:1,thousands:1e3,millions:1e6,billions:1e9}[scale],suffix={units:'',thousands:'K',millions:'M',billions:'B'}[scale];
 return scale==='units'?value.toLocaleString('en-US',{maximumFractionDigits:2}):fixed(value/div,2)+suffix;
}
/** CSV rows. Values stay numbers; inputs are described in text. */
export function catalogExportRows(table:CatalogTable):(string|number)[][]{
 const out:(string|number)[][]=[['metric_id','metric','group','period_end','value','unit','basis','formula','inputs','reason']];
 for(const row of table.rows)for(const cell of row.cells)out.push([row.id,row.label,row.group,cell.end,cell.value===null?'':cell.value,row.unit,row.basis,row.formula??cell.method??'',cell.inputs.map(i=>i.label+' '+i.end+(i.value===null?'':' = '+i.value)).join('; '),cell.reason??'']);
 return out;
}
/** Every catalog leaf id this module covers with a computed or reported value. */
export const CATALOG_COVERED_IDS:readonly string[]=[...new Set([...CATALOG_ENTRIES.flatMap(e=>e.catalogIds),...CATALOG_SECTIONS.flatMap(s=>s.catalogIds)])];
