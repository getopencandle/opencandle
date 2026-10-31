import {describe,expect,it} from 'vitest';
import {buildSymbolSearchCandidates,createSymbolSearchSession,linkedSymbolTargets,parseSymbolQuery,resolveSymbolEntry,searchSymbols,switchRequest,symbolEntryFromKey,syntheticGenerationCandidate,type SymbolSearchCandidate} from '../../src/ui/symbol-search';
import {patchWorkspace,selectedDataset,workspaceDatasets,ensureWorkspaceGrid} from '../../src/ui/workspace-grid';
import {createInitialWorkspace} from '../../src/ui/workspace-state';
import {resizeMultiChartState} from '../../src/ui/MultiChartGrid';
import type {BarDataset} from '../../src/domain/types';

// Independent literal imports. Nothing here is real market data; values are test literals.
const day=86400,start=1704153600;
function imported(symbol:string,exchange:string,providerId:string,datasetId:string,resolution='1D',closes=[10,11,12],step=day):BarDataset{
 return{instrument:{id:exchange+':'+symbol,symbol,name:symbol+' test listing on '+exchange,exchange,currency:'USD',assetClass:'stock',tickSize:0.01,lotSize:1,timezone:'America/New_York'},
  bars:closes.map((close,index)=>({time:start+index*step,open:close,high:close+1,low:close-1,close,volume:1000+index})),resolution,
  provenance:{providerId,providerName:providerId+' CSV import',datasetId,fixture:false,coverage:closes.length+' imported rows',asOf:start+(closes.length-1)*step,delaySeconds:null,adjustment:'unknown',session:'unknown',timezone:'America/New_York',state:'ready',license:'User-supplied local file',revision:'1',notes:[]}};
}
const gmeA=imported('GME','NYSE','csv-alpha','alpha:GME'),gmeB=imported('GME','XNYS-ALT','csv-beta','beta:GME',undefined,[20,21]),iwm=imported('IWM','ARCA','csv-alpha','alpha:IWM',undefined,[200]);
function setup(imports:BarDataset[]=[gmeA,gmeB,iwm]){
 const state=patchWorkspace(createInitialWorkspace(),{imports});
 return{state,candidates:buildSymbolSearchCandidates(workspaceDatasets(state),state.imports)};
}
const find=(rows:readonly SymbolSearchCandidate[],datasetId:string)=>rows.find(row=>row.datasetId===datasetId)!;

