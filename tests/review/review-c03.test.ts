// Independent second review of symbol search and details. Model-level evidence only.
// Tests named "FINDING" pin the CURRENT behaviour behind a review finding, so they flip when fixed.
import {beforeEach,describe,expect,it,vi} from 'vitest';
import {buildSymbolSearchCandidates,createSymbolSearchSession,resolveSymbolEntry,searchSymbols,switchRequest,symbolEntryBlocked,symbolEntryFromKey,syntheticGenerationCandidate} from '../../src/ui/symbol-search';
import {SymbolSearchDialog,type SymbolSearchDialogProps} from '../../src/ui/SymbolSearchDialog';
import {checkFundamentalsSummary,formatFundamentalsPeriod,type SymbolFundamentalsSummary} from '../../src/ui/symbol-details-fundamentals';
import {patchWorkspace,selectedDataset,workspaceDatasets} from '../../src/ui/workspace-grid';
import {selectWorkspaceInterval} from '../../src/ui/workspace-intervals';
import {createInitialWorkspace} from '../../src/ui/workspace-state';
import {aggregateInterval,createIntervalMenuState} from '../../src/domain/intervals';
// The app's demo 1D source is now demoDailyDataset (3,900 bars); a test that stands in for it uses the same dataset, or saved source bases no longer match.
import {fixtureDataset,demoDailyDataset} from '../../src/domain/fixtures';
import type {BarDataset} from '../../src/domain/types';

const hooks=vi.hoisted(()=>({cells:[] as any[],cursor:0}));
vi.mock('react',async()=>{const actual=await vi.importActual<any>('react');return{...actual,useState:(initial:any)=>{const i=hooks.cursor++;if(!(i in hooks.cells))hooks.cells[i]=typeof initial==='function'?initial():initial;return[hooks.cells[i],(value:any)=>{hooks.cells[i]=typeof value==='function'?value(hooks.cells[i]):value;}];},useRef:(initial:any)=>{const i=hooks.cursor++;if(!(i in hooks.cells))hooks.cells[i]={current:initial};return hooks.cells[i];},useEffect:()=>{hooks.cursor++;}};});
beforeEach(()=>{hooks.cells=[];hooks.cursor=0;});
function find(node:any,predicate:(node:any)=>boolean):any{if(Array.isArray(node)){for(const child of node){const found=find(child,predicate);if(found)return found;}}else if(node?.props){if(predicate(node))return node;return find(node.props.children,predicate);}return null;}

// Review literals, not market data. Different numbers and names from the builder's fixtures.
const t0=1700006400;
function listing(symbol:string,exchange:string,datasetId:string,closes:number[],revision='1'):BarDataset{
 return{instrument:{id:'rv:'+exchange+':'+symbol,symbol,name:'Review '+symbol+' on '+exchange,exchange,currency:'USD',assetClass:'stock',tickSize:0.01,lotSize:1,timezone:'UTC'},
  bars:closes.map((close,index)=>({time:t0+index*86400,open:close,high:close+0.5,low:close-0.5,close,volume:7+index})),resolution:'1D',
  provenance:{providerId:datasetId.split(':')[0],providerName:'Review '+datasetId.split(':')[0],datasetId,fixture:false,coverage:closes.length+' review rows',asOf:t0,delaySeconds:null,adjustment:'unknown',session:'unknown',timezone:'UTC',state:'ready',license:'review literal',revision,notes:[]}};
}
const gmeP=listing('GME','PSX','rva:GME',[31,32,33,34]),gmeQ=listing('GME','QEX','rvb:GME',[41,42]);
const candidatesOf=(state:Parameters<typeof workspaceDatasets>[0])=>buildSymbolSearchCandidates(workspaceDatasets(state),state.imports);

