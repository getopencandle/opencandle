import {expect,it,vi} from 'vitest';
import {createInitialWorkspace} from '../../src/ui/workspace-state';
import {patchWorkspace,projectGrid,ensureWorkspaceGrid,allChartsDataset} from '../../src/ui/workspace-grid';
import {drawingScopeBasis} from '../../src/ui/drawing-scopes';
import {resizeMultiChartState} from '../../src/ui/MultiChartGrid';
import {prepareWorkspaceData,prepareWorkspaceReplacement} from '../../src/ui/workspace-transfer';
import {createFinancialPublicationGuard} from '../../src/ui/financial-publication';
import {prepareWorkspaceJSON} from '../../src/ui/workspace-json';
import {createPaperAccount} from '../../src/domain/paper';
import {fixtureDataset} from '../../src/domain/fixtures';
import {selectWorkspaceInterval} from '../../src/ui/workspace-intervals';
import {aggregateInterval,createIntervalMenuState} from '../../src/domain/intervals';
import {prepareTemplateApplication} from '../../src/ui/template-application';
import {createIndicatorTemplates,saveIndicatorTemplate,templateSource} from '../../src/ui/indicator-templates';
const doc=(id:string)=>({version:1,drawings:[{id,type:'trendline',paneId:'price',anchors:[{time:1704153600,price:100.005},{time:1704240000,price:101.25}],style:{lineColor:'#123456'},locked:true,visible:false}]});
const initial=()=>patchWorkspace(createInitialWorkspace(),{drawings:doc('synthetic-gme')});
const payload=(workspace:ReturnType<typeof createInitialWorkspace>)=>prepareWorkspaceJSON({...workspace,paper:createPaperAccount(),alerts:[]});

it('a wrong active basis rejects complete grid publication and JSON replacement without losing any archive',()=>{
 const original=patchWorkspace(initial(),{symbol:'SPY'}),serialized=JSON.stringify(original),candidate=structuredClone(original),id=candidate.grid!.layout.activeCellId;
 candidate.grid!.cells[id].drawingScopes!.activeBasis.exchange='OTHER';expect(()=>patchWorkspace(original,{grid:candidate.grid})).toThrow('does not match');
 expect(()=>prepareWorkspaceReplacement(JSON.stringify({schemaVersion:1,data:payload(candidate)}))).toThrow('does not match');expect(JSON.stringify(original)).toBe(serialized);
 expect(patchWorkspace(original,{symbol:'GME'}).drawings).toEqual(doc('synthetic-gme'));
});

it('legacy missing source cannot assign its cell document using the toolbar synthetic fallback',()=>{
 const original=initial(),broken=structuredClone(original),id=broken.grid!.layout.activeCellId;delete broken.grid!.cells[id].drawingScopes;broken.grid!.cells[id].datasetId='missing-original-import';
 const serialized=JSON.stringify(broken);expect(()=>ensureWorkspaceGrid(broken)).toThrow('exact saved chart source');expect(()=>prepareWorkspaceData(payload(broken))).toThrow();expect(JSON.stringify(broken)).toBe(serialized);
});

it('ordinary drawing capture at128 retained archives rejects the129th scope before publication',()=>{
 const original=createInitialWorkspace(),id=original.grid!.layout.activeCellId;original.grid!.cells[id].drawingScopes={schemaVersion:1,activeBasis:drawingScopeBasis(fixtureDataset('GME',1)),inactive:Array.from({length:128},(_,index)=>({basis:drawingScopeBasis(fixtureDataset('ARCHIVE'+index,0)),document:{version:1,drawings:[],opaque:{index,label:'Synthetic retained metadata'}}}))};
 const admitted=projectGrid(original,original.grid!),serialized=JSON.stringify(admitted);
 expect(()=>patchWorkspace(admitted,{drawings:doc('synthetic-overflow')})).toThrow('too many saved drawing groups');expect(JSON.stringify(admitted)).toBe(serialized);
 expect(admitted.grid!.cells[id].drawingScopes!.inactive).toHaveLength(128);expect(admitted.drawings.drawings).toEqual([]);
});

