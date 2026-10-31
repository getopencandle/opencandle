import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {FundamentalsDialog} from '../../src/ui/FundamentalsDialog';
import {normalizeCompanyFacts,type FactsDocument} from '../../src/fundamentals/company-facts';
import {createFundamentalsPreferences,createFundamentalsView,setFundamentalsLink,type FundamentalsPreferences} from '../../src/fundamentals/preferences';
import {syntheticStatementFacts,syntheticSource} from './fixtures/synthetic-statements';
// Actual component handlers with controlled React hook state. No DOM rendering, focus, native
// dialog, IPC or packaged-app evidence. SYNTHETIC facts only; the SEC bridge is a stub.
const hooks=vi.hoisted(()=>({cells:[] as any[],cursor:0}));
vi.mock('react',async()=>{const actual=await vi.importActual<any>('react');return {...actual,useState:(initial:any)=>{const i=hooks.cursor++;if(!(i in hooks.cells))hooks.cells[i]=typeof initial==='function'?initial():initial;return [hooks.cells[i],(next:any)=>{hooks.cells[i]=typeof next==='function'?next(hooks.cells[i]):next;}];},useRef:(initial:any)=>{const i=hooks.cursor++;if(!(i in hooks.cells))hooks.cells[i]={current:initial};return hooks.cells[i];},useEffect:()=>{hooks.cursor++;},useMemo:(fn:()=>any)=>fn()};});
const text=(node:any):string=>typeof node==='string'||typeof node==='number'?String(node):Array.isArray(node)?node.map(text).join(''):node?.props?text(node.props.children):'';
function find(tree:any,match:(node:any)=>boolean):any{if(Array.isArray(tree)){for(const child of tree){const found=find(child,match);if(found)return found;}return null;}if(!tree?.props)return null;if(match(tree))return tree;return find(tree.props.children,match);}
const raw=syntheticStatementFacts(),facts=normalizeCompanyFacts(raw);
const fixture:FactsDocument={id:'synthetic-facts:statements',facts,source:syntheticSource};
const local:FactsDocument={id:'local-facts:statements',facts,source:{kind:'local-import',label:'User-supplied companyfacts JSON; source unverified',retrievedAt:'2026-10-15T00:00:00Z',sourceUrl:null,sha256:null}};
const market={exchange:'NYSE',symbol:'SYNTHCO',synthetic:false};
function mount(patch:Record<string,unknown>={}){
 const props:any={symbol:'GME',documents:[local],onChange:vi.fn(()=>true),onClose:vi.fn(),now:()=>new Date('2024-12-31T12:00:00Z'),...patch};
 // asyncParent: the parent accepts but re-renders later, so the dialog keeps rendering the old prop.
 if(props.preferences){const user=props.onPreferencesChange,later=props.asyncParent;props.onPreferencesChange=vi.fn((next:FundamentalsPreferences)=>{const result=user?user(next):true;if(result!==false&&!later)props.preferences=next;return result;});}
 const render=()=>{hooks.cursor=0;return FundamentalsDialog(props);};
 const node=(label:string)=>{const found=find(render(),n=>n.props['aria-label']===label||n.type==='button'&&text(n.props.children)===label);if(!found)throw Error('Missing control '+label);return found;};
 return {props,render,node,all:()=>text(render()),click:(label:string)=>node(label).props.onClick(),change:(label:string,value:string)=>node(label).props.onChange({target:{value}}),error:()=>text(find(render(),n=>n.props.role==='alert'))};
}
const flush=()=>new Promise(resolve=>setTimeout(resolve,0));
beforeEach(()=>{hooks.cells=[];hooks.cursor=0;});afterEach(()=>vi.unstubAllGlobals());
describe('statement views',()=>{
 it('opens on the annual income statement with source, cutoff and the selected line provenance',()=>{
  const ui=mount(),all=ui.all();
  expect(all).toContain('FY ending 2024-01-31');expect(all).toContain('FY ending 2023-01-31');expect(all).not.toContain('2025-01-31');
  // Auto scale: largest monetary value 1020 -> thousands. 1020 / 1000 = 1.02K.
  expect(all).toContain('1.02K');expect(all).toContain('filing cutoff 2024-12-31');
  const detail=text(ui.node('Statement line detail'));
  expect(detail).toContain('Reported under us-gaap:RevenueFromContractWithCustomerExcludingAssessedTax');expect(detail).toContain('filed 2024-06-10');expect(detail).toContain('10-K/A');
  expect(detail).toContain('Reported under us-gaap:SalesRevenueNet');
 });
 it('applies the filing cutoff, period, scale and currency selectors to the table',()=>{
  const ui=mount();
  ui.change('Statement scale','units');expect(ui.all()).toContain('1,020');
  ui.change('Fundamentals filing cutoff','2024-06-09');expect(ui.all()).toContain('1,000');expect(ui.all()).not.toContain('1,020');
  ui.change('Fundamentals filing cutoff','');expect(ui.node('Filing cutoff mode').props.value).toBe('none');expect(ui.all()).toContain('1,200');
  ui.change('Filing cutoff mode','today');ui.change('Statement period','TTM');
  // TTM revenue to 2024-10-31 = 1020 + 900 - 740 = 1180.
  expect(ui.all()).toContain('TTM ending 2024-10-31');expect(ui.all()).toContain('1,180');
  ui.change('Statement period','FQ');expect(ui.all()).toContain('FQ ending 2024-07-31');
  ui.click('Balance sheet');ui.change('Statement currency','EUR');expect(ui.node('Statement currency').props.value).toBe('EUR');
  ui.change('Statement line','goodwill');expect(text(ui.node('Statement line detail'))).toContain('At 2024-01-31: 70 EUR');
  ui.change('Statement period','TTM');expect(ui.all()).toContain('point-in-time');
 });
 it('shows derived statistics with formulas, refusals and explicit unavailable metrics',()=>{
  const ui=mount();ui.click('Statistics');const all=ui.all();
  // Net margin = 100 / 1020 * 100 = 9.80%; current ratio = 500 / 250 = 2.00.
  expect(all).toContain('9.80%');
  ui.change('Statement line','current_ratio');expect(text(ui.node('Statement line detail'))).toContain('At 2024-01-31: 2.00 x');
  expect(all).toContain('Market capitalization: Needs point-in-time prices');expect(all).toContain('Free float: No float source');expect(all).toContain('EPS estimates: Consensus estimates are vendor data');expect(all).toContain('ETF AUM');
  ui.click('Inspect Operating margin %');const detail=text(ui.node('Statement line detail'));
  expect(detail).toContain('Formula: Operating income / Total revenue * 100');expect(detail).toContain('Inputs cover different periods');
  ui.change('Statement line','current_ratio');expect(text(ui.node('Statement line detail'))).toContain('Denominator Total current liabilities is zero for this period.');
 });
 it('keeps the existing reported-facts browser and shares the cutoff with it',()=>{
  const ui=mount();ui.change('Fundamentals filing cutoff','2024-06-09');ui.click('Reported facts');
  ui.change('Search fundamental fields','RevenueFromContract');
  expect(ui.node('Reported fundamental field').props.value).toBe('us-gaap:RevenueFromContractWithCustomerExcludingAssessedTax');
  ui.change('Fact period','annual-length');
  // As of 2024-06-09 only the original FY2023 10-K value (1000) exists; FY2024 and the 10-K/A are later.
  expect(ui.all()).toContain('1 results');expect(ui.all()).toContain('later filings excluded');
 });
});
describe('reset, persistence and symbol links',()=>{
 it('persists each view change and resets to the documented defaults',()=>{
  const ui=mount({preferences:createFundamentalsPreferences()});
  ui.change('Statement period','FQ');ui.change('Statement scale','millions');ui.click('Cash flow');
  expect(ui.props.onPreferencesChange.mock.calls.at(-1)[0].view).toMatchObject({tab:'cashflow',basis:'FQ',scale:'millions'});
  ui.click('Reset view');
  expect(ui.props.onPreferencesChange.mock.calls.at(-1)[0].view).toEqual(createFundamentalsView());
  expect(ui.node('Statement period').props.value).toBe('FY');
 });
 it('restores a saved view and reports, without hiding, a rejected save',()=>{
  const saved={...createFundamentalsPreferences(),view:{...createFundamentalsView(),tab:'statistics' as const,basis:'TTM' as const,scale:'units' as const}};
  const ui=mount({preferences:saved,onPreferencesChange:()=>false});
  expect(ui.all()).toContain('TTM ending 2024-10-31');
  ui.change('Statement scale','thousands');
  expect(ui.error()).toContain('not saved');expect(ui.node('Statement scale').props.value).toBe('thousands');
 });
 it('treats a throwing save callback (App commit guards) as not saved instead of failing silently',()=>{
  const ui=mount({preferences:createFundamentalsPreferences(),onPreferencesChange:()=>{throw new Error('This chart dialog was closed or replaced.');}});
  expect(()=>ui.change('Statement scale','millions')).not.toThrow();
  expect(ui.error()).toContain('This view is shown but was not saved');expect(ui.error()).toContain('closed or replaced');
  expect(ui.node('Statement scale').props.value).toBe('millions');
  hooks.cells=[];const linker=mount({market,preferences:createFundamentalsPreferences(),onPreferencesChange:()=>{throw new Error('This chart dialog was closed or replaced.');}});
  expect(()=>linker.click('Use for SYNTHCO')).not.toThrow();expect(linker.error()).toContain('closed or replaced');expect(linker.all()).toContain('Not linked to NYSE:SYNTHCO');
 });
 it('links a company to the exact chart market only on request, and refuses synthetic/real mixing',()=>{
  const ui=mount({market,preferences:createFundamentalsPreferences()});
  expect(ui.all()).toContain('Not linked to NYSE:SYNTHCO');
  ui.click('Use for SYNTHCO');
  expect(ui.props.preferences.links).toEqual([{...market,documentId:local.id}]);expect(ui.all()).toContain('Linked to NYSE:SYNTHCO');
  ui.click('Unlink from SYNTHCO');expect(ui.props.preferences.links).toEqual([]);
  hooks.cells=[];const mixed=mount({market,documents:[fixture],preferences:createFundamentalsPreferences()});
  expect(mixed.node('Use for SYNTHCO').props.disabled).toBe(true);expect(mixed.all()).toContain('Demo data cannot be linked to a real-market symbol.');
 });
 it('shows a saved link at once and never drops it on a later view save, even before the parent re-renders',()=>{
  const ui=mount({market,preferences:createFundamentalsPreferences(),asyncParent:true});
  ui.click('Use for SYNTHCO');expect(ui.all()).toContain('Linked to NYSE:SYNTHCO');
  ui.change('Statement scale','units');
  expect(ui.props.onPreferencesChange.mock.calls.at(-1)[0].links).toEqual([{...market,documentId:local.id}]);
 });
 it('opens on the document linked to the market and prunes its link after removal',()=>{
  const preferences=setFundamentalsLink(createFundamentalsPreferences(),market,local.id);
  const ui=mount({market,documents:[fixture,local],preferences});
  expect(ui.node('Fundamentals document').props.value).toBe(local.id);
  ui.click('Remove saved data');
  expect(ui.props.onChange).toHaveBeenCalledWith([fixture]);expect(ui.props.preferences.links).toEqual([]);
 });
});
describe('load failure, cancellation and stale results',()=>{
 const deferred=()=>{let resolve!:(value:any)=>void;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};
 const ok={ok:true,value:{cik:'0000009999',data:raw,provenance:{retrievedAt:'2026-10-15T00:00:00Z',sourceUrl:'https://data.sec.gov/api/xbrl/companyfacts/CIK0000009999.json',sha256:'a'.repeat(64)}}};
 it('shows a provider failure and keeps saved data unchanged',async()=>{
  vi.stubGlobal('window',{lv:{fetchSecCompanyFacts:vi.fn(async()=>({ok:false,error:{message:'SEC request was denied (403).'}})),cancelSecRequest:vi.fn()}});
  const ui=mount();ui.click('Fetch public SEC facts');await flush();
  expect(ui.error()).toContain('SEC request was denied (403).');expect(ui.props.onChange).not.toHaveBeenCalled();expect(ui.node('Fetch public SEC facts').props.disabled).toBe(false);
 });
 it('cancels an in-flight request and ignores its late result; a newer request still lands',async()=>{
  const first=deferred(),second=deferred(),fetch=vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise),cancel=vi.fn();
  vi.stubGlobal('window',{lv:{fetchSecCompanyFacts:fetch,cancelSecRequest:cancel}});
  const ui=mount({documents:[]});ui.change('SEC company CIK','9999');
  ui.click('Fetch public SEC facts');expect(ui.node('Cancel request')).toBeTruthy();
  const firstId=fetch.mock.calls[0][0].requestId;ui.click('Cancel request');
  expect(cancel).toHaveBeenCalledWith({requestId:firstId});
  ui.click('Fetch public SEC facts');second.resolve(ok);await flush();
  expect(ui.props.onChange).toHaveBeenCalledTimes(1);expect(ui.props.onChange.mock.calls[0][0][0]).toMatchObject({id:'sec:0000009999',source:{kind:'sec-public'}});
  first.resolve({...ok,value:{...ok.value,data:{...raw,entityName:'Stale late response'}}});await flush();
  expect(ui.props.onChange).toHaveBeenCalledTimes(1);expect(ui.error()).toBe('');
 });
 it('exports the statement with negative values as plain numbers',async()=>{
  const exportData=vi.fn(async(_:any)=>({ok:true,value:null}));vi.stubGlobal('window',{lv:{exportData,cancelSecRequest:vi.fn()}});
  const ui=mount();ui.click('Statistics');ui.click('Export statement CSV');await flush();
  const request=exportData.mock.calls[0][0],csv:string=request.text;
  // Liabilities to equity = 600 / -50 = -12, exported as "-12", never "'-12".
  expect(csv).toContain('"liabilities_to_equity","Total liabilities to equity","","2024-01-31","-12","x","derived"');expect(csv).not.toContain("'-");
  expect(request.suggestedName).toBe('OpenCandle-0000009999-statistics-FY.csv');
  // The export covers the periods shown, and the UI says so next to the action.
  expect(ui.all()).toContain('Exports the 2 periods shown.');
 });
 it('rejects a response whose company identity differs from the request',async()=>{
  vi.stubGlobal('window',{lv:{fetchSecCompanyFacts:vi.fn(async()=>({...ok,value:{...ok.value,cik:'0000001234'}})),cancelSecRequest:vi.fn()}});
  const ui=mount();ui.click('Fetch public SEC facts');await flush();
  expect(ui.error()).toContain('did not match');expect(ui.props.onChange).not.toHaveBeenCalled();
 });
});
describe('price-based ratios and graph tab',()=>{
 const close={close:10,date:'2024-12-30',currency:'USD',symbol:'SYNTH',source:'SYNTHETIC DEMO dataset'};
 it('computes P/E from the loaded close and keeps unmet ratios unavailable with their reason',()=>{
  const ui=mount({lastClose:close});ui.click('Statistics');const all=ui.all();
  // Reported twelve-month diluted EPS 1.25 -> 10 / 1.25 = 8x ; EPS yield = 1.25 / 10 * 100 = 12.5%.
  expect(all).toContain('Price to earnings ratio8x');expect(all).toContain('EPS yield %12.5%');
  expect(all).toContain('SYNTH close 10 on 2024-12-30');
  expect(all).toContain('Market capitalizationNot availableNo shares outstanding count');
  expect(all).not.toContain('Market capitalization: Needs point-in-time prices');// Enterprise value is now computed in the Metrics tab from the loaded close, and the list says where.
  expect(all).toContain('Enterprise value: Needs a price. The Metrics tab computes it from the last loaded close');
 });
 it('without a loaded close the legacy unavailable list is unchanged and no ratio is invented',()=>{
  const all=(()=>{const ui=mount();ui.click('Statistics');return ui.all();})();
  expect(all).toContain('Market capitalization: Needs point-in-time prices');expect(all).not.toContain('Price-based ratios');
 });
 it('offers a Graph tab that replaces the statement view and returns to it',()=>{
  const ui=mount();ui.click('Graph');expect(ui.node('Graph').props['aria-selected']).toBe(true);expect(ui.all()).not.toContain('7 lines');
  ui.click('Income statement');expect(ui.node('Graph').props['aria-selected']).toBe(false);expect(ui.all()).toContain('lines');
 });
});
