import {describe,it,expect} from 'vitest';
import {normalizeCompanyFacts,type FactsDocument} from '../../src/fundamentals/company-facts';
import {buildSymbolFundamentalsSummary,createSummaryMemo,SUMMARY_FIELDS,type SummaryInput} from '../../src/fundamentals/symbol-summary';
import {createFundamentalsPreferences,setFundamentalsLink} from '../../src/fundamentals/preferences';
import {checkFundamentalsSummary,FUNDAMENTALS_SUMMARY_FIELD_LIMIT,type SymbolFundamentalsSummary as C03Summary} from './fixtures/c03-symbol-fundamentals-contract';
import {syntheticStatementFacts,syntheticSource} from './fixtures/synthetic-statements';
// SYNTHETIC facts only. The "real-market" cases use a local-import document of the same synthetic
// numbers purely to exercise the contract's real/synthetic separation.
const facts=normalizeCompanyFacts(syntheticStatementFacts());
const realDoc:FactsDocument={id:'local-facts:test',facts,source:{kind:'local-import',label:'User-supplied companyfacts JSON; source unverified',retrievedAt:'2026-10-15T00:00:00Z',sourceUrl:null,sha256:null}};
const fakeDoc:FactsDocument={id:'synthetic-facts:test',facts,source:syntheticSource};
const real={exchange:'NYSE',symbol:'SYNTHCO',synthetic:false},demo={exchange:'LV',symbol:'GME',synthetic:true};
const linked=(market:typeof real,documentId:string)=>setFundamentalsLink(createFundamentalsPreferences(),market,documentId).links;
const input=(patch:Partial<SummaryInput>={}):SummaryInput=>({market:real,documents:[realDoc,fakeDoc],links:linked(real,realDoc.id),asOf:'2024-12-31',...patch});
const accept=(summary:C03Summary,market=summary.market)=>{const result=checkFundamentalsSummary(summary,market);if(!result.ok)throw Error(result.reason);return result.summary;};
const field=(summary:C03Summary,id:string)=>summary.fields.find(row=>row.id===id)!;
describe('SymbolDetails fundamentals summary producer (C03 contract)',()=>{
 it('produces an accepted twelve-field summary for the linked filing entity',()=>{
  // Compile-time: the producer output is assignable to the verbatim C03 type.
  const summary:C03Summary=buildSymbolFundamentalsSummary(input());
  const accepted=accept(summary);
  expect(accepted.availability).toBe('available');expect(summary.fields).toHaveLength(FUNDAMENTALS_SUMMARY_FIELD_LIMIT);expect(summary.fields.map(row=>row.id)).toEqual([...SUMMARY_FIELDS]);
  expect(summary).toMatchObject({asOf:'2024-12-31',entity:{name:'Synthetic Statement Co (SYNTHETIC)',cik:'0000009999'},source:{kind:'local-import'}});
  // Latest FY ending on/before the cutoff is 2024-01-31; revenue is the 10-K/A value 1020.
  expect(field(summary,'revenue')).toMatchObject({value:1020,unit:'USD',filed:'2024-06-10',form:'10-K/A',accession:'0000009999-24-000002',period:{start:'2023-02-01',end:'2024-01-31',fiscalYear:null,fiscalPeriod:'FY'}});
  expect(field(summary,'total_equity')).toMatchObject({value:-50,period:{start:null,end:'2024-01-31',fiscalPeriod:'Instant'}});
  expect(field(summary,'eps_diluted')).toMatchObject({value:1.25,unit:'USD/shares'});
  // Free cash flow = 300 - 80 = 220; net margin = 100 / 1020 * 100 = 9.80392156862745...
  expect(field(summary,'free_cash_flow')).toMatchObject({value:220,derived:{formula:'Cash from operating activities - Capital expenditures',inputs:['operating_cash_flow','capital_expenditures']}});
  expect(field(summary,'net_margin').value).toBeCloseTo(9.80392156862745,10);expect(field(summary,'net_margin').unit).toBe('%');
  expect(field(summary,'net_margin').derived?.inputs).toEqual(['net_income','revenue']);
  // The checker rejects it for any other market identity.
  expect(checkFundamentalsSummary(summary,{...real,exchange:'NASDAQ'}).ok).toBe(false);
 });
 it('keeps missing values null with reasons (never zero) when a later year is partly filed',()=>{
  const summary=buildSymbolFundamentalsSummary(input({asOf:'2025-06-30'}));accept(summary);
  // FY2024 (ends 2025-01-31, filed 2025-03-25): revenue 1200, but no net income or balance sheet.
  expect(field(summary,'revenue').value).toBe(1200);
  expect(field(summary,'net_income')).toMatchObject({value:null,missingReason:'Not reported for the period ending 2025-01-31.'});
  expect(field(summary,'total_assets')).toMatchObject({value:null,missingReason:'No instant value is reported at 2025-01-31.'});
  expect(field(summary,'net_margin').value).toBeNull();expect(field(summary,'net_margin').missingReason).toMatch(/^Net income is unavailable/);
  expect(summary.fields.some(row=>row.value===0)).toBe(false);
 });
 it('excludes filings after the cutoff, including the amendment',()=>{
  expect(field(buildSymbolFundamentalsSummary(input({asOf:'2024-06-09'})),'revenue').value).toBe(1000);
  expect(field(buildSymbolFundamentalsSummary(input({asOf:'2024-06-09',revisions:'original'})),'revenue').value).toBe(1000);
  const early=buildSymbolFundamentalsSummary(input({asOf:'2023-03-14'}));accept(early);
  // Nothing is filed before 2023-03-15, so the summary is unavailable with a reason and no fields.
  expect(early).toMatchObject({availability:'unavailable',fields:[]});expect(early.reason).toContain('on or before 2023-03-14');
 });
 it('supports a TTM summary with instant balance values at the same period end',()=>{
  const summary=buildSymbolFundamentalsSummary(input({basis:'TTM'}));accept(summary);
  // TTM to 2024-10-31: revenue 1020 + 900 - 740 = 1180; net income 100 + 75 - 60 = 115.
  expect(field(summary,'revenue')).toMatchObject({value:1180,period:{start:'2023-11-01',end:'2024-10-31',fiscalPeriod:'TTM'}});
  expect(field(summary,'net_income').value).toBe(115);
  // FCF TTM = (300 + 210 - 180) - (80 + 60 - 50) = 330 - 90 = 240.
  expect(field(summary,'free_cash_flow').value).toBe(240);
  expect(field(summary,'total_assets')).toMatchObject({value:null,missingReason:'No instant value is reported at 2024-10-31.'});
 });
 it('never mixes synthetic and real data and never infers a link',()=>{
  const none=buildSymbolFundamentalsSummary(input({links:[]}));accept(none);
  expect(none).toMatchObject({availability:'not-loaded',source:null,fields:[]});expect(none.reason).toContain('does not map tickers to CIKs');
  const demoNone=buildSymbolFundamentalsSummary(input({market:demo,links:[]}));accept(demoNone);expect(demoNone.availability).toBe('not-applicable');
  // Real filing document linked to a SYNTHETIC DEMO market: no values, no source.
  const crossed=buildSymbolFundamentalsSummary(input({market:demo,links:linked(demo,realDoc.id)}));accept(crossed);
  expect(crossed).toMatchObject({availability:'unavailable',source:null,fields:[]});
  const crossedReal=buildSymbolFundamentalsSummary(input({links:linked(real,fakeDoc.id)}));accept(crossedReal);expect(crossedReal.availability).toBe('unavailable');
  // Synthetic fixture explicitly linked to the synthetic market is allowed and labelled synthetic.
  const fixture=buildSymbolFundamentalsSummary(input({market:demo,links:linked(demo,fakeDoc.id)}));
  expect(accept(fixture).source?.kind).toBe('synthetic');
 });
 it('reports ETFs, removed documents and missing currencies explicitly',()=>{
  const etf=buildSymbolFundamentalsSummary(input({assetClass:'ETF'}));accept(etf);expect(etf).toMatchObject({availability:'not-applicable',fields:[]});
  const removed=buildSymbolFundamentalsSummary(input({documents:[]}));accept(removed);expect(removed.reason).toContain('was removed');
  const eur=buildSymbolFundamentalsSummary(input({currency:'JPY'}));accept(eur);expect(eur.availability).toBe('unavailable');expect(eur.reason).toContain('JPY');
  const empty:FactsDocument={...realDoc,id:'empty',facts:normalizeCompanyFacts({cik:7,entityName:'Synthetic empty',facts:{}})};
  const blank=buildSymbolFundamentalsSummary(input({documents:[empty],links:linked(real,'empty')}));accept(blank);expect(blank.reason).toContain('no reported currency');
 });
 it('falls back to identifiers for blank names and rejects an invalid cutoff explicitly',()=>{
  const blank:FactsDocument={id:'blank',facts:{...facts,entityName:'  '},source:{...realDoc.source,label:''}};
  const summary=buildSymbolFundamentalsSummary(input({documents:[blank],links:linked(real,'blank')}));
  expect(accept(summary)).toMatchObject({availability:'available',entity:{name:'CIK 0000009999'},source:{label:'Local companyfacts import'}});
  const bad=buildSymbolFundamentalsSummary(input({asOf:'x'.repeat(50)}));
  expect(accept(bad)).toMatchObject({availability:'error',asOf:null});
 });
 it('prefers the latest period with income values over a balance-only date',()=>{
  // TTM: 2025-03-31 has assets (100) but no TTM net income (no prior-year Q1), so the summary uses
  // 2024-12-31 where net income 10 is a reported annual period and assets are 90.
  const raw={cik:11,entityName:'Synthetic TTM',facts:{'us-gaap':{NetIncomeLoss:{units:{USD:[{start:'2024-01-01',end:'2024-12-31',val:10,filed:'2025-02-01'},{start:'2025-01-01',end:'2025-03-31',val:3,filed:'2025-05-01'}]}},Assets:{units:{USD:[{end:'2024-12-31',val:90,filed:'2025-02-01'},{end:'2025-03-31',val:100,filed:'2025-05-01'}]}}}}};
  const doc:FactsDocument={...realDoc,id:'ttm',facts:normalizeCompanyFacts(raw)};
  const summary=buildSymbolFundamentalsSummary(input({documents:[doc],links:linked(real,'ttm'),basis:'TTM',asOf:null}));accept(summary);
  expect(field(summary,'net_income')).toMatchObject({value:10,period:{end:'2024-12-31'}});expect(field(summary,'total_assets').value).toBe(90);
 });
 it('evicts the least recently used summary one at a time',()=>{
  const memo=createSummaryMemo(2),documents=[realDoc,fakeDoc],links=linked(real,realDoc.id),at=(asOf:string)=>memo(input({documents,links,asOf}));
  const a=at('2024-12-31'),b=at('2024-06-09');expect(at('2024-12-31')).toBe(a);
  at('2024-06-10');                 // evicts b (least recently used), keeps a
  expect(at('2024-12-31')).toBe(a);expect(at('2024-06-09')).not.toBe(b);
 });
 it('memoizes to a stable object for identical inputs',()=>{
  const memo=createSummaryMemo(),documents=[realDoc,fakeDoc],links=linked(real,realDoc.id);
  const a=memo(input({documents,links})),b=memo(input({documents,links:[...links]}));
  expect(b).toBe(a);
  expect(memo(input({documents,links,asOf:'2024-06-09'}))).not.toBe(a);
  expect(memo(input({documents:[...documents],links}))).not.toBe(a);
 });
});
