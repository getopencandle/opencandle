// Symbol details independent second review (second reviewer). New file only; no builder code is changed.
// Every expected number below was computed by hand from the SYNTHETIC rows in reviewFacts(), not by
// calling the code under test. Calendar fiscal year. Day counts (inclusive):
//  FY23 2023-01-01..2023-12-31 = 365, FY24 2024-01-01..2024-12-31 = 366,
//  Q1'23 90, Q2'23 91, Q3'23 92, Q4'23 92, Q1'24 91, Q2'24 91, Q3'24 92,
//  YTD6'23 181, YTD6'24 182, YTD9'23 273, YTD9'24 274.
// Filings: K23 10-K 2024-02-15, QA 10-Q 2024-04-25, QB 10-Q 2024-07-25, KA 10-K/A 2024-08-01
// (restates FY23 revenue 1000 -> 1050 and repeats FY23 net income 100), QC 10-Q 2024-10-24,
// K24 10-K 2025-02-14 (FY24 revenue 1300, repeats FY23 revenue 1050, EPS only in EUR/shares).
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {normalizeCompanyFacts,restoreFactsDocument,type FactsDocument} from '../../src/fundamentals/company-facts';
import {buildStatement,statementCells,statementCurrencies,statementExportRows,type StatementOptions,type StatementTable} from '../../src/fundamentals/statements';
import {buildSymbolFundamentalsSummary,createSummaryMemo,SUMMARY_FIELDS,type SummaryInput} from '../../src/fundamentals/symbol-summary';
import {createFundamentalsPreferences,createFundamentalsView,restoreFundamentalsPreferences,setFundamentalsLink} from '../../src/fundamentals/preferences';
import {checkFundamentalsSummary} from '../fundamentals/fixtures/c03-symbol-fundamentals-contract';
import {FundamentalsDialog,csvCell} from '../../src/ui/FundamentalsDialog';

const hooks=vi.hoisted(()=>({cells:[] as any[],cursor:0}));
vi.mock('react',async()=>{const actual=await vi.importActual<any>('react');return {...actual,useState:(initial:any)=>{const i=hooks.cursor++;if(!(i in hooks.cells))hooks.cells[i]=typeof initial==='function'?initial():initial;return [hooks.cells[i],(next:any)=>{hooks.cells[i]=typeof next==='function'?next(hooks.cells[i]):next;}];},useRef:(initial:any)=>{const i=hooks.cursor++;if(!(i in hooks.cells))hooks.cells[i]={current:initial};return hooks.cells[i];},useEffect:()=>{hooks.cursor++;},useMemo:(fn:()=>any)=>fn()};});
beforeEach(()=>{hooks.cells=[];hooks.cursor=0;});afterEach(()=>vi.unstubAllGlobals());