describe('IR-3 header resolution against real workspace paths',()=>{
 it('F1 fixed: after an interval round-trip leaves a derived SPY 1W (and 1M) in imports, every executable-flows header Enter still switches to the 1D fixture',()=>{
  const menu=createIntervalMenuState(),onSpy=patchWorkspace(createInitialWorkspace(),{symbol:'SPY',sourceId:null});
  const weekly=aggregateInterval(demoDailyDataset('SPY'),'1W',menu.policy).dataset;
  const atWeek=selectWorkspaceInterval(onSpy,weekly,menu),backToDay=selectWorkspaceInterval(atWeek,demoDailyDataset('SPY'),atWeek.intervals);
  expect(backToDay.sourceId).toBeNull();
  const derived=backToDay.imports.filter(row=>row.instrument.symbol==='SPY');expect(derived).toHaveLength(1);expect(derived[0].resolution).toBe('1W');
  const onGme=patchWorkspace(backToDay,{symbol:'GME',sourceId:null});
  // Baseline App path: switchSymbol('SPY') = patch {symbol:'SPY',sourceId:null}: opens the daily synthetic fixture.
  expect(selectedDataset(patchWorkspace(onGme,{symbol:'SPY',sourceId:null})).provenance.fixture).toBe(true);
  // Fixed (re-review): every header Enter step of executable-flows.mjs (GME/SPY and openingSymbol restores)
  // resolves unique to the daily synthetic fixture with sourceId null, from any chart state the flows reach.
  let state:typeof onGme=onGme;
  for(const [symbol,resolution] of [['SPY','1D'],['GME','1D'],['SPY','1D'],['GME','1D'],['SPY','1D'],['GME','1D'],['spy','1D'],['GME','1W'],['SPY','1W']] as const){
   const entry=resolveSymbolEntry(symbol,candidatesOf(state),resolution);expect(entry.kind).toBe('unique');
   if(entry.kind!=='unique')return;
   expect([entry.candidate.sourceId,entry.candidate.sourceKind,entry.candidate.resolution]).toEqual([null,'synthetic','1D']);
   state=patchWorkspace(state,{symbol:entry.candidate.symbol,sourceId:entry.candidate.sourceId});expect(selectedDataset(state).provenance.fixture).toBe(true);
  }
  // From the derived weekly chart itself (sourceId = derived id) Enter on SPY also returns to the 1D fixture, as baseline did.
  const onWeekly=patchWorkspace(onGme,{symbol:'SPY',sourceId:derived[0].provenance.datasetId});expect(selectedDataset(onWeekly).resolution).toBe('1W');
  const back=resolveSymbolEntry('SPY',candidatesOf(onWeekly),'1W');expect(back.kind==='unique'&&back.candidate.sourceId).toBeNull();
  // Two derived intervals of the same symbol add no ambiguity either.
  const monthly=aggregateInterval(demoDailyDataset('SPY'),'1M',menu.policy).dataset,withMonth=selectWorkspaceInterval(patchWorkspace(onGme,{symbol:'SPY',sourceId:null}),monthly,backToDay.intervals);
  expect(withMonth.imports.filter(row=>row.instrument.symbol==='SPY')).toHaveLength(2);
  expect(resolveSymbolEntry('SPY',candidatesOf(withMonth),'1M').kind).toBe('unique');
 });
 it('re-review: an imported ticker still never loses to the synthetic fixture, with or without derived rows of it',()=>{
  const xyz=listing('XYZQ','PSX','rva:XYZQ',[5,6,7,8,9,10,11,12,13,14,15,16,17,18]);
  let state=patchWorkspace(createInitialWorkspace(),{imports:[gmeP,xyz]});
  // Import-only ticker (no fixture in the universe): Enter opens exactly the import.
  let entry=resolveSymbolEntry('XYZQ',candidatesOf(state),'1D');expect(entry.kind==='unique'&&entry.candidate.sourceId).toBe('rva:XYZQ');
  // Derive a weekly of the import: still the import, never the derived row or a fixture.
  const menu=createIntervalMenuState(),onXyz=patchWorkspace(state,{symbol:'XYZQ',sourceId:'rva:XYZQ'}),weekly=aggregateInterval(xyz,'1W',menu.policy).dataset;
  state=selectWorkspaceInterval(onXyz,weekly,menu);expect(state.imports.length).toBe(3);
  entry=resolveSymbolEntry('XYZQ',candidatesOf(state),'1W');
  // On the weekly chart the universe also carries the current-symbol fixture XYZQ: a supplied import and a fixture -> dialog, never silent synthetic.
  expect(entry.kind).toBe('ambiguous');
  if(entry.kind==='ambiguous')expect(entry.candidates.map(row=>row.sourceKind).sort()).toEqual(['imported','synthetic']);
  const onGme=patchWorkspace(state,{symbol:'GME',sourceId:null});entry=resolveSymbolEntry('XYZQ',candidatesOf(onGme),'1D');expect(entry.kind==='unique'&&entry.candidate.sourceId).toBe('rva:XYZQ');
  // Imported GME plus fixture GME stays ambiguous (the baseline header bug stays fixed).
  expect(resolveSymbolEntry('GME',candidatesOf(onGme),'1D').kind).toBe('ambiguous');
  // Search order: real before synthetic; a supplied source before rows derived from it.
  expect(searchSymbols(candidatesOf(onGme),'XYZQ').rows.map(row=>row.sourceKind)).toEqual(['imported','derived']);
 });
 it('confirms the baseline defect: Enter on GME while an imported GME is active silently opens the synthetic fixture; IR-3 routes it to the dialog',()=>{
  const withImport=patchWorkspace(createInitialWorkspace(),{imports:[gmeP]}),active=patchWorkspace(withImport,{symbol:'GME',sourceId:'rva:GME'});
  expect(selectedDataset(active).provenance.datasetId).toBe('rva:GME');
  const baselineEnter=patchWorkspace(active,{symbol:'GME',sourceId:null});
  expect(selectedDataset(baselineEnter).provenance.fixture).toBe(true);
  expect(resolveSymbolEntry('GME',candidatesOf(active),'1D').kind).toBe('ambiguous');
 });
 it('unknown valid tickers: baseline silently generates SYNTHETIC bars; IR-3 reports unresolved and the dialog offers generation only as a labelled row',()=>{
  const state=createInitialWorkspace();
  expect(selectedDataset(patchWorkspace(state,{symbol:'QZQZ',sourceId:null})).provenance.fixture).toBe(true);
  const candidates=candidatesOf(state);
  expect(resolveSymbolEntry('qzqz',candidates,'1D')).toEqual({kind:'unresolved',symbol:'QZQZ'});
  const generated=syntheticGenerationCandidate('qzqz',candidates)!;
  expect([generated.sourceKind,generated.synthetic,generated.exchange,generated.barCount]).toEqual(['generated',true,'SYNTHETIC',null]);
  expect(syntheticGenerationCandidate('PSX:QZQZ',candidates)).toBeNull();
  expect(searchSymbols(candidates,'QZQZ').total).toBe(0);
 });
 it('EXCHANGE:TICKER picks exactly one of two same-ticker imports and the patch lands on that dataset',()=>{
  const state=patchWorkspace(createInitialWorkspace(),{imports:[gmeP,gmeQ]}),candidates=candidatesOf(state);
  const entry=resolveSymbolEntry('qex:gme',candidates,'1D');expect(entry.kind).toBe('unique');
  if(entry.kind!=='unique')return;
  const request=switchRequest(entry.candidate,'entry');expect([request.sourceId,request.exchange,request.synthetic]).toEqual(['rvb:GME','QEX',false]);
  const next=patchWorkspace(state,{symbol:request.symbol,sourceId:request.sourceId});
  expect(next.grid.cells[next.grid.layout.activeCellId].datasetId).toBe('rvb:GME');expect(selectedDataset(next).bars.map(bar=>bar.close)).toEqual([41,42]);
  const rows=searchSymbols(candidates,'GME').rows;expect(rows.map(row=>[row.exchange,row.sourceKind])).toEqual([['PSX','imported'],['QEX','imported'],['SYNTHETIC','synthetic']]);
 });
});

