import {describe,expect,it} from 'vitest';
import {normalizeCompanyFacts} from '../../src/fundamentals/company-facts';
import {buildMetricCatalog,catalogExportRows,formatCatalogValue,CATALOG_COVERED_IDS,CATALOG_ENTRIES,CATALOG_UNAVAILABLE,type CatalogOptions,type CatalogTable} from '../../src/fundamentals/metric-catalog';
import {STATEMENT_LINES} from '../../src/fundamentals/statements';
import {buildGraphSeries,createGraphConfig,moveGraphItem,restoreGraphConfig,GRAPH_METRICS} from '../../src/fundamentals/graph';
import {snapshotPalette} from '../../src/ui/FundamentalsGraph';
import {metricsModel} from '../../src/ui/FundamentalsMetrics';
import {catalogFacts} from './fixtures/dl-gaps3-catalog-facts';
// SYNTHETIC facts only. Expected values are worked out by hand from the fixture numbers and the
// published formula, not by re-running LV code. No network, DOM or IPC.
const facts=normalizeCompanyFacts(catalogFacts());
const price={close:50,date:'2025-03-03',currency:'USD',symbol:'SYNC',source:'synthetic test bars'};
const opts=(patch:Partial<CatalogOptions>={}):CatalogOptions=>({basis:'FY',currency:'USD',asOf:null,revisions:'latest',columns:4,price:null,today:'2025-03-05',...patch});
const at=(table:CatalogTable,id:string,end='2024-12-31')=>{const row=table.rows.find(r=>r.id===id);if(!row)throw Error('no row '+id);const cell=row.cells.find(c=>c.end===end);if(!cell)throw Error('no cell '+id+' '+end);return cell;};
const v=(table:CatalogTable,id:string,end?:string)=>at(table,id,end).value;
describe('metric catalog lines and formulas',()=>{
 const t=buildMetricCatalog(facts,opts());
 it('uses the statement period ends, newest first',()=>{expect(t.columns).toEqual(['2024-12-31','2023-12-31']);});
 it('maps SEC tags to line items and keeps unreported lines unavailable, never zero',()=>{
  expect(v(t,'ltd_current')).toBe(20);expect(v(t,'retained_earnings')).toBe(300);expect(v(t,'shares_outstanding')).toBe(100);
  const missing=at(t,'restructuring');expect(missing.value).toBeNull();expect(missing.reason).toMatch(/Not reported/);
 });
 it('builds debt and cash aggregates from the reported components',()=>{
  // Short-term debt 30 + 20 = 50; long-term 200; total 250. Cash 100 + STI 50 = 150. Net debt 100.
  expect(v(t,'short_term_debt')).toBe(50);expect(v(t,'total_debt')).toBe(250);expect(v(t,'cash_sti')).toBe(150);expect(v(t,'net_debt')).toBe(100);
  expect(v(t,'intangibles_net')).toBe(80);expect(v(t,'opex_total')).toBe(750);expect(v(t,'tax_current_domestic')).toBe(24);
 });
 it('computes standard ratios with hand-worked values',()=>{
  expect(v(t,'ebit')).toBe(200);expect(v(t,'ebitda')).toBe(250);expect(v(t,'interest_coverage')).toBe(10);expect(v(t,'ebitda_margin')).toBeCloseTo(25,10);
  expect(v(t,'roe')).toBeCloseTo(28.8,10);expect(v(t,'roa')).toBeCloseTo(14.4,10);expect(v(t,'quick_ratio')).toBeCloseTo(230/150,10);expect(v(t,'cash_ratio')).toBeCloseTo(1,10);
  expect(v(t,'debt_to_equity')).toBeCloseTo(0.5,10);expect(v(t,'debt_to_capital')).toBeCloseTo(250/750,10);expect(v(t,'asset_turnover')).toBeCloseTo(1,10);
  // FY2024 has 366 days: 60 / 600 * 366 = 36.6; 80 / 1000 * 366 = 29.28; 40 / 600 * 366 = 24.4.
  expect(v(t,'days_inventory')).toBeCloseTo(36.6,10);expect(v(t,'days_sales')).toBeCloseTo(29.28,10);expect(v(t,'days_payable')).toBeCloseTo(24.4,10);expect(v(t,'cash_conversion_cycle')).toBeCloseTo(41.48,10);
  expect(v(t,'bvps')).toBe(5);expect(v(t,'tbvps')).toBeCloseTo(4.2,10);expect(v(t,'graham_number')).toBeCloseTo(Math.sqrt(162),10);
  expect(v(t,'sloan_ratio')).toBeCloseTo((144-220+100)/1000*100,10);expect(v(t,'quality_ratio')).toBeCloseTo(220/144,10);
 });
 it('computes year-over-year growth and dividend streaks from older periods',()=>{
  expect(v(t,'revenue_growth')).toBeCloseTo(25,10);expect(v(t,'eps_diluted_growth')).toBeCloseTo(44,10);expect(v(t,'net_income_growth')).toBeCloseTo(44,10);
  // DPS 0.40 > 0.36 > 0.30 = 0.30: two years of growth; four years paid.
  expect(v(t,'continuous_dividend_growth')).toBe(2);expect(v(t,'continuous_dividend_payout')).toBe(4);
  const old=at(t,'revenue_growth','2023-12-31');expect(old.value).toBeNull();expect(old.reason).toMatch(/Total revenue ending 2022-12-31 is unavailable/);
 });
 it('scores Piotroski 9 when every test passes and leaves it empty when an input is missing',()=>{
  expect(v(t,'piotroski')).toBe(9);
  const z=v(t,'zmijewski')!;expect(z).toBeCloseTo(-4.336-4.513*0.144+5.679*0.5+0.004*2,10);
  const s=v(t,'springate')!;expect(s).toBeCloseTo(1.03*0.15+3.07*0.2+0.66*1.2+0.4*1,10);
  expect(at(t,'piotroski','2023-12-31').value).toBeNull();
 });
 it('gives zero and negative denominators an explicit reason',()=>{
  const d=JSON.parse(JSON.stringify(catalogFacts()));d.facts['us-gaap'].StockholdersEquity.units.USD[0].val=0;d.facts['us-gaap'].InterestExpense.units.USD[0].val=-5;
  const t2=buildMetricCatalog(normalizeCompanyFacts(d),opts());
  expect(at(t2,'roe').value).toBeNull();expect(at(t2,'roe').reason).toMatch(/zero or negative/);
  expect(at(t2,'interest_coverage').reason).toMatch(/Interest expense is zero or negative/);
  expect(at(t2,'equity_to_assets').value).toBe(0);
 });
 it('lists inputs for every computed value',()=>{
  const c=at(t,'net_debt');expect(c.inputs.map(i=>i.label+'='+i.value)).toEqual(expect.arrayContaining(['Total debt=250','Cash and short-term investments=150']));
 });
});
describe('valuation with the last loaded close',()=>{
 it('needs a loaded price and says so',()=>{const t=buildMetricCatalog(facts,opts());expect(at(t,'enterprise_value').value).toBeNull();expect(at(t,'enterprise_value').reason).toMatch(/No loaded price/);});
 it('computes enterprise value and price ratios at the newest period only',()=>{
  const t=buildMetricCatalog(facts,opts({price}));
  // Market cap 50 * 100 = 5000. EV = 5000 + 250 - 150 = 5100.
  expect(v(t,'enterprise_value')).toBe(5100);expect(v(t,'ev_ebit')).toBeCloseTo(25.5,10);expect(v(t,'price_fcf')).toBeCloseTo(5000/150,10);expect(v(t,'tobins_q')).toBeCloseTo(5.5,10);
  expect(v(t,'altman_z')).toBeCloseTo(1.2*0.15+1.4*0.3+3.3*0.2+0.6*10+1,10);
  expect(v(t,'buyback_yield')).toBeCloseTo(25/5000*100,10);
  expect(at(t,'enterprise_value','2023-12-31').reason).toMatch(/newest period only/);
 });
 it('refuses a price in another currency',()=>{const t=buildMetricCatalog(facts,opts({price:{...price,currency:'EUR'}}));expect(at(t,'enterprise_value').reason).toMatch(/does not convert/);});
});
describe('catalog table integrity',()=>{
 it('every leaf id is claimed by at most one entry and none collides with the statement lines',()=>{
  const all=[...CATALOG_ENTRIES.flatMap(e=>e.catalogIds),...CATALOG_UNAVAILABLE.flatMap(u=>u.catalogIds)];expect(new Set(all).size).toBe(all.length);
  const base=STATEMENT_LINES.flatMap(s=>s.catalogId?[s.catalogId]:[]);expect(all.filter(id=>base.includes(id))).toEqual([]);
  expect(CATALOG_COVERED_IDS.every(id=>/^AN\.FUND\.METRIC\.\d+$/.test(id))).toBe(true);
 });
 it('ids are unique and labels have no em dash',()=>{const ids=CATALOG_ENTRIES.map(e=>e.id);expect(new Set(ids).size).toBe(ids.length);expect(ids.some(id=>STATEMENT_LINES.some(s=>s.id===id))).toBe(false);for(const e of CATALOG_ENTRIES)expect(e.label+(e.note??'')+(e.kind==='formula'?e.formula:'')).not.toContain('—');});
 it('exports numbers as numbers with the formula and reason',()=>{
  const rows=catalogExportRows(buildMetricCatalog(facts,opts()));expect(rows[0]).toEqual(['metric_id','metric','group','period_end','value','unit','basis','formula','inputs','reason']);
  const roe=rows.find(r=>r[0]==='roe'&&r[3]==='2024-12-31')!;expect(typeof roe[4]).toBe('number');expect(roe[6]).toBe('LV-DEFINED');
 });
 it('formats each measure',()=>{expect(formatCatalogValue(36.6,'days')).toBe('36.6 days');expect(formatCatalogValue(2,'years')).toBe('2 years');expect(formatCatalogValue(0.5,'ratio')).toBe('0.50x');expect(formatCatalogValue(null,'percent')).toBe('Unavailable');expect(formatCatalogValue(2500000,'currency','millions')).toBe('2.50M');});
 it('the metrics view model picks a scale and builds the base rows for sections',()=>{
  const m=metricsModel({document:{id:'d',facts,source:{kind:'synthetic',label:'x',retrievedAt:'2025-01-01T00:00:00Z',sourceUrl:null,sha256:null}},basis:'FY',currency:'USD',asOf:null,revisions:'latest',columns:4,scale:'auto',price:null,today:'2025-03-05'});
  expect(m.scale).toBe('units');expect(m.base.find(r=>r.id==='revenue')!.cells[0].value).toBe(1000);
 });
});
describe('fundamentals graph additions',()=>{
 const doc={id:'d1',facts,source:{kind:'synthetic' as const,label:'x',retrievedAt:'2025-01-01T00:00:00Z',sourceUrl:null,sha256:null}};
 it('draws catalog metrics and keeps price-based rows out of the graph list',()=>{
  expect(GRAPH_METRICS.some(m=>m.id==='roe')).toBe(true);expect(GRAPH_METRICS.some(m=>m.id==='enterprise_value')).toBe(false);
  const built=buildGraphSeries([doc],{...createGraphConfig(),documentIds:['d1'],metricIds:['roe']},null);
  const pts=built.series[0].points;expect(pts.map(p=>p.end)).toEqual(['2023-12-31','2024-12-31']);expect(pts[0].value).toBeCloseTo(100/420*100,10);expect(pts[1].value).toBeCloseTo(28.8,10);
 });
 it('reorders selected metrics and leaves edge moves unchanged',()=>{expect(moveGraphItem(['a','b','c'],'c',-1)).toEqual(['a','c','b']);expect(moveGraphItem(['a','b'],'a',-1)).toEqual(['a','b']);});
 it('a chosen currency a company does not report leaves it out with a note, never converted',()=>{
  const built=buildGraphSeries([doc],{...createGraphConfig(),documentIds:['d1'],currency:'EUR'},null);expect(built.series).toEqual([]);expect(built.notices[0]).toMatch(/does not report in EUR.*does not convert/);
 });
 it('restores old saved configurations and validates the new options',()=>{
  const {currency,snapshot,colors,...old}=createGraphConfig();expect(restoreGraphConfig(old)).toEqual(createGraphConfig());
  const full={...createGraphConfig(),currency:'USD',snapshot:{legend:false,background:'light'},colors:{'d1|roe':3}};expect(restoreGraphConfig(JSON.parse(JSON.stringify(full)))).toEqual(full);
  expect(()=>restoreGraphConfig({...full,colors:{'d1|roe':9}})).toThrow(/colors/);expect(()=>restoreGraphConfig({...full,currency:'usd'})).toThrow(/currency/);expect(()=>restoreGraphConfig({...full,snapshot:{legend:true,background:'neon'}})).toThrow(/snapshot/);
 });
 it('snapshot palettes: light is fixed, transparent keeps theme text',()=>{const token=(_:string,f:string)=>f;expect(snapshotPalette('light',token).bg).toBe('#ffffff');expect(snapshotPalette('transparent',token)).toEqual({...snapshotPalette('theme',token),bg:'transparent'});});
});
describe('blank check flag from the SEC industry code',()=>{
 it('SIC 6770 reads Yes; other codes read No; no SIC states nothing',async()=>{
  const {detailProfile}=await import('../../src/fundamentals/detail-sources');
  const base={sic:'6770',sicDescription:'Blank Checks',entityType:'operating',category:null,stateOfIncorporation:'DE',fiscalYearEnd:'1231',tickers:[],exchanges:[],businessCity:null,businessState:null};
  const line=(sic:string|null)=>detailProfile({...base,sic},null,null,{exchange:'NASDAQ',symbol:'SPAC',synthetic:false}).lines.find(l=>l.label==='Blank check company')?.value;
  expect(line('6770')).toBe('Yes (SIC 6770)');expect(line('3571')).toBe('No');expect(line(null)).toBeUndefined();
 });
});