it('new cells do not inherit another cell archive and independent chart documents return after all-chart switching',()=>{
 const archived=patchWorkspace(initial(),{symbol:'SPY'}),grid=resizeMultiChartState(archived.grid!,'two-columns'),first=grid.layout.activeCellId,second=grid.layout.cells[1].id;
 expect(grid.cells[second].drawingScopes!.inactive).toEqual([]);expect(grid.cells[second].drawings.drawings).toEqual([]);
 grid.cells[second].drawings=doc('synthetic-second-spy');grid.layout.cells[1].group='independent';const workspace=patchWorkspace(archived,{grid});
 const gme=allChartsDataset(workspace,fixtureDataset('GME',500)),spy=allChartsDataset(gme,fixtureDataset('SPY',500));
 expect(gme.grid.cells[first].drawings).toEqual(doc('synthetic-gme'));expect(gme.grid.cells[second].drawings.drawings).toEqual([]);
 expect(spy.grid.cells[first].drawings.drawings).toEqual([]);expect(spy.grid.cells[second].drawings).toEqual(doc('synthetic-second-spy'));expect(workspace.grid!.cells[first].drawingScopes!.inactive).toHaveLength(1);
});

it('recovery projects the exact active document rather than a contradictory toolbar alias',()=>{
 const original=patchWorkspace(initial(),{symbol:'SPY'}),data=payload(original);data.drawings=doc('synthetic-wrong-toolbar-alias');const restored=prepareWorkspaceData(data);
 expect(restored.workspace.drawings.drawings).toEqual([]);expect(restored.summary.join(' ')).toContain('inactive symbol/basis archives');expect(patchWorkspace(restored.workspace,{symbol:'GME'}).drawings).toEqual(doc('synthetic-gme'));
});

it('unknown-adjustment derived intervals keep their exact source bucket and roundtrip without coordinate conversion',()=>{
 const source=fixtureDataset('GME',30);source.provenance={...source.provenance,datasetId:'synthetic-local-unknown',providerId:'synthetic-review-import',adjustment:'unknown'};
 let workspace=patchWorkspace(createInitialWorkspace(),{imports:[source],sourceId:source.provenance.datasetId});workspace=patchWorkspace(workspace,{drawings:doc('synthetic-unknown-daily')});const serialized=JSON.stringify(workspace),menu=createIntervalMenuState(),weekly=aggregateInterval(source,'1W',menu.policy).dataset;
 const next=selectWorkspaceInterval(workspace,weekly,menu);expect(next.drawings.drawings).toEqual([]);expect(next.grid!.cells[next.grid!.layout.activeCellId].drawingScopes!.inactive).toHaveLength(1);
 const back=selectWorkspaceInterval(next,source,menu);expect(back.drawings).toEqual(doc('synthetic-unknown-daily'));expect(JSON.stringify(workspace)).toBe(serialized);
});

it('a copied study renderer ID cannot authorize template deletion even on the same qualified symbol',()=>{
 const drawing={...doc('synthetic-foreign-study'),drawings:[{...doc('synthetic-foreign-study').drawings[0],paneId:'recycled-native',lvPaneBinding:{schemaVersion:1,target:{kind:'owners',owners:[{kind:'built',id:'foreign-saved-study'}]}}}]};
 const workspace=patchWorkspace(createInitialWorkspace(),{drawings:drawing}),serialized=JSON.stringify(workspace),template=saveIndicatorTemplate(createIndicatorTemplates(),'Synthetic replacement',{indicators:[],scripts:[],rememberSymbol:false,rememberInterval:false,source:templateSource(fixtureDataset('GME',500))},()=> 'synthetic-template').records[0];
 const makeId=vi.fn(()=> 'synthetic-next');
 expect(()=>prepareTemplateApplication(workspace,template,[{paneId:'price',replaceable:false},{paneId:'recycled-native',replaceable:true}],[],makeId)).toThrow();expect(makeId).not.toHaveBeenCalled();expect(JSON.stringify(workspace)).toBe(serialized);
});

it('bank size plus unrelated workspace data is rejected by aggregate financial admission without stripping archives',()=>{
 const original=createInitialWorkspace();original.syntheticReviewPadding='x'.repeat(31*1024*1024);const guard=createFinancialPublicationGuard(),paper=createPaperAccount();expect(()=>guard(original,[],paper)).not.toThrow();
 const next=structuredClone(original),id=next.grid!.layout.activeCellId;next.grid!.cells[id].drawingScopes!.inactive.push({basis:drawingScopeBasis(fixtureDataset('SPY',1)),document:{version:1,drawings:[],opaque:'x'.repeat(2*1024*1024)}});
 expect(()=>guard(next,[],paper)).toThrow();expect(original.grid!.cells[id].drawingScopes!.inactive).toEqual([]);expect(next.grid!.cells[id].drawingScopes!.inactive).toHaveLength(1);
});