describe('typed entry does not collide with existing App/Watchlist shortcuts',()=>{
 const ev=(key:string,mods:Partial<{ctrlKey:boolean;metaKey:boolean;altKey:boolean;shiftKey:boolean;repeat:boolean;isComposing:boolean}>={})=>({key,ctrlKey:false,metaKey:false,altKey:false,shiftKey:false,...mods});
 it('leaves Ctrl+S/Z/Y, ".", Escape, Alt+T, Alt+N, Shift+W, digits and auto-repeat alone',()=>{
  for(const event of [ev('s',{ctrlKey:true}),ev('z',{ctrlKey:true}),ev('Z',{ctrlKey:true,shiftKey:true}),ev('y',{metaKey:true}),ev('.'),ev('Escape'),ev('t',{altKey:true}),ev('n',{altKey:true}),ev('W',{shiftKey:true}),ev('5'),ev('g',{repeat:true}),ev('g',{isComposing:true}),ev('k',{ctrlKey:true,shiftKey:true}),ev('Enter'),ev('ArrowLeft')])
   expect(symbolEntryFromKey(event,false)).toBeNull();
  expect(symbolEntryFromKey(ev('g'),false)).toEqual({initialQuery:'G',origin:'typed'});
  // Cmd/Ctrl+K opens Quick search (shortcut-dispatch 'quick-search'), not the symbol entry.
  expect(symbolEntryFromKey(ev('K',{metaKey:true}),false)).toBeNull();
  expect(symbolEntryFromKey(ev('g'),true)).toBeNull();
  expect(symbolEntryFromKey(ev('é'),false)).toBeNull();
 });
});