const F={K23:{filed:'2024-02-15',form:'10-K',accn:'R-24-1'},QA:{filed:'2024-04-25',form:'10-Q',accn:'R-24-2'},QB:{filed:'2024-07-25',form:'10-Q',accn:'R-24-3'},KA:{filed:'2024-08-01',form:'10-K/A',accn:'R-24-4'},QC:{filed:'2024-10-24',form:'10-Q',accn:'R-24-5'},K24:{filed:'2025-02-14',form:'10-K',accn:'R-25-1'}};
const P={FY23:{start:'2023-01-01',end:'2023-12-31'},FY24:{start:'2024-01-01',end:'2024-12-31'},Q1a:{start:'2023-01-01',end:'2023-03-31'},Q2a:{start:'2023-04-01',end:'2023-06-30'},Q3a:{start:'2023-07-01',end:'2023-09-30'},Q4a:{start:'2023-10-01',end:'2023-12-31'},Q1:{start:'2024-01-01',end:'2024-03-31'},Q2:{start:'2024-04-01',end:'2024-06-30'},Q3:{start:'2024-07-01',end:'2024-09-30'},H1a:{start:'2023-01-01',end:'2023-06-30'},H1:{start:'2024-01-01',end:'2024-06-30'},N9a:{start:'2023-01-01',end:'2023-09-30'},N9:{start:'2024-01-01',end:'2024-09-30'}};
const r=(p:{start:string;end:string},val:number,f:object)=>({...p,val,...f}),i=(end:string,val:number,f:object)=>({end,val,...f});
function reviewRaw(entityName='Review Synthetic Co (SYNTHETIC)'){
 return {cik:4242,entityName,facts:{'us-gaap':{
  Revenues:{units:{USD:[r(P.FY23,1000,F.K23),r(P.FY23,1050,F.KA),r(P.FY23,1050,F.K24),r(P.FY24,1300,F.K24),
   r(P.Q1,300,F.QA),r(P.Q1a,220,F.QA),r(P.Q2,310,F.QB),r(P.H1,610,F.QB),r(P.Q2a,240,F.QB),r(P.H1a,460,F.QB),
   r(P.Q3,330,F.QC),r(P.N9,940,F.QC),r(P.Q3a,260,F.QC),r(P.N9a,720,F.QC)]}},
  NetIncomeLoss:{units:{USD:[r(P.FY23,100,F.K23),r(P.FY23,100,F.KA),r(P.Q4a,25,F.K23),
   r(P.Q1,30,F.QA),r(P.Q1a,20,F.QA),r(P.Q2,35,F.QB),r(P.H1,65,F.QB),r(P.Q2a,22,F.QB),r(P.H1a,42,F.QB),
   r(P.Q3,40,F.QC),r(P.N9,105,F.QC),r(P.Q3a,28,F.QC),r(P.N9a,70,F.QC)]}},
  GrossProfit:{units:{USD:[r(P.FY23,400,F.K23)]}},
  OperatingIncomeLoss:{units:{USD:[r({start:'2022-12-31',end:'2023-12-31'},150,F.K23)]}},
  EarningsPerShareDiluted:{units:{'USD/shares':[r(P.FY23,2.5,F.K23)],'EUR/shares':[r(P.FY24,3.1,F.K24)]}},
  WeightedAverageNumberOfDilutedSharesOutstanding:{units:{shares:[r(P.FY23,40,F.K23)]}},
  CashAndCashEquivalentsAtCarryingValue:{units:{EUR:[i('2023-12-31',70,F.K23)]}},
  AssetsCurrent:{units:{USD:[i('2023-12-31',600,F.K23),i('2024-03-31',610,F.QA),i('2024-06-30',620,F.QB),i('2024-09-30',630,F.QC)]}},
  LiabilitiesCurrent:{units:{USD:[i('2023-12-31',400,F.K23),i('2024-06-30',-5,F.QB),i('2024-09-30',0,F.QC)]}},
  Liabilities:{units:{USD:[i('2023-12-31',900,F.K23)]}},
  StockholdersEquity:{units:{USD:[i('2023-12-31',-300,F.K23)]}},
  NetCashProvidedByUsedInOperatingActivities:{units:{USD:[r(P.FY23,300,F.K23),r(P.N9,250,F.QC),r(P.N9a,200,F.QC)]}},
  PaymentsToAcquirePropertyPlantAndEquipment:{units:{USD:[r(P.FY23,120,F.K23),r(P.N9,90,F.QC),r(P.N9a,80,F.QC)]}},
 }}};
}
const facts=normalizeCompanyFacts(reviewRaw());
const opts=(patch:Partial<StatementOptions>={}):StatementOptions=>({statement:'income',basis:'FY',currency:'USD',asOf:'2024-12-31',revisions:'latest',columns:20,...patch});
const cellOf=(t:StatementTable,id:string,end:string)=>{const c=t.columns.indexOf(end);if(c<0)throw Error('No column '+end+' in ['+t.columns.join(',')+']');return t.rows.find(row=>row.id===id)!.cells[c];};
const one=(id:string,end:string,patch:Partial<StatementOptions>={})=>statementCells(facts,opts(patch),[id],end)[id];

