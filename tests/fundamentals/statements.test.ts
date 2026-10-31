import {describe,it,expect} from 'vitest';
import {normalizeCompanyFacts} from '../../src/fundamentals/company-facts';
import {buildStatement,statementCells,formatStatementValue,resolveScale,statementCurrencies,statementExportRows,addDays,type StatementOptions,type StatementTable} from '../../src/fundamentals/statements';
import {syntheticStatementFacts} from './fixtures/synthetic-statements';
// All facts are SYNTHETIC (see fixture). Expected values are computed by hand in the comments,
// not by calling the code under test.
const facts=(mutate?:(raw:any)=>void)=>{const raw=syntheticStatementFacts();mutate?.(raw);return normalizeCompanyFacts(raw);};
const opts=(patch:Partial<StatementOptions>={}):StatementOptions=>({statement:'income',basis:'FY',currency:'USD',asOf:'2024-12-31',revisions:'latest',columns:8,...patch});
const cell=(table:StatementTable,id:string,end:string)=>{const i=table.columns.indexOf(end);if(i<0)throw Error('No column '+end+' in '+table.columns.join(','));return table.rows.find(row=>row.id===id)!.cells[i];};
const values=(table:StatementTable,id:string)=>table.rows.find(row=>row.id===id)!.cells.map(c=>c.value);
describe('annual statements, amendments and point-in-time cutoff',()=>{
 it('shows fiscal-year columns newest first and falls back to an older revenue tag per period',()=>{
  const t=buildStatement(facts(),opts());
  // FY2024 (ends 2025-01-31) is filed 2025-03-25, after the 2024-12-31 cutoff, so it is absent.
  expect(t.columns).toEqual(['2024-01-31','2023-01-31']);
  // FY2023 revenue: the 10-K/A (1020, filed 2024-06-10) is the latest filing on or before the cutoff.
  expect(values(t,'revenue')).toEqual([1020,900]);
  expect(cell(t,'revenue','2024-01-31')).toMatchObject({form:'10-K/A',filed:'2024-06-10',tag:'us-gaap:RevenueFromContractWithCustomerExcludingAssessedTax',start:'2023-02-01'});
  // FY2022 is reported only under SalesRevenueNet; the tag actually used stays visible.
  expect(cell(t,'revenue','2023-01-31').tag).toBe('us-gaap:SalesRevenueNet');
  expect(values(t,'net_income')).toEqual([100,90]);
 });
 it('applies amendments only on or after their filing day and supports as-first-reported',()=>{
  const fy23=(asOf:string|null,revisions:'latest'|'original'='latest')=>cell(buildStatement(facts(),opts({asOf,revisions})),'revenue','2024-01-31').value;
  expect(fy23('2024-06-09')).toBe(1000);   // 10-K only; 10-K/A is one day later
  expect(fy23('2024-06-10')).toBe(1020);   // inclusive cutoff day
  expect(fy23('2024-12-31','original')).toBe(1000);
  // Before the original 10-K (filed 2024-03-20) the FY2023 period does not exist yet.
  expect(buildStatement(facts(),opts({asOf:'2024-03-19'})).columns).toEqual(['2023-01-31']);
 });
 it('excludes later filings at the cutoff and keeps missing lines null with a reason, never zero',()=>{
  expect(buildStatement(facts(),opts({asOf:'2025-03-24'})).columns[0]).toBe('2024-01-31');
  const t=buildStatement(facts(),opts({asOf:'2025-03-25'}));
  expect(t.columns[0]).toBe('2025-01-31');
  expect(cell(t,'revenue','2025-01-31').value).toBe(1200);
  expect(cell(t,'net_income','2025-01-31')).toMatchObject({value:null,reason:'Not reported for the period ending 2025-01-31.'});
  // No cutoff: everything supplied is visible.
  expect(buildStatement(facts(),opts({asOf:null})).columns).toEqual(['2025-01-31','2024-01-31','2023-01-31']);
 });
});
describe('quarterly and TTM periods',()=>{
 it('uses only reported 60-120 day quarters and never subtracts year-to-date totals',()=>{
  const t=buildStatement(facts(),opts({basis:'FQ'}));
  expect(t.columns).toEqual(['2024-10-31','2024-07-31','2024-04-30']);
  expect(values(t,'revenue')).toEqual([320,300,280]);
  // Gross profit at 2024-10-31 is reported only as a 274-day YTD (360). 360-? is not computed.
  expect(cell(t,'gross_profit','2024-10-31')).toMatchObject({value:null,reason:'Only a longer period ending 2024-10-31 is reported, not a standalone quarter. OpenCandle does not subtract year-to-date totals.'});
  // Cash flow has no 60-120 day periods at all.
  const cash=buildStatement(facts(),opts({statement:'cashflow',basis:'FQ'}));
  expect(cash.columns).toEqual([]);expect(cash.notices[0]).toContain('No reported 60-120 day periods');
 });
 it('computes TTM as annual + YTD - prior YTD with every input listed',()=>{
  const t=buildStatement(facts(),opts({basis:'TTM'}));
  // Kept columns have values; 2024-07-31, 2024-04-30 and 2023-10-31 lack a matching prior-year YTD.
  expect(t.columns).toEqual(['2024-10-31','2024-01-31','2023-01-31']);expect(t.droppedColumns).toBe(3);
  // Revenue TTM to 2024-10-31 = FY2023 1020 + 9M FY2024 900 - 9M FY2023 740 = 1180.
  const revenue=cell(t,'revenue','2024-10-31');
  expect(revenue).toMatchObject({value:1180,method:'annual-plus-ytd',start:'2023-11-01',end:'2024-10-31',filed:'2024-12-05'});
  expect(revenue.inputs.map(i=>[i.sign,i.value,i.start,i.end])).toEqual([[1,1020,'2023-02-01','2024-01-31'],[1,900,'2024-02-01','2024-10-31'],[-1,740,'2023-02-01','2023-10-31']]);
  // Net income TTM = 100 + 75 - 60 = 115. At a fiscal year end the reported annual value is used.
  expect(cell(t,'net_income','2024-10-31').value).toBe(115);
  expect(cell(t,'revenue','2024-01-31')).toMatchObject({value:1020,method:'reported-annual'});
  // As first reported, FY2023 is the original 1000: 1000 + 900 - 740 = 1160.
  expect(cell(buildStatement(facts(),opts({basis:'TTM',revisions:'original'})),'revenue','2024-10-31').value).toBe(1160);
 });
 it('does not add per-share values across periods',()=>{
  const t=buildStatement(facts(),opts({basis:'TTM'}));
  expect(cell(t,'eps_diluted','2024-10-31')).toMatchObject({value:null,reason:'Per-share and share-count values are not additive. TTM is shown only where a twelve-month period is reported.'});
  expect(cell(t,'eps_diluted','2024-01-31')).toMatchObject({value:1.25,unit:'USD/shares'});
 });
 it('sums four contiguous reported quarters when no annual period ends there',()=>{
  const raw={cik:5,entityName:'Synthetic quarters only',facts:{'us-gaap':{NetIncomeLoss:{units:{USD:[
   {start:'2024-01-01',end:'2024-03-31',val:10,filed:'2024-04-20'},{start:'2024-04-01',end:'2024-06-30',val:20,filed:'2024-07-20'},
   {start:'2024-07-01',end:'2024-09-30',val:30,filed:'2024-10-20'},{start:'2024-10-01',end:'2024-12-31',val:40,filed:'2025-01-20'}]}}}}};
  const t=buildStatement(normalizeCompanyFacts(raw),opts({basis:'TTM',asOf:null}));
  // 10 + 20 + 30 + 40 = 100 over 2024-01-01..2024-12-31 (366 days).
  expect(cell(t,'net_income','2024-12-31')).toMatchObject({value:100,method:'four-quarters',start:'2024-01-01',filed:'2025-01-20'});
  // Only three quarters end at 2024-09-30, so no TTM there.
  expect(t.columns).toEqual(['2024-12-31']);
 });
 it('refuses TTM on the cash-flow statement only where inputs are missing',()=>{
  const t=buildStatement(facts(),opts({statement:'cashflow',basis:'TTM'}));
  // CFO TTM = 300 + 210 - 180 = 330; capex TTM = 80 + 60 - 50 = 90; FCF = 330 - 90 = 240.
  expect(cell(t,'operating_cash_flow','2024-10-31').value).toBe(330);
  expect(cell(t,'capital_expenditures','2024-10-31').value).toBe(90);
  expect(cell(t,'free_cash_flow','2024-10-31')).toMatchObject({value:240,method:'derived',filed:'2024-12-05'});
  // Capex not reported, so free cash flow is unavailable (not 250 - 0).
  expect(cell(t,'free_cash_flow','2023-01-31')).toMatchObject({value:null});
  expect(cell(t,'free_cash_flow','2023-01-31').reason).toContain('Capital expenditures (payments for PP&E) is unavailable');
 });
});
describe('balance sheet',()=>{
 it('uses instants at fiscal period ends, never sums them and refuses TTM',()=>{
  const fy=buildStatement(facts(),opts({statement:'balance'}));
  expect(fy.columns).toEqual(['2024-01-31','2023-01-31']);expect(values(fy,'total_assets')).toEqual([1500,1400]);
  expect(cell(fy,'total_liabilities','2023-01-31').reason).toBe('No instant value is reported at 2023-01-31.');
  // Quarterly adds the 2024-10-31 quarter end that has instants; 07-31 and 04-30 have none.
  expect(buildStatement(facts(),opts({statement:'balance',basis:'FQ'})).columns).toEqual(['2024-10-31','2024-01-31','2023-01-31']);
  const ttm=buildStatement(facts(),opts({statement:'balance',basis:'TTM'}));
  expect(ttm.columns).toEqual([]);expect(ttm.notices[0]).toContain('point-in-time');
 });
 it('refuses unit mismatches instead of converting currencies',()=>{
  const usd=buildStatement(facts(),opts({statement:'balance'}));
  expect(cell(usd,'goodwill','2024-01-31')).toMatchObject({value:null,reason:'Reported only in EUR, not USD. OpenCandle does not convert units or currencies.'});
  expect(statementCurrencies(facts())).toEqual(['USD','EUR']);
  const eur=buildStatement(facts(),opts({statement:'balance',currency:'EUR'}));
  expect(eur.columns).toEqual(['2024-01-31']);expect(cell(eur,'goodwill','2024-01-31').value).toBe(70);
  expect(cell(eur,'total_assets','2024-01-31').reason).toBe('Reported only in USD, not EUR. OpenCandle does not convert units or currencies.');
  expect(eur.notices.join(' ')).toContain('1 period end has no EUR values');
 });
});
describe('derived statistics',()=>{
 const stats=(patch:Partial<StatementOptions>={})=>buildStatement(facts(),opts({statement:'statistics',...patch}));
 it('computes ratios only from same-period, same-unit inputs',()=>{
  const t=stats(),end='2024-01-31';
  // Gross margin = 400 / 1020 * 100 = 39.2156862745...
  expect(cell(t,'gross_margin',end).value).toBeCloseTo(39.2156862745098,10);
  // Net margin = 100 / 1020 * 100 = 9.80392156862745...
  expect(cell(t,'net_margin',end).value).toBeCloseTo(9.80392156862745,10);
  expect(cell(t,'net_margin',end).inputs.map(i=>[i.id,i.value])).toEqual([['net_income',100],['revenue',1020]]);
  // Free cash flow = 300 - 80 = 220; FCF margin = 220 / 1020 * 100 = 21.5686274509...
  expect(cell(t,'free_cash_flow',end).value).toBe(220);
  expect(cell(t,'fcf_margin',end).value).toBeCloseTo(21.5686274509804,10);
  // Current ratio = 500 / 250 = 2. Liabilities to equity = 600 / -50 = -12 (negative equity is shown).
  expect(cell(t,'current_ratio',end).value).toBe(2);
  expect(cell(t,'liabilities_to_equity',end).value).toBe(-12);
  // Operating income covers 2023-02-02..2024-01-31 but revenue 2023-02-01..2024-01-31.
  expect(cell(t,'operating_margin',end)).toMatchObject({value:null,reason:'Inputs cover different periods (2023-02-02 to 2024-01-31 versus 2023-02-01 to 2024-01-31). OpenCandle does not combine them.'});
 });
 it('gives unavailable for zero, negative-by-definition and missing denominators',()=>{
  const t=stats();
  expect(cell(t,'current_ratio','2023-01-31')).toMatchObject({value:null,reason:'Denominator Total current liabilities is zero for this period.'});
  // FY2022 net margin = 90 / 900 * 100 = 10 exactly.
  expect(cell(t,'net_margin','2023-01-31').value).toBe(10);
  // FY2022 total liabilities (the numerator) is missing: unavailable with the input's reason, not 0.
  expect(cell(t,'liabilities_to_equity','2023-01-31').reason).toMatch(/^Total liabilities is unavailable/);
  const q=stats({basis:'FQ'});
  // Current liabilities at 2024-10-31 are -10: the reference current-ratio definition leaves it empty.
  expect(cell(q,'current_ratio','2024-10-31')).toMatchObject({value:null,reason:'Denominator Total current liabilities is negative; the reference definition leaves this result empty.'});
  // Gross profit has no TTM at 2024-10-31 (no prior-year YTD), so gross margin is unavailable, not 0.
  const ttm=stats({basis:'TTM'});
  expect(cell(ttm,'gross_margin','2024-10-31').value).toBeNull();
  expect(cell(ttm,'gross_margin','2024-10-31').reason).toMatch(/^Gross profit is unavailable/);
  // TTM net margin = 115 / 1180 * 100 = 9.74576271186...
  expect(cell(ttm,'net_margin','2024-10-31').value).toBeCloseTo(9.74576271186441,10);
 });
});
describe('conflicts, unknown chronology and validation',()=>{
 it('leaves same-day conflicting values unavailable instead of choosing one',()=>{
  const t=buildStatement(facts(raw=>raw.facts['us-gaap'].RevenueFromContractWithCustomerExcludingAssessedTax.units.USD.push({start:'2024-05-01',end:'2024-07-31',val:301,filed:'2024-09-05',form:'10-Q',accn:'other'})),opts({basis:'FQ'}));
  expect(cell(t,'revenue','2024-07-31')).toMatchObject({value:null,reason:'Conflicting values (300, 301) were filed on 2024-09-05. OpenCandle does not pick one.'});
  expect(cell(t,'revenue','2024-10-31').value).toBe(320);
 });
 it('does not rank undated values against dated ones without a cutoff',()=>{
  const f=facts(raw=>raw.facts['us-gaap'].NetIncomeLoss.units.USD.push({start:'2023-02-01',end:'2024-01-31',val:99}));
  expect(cell(buildStatement(f,opts({asOf:null})),'net_income','2024-01-31').reason).toContain('unknown filing date');
  expect(cell(buildStatement(f,opts()),'net_income','2024-01-31').value).toBe(100);
 });
 it('refuses ambiguous annual periods sharing an end date',()=>{
  const f=facts(raw=>raw.facts['us-gaap'].GrossProfit.units.USD.push({start:'2023-01-29',end:'2024-01-31',val:410,filed:'2024-03-20'}));
  expect(cell(buildStatement(f,opts()),'gross_profit','2024-01-31')).toMatchObject({value:null,refused:true});
  expect(cell(buildStatement(f,opts()),'gross_profit','2024-01-31').reason).toContain('Several annual periods');
 });
 it('rejects invalid options',()=>{
  expect(()=>buildStatement(facts(),opts({columns:7}))).toThrow('Invalid statement view options');
  expect(()=>buildStatement(facts(),opts({asOf:'2024-02-30'}))).toThrow('calendar');
  expect(()=>buildStatement(facts(),opts({currency:''}))).toThrow('currency');
 });
 it('limits columns and reports how many periods exist',()=>{
  const two=buildStatement(normalizeCompanyFacts({cik:6,entityName:'Synthetic',facts:{'us-gaap':{NetIncomeLoss:{units:{USD:Array.from({length:6},(_,i)=>({start:(2018+i)+'-01-01',end:(2018+i)+'-12-31',val:i,filed:(2019+i)+'-02-01'}))}}}}}),opts({asOf:null,columns:4}));
  // Six annual periods (2018..2023), the latest four shown; the 2018 value 0 is a real zero, not missing.
  expect(two.columns).toEqual(['2023-12-31','2022-12-31','2021-12-31','2020-12-31']);expect(two.availableColumns).toBe(6);
  expect(two.notices).toContain('Showing the latest 4 of 6 periods.');
 });
});
describe('review regressions',()=>{
 it('keeps a period whose only cells are refused (conflicts) instead of calling it empty',()=>{
  const f=normalizeCompanyFacts({cik:8,entityName:'Synthetic conflict',facts:{'us-gaap':{Revenues:{units:{USD:[{start:'2023-01-01',end:'2023-12-31',val:100,filed:'2024-02-01'}]}},NetIncomeLoss:{units:{USD:[{start:'2023-01-01',end:'2023-12-31',val:10,filed:'2024-02-01',accn:'a'},{start:'2023-01-01',end:'2023-12-31',val:11,filed:'2024-02-01',accn:'b'}]}}}}});
  const t=buildStatement(f,opts({statement:'statistics',asOf:null}));
  // Net margin would be 10/100 or 11/100; the conflict is refused and the period stays visible.
  expect(t.columns).toEqual(['2023-12-31']);expect(t.droppedColumns).toBe(0);
  expect(cell(t,'net_margin','2023-12-31')).toMatchObject({value:null,refused:true});
  expect(cell(t,'net_margin','2023-12-31').reason).toContain('Conflicting values (10, 11)');
 });
 it('mentions another currency only when that value would qualify for the chosen period',()=>{
  const f=normalizeCompanyFacts({cik:9,entityName:'Synthetic units',facts:{'us-gaap':{NetIncomeLoss:{units:{USD:[{start:'2024-10-01',end:'2024-12-31',val:5,filed:'2025-02-01'}]}},Revenues:{units:{EUR:[{start:'2024-01-01',end:'2024-12-31',val:50,filed:'2025-02-01'}]}}}}});
  // The EUR revenue is annual, so in the quarterly view it is simply not a quarter.
  expect(cell(buildStatement(f,opts({basis:'FQ',asOf:null})),'revenue','2024-12-31').reason).toBe('Not reported for the period ending 2024-12-31.');
 });
 it('chooses the default currency from filings on or before the cutoff',()=>{
  // Before 2024-03-20 only the FY2022 10-K (USD) is filed; the EUR goodwill arrives with the FY2023 10-K.
  expect(statementCurrencies(facts(),'2024-03-19')).toEqual(['USD']);
  expect(statementCurrencies(facts(),'2024-03-20')).toEqual(['USD','EUR']);
 });
});
describe('second review regressions',()=>{
 it('quarterly statistics include the fiscal-year end for point-in-time ratios (no standalone Q4 needed)',()=>{
  const t=buildStatement(facts(),opts({statement:'statistics',basis:'FQ'}));
  // 2023-01-31 has no values (zero current liabilities, annual-only flows), so it is dropped.
  expect(t.columns).toEqual(['2024-10-31','2024-07-31','2024-04-30','2024-01-31']);expect(t.droppedColumns).toBe(1);
  // Current ratio at the FY2023 end = 500 / 250 = 2, from 10-K instants.
  expect(cell(t,'current_ratio','2024-01-31').value).toBe(2);
  // Flow ratios there still need a standalone quarter, which is not reported.
  expect(cell(t,'net_margin','2024-01-31').reason).toContain('not a standalone quarter');
 });
 it('leaves margins on negative revenue unavailable and says the rule is OpenCandle policy',()=>{
  const f=normalizeCompanyFacts({cik:12,entityName:'Synthetic negative revenue',facts:{'us-gaap':{Revenues:{units:{USD:[{start:'2023-01-01',end:'2023-12-31',val:-100,filed:'2024-02-01'}]}},NetIncomeLoss:{units:{USD:[{start:'2023-01-01',end:'2023-12-31',val:10,filed:'2024-02-01'}]}}}}});
  // Every statistics cell here is unavailable, so the table drops the period; read the cell directly.
  expect(buildStatement(f,opts({statement:'statistics',asOf:null})).columns).toEqual([]);
  const c=statementCells(f,opts({statement:'statistics',asOf:null}),['net_margin'],'2023-12-31').net_margin;
  expect(c).toMatchObject({value:null,reason:'Denominator Total revenue is negative. OpenCandle leaves margins on negative revenue empty; the reference article does not define this case.'});
 });
 it('shows the same provenance whatever the input order when two same-day filings agree',()=>{
  const row=(accn:string)=>({start:'2023-01-01',end:'2023-12-31',val:50,filed:'2024-02-01',form:'10-K',accn});
  const shown=(rows:object[])=>cell(buildStatement(normalizeCompanyFacts({cik:13,entityName:'Synthetic duplicate',facts:{'us-gaap':{NetIncomeLoss:{units:{USD:rows}}}}}),opts({asOf:null})),'net_income','2023-12-31');
  // Smallest accession number wins in both orders; the value 50 is not a conflict.
  expect(shown([row('0000000013-24-000002'),row('0000000013-24-000001')])).toMatchObject({value:50,accession:'0000000013-24-000001'});
  expect(shown([row('0000000013-24-000001'),row('0000000013-24-000002')]).accession).toBe('0000000013-24-000001');
 });
});
describe('display and export',()=>{
 it('scales display only and shows unknown as Unavailable',()=>{
  const t=buildStatement(facts(),opts({statement:'balance'}));
  expect(resolveScale('auto',t)).toBe('thousands');   // largest monetary value 1500
  expect(formatStatementValue(1020,'currency','thousands')).toBe('1.02K');
  expect(formatStatementValue(1020,'currency','units')).toBe('1,020');
  expect(formatStatementValue(0,'currency','millions')).toBe('0.00M');
  expect(formatStatementValue(9.80392156862745,'percent','billions')).toBe('9.80%');
  expect(formatStatementValue(1.25,'per-share','millions')).toBe('1.25');
  expect(formatStatementValue(null,'currency','units')).toBe('Unavailable');
  expect(addDays('2024-02-28',1)).toBe('2024-02-29');
 });
 it('exports exact values with method, provenance and reason',()=>{
  const rows=statementExportRows(buildStatement(facts(),opts({statement:'statistics'})));
  expect(rows[0]).toEqual(['line_id','line','period_start','period_end','value','unit','method','tag','filed','form','accession','reason','formula']);
  const fcf=rows.find(row=>row[0]==='free_cash_flow'&&row[3]==='2024-01-31')!;
  expect(fcf.slice(2,7)).toEqual(['2023-02-01','2024-01-31',220,'USD','derived']);expect(fcf[12]).toBe('Cash from operating activities - Capital expenditures');
  expect(rows.find(row=>row[0]==='current_ratio'&&row[3]==='2023-01-31')![11]).toContain('zero');
  // Negative values stay numbers (600 / -50 = -12) so a CSV writer cannot treat them as formulas.
  expect(rows.find(row=>row[0]==='liabilities_to_equity'&&row[3]==='2024-01-31')![4]).toBe(-12);
 });
});