describe('stale selection',()=>{
 it('a re-imported source with a new revision, or an earlier ticket, cannot be chosen; a valid choice runs once',()=>{
  const before=buildSymbolSearchCandidates([gmeP],[gmeP]),after=buildSymbolSearchCandidates([{...gmeP,provenance:{...gmeP.provenance,revision:'2'}}],[{...gmeP,provenance:{...gmeP.provenance,revision:'2'}}]);
  const session=createSymbolSearchSession(),first=session.begin(),accept=vi.fn(()=>true);
  expect(()=>session.choose(first,before[0],after,'GME',accept)).toThrow(/out of date/);
  const second=session.begin();expect(()=>session.choose(first,after[0],after,'GME',accept)).toThrow(/earlier search/);
  expect(session.choose(second,after[0],after,'GME',accept)).toBe(true);expect(session.choose(second,after[0],after,'GME',accept)).toBe(false);expect(accept).toHaveBeenCalledOnce();
 });
 it('F4 fixed: when the AUTO-highlighted first row is removed, Enter refuses; a better-ranked newcomer does not displace it; a new query starts fresh',()=>{
  const selected:any[]=[];
  let props:SymbolSearchDialogProps={candidates:buildSymbolSearchCandidates([demoDailyDataset('GME'),gmeP,gmeQ],[gmeP,gmeQ]),origin:'toolbar',initialQuery:'GME',onSelect(request){selected.push(request);return true;},onClose(){}};
  const render=()=>{hooks.cursor=0;return SymbolSearchDialog(props);};
  const input=()=>find(render(),node=>node.type==='input'&&node.props['aria-label']==='Search symbols');
  expect(input().props['aria-activedescendant']).toBeTruthy();
  props={...props,candidates:buildSymbolSearchCandidates([demoDailyDataset('GME'),gmeQ],[gmeQ])};
  const enter=()=>input().props.onKeyDown({key:'Enter',preventDefault(){},stopPropagation(){},nativeEvent:{isComposing:false}});
  enter();expect(selected).toEqual([]);
  const status=()=>{const node=find(render(),n=>n.props?.role==='status');return JSON.stringify(node.props.children);};
  expect(status()).toContain('highlighted result changed');expect(input().props['aria-activedescendant']).toBeUndefined();
  // New query: fresh automatic choice; Enter opens it.
  // A typed 2+ char ticker with no source ('GM') lead as its DEMO row; one letter keeps supplied prefix matches first.
  input().props.onChange({target:{value:'G'}});enter();expect(selected.map(row=>row.datasetId)).toEqual(['rvb:GME']);
 });
 it('F4 fixed: a better-ranked arrival keeps the automatic row in place',()=>{
  const selected:any[]=[];
  let props:SymbolSearchDialogProps={candidates:buildSymbolSearchCandidates([demoDailyDataset('GME'),gmeQ],[gmeQ]),origin:'toolbar',initialQuery:'GME',onSelect(request){selected.push(request);return true;},onClose(){}};
  const render=()=>{hooks.cursor=0;return SymbolSearchDialog(props);};
  const input=()=>find(render(),node=>node.type==='input'&&node.props['aria-label']==='Search symbols');
  const first=input().props['aria-activedescendant'];
  props={...props,candidates:buildSymbolSearchCandidates([demoDailyDataset('GME'),gmeP,gmeQ],[gmeP,gmeQ])};// PSX sorts before QEX
  expect(input().props['aria-activedescendant']).toBe(first);
  input().props.onKeyDown({key:'Enter',preventDefault(){},stopPropagation(){},nativeEvent:{isComposing:false}});
  expect(selected.map(row=>row.datasetId)).toEqual(['rvb:GME']);
 });
 it('F2 fixed: typed entry blocker fails closed and blocks open menus/popovers, not an ordinary chart',()=>{
  const doc=(hit:string|null)=>({querySelector:(selector:string)=>hit&&selector.split(',').includes(hit)?{}:null});
  expect(symbolEntryBlocked(doc(null),{closest:()=>null})).toBe(false);
  for(const hit of ['[role=menu]','[data-lv-context-menu]','[role=listbox]','.color-popover','[role=dialog]'])expect(symbolEntryBlocked(doc(hit),null)).toBe(true);
  expect(symbolEntryBlocked(doc(null),{closest:(selector:string)=>selector.includes('textarea')?{}:null})).toBe(true);
  expect(symbolEntryBlocked({querySelector(){throw Error('bad selector');}},null)).toBe(true);
  expect(symbolEntryBlocked(null,null)).toBe(true);
 });
});