describe('annual lines, amendment and point-in-time cutoff',()=>{
 it('FY columns and values at a 2024-12-31 cutoff (FY24 10-K filed 2025-02-14 is excluded)',()=>{
  const t=buildStatement(facts,opts());
  expect(t.columns).toEqual(['2023-12-31']);
  expect(cellOf(t,'revenue','2023-12-31')).toMatchObject({value:1050,form:'10-K/A',filed:'2024-08-01',accession:'R-24-4',start:'2023-01-01'});
  // Duplicate FY23 net income (100 in K23 and KA): same value, latest filing wins, no conflict.
  expect(cellOf(t,'net_income','2023-12-31')).toMatchObject({value:100,refused:false,form:'10-K/A'});
 });
 it('amendment cutoff: one day before the 10-K/A shows 1000, the filing day itself shows 1050',()=>{
  expect(one('revenue','2023-12-31',{asOf:'2024-07-31'})).toMatchObject({value:1000,form:'10-K',filed:'2024-02-15'});
  expect(one('revenue','2023-12-31',{asOf:'2024-08-01'})).toMatchObject({value:1050,form:'10-K/A'});
  // Before the original 10-K nothing for FY23 exists.
  expect(one('revenue','2023-12-31',{asOf:'2024-02-14'}).value).toBeNull();
  // As first reported is the original 1000 even with every later filing visible.
  expect(one('revenue','2023-12-31',{asOf:null,revisions:'original'}).value).toBe(1000);
 });
 it('duplicate fact in a later 10-K: latest provenance is that 10-K, value unchanged',()=>{
  const t=buildStatement(facts,opts({asOf:null}));
  expect(t.columns).toEqual(['2024-12-31','2023-12-31']);
  expect(cellOf(t,'revenue','2023-12-31')).toMatchObject({value:1050,filed:'2025-02-14',accession:'R-25-1'});
  expect(cellOf(t,'revenue','2024-12-31').value).toBe(1300);
  expect(cellOf(t,'net_income','2024-12-31')).toMatchObject({value:null,reason:'Not reported for the period ending 2024-12-31.'});
 });
 it('per-share unit mismatch is refused, not converted; share counts keep their own unit',()=>{
  const t=buildStatement(facts,opts({asOf:null}));
  expect(cellOf(t,'eps_diluted','2024-12-31')).toMatchObject({value:null,reason:'Reported only in EUR/shares, not USD/shares. OpenCandle does not convert units or currencies.'});
  expect(cellOf(t,'eps_diluted','2023-12-31')).toMatchObject({value:2.5,unit:'USD/shares'});
  expect(cellOf(t,'shares_diluted','2023-12-31')).toMatchObject({value:40,unit:'shares'});
  expect(statementCurrencies(facts,null)).toEqual(['USD','EUR']);
  const bal=buildStatement(facts,opts({statement:'balance'}));
  expect(cellOf(bal,'cash','2023-12-31').reason).toBe('Reported only in EUR, not USD. OpenCandle does not convert units or currencies.');
 });
});

describe('quarterly and TTM',()=>{
 it('FQ uses only reported quarters; the fiscal Q4 revenue (only FY reported) is unavailable, never FY - 9M',()=>{
  const t=buildStatement(facts,opts({basis:'FQ'}));
  expect(t.columns).toEqual(['2024-09-30','2024-06-30','2024-03-31','2023-12-31','2023-09-30','2023-06-30','2023-03-31']);
  expect(t.rows.find(row=>row.id==='revenue')!.cells.map(c=>c.value)).toEqual([330,310,300,null,260,240,220]);
  expect(cellOf(t,'revenue','2023-12-31').reason).toContain('OpenCandle does not subtract year-to-date totals');
  expect(cellOf(t,'net_income','2023-12-31').value).toBe(25);
 });
 it('TTM revenue without a reported Q4 = FY + YTD - prior YTD (no four contiguous quarters exist)',()=>{
  const t=buildStatement(facts,opts({basis:'TTM'}));
  // 1050 + 940 - 720 = 1270; 1050 + 610 - 460 = 1200; 1050 + 300 - 220 = 1130; FY23 reported 1050.
  expect(cellOf(t,'revenue','2024-09-30')).toMatchObject({value:1270,method:'annual-plus-ytd',start:'2023-10-01'});
  expect(cellOf(t,'revenue','2024-06-30')).toMatchObject({value:1200,start:'2023-07-01'});
  expect(cellOf(t,'revenue','2024-03-31')).toMatchObject({value:1130,start:'2023-04-01'});
  expect(cellOf(t,'revenue','2023-12-31')).toMatchObject({value:1050,method:'reported-annual'});
  expect(cellOf(t,'revenue','2024-09-30').inputs.map(x=>[x.sign,x.value])).toEqual([[1,1050],[1,940],[-1,720]]);
 });
 it('TTM net income uses four contiguous reported quarters when Q4 is reported',()=>{
  const t=buildStatement(facts,opts({basis:'TTM'}));
  // 25 + 30 + 35 + 40 = 130; 28 + 25 + 30 + 35 = 118; 22 + 28 + 25 + 30 = 105.
  expect(cellOf(t,'net_income','2024-09-30')).toMatchObject({value:130,method:'four-quarters',start:'2023-10-01'});
  expect(cellOf(t,'net_income','2024-06-30')).toMatchObject({value:118,method:'four-quarters',start:'2023-07-01'});
  expect(cellOf(t,'net_income','2024-03-31')).toMatchObject({value:105,method:'four-quarters'});
  // TTM net margin = 130 / 1270 * 100 = 10.2362204724...
  expect(one('net_margin','2024-09-30',{basis:'TTM'}).value).toBeCloseTo(10.236220472440944,10);
 });
 it('point-in-time TTM: before Q3\'23 comparatives are filed, four quarters are incomplete and FY+YTD is used',()=>{
  // Cutoff 2024-07-31: Q3'23 (filed 2024-10-24) unavailable; NI = 100 + 65 - 42 = 123; revenue = 1000 + 610 - 460 = 1150.
  expect(one('net_income','2024-06-30',{basis:'TTM',asOf:'2024-07-31'})).toMatchObject({value:123,method:'annual-plus-ytd'});
  expect(one('revenue','2024-06-30',{basis:'TTM',asOf:'2024-07-31'}).value).toBe(1150);
  // On the 10-K/A day revenue becomes 1050 + 610 - 460 = 1200.
  expect(one('revenue','2024-06-30',{basis:'TTM',asOf:'2024-08-01'}).value).toBe(1200);
 });
 it('TTM at FY24 end with no FY24 net income and no Q4 is unavailable, not a sum of three quarters',()=>{
  const c=one('net_income','2024-12-31',{basis:'TTM',asOf:null});
  expect(c.value).toBeNull();expect(c.reason).toContain('No reported twelve-month period, four contiguous reported quarters');
 });
 it('non-contiguous quarters (one-day gap) do not form a TTM',()=>{
  const f=normalizeCompanyFacts({cik:7,entityName:'Gap (SYNTHETIC)',facts:{'us-gaap':{NetIncomeLoss:{units:{USD:[
   {start:'2024-01-01',end:'2024-03-31',val:1,filed:'2025-01-01'},{start:'2024-04-01',end:'2024-06-30',val:2,filed:'2025-01-01'},
   {start:'2024-07-02',end:'2024-09-30',val:3,filed:'2025-01-01'},{start:'2024-10-01',end:'2024-12-31',val:4,filed:'2025-01-01'}]}}}}});
  expect(statementCells(f,opts({basis:'TTM',asOf:null}),['net_income'],'2024-12-31').net_income.value).toBeNull();
 });
});

