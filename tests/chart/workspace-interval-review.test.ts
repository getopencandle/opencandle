import {it,expect} from 'vitest';
import {fixtureDataset} from '../../src/domain/fixtures';
import {aggregateInterval,createIntervalMenuState} from '../../src/domain/intervals';
import {ensureWorkspaceGrid,selectedDataset} from '../../src/ui/workspace-grid';
import {selectWorkspaceInterval} from '../../src/ui/workspace-intervals';
import {restoreWorkspace} from '../../src/ui/workspace-validation';
import {defaultTheme} from '../../src/ui/themes';
import {DEFAULT_STRATEGY_CONFIG} from '../../src/domain/strategy';
function source(provider:string,resolution:string,id=provider+'-'+resolution){const dataset=fixtureDataset('GME',3);dataset.resolution=resolution;dataset.provenance={...dataset.provenance,providerId:provider,providerName:'Synthetic '+provider,datasetId:id};dataset.bars=[0,60,120].map(time=>({time,open:10,high:12,low:9,close:11,volume:100}));return dataset;}
const defaults={version:1,symbol:'GME',sourceId:null,imports:[],chartStyle:'candles',themeId:defaultTheme.id,appearance:defaultTheme.appearance,watchlist:['GME'],chartOptions:{source:'close' as const,scale:'linear' as const,auto:true,invert:false,timezone:'UTC'},drawings:{version:1,drawings:[]},indicators:[],comparisons:[],script:{id:'test',name:'Synthetic test',source:'({onBar(){}})',pane:'price'},strategy:DEFAULT_STRATEGY_CONFIG,screener:{columns:[{id:'symbol',metric:'symbol'}],filters:[],sort:{columnId:'symbol',direction:'asc'}}};
function two(a=source('A','1m'),b=source('B','1m'),extra:ReturnType<typeof source>[]=[]){const state=ensureWorkspaceGrid({...defaults,imports:[a,b,...extra],sourceId:a.provenance.datasetId}),first=state.grid.layout.cells[0];state.grid.presetId='two-rows';state.grid.layout.sync.interval=true;state.grid.layout.sync.symbol=false;state.grid.layout.cells.push({...first,id:'second',interval:b.resolution});state.grid.cells.second={...structuredClone(state.grid.cells[first.id]),datasetId:b.provenance.datasetId};return state;}
it('interval-only linking preserves independent providers for the same instrument',()=>{
 const a5=source('A','5m'),b5=source('B','5m'),state=two(undefined,undefined,[a5,b5]),next=selectWorkspaceInterval(state,a5,createIntervalMenuState());
 expect(next.grid.layout.cells.map(row=>row.interval)).toEqual(['5m','5m']);expect(next.grid.cells.second.datasetId).toBe(b5.provenance.datasetId);expect(selectedDataset(next).provenance.providerId).toBe('A');
});
it('matching linked interval keeps its exact previous provider/source even when active source changes',()=>{
 const a5=source('A','5m'),b5=source('B','5m'),state=two(source('A','1m'),b5,[a5]),next=selectWorkspaceInterval(state,a5,createIntervalMenuState());expect(next.grid.cells.second.datasetId).toBe(b5.provenance.datasetId);
});
it('missing or ambiguous compatible linked sources leave imports, menu and every cell unchanged',()=>{
 const a5=source('A','5m');for(const extra of [[],[source('B','5m','b-first'),source('B','5m','b-second')]]){const state=two(undefined,undefined,[a5,...extra]),before=JSON.stringify(state);expect(()=>selectWorkspaceInterval(state,a5,createIntervalMenuState())).toThrow('Linked');expect(JSON.stringify(state)).toBe(before);}
 const incompatible=source('B','5m');incompatible.provenance.session='extended';const state=two(undefined,undefined,[a5,incompatible]);expect(()=>selectWorkspaceInterval(state,a5,createIntervalMenuState())).toThrow('Linked');
});
it('derived reuse requires matching original lineage, and a stored synthetic derived source remains selected',()=>{
 const a=source('A','1m'),b=source('B','1m'),derived=aggregateInterval(a,'5m').dataset,state=two(a,b),before=JSON.stringify(state);expect(()=>selectWorkspaceInterval(state,derived,createIntervalMenuState())).toThrow('Linked');expect(JSON.stringify(state)).toBe(before);
 const same=two(a,{...structuredClone(a),provenance:{...a.provenance,datasetId:a.provenance.datasetId}});same.imports=[a];const next=selectWorkspaceInterval(same,derived,createIntervalMenuState());expect(next.grid.cells.second.datasetId).toBe(derived.provenance.datasetId);expect(next.sourceId).toBe(derived.provenance.datasetId);expect(selectedDataset(next).provenance.fixture).toBe(true);expect(selectedDataset(next).resolution).toBe('5m');
 const restored=restoreWorkspace(next,defaults);expect(selectedDataset(restored).provenance.datasetId).toBe(derived.provenance.datasetId);
 const malformed=structuredClone(next);(malformed.imports.find(row=>row.provenance.datasetId===derived.provenance.datasetId) as any).derivation.buckets[0].availableAt=0;expect(()=>restoreWorkspace(malformed,defaults)).toThrow('availability');
});
it('recovery rejects two imported contents under one source ID instead of choosing the first',()=>{
 const a=source('A','1m'),b=structuredClone(a);b.bars[0].close=12;const saved={...defaults,sourceId:a.provenance.datasetId,imports:[a,b]};expect(()=>restoreWorkspace(saved,defaults)).toThrow(/duplicate|unique/i);
});