describe('fundamentals contract (C09-impacting)',()=>{
 const market={exchange:'PSX',symbol:'GME',synthetic:false};
 const base=():SymbolFundamentalsSummary=>({schemaVersion:1,market,availability:'available',reason:null,source:{kind:'local-import',label:'Review facts',retrievedAt:null,sourceUrl:null,sha256:null},entity:null,asOf:null,
  fields:[{id:'cash',label:'Cash',value:0,unit:'USD',period:{start:null,end:'2024-01-31',fiscalYear:null,fiscalPeriod:null},filed:null,form:null,accession:null,missingReason:null},{id:'debt',label:'Debt',value:null,unit:'USD',period:null,filed:null,form:null,accession:null,missingReason:'Not tagged'}]});
 it('zero stays 0 and missing stays null with its reason; NaN never passes',()=>{
  const check=checkFundamentalsSummary(base(),market);expect(check.ok).toBe(true);
  if(check.ok)expect(check.summary.fields.map(row=>[row.value,row.missingReason])).toEqual([[0,null],[null,'Not tagged']]);
  const bad=base();(bad.fields[0] as any).value=Number.NaN;expect(checkFundamentalsSummary(bad,market).ok).toBe(false);
  const zeroForMissing=base();(zeroForMissing.fields[1] as any).missingReason=null;expect(checkFundamentalsSummary(zeroForMissing,market).ok).toBe(false);
 });
 it('every documented key is required: omitting entity, asOf or a field unit rejects the whole summary',()=>{
  for(const drop of ['entity','asOf','reason'] as const){const value:any=base();delete value[drop];expect(checkFundamentalsSummary(value,market).ok).toBe(false);}
  const noUnit:any=base();delete noUnit.fields[0].unit;expect(checkFundamentalsSummary(noUnit,market).ok).toBe(false);
 });
 it('a derived field whose inputs are not fields in the same summary rejects the WHOLE summary (C09 must ship inputs inside the 12-field limit)',()=>{
  const value=base();(value.fields as any[]).push({id:'ratio',label:'Ratio',value:null,unit:null,period:null,filed:null,form:null,accession:null,missingReason:'Denominator missing',derived:{formula:'cash / price',inputs:['cash','price']}});
  const check=checkFundamentalsSummary(value,market);expect(check.ok).toBe(false);
 });
 it('FINDING F5 (Low, C09-impacting): a non-available summary (for example "error") that carries a source still shows its values',()=>{
  const value={...base(),availability:'error' as const,reason:'Refresh failed'};
  const check=checkFundamentalsSummary(value,market);expect(check.ok).toBe(true);
  if(check.ok)expect(check.summary.fields[0].value).toBe(0);
 });
 it('market identity and synthetic/real separation are exact',()=>{
  expect(checkFundamentalsSummary(base(),{...market,exchange:'psx'}).ok).toBe(false);
  expect(checkFundamentalsSummary(base(),{...market,synthetic:true}).ok).toBe(false);
  expect(checkFundamentalsSummary({...base(),market:{...market,synthetic:true},source:{kind:'synthetic',label:'Demo',retrievedAt:null,sourceUrl:null,sha256:null}},{...market,synthetic:true}).ok).toBe(true);
 });
 it('FINDING F6 (Nit): a start-only period is displayed as "dates not supplied"',()=>{
  expect(formatFundamentalsPeriod({start:'2024-01-01',end:null,fiscalYear:null,fiscalPeriod:null})).toBe('dates not supplied');
 });
});