describe('derived metrics and denominators',()=>{
 it('FY23 margins, FCF, current ratio and liabilities/equity',()=>{
  const t=buildStatement(facts,opts({statement:'statistics'}));
  // 400/1050*100 = 38.0952380952; 100/1050*100 = 9.5238095238; FCF 300-120 = 180; 180/1050*100 = 17.1428571429
  expect(cellOf(t,'gross_margin','2023-12-31').value).toBeCloseTo(38.095238095238095,10);
  expect(cellOf(t,'net_margin','2023-12-31').value).toBeCloseTo(9.523809523809524,10);
  expect(cellOf(t,'free_cash_flow','2023-12-31').value).toBe(180);
  expect(cellOf(t,'fcf_margin','2023-12-31').value).toBeCloseTo(17.142857142857142,10);
  expect(cellOf(t,'current_ratio','2023-12-31').value).toBe(1.5);
  expect(cellOf(t,'liabilities_to_equity','2023-12-31').value).toBe(-3);
  // Operating income covers 2022-12-31..2023-12-31 (366 d): different period, refused.
  expect(cellOf(t,'operating_margin','2023-12-31').reason).toBe('Inputs cover different periods (2022-12-31 to 2023-12-31 versus 2023-01-01 to 2023-12-31). OpenCandle does not combine them.');
  // Same metric at the amendment-eve cutoff: 100/1000*100 = 10 exactly.
  expect(one('net_margin','2023-12-31',{asOf:'2024-07-31'}).value).toBe(10);
 });
 it('current ratio: missing, negative and zero denominators are empty with reasons',()=>{
  const q=buildStatement(facts,opts({statement:'statistics',basis:'FQ'}));
  expect(cellOf(q,'current_ratio','2024-03-31').reason).toBe('Denominator Total current liabilities is unavailable: No instant value is reported at 2024-03-31.');
  expect(cellOf(q,'current_ratio','2024-06-30').reason).toBe('Denominator Total current liabilities is negative; the reference definition leaves this result empty.');
  expect(cellOf(q,'current_ratio','2024-09-30').reason).toBe('Denominator Total current liabilities is zero for this period.');
  // Quarterly net margin 30/300*100 = 10; at fiscal Q4 the revenue denominator is missing.
  expect(cellOf(q,'net_margin','2024-03-31').value).toBe(10);
  expect(cellOf(q,'net_margin','2023-12-31')).toMatchObject({value:null});
  expect(cellOf(q,'net_margin','2023-12-31').reason).toMatch(/^Denominator Total revenue is unavailable/);
 });
 it('TTM cash flow: OCF 300+250-200 = 350, capex 120+90-80 = 130, FCF 220, FCF margin 220/1270',()=>{
  const t=buildStatement(facts,opts({statement:'statistics',basis:'TTM'}));
  expect(cellOf(t,'free_cash_flow','2024-09-30').value).toBe(220);
  expect(cellOf(t,'fcf_margin','2024-09-30').value).toBeCloseTo(17.322834645669293,10);
 });
});