describe('candidates and search',()=>{
 it('keeps one row per exact source with explicit exchange/provider identity and switch source IDs',()=>{
  const {candidates}=setup(),a=find(candidates,'alpha:GME'),b=find(candidates,'beta:GME'),fixture=find(candidates,'lv-synthetic-v1:GME');
  expect([a.exchange,a.providerName,a.sourceId,a.sourceKind,a.synthetic,a.barCount,a.lastBarTime]).toEqual(['NYSE','csv-alpha CSV import','alpha:GME','imported',false,3,start+2*day]);
  expect([b.exchange,b.sourceId,b.barCount]).toEqual(['XNYS-ALT','beta:GME',2]);
  expect([fixture.exchange,fixture.sourceId,fixture.sourceKind,fixture.synthetic]).toEqual(['SYNTHETIC',null,'synthetic',true]);
  expect(new Set([a.key,b.key,fixture.key]).size).toBe(3);
  const adjusted=buildSymbolSearchCandidates([{...gmeA,provenance:{...gmeA.provenance,adjustment:'split-adjusted'}}],[]);expect(adjusted[0].stamp).not.toBe(a.stamp);
 });
 it('ranks exact ticker first, imported before synthetic, and reports totals',()=>{
  const {candidates}=setup(),result=searchSymbols(candidates,'gme');
  expect(result.rows.map(row=>row.datasetId)).toEqual(['alpha:GME','beta:GME','lv-synthetic-v1:GME']);expect(result.total).toBe(3);expect(result.truncated).toBe(0);
  expect(searchSymbols(candidates,'SP').rows[0].symbol).toBe('SPY');
  expect(searchSymbols(candidates,'test listing').rows.map(row=>row.datasetId).sort()).toEqual(['alpha:GME','alpha:IWM','beta:GME']);
 });
 it('EXCHANGE:TICKER narrows the source; filters and limits are honoured',()=>{
  const {candidates}=setup();
  expect(searchSymbols(candidates,'xnys-alt:gme').rows.map(row=>row.datasetId)).toEqual(['beta:GME']);
  expect(searchSymbols(candidates,'SYNTHETIC:GME').rows.map(row=>row.datasetId)).toEqual(['lv-synthetic-v1:GME']);
  expect(searchSymbols(candidates,'GME',{assetClass:'all',source:'imported'}).rows.every(row=>!row.synthetic)).toBe(true);
  expect(searchSymbols(candidates,'',{assetClass:'etf',source:'synthetic'}).rows.map(row=>row.symbol).sort()).toEqual(['DIA','IWM','QQQ','SPY','XLF','XLK']);
  const limited=searchSymbols(candidates,'',undefined,4);expect(limited.rows).toHaveLength(4);expect(limited.truncated).toBe(limited.total-4);
  expect(parseSymbolQuery(' nyse:gme ')).toEqual({text:'NYSE:GME',exchange:'NYSE',symbol:'GME'});expect(parseSymbolQuery('a:b:c').exchange).toBeNull();
 });
 it('no results stays empty and never converts a miss into a row',()=>{const {candidates}=setup();expect(searchSymbols(candidates,'NO SUCH THING')).toEqual({rows:[],total:0,truncated:0});});
 it('a non-canonical stored ticker is searchable but not openable, so the switch cannot miss its dataset',()=>{
  const lower=imported('gme','LOCAL','csv-gamma','gamma:gme'),{candidates}=setup([lower]),row=find(candidates,'gamma:gme');
  expect([row.symbol,row.openable]).toEqual(['gme',false]);expect(row.unavailableReason).toMatch(/cannot be entered/);
  expect(searchSymbols(candidates,'GME').rows.map(item=>item.datasetId)).toEqual(['lv-synthetic-v1:GME','gamma:gme']);
  expect(syntheticGenerationCandidate('GME',candidates)).toBeNull();
 });
 it('duplicate imported dataset identity is shown but not openable',()=>{
  const twin={...gmeA,bars:gmeA.bars.slice(0,2)},{candidates}=setup([gmeA,twin]),row=find(candidates,'alpha:GME');
  expect(row.openable).toBe(false);expect(row.unavailableReason).toMatch(/ambiguous|share/);
  expect(resolveSymbolEntry('NYSE:GME',candidates).kind).toBe('unresolved');
 });
});
describe('typed entry resolution',()=>{
 it('GME/SPY/third symbol: unique fixture, ambiguous imported+synthetic, unique imported by exchange',()=>{
  const {candidates}=setup(),spy=resolveSymbolEntry('spy',candidates);
  expect(spy.kind).toBe('unique');if(spy.kind==='unique')expect([spy.candidate.datasetId,spy.candidate.sourceId]).toEqual(['lv-synthetic-v1:SPY',null]);
  const gme=resolveSymbolEntry('GME',candidates);expect(gme.kind).toBe('ambiguous');if(gme.kind==='ambiguous')expect(gme.candidates.map(row=>row.datasetId).sort()).toEqual(['alpha:GME','beta:GME','lv-synthetic-v1:GME']);
  const nyse=resolveSymbolEntry('NYSE:GME',candidates);expect(nyse.kind==='unique'&&nyse.candidate.sourceId).toBe('alpha:GME');
  const third=resolveSymbolEntry('IWM',candidates);expect(third.kind).toBe('ambiguous');
  const arca=resolveSymbolEntry('ARCA:IWM',candidates);expect(arca.kind==='unique'&&arca.candidate.datasetId).toBe('alpha:IWM');
 });
 it('without imports, existing header behaviour is preserved for demo symbols',()=>{const {candidates}=setup([]);for(const symbol of ['GME','SPY','AAPL']){const result=resolveSymbolEntry(symbol,candidates);expect(result.kind==='unique'&&[result.candidate.sourceId,result.candidate.synthetic]).toEqual([null,true]);}});
 it('unresolved and invalid entries never pick a source; generation is a separate labelled synthetic row',()=>{
  const {candidates}=setup();expect(resolveSymbolEntry('ZZZZ',candidates)).toEqual({kind:'unresolved',symbol:'ZZZZ'});
  expect(resolveSymbolEntry('BAD SYMBOL!',candidates).kind).toBe('invalid');expect(resolveSymbolEntry('',candidates).kind).toBe('invalid');
  const generated=syntheticGenerationCandidate('zzzz',candidates)!;
  expect([generated.sourceKind,generated.synthetic,generated.sourceId,generated.exchange,generated.datasetId,generated.barCount,generated.lastBarTime]).toEqual(['generated',true,null,'SYNTHETIC','lv-synthetic-v1:ZZZZ',null,null]);
  expect(syntheticGenerationCandidate('GME',candidates)).toBeNull();expect(syntheticGenerationCandidate('NYSE:ZZZZ',candidates)).toBeNull();expect(syntheticGenerationCandidate('NO SUCH',candidates)).toBeNull();
 });
 it('different intervals of one source family resolve to the current interval only when exactly one matches',()=>{
  const weekly=imported('GME','NYSE','csv-alpha','alpha:GME:1W','1W',[10,12],7*day),{candidates}=setup([gmeA,weekly]);
  const entry=(resolution?:string)=>resolveSymbolEntry('NYSE:GME',candidates,resolution);
  expect(entry('1W').kind==='unique'&&(entry('1W') as any).candidate.datasetId).toBe('alpha:GME:1W');
  expect(entry('1h').kind).toBe('ambiguous');expect(entry().kind).toBe('ambiguous');
 });
 it('typing a letter on the chart opens search; digits, dot, modifiers, composition and editors do not',()=>{
  const key=(value:string,extra:Partial<Parameters<typeof symbolEntryFromKey>[0]>={},blocked=false)=>symbolEntryFromKey({key:value,ctrlKey:false,metaKey:false,altKey:false,shiftKey:false,...extra},blocked);
  expect(key('g')).toEqual({initialQuery:'G',origin:'typed'});/* Ctrl/Cmd+K is Quick search now (shortcut-dispatch). */expect(key('k',{ctrlKey:true})).toBeNull();expect(key('K',{metaKey:true})).toBeNull();
  for(const miss of [key('1'),key('.'),key('F',{shiftKey:true}),key('t',{altKey:true}),key('s',{ctrlKey:true}),key('g',{isComposing:true}),key('g',{repeat:true}),key('g',{},true),key('Enter'),key('Escape'),key('ArrowUp')])expect(miss).toBeNull();
 });
});
describe('session leases',()=>{
 it('results from an earlier query are not current and cannot be chosen',()=>{
  const {candidates}=setup(),session=createSymbolSearchSession(),first=session.begin(),row=searchSymbols(candidates,'GME').rows[0],second=session.begin();
  expect(session.isCurrent(first)).toBe(false);expect(session.isCurrent(second)).toBe(true);
  let calls=0;expect(()=>session.choose(first,row,candidates,'GME',()=>{calls++;})).toThrow(/earlier search/);expect(calls).toBe(0);
  expect(session.choose(second,row,candidates,'GME',()=>{calls++;})).toBe(true);expect(calls).toBe(1);
  expect(session.choose(second,row,candidates,'GME',()=>{calls++;})).toBe(false);expect(calls).toBe(1);expect(()=>session.begin()).toThrow(/closed/);
 });
 it('a revised or removed source rejects a retained row; a rejected switch keeps the session open',()=>{
  const {candidates}=setup(),session=createSymbolSearchSession(),ticket=session.begin(),row=find(candidates,'alpha:GME');
  const revised=buildSymbolSearchCandidates([{...gmeA,provenance:{...gmeA.provenance,revision:'2'}}],[{...gmeA,provenance:{...gmeA.provenance,revision:'2'}}]);
  expect(()=>session.choose(ticket,row,revised,'GME',()=>true)).toThrow(/out of date/);expect(()=>session.choose(ticket,row,[],'GME',()=>true)).toThrow(/out of date/);
  expect(()=>session.choose(ticket,row,candidates,'GME',()=>false)).toThrow(/did not change/);expect(session.closed).toBe(false);
  const generated=syntheticGenerationCandidate('ZZZZ',candidates)!;expect(()=>session.choose(ticket,generated,[...candidates,{...generated,sourceKind:'imported',symbol:'ZZZZ'}],'ZZZZ',()=>true)).toThrow(/out of date/);
 });
});
describe('actual chart switching through the existing workspace path',()=>{
 it('a chosen same-ticker source is the exact dataset the workspace selects',()=>{
  const {state,candidates}=setup();
  for(const id of ['alpha:GME','beta:GME','lv-synthetic-v1:GME','alpha:IWM','lv-synthetic-v1:SPY']){const request=switchRequest(find(candidates,id),'toolbar'),next=patchWorkspace(state,{symbol:request.symbol,sourceId:request.sourceId});expect(selectedDataset(next).provenance.datasetId).toBe(request.datasetId);expect(next.grid.cells[next.grid.layout.activeCellId].datasetId).toBe(request.datasetId);}
 });
 it('generated synthetic choice uses the existing labelled fixture path',()=>{const {state,candidates}=setup(),request=switchRequest(syntheticGenerationCandidate('ZZZZ',candidates)!,'typed'),next=patchWorkspace(state,{symbol:request.symbol,sourceId:request.sourceId}),data=selectedDataset(next);expect([data.provenance.datasetId,data.provenance.fixture,data.instrument.exchange]).toEqual([request.datasetId,true,'SYNTHETIC']);});
 it('linked charts: symbol sync changes the group atomically, and a missing linked interval changes nothing',()=>{
  const {state,candidates}=setup(),grid=resizeMultiChartState(state.grid!,'two-columns');grid.layout.sync.symbol=true;
  const linked=ensureWorkspaceGrid({...state,grid});expect(linkedSymbolTargets(linked.grid)).toBe(2);expect(linkedSymbolTargets(state.grid)).toBe(1);
  const request=switchRequest(find(candidates,'beta:GME'),'toolbar'),next=patchWorkspace(linked,{symbol:request.symbol,sourceId:request.sourceId});
  expect(next.grid.layout.cells.map(row=>next.grid.cells[row.id].datasetId)).toEqual(['beta:GME','beta:GME']);
  const unsynced=structuredClone(linked.grid);unsynced.layout.sync.interval=false;unsynced.layout.cells[1].interval='1W';
  const mixed=ensureWorkspaceGrid({...linked,grid:unsynced}),before=JSON.stringify(mixed);
  expect(()=>patchWorkspace(mixed,{symbol:request.symbol,sourceId:request.sourceId})).toThrow(/No supplied 1W history for GME. Charts were unchanged./);expect(JSON.stringify(mixed)).toBe(before);
 });
});
describe('second review fixes',()=>{
 it('F1: replays the executable-flows symbol-entry sequence after EXE.INTERVAL leaves a derived SPY 1W in imports',async()=>{
  // Stands in for the app's demo 1D source (demoDailyDataset, 3,900 bars), or the saved source basis no longer matches.
  const {selectWorkspaceInterval}=await import('../../src/ui/workspace-intervals'),{aggregateInterval,createIntervalMenuState}=await import('../../src/domain/intervals'),{demoDailyDataset}=await import('../../src/domain/fixtures');
  // Header Enter: resolve, then switchSymbol(symbol, sourceId) == patchWorkspace.
  const enter=(state:ReturnType<typeof createInitialWorkspace>,text:string)=>{const entry=resolveSymbolEntry(text,buildSymbolSearchCandidates(workspaceDatasets(state),state.imports),selectedDataset(state).resolution);expect(entry.kind,text).toBe('unique');if(entry.kind!=='unique')throw Error(text);expect([entry.candidate.sourceId,entry.candidate.sourceKind,entry.candidate.resolution]).toEqual([null,'synthetic','1D']);const next=patchWorkspace(state,{symbol:entry.candidate.symbol,sourceId:entry.candidate.sourceId});expect([next.symbol,next.sourceId]).toEqual([text,null]);return next;};
  let state=enter(createInitialWorkspace(),'SPY');// EXE.SYMBOL (line 110)
  const menu=createIntervalMenuState(),weekly=aggregateInterval(demoDailyDataset('SPY'),'1W',menu.policy).dataset;// EXE.INTERVAL (112-121)
  state=selectWorkspaceInterval(state,weekly,menu);expect(selectedDataset(state).resolution).toBe('1W');
  const onWeekly=resolveSymbolEntry('SPY',buildSymbolSearchCandidates(workspaceDatasets(state),state.imports),'1W');expect(onWeekly.kind==='unique'&&onWeekly.candidate.sourceId).toBeNull();// same as baseline switchSymbol('SPY')
  state=selectWorkspaceInterval(state,demoDailyDataset('SPY'),state.intervals);expect(state.imports.filter(row=>row.instrument.symbol==='SPY').map(row=>row.resolution)).toEqual(['1W']);
  state=enter(state,'GME');// EXE.WORKSPACE_RESTORE (295)
  for(const symbol of ['GME','SPY'])state=enter(state,symbol);// EXE.DRAWING_DUPLICATE (308-309)
  state=enter(state,'SPY');// openingSymbol restore (322)
  for(const flow of ['FIB_ONE_COLOR','FIB_LEVEL_FORMAT','FIB_TREND_LINE','FIB_LEVEL_PRESENTATION','FIB_LEVEL_TEXT_POLICY']){const opening=state.symbol;for(const symbol of ['GME','SPY'])state=enter(state,symbol);state=enter(state,opening);expect(flow).toBeTruthy();}
  // The derived row is still searchable and labelled in the dialog.
  const rows=searchSymbols(buildSymbolSearchCandidates(workspaceDatasets(state),state.imports),'SPY').rows;expect(rows.map(row=>[row.sourceKind,row.resolution])).toEqual([['synthetic','1D'],['derived','1W']]);
 });
 it('F1: derived rows never add ambiguity, but distinct supplied sources still do',()=>{
  const derivedAlpha={...gmeA,resolution:'1W',derivation:{from:'alpha:GME'},provenance:{...gmeA.provenance,providerId:'lv-local-aggregation',datasetId:'agg:alpha:GME:1W'}} as BarDataset,{candidates}=setup([gmeA,derivedAlpha]);
  const nyse=resolveSymbolEntry('NYSE:GME',candidates,'1W');expect(nyse.kind==='unique'&&nyse.candidate.datasetId).toBe('alpha:GME');
  expect(resolveSymbolEntry('GME',candidates,'1D').kind).toBe('ambiguous');
  const onlyDerived=setup([derivedAlpha]).candidates,lone=resolveSymbolEntry('NYSE:GME',onlyDerived,'1W');expect(lone.kind==='unique'&&lone.candidate.datasetId).toBe('agg:alpha:GME:1W');
 });
 it('F2: typed entry is blocked while a menu, context menu, listbox, popover or dialog is open, or from inside one; fails closed',async()=>{
  const {symbolEntryBlocked,SYMBOL_ENTRY_BLOCKERS}=await import('../../src/ui/symbol-search');
  const root=(open:string|null)=>({querySelector:(selector:string)=>open&&selector.split(',').includes(open)?{}:null});
  expect(symbolEntryBlocked(root(null),null)).toBe(false);
  for(const open of ['[role=menu]','[data-lv-context-menu]','[role=listbox]','.color-popover','[role=dialog]','[role=alertdialog]'])expect(symbolEntryBlocked(root(open),null),open).toBe(true);
  expect(symbolEntryBlocked(root(null),{closest:(selector:string)=>selector.includes('[role=menu]')?{}:null})).toBe(true);
  expect(symbolEntryBlocked(null,null)).toBe(true);expect(symbolEntryBlocked({querySelector(){throw Error('bad selector');}},null)).toBe(true);
  expect(SYMBOL_ENTRY_BLOCKERS).not.toContain('aria-expanded');// expanded detail blocks must not disable typing
 });
});