describe('CSV export',()=>{
 it('neutralises formula-like text but leaves numeric negatives as numbers, with RFC quoting',()=>{
  for(const lead of ['=','+','-','@','\t','\r'])expect(csvCell(lead+'1')).toBe('"\''+lead+'1"');
  expect(csvCell(-50)).toBe('"-50"');expect(csvCell(-0.25)).toBe('"-0.25"');expect(csvCell(0)).toBe('"0"');
  expect(csvCell('a "b"\nc')).toBe('"a ""b""\nc"');
  const rows=statementExportRows(buildStatement(facts,opts({statement:'statistics'})));
  const le=rows.find(row=>row[0]==='liabilities_to_equity'&&row[3]==='2023-12-31')!;
  expect(le[4]).toBe(-3);expect(typeof le[4]).toBe('number');
  // Unavailable is an empty cell, never 0.
  expect(rows.find(row=>row[0]==='operating_margin'&&row[3]==='2023-12-31')![4]).toBe('');
 });
 it('dialog statement export escapes a hostile entity name and keeps -3 numeric',async()=>{
  const hostile:FactsDocument={id:'local-facts:hostile',facts:normalizeCompanyFacts(reviewRaw('=HYPERLINK("http://x","y")')),source:{kind:'local-import',label:'-cmd label',retrievedAt:'2026-10-15T00:00:00Z',sourceUrl:null,sha256:null}};
  const exportData=vi.fn(async(_:any)=>({ok:true,value:null}));vi.stubGlobal('window',{lv:{exportData,cancelSecRequest:vi.fn()}});
  const props:any={symbol:'X',documents:[hostile],onChange:vi.fn(()=>true),onClose:vi.fn(),now:()=>new Date('2024-12-31T12:00:00Z')};
  const render=()=>{hooks.cursor=0;return FundamentalsDialog(props);};
  const find=(tree:any,match:(n:any)=>boolean):any=>{if(Array.isArray(tree)){for(const c of tree){const f=find(c,match);if(f)return f;}return null;}if(!tree?.props)return null;if(match(tree))return tree;return find(tree.props.children,match);};
  const text=(n:any):string=>typeof n==='string'||typeof n==='number'?String(n):Array.isArray(n)?n.map(text).join(''):n?.props?text(n.props.children):'';
  const button=(label:string)=>find(render(),n=>n.type==='button'&&text(n.props.children)===label);
  button('Statistics').props.onClick();await button('Export statement CSV').props.onClick();await new Promise(res=>setTimeout(res,0));
  const csv:string=exportData.mock.calls[0][0].text;
  expect(csv).toContain('"\'=HYPERLINK(""http://x"",""y"")"');
  expect(csv).not.toMatch(/(^|,)"=HYPERLINK/m);
  expect(csv).toContain('"liabilities_to_equity","Total liabilities to equity","","2023-12-31","-3","x","derived"');
  expect(csv).not.toContain('"\'-3"');
 });
});

describe('C03 summary contract',()=>{
 const real={exchange:'NYSE',symbol:'REVW',synthetic:false},demo={exchange:'LV',symbol:'REVW',synthetic:true};
 const doc:FactsDocument={id:'local-facts:review',facts,source:{kind:'local-import',label:'User-supplied companyfacts JSON; source unverified',retrievedAt:'2026-10-15T00:00:00Z',sourceUrl:null,sha256:null}};
 const base=(patch:Partial<SummaryInput>={}):SummaryInput=>({market:real,documents:[doc],links:setFundamentalsLink(createFundamentalsPreferences(),real,doc.id).links,asOf:'2024-12-31',...patch});
 const ok=(s:any,m=s.market)=>{const res=checkFundamentalsSummary(s,m);if(!res.ok)throw Error(res.reason);return res.summary;};
 const f=(s:any,id:string)=>s.fields.find((x:any)=>x.id===id);
 it('FY summary at the cutoff: latest filed FY is FY23 with the 10-K/A revenue',()=>{
  const s=ok(buildSymbolFundamentalsSummary(base()));
  expect(s.availability).toBe('available');expect(s.fields.map(x=>x.id)).toEqual([...SUMMARY_FIELDS]);
  expect(f(s,'revenue')).toMatchObject({value:1050,form:'10-K/A',period:{start:'2023-01-01',end:'2023-12-31'}});
  expect(f(s,'net_margin').value).toBeCloseTo(9.523809523809524,10);
  expect(f(s,'free_cash_flow').value).toBe(180);expect(f(s,'total_equity').value).toBe(-300);
  expect(f(s,'total_assets')).toMatchObject({value:null});expect(f(s,'total_assets').missingReason).toBeTruthy();
  for(const id of ['market_cap','free_float','eps_estimates','price_earnings'])expect(f(s,id)).toBeUndefined();
 });
 it('no cutoff picks FY24 and keeps missing net income null with a reason',()=>{
  const s=ok(buildSymbolFundamentalsSummary(base({asOf:null})));
  expect(f(s,'revenue').value).toBe(1300);expect(f(s,'net_income')).toMatchObject({value:null});expect(f(s,'net_margin').value).toBeNull();
 });
 it('TTM summary at 2024-09-30: revenue 1270, net income 130, FCF 220',()=>{
  const s=ok(buildSymbolFundamentalsSummary(base({basis:'TTM'})));
  expect(f(s,'revenue').value).toBe(1270);expect(f(s,'net_income').value).toBe(130);expect(f(s,'free_cash_flow').value).toBe(220);
 });
 it('non-available states carry no fields and pass the checker; links are exact identities only',()=>{
  const states=[
   buildSymbolFundamentalsSummary(base({market:{exchange:'NASDAQ',symbol:'REVW',synthetic:false}})),
   buildSymbolFundamentalsSummary(base({market:demo,links:setFundamentalsLink(createFundamentalsPreferences(),demo,doc.id).links})),
   buildSymbolFundamentalsSummary(base({market:demo,links:[]})),
   buildSymbolFundamentalsSummary(base({assetClass:'ETF'})),
   buildSymbolFundamentalsSummary(base({documents:[]})),
   buildSymbolFundamentalsSummary(base({asOf:'2024-13-01'})),
   buildSymbolFundamentalsSummary(base({asOf:'2023-01-01'})),
  ];
  expect(states.map(s=>s.availability)).toEqual(['not-loaded','unavailable','not-applicable','not-applicable','unavailable','error','unavailable']);
  for(const s of states){expect(s.fields).toEqual([]);ok(s);}
  // Real data linked to a SYNTHETIC symbol never shows values.
  expect(states[1].reason).toContain('real filing data');
 });
 it('memo returns the identical object for identical inputs and a new one for a new document list',()=>{
  const memo=createSummaryMemo(),input=base();
  expect(memo(input)).toBe(memo({...input}));expect(memo({...input,documents:[doc]})).not.toBe(memo(input));
 });
});

describe('saved state, staleness and cancel',()=>{
 it('an old saved document round-trips through restore and still builds statements',()=>{
  const saved=JSON.parse(JSON.stringify({id:'local-facts:old',facts,source:{kind:'local-import',label:'old',retrievedAt:'2026-10-14T00:00:00Z',sourceUrl:null,sha256:null}}));
  const restored=restoreFactsDocument(saved);
  expect(cellOf(buildStatement(restored.facts,opts()),'revenue','2023-12-31').value).toBe(1050);
  const prefs=createFundamentalsPreferences();expect(restoreFundamentalsPreferences(JSON.parse(JSON.stringify(prefs)))).toEqual(prefs);
  expect(()=>restoreFundamentalsPreferences({...prefs,extra:1})).toThrow();
 });
 it('dialog without saved preferences opens with defaults; removing data during a fetch ignores the late result',async()=>{
  let resolve!:(v:any)=>void;const pending=new Promise(res=>{resolve=res;});
  const fetch=vi.fn(()=>pending),cancel=vi.fn();vi.stubGlobal('window',{lv:{fetchSecCompanyFacts:fetch,cancelSecRequest:cancel}});
  const doc:FactsDocument={id:'local-facts:a',facts,source:{kind:'local-import',label:'a',retrievedAt:'2026-10-15T00:00:00Z',sourceUrl:null,sha256:null}};
  const props:any={symbol:'X',documents:[doc],onChange:vi.fn(()=>true),onClose:vi.fn(),now:()=>new Date('2024-12-31T12:00:00Z')};
  const render=()=>{hooks.cursor=0;return FundamentalsDialog(props);};
  const find=(tree:any,match:(n:any)=>boolean):any=>{if(Array.isArray(tree)){for(const c of tree){const f=find(c,match);if(f)return f;}return null;}if(!tree?.props)return null;if(match(tree))return tree;return find(tree.props.children,match);};
  const text=(n:any):string=>typeof n==='string'||typeof n==='number'?String(n):Array.isArray(n)?n.map(text).join(''):n?.props?text(n.props.children):'';
  expect(text(render())).toContain('FY ending 2023-12-31');
  find(render(),n=>n.props['aria-label']==='SEC company CIK').props.onChange({target:{value:'4242'}});
  find(render(),n=>n.type==='button'&&n.props['aria-label']==='Fetch public SEC facts').props.onClick();
  find(render(),n=>n.type==='button'&&text(n.props.children)==='Remove saved data').props.onClick();
  expect(cancel).toHaveBeenCalledTimes(1);expect(props.onChange).toHaveBeenCalledWith([]);
  resolve({ok:true,value:{cik:'0000004242',data:reviewRaw(),provenance:{retrievedAt:'2026-10-15T00:00:00Z',sourceUrl:'https://data.sec.gov/api/xbrl/companyfacts/CIK0000004242.json',sha256:'b'.repeat(64)}}});
  await new Promise(res=>setTimeout(res,0));
  expect(props.onChange).toHaveBeenCalledTimes(1);
 });
 // REVIEW FINDING M-1 (fixed in the second round): App.commitDialogField THROWS on a closed/replaced
 // dialog or stale key. persist() must treat a throw as not saved, keep the draft and report it.
 it('a throwing preferences callback is reported, not thrown out of the handler',()=>{
  const doc:FactsDocument={id:'local-facts:c',facts,source:{kind:'local-import',label:'c',retrievedAt:'2026-10-15T00:00:00Z',sourceUrl:null,sha256:null}};
  const props:any={symbol:'X',documents:[doc],onChange:vi.fn(()=>true),onClose:vi.fn(),preferences:createFundamentalsPreferences(),onPreferencesChange:()=>{throw new Error('This chart dialog was closed or replaced.');},now:()=>new Date('2024-12-31T12:00:00Z')};
  const render=()=>{hooks.cursor=0;return FundamentalsDialog(props);};
  const find=(tree:any,match:(n:any)=>boolean):any=>{if(Array.isArray(tree)){for(const c of tree){const f=find(c,match);if(f)return f;}return null;}if(!tree?.props)return null;if(match(tree))return tree;return find(tree.props.children,match);};
  const text=(n:any):string=>typeof n==='string'||typeof n==='number'?String(n):Array.isArray(n)?n.map(text).join(''):n?.props?text(n.props.children):'';
  expect(()=>find(render(),n=>n.props['aria-label']==='Statement scale').props.onChange({target:{value:'units'}})).not.toThrow();
  expect(text(find(render(),n=>n.props.role==='alert'))).toContain('closed or replaced');
  expect(text(find(render(),n=>n.props.role==='alert'))).toContain('not saved');
  // Draft kept: the local view shows the change.
  expect(find(render(),n=>n.props['aria-label']==='Statement scale').props.value).toBe('units');
 });
 it('a saved currency the document lacks falls back visibly instead of showing nothing',()=>{
  const preferences={...createFundamentalsPreferences(),view:{...createFundamentalsView(),currency:'JPY'}};
  const doc:FactsDocument={id:'local-facts:b',facts,source:{kind:'local-import',label:'b',retrievedAt:'2026-10-15T00:00:00Z',sourceUrl:null,sha256:null}};
  const props:any={symbol:'X',documents:[doc],onChange:vi.fn(()=>true),onClose:vi.fn(),preferences,onPreferencesChange:vi.fn(()=>true),now:()=>new Date('2024-12-31T12:00:00Z')};
  hooks.cursor=0;const tree=FundamentalsDialog(props);
  const text=(n:any):string=>typeof n==='string'||typeof n==='number'?String(n):Array.isArray(n)?n.map(text).join(''):n?.props?text(n.props.children):'';
  expect(text(tree)).toContain('JPY is not reported on this company\'s statement tags; showing USD.');
 });
});

describe('re-review of second-round fixes (hand-computed)',()=>{
 // Same dataset minus the Q4'23 net income: no standalone Q4 flow anywhere.
 const noQ4=()=>{const raw=reviewRaw();raw.facts['us-gaap'].NetIncomeLoss.units.USD=raw.facts['us-gaap'].NetIncomeLoss.units.USD.filter((row:any)=>row.start!=='2023-10-01');return normalizeCompanyFacts(raw);};
 it('L-2: quarterly Statistics includes the fiscal-year end; instants ratios compute, flow ratios stay unavailable',()=>{
  const t=buildStatement(noQ4(),opts({statement:'statistics',basis:'FQ'}));
  expect(t.columns).toContain('2023-12-31');
  // 600 / 400 = 1.5 and 900 / -300 = -3 from the FY23 10-K instants.
  expect(cellOf(t,'current_ratio','2023-12-31').value).toBe(1.5);
  expect(cellOf(t,'liabilities_to_equity','2023-12-31').value).toBe(-3);
  for(const id of ['net_margin','gross_margin','free_cash_flow']){const c=cellOf(t,id,'2023-12-31');expect(c.value).toBeNull();expect(c.reason).toContain('not a standalone quarter');}
  // Quarter columns are unchanged: 30 / 300 * 100 = 10.
  expect(cellOf(t,'net_margin','2024-03-31').value).toBe(10);
 });
 it('negative revenue: margins unavailable, FCF and liabilities/equity still compute',()=>{
  const f=normalizeCompanyFacts({cik:11,entityName:'Neg (SYNTHETIC)',facts:{'us-gaap':{Revenues:{units:{USD:[{start:'2023-01-01',end:'2023-12-31',val:-100,filed:'2024-02-01'}]}},NetIncomeLoss:{units:{USD:[{start:'2023-01-01',end:'2023-12-31',val:10,filed:'2024-02-01'}]}},NetCashProvidedByUsedInOperatingActivities:{units:{USD:[{start:'2023-01-01',end:'2023-12-31',val:5,filed:'2024-02-01'}]}},PaymentsToAcquirePropertyPlantAndEquipment:{units:{USD:[{start:'2023-01-01',end:'2023-12-31',val:8,filed:'2024-02-01'}]}}}}});
  const c=statementCells(f,opts({asOf:null}),['net_margin','fcf_margin','free_cash_flow'],'2023-12-31');
  expect(c.net_margin.value).toBeNull();expect(c.net_margin.reason).toContain('negative');
  expect(c.fcf_margin.value).toBeNull();
  expect(c.free_cash_flow.value).toBe(-3);   // 5 - 8
 });
 it('same-day identical values: the smallest accession is shown regardless of input order',()=>{
  const mk=(order:number[])=>{const rows=[{accn:'0000000001-24-000009'},{accn:'0000000001-24-000002'},{}].map(x=>({start:'2023-01-01',end:'2023-12-31',val:50,filed:'2024-02-01',...x}));return normalizeCompanyFacts({cik:12,entityName:'Acc (SYNTHETIC)',facts:{'us-gaap':{Revenues:{units:{USD:order.map(i=>rows[i])}}}}});};
  for(const order of [[0,1,2],[2,1,0],[1,2,0]])expect(statementCells(mk(order),opts({asOf:null}),['revenue'],'2023-12-31').revenue).toMatchObject({value:50,accession:'0000000001-24-000002'});
 });
 it('memo: LRU evicts one entry at a time and a hit refreshes recency',()=>{
  const docs:FactsDocument[]=[{id:'d',facts,source:{kind:'local-import',label:'d',retrievedAt:'2026-10-15T00:00:00Z',sourceUrl:null,sha256:null}}];
  const memo=createSummaryMemo(2),inp=(asOf:string):SummaryInput=>({market:{exchange:'X',symbol:'Y',synthetic:false},documents:docs,links:[],asOf});
  const a=memo(inp('2024-01-01')),b=memo(inp('2024-01-02'));
  expect(memo(inp('2024-01-01'))).toBe(a);      // a now most recent
  memo(inp('2024-01-03'));                       // evicts b only
  expect(memo(inp('2024-01-01'))).toBe(a);
  expect(memo(inp('2024-01-02'))).not.toBe(b);
 });
 it('L-3: the export control states how many periods it exports',()=>{
  const doc:FactsDocument={id:'local-facts:e',facts,source:{kind:'local-import',label:'e',retrievedAt:'2026-10-15T00:00:00Z',sourceUrl:null,sha256:null}};
  const props:any={symbol:'X',documents:[doc],onChange:vi.fn(()=>true),onClose:vi.fn(),preferences:{...createFundamentalsPreferences(),view:{...createFundamentalsView(),tab:'statistics',basis:'FQ',columns:4}},onPreferencesChange:vi.fn(()=>true),now:()=>new Date('2024-12-31T12:00:00Z')};
  hooks.cursor=0;const tree=FundamentalsDialog(props);
  const text=(n:any):string=>typeof n==='string'||typeof n==='number'?String(n):Array.isArray(n)?n.map(text).join(''):n?.props?text(n.props.children):'';
  // FQ statistics at 2024-12-31 has 7 kept periods (2024-09-30 .. 2023-03-31); 4 are shown.
  expect(text(tree)).toContain('Exports the 4 periods shown of 7; raise Periods to include more.');
 });
});
