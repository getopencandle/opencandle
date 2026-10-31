import {expect,it} from 'vitest';
import {createInitialWorkspace} from '../../src/ui/workspace-state';
import {restoreWorkspace} from '../../src/ui/workspace-validation';
import {prepareWorkspaceData} from '../../src/ui/workspace-transfer';
import {createPaperAccount} from '../../src/domain/paper';
import {prepareWorkspaceJSON} from '../../src/ui/workspace-json';
import {historicalChartWorkspace,changedChartGrid} from '../../src/ui/workspace-history';
import {renameSavedLayout,duplicateSavedLayout,deleteSavedLayout,prepareLayoutSave} from '../../src/ui/layout-library';
import {projectGrid} from '../../src/ui/workspace-grid';

it('migrates an absent library from the exact stored grid and discloses it in complete payload recovery',()=>{
 const original=createInitialWorkspace();original.grid!.layout.name='Exact saved legacy';original.grid!.cells[original.grid!.layout.activeCellId].appearance.background='#654321';
 const input={...original};delete input.layoutLibrary;
 const recovered=restoreWorkspace(input,createInitialWorkspace());expect(recovered.layoutLibrary!.entries[0].grid).toEqual(input.grid);expect(recovered.layoutLibrary!.entries[0].savedAt).toBe(0);
 const complete=prepareWorkspaceData(prepareWorkspaceJSON({...input,paper:createPaperAccount(),alerts:[]}));expect(complete.migrations.some(text=>text.includes('layoutLibrary'))).toBe(true);expect(complete.workspace.layoutLibrary!.entries[0].grid).toEqual(input.grid);
 for(const malformed of [null,undefined,{}, {schemaVersion:2}])expect(()=>restoreWorkspace({...input,layoutLibrary:malformed} as any,original)).toThrow();
});
it('validates saved inactive sources and exact chart ownership before returning a library',()=>{
 const state=createInitialWorkspace();let sequence=0;const duplicate=duplicateSavedLayout(state.layoutLibrary!,state.grid!,state.grid!,'Inactive',100,()=> 'review-'+(++sequence));
 const missing=structuredClone(duplicate.library);missing.entries[1].grid.cells[missing.entries[1].grid.layout.activeCellId].datasetId='unavailable-import';
 expect(()=>restoreWorkspace({...state,layoutLibrary:missing},state)).toThrow();
 const collision=structuredClone(duplicate.library),cell=state.grid!.layout.activeCellId,other=collision.entries[1].grid.layout.activeCellId;
 collision.entries[1].grid.cells={[cell]:collision.entries[1].grid.cells[other]};collision.entries[1].grid.layout.cells[0].id=cell;collision.entries[1].grid.layout.activeCellId=cell;
 expect(()=>restoreWorkspace({...state,layoutLibrary:collision},state)).toThrow();
});
it('projects chart Undo over every current global owner and saved library without resurrecting a deleted layout',()=>{
 const before=createInitialWorkspace();let index=0;const added=duplicateSavedLayout(before.layoutLibrary!,before.grid!,before.grid!,'Deleted',100,()=> 'old-'+(++index));
 const historical={...before,layoutLibrary:added.library};const renamed=renameSavedLayout(added.library,before.grid!,before.grid!.layout.id,'Current name');
 const working=structuredClone(renamed.grid);working.cells[working.layout.activeCellId].appearance.background='#abcdef';
 const latest=projectGrid({...before,layoutLibrary:deleteSavedLayout(prepareLayoutSave(renamed.library,working,200),added.entry.id),watchBook:{...before.watchBook,notes:[]},imports:[...before.imports],scriptLibrary:{...before.scriptLibrary,documents:[...before.scriptLibrary.documents]},news:{...before.news},calendar:{...before.calendar},fundamentals:[...before.fundamentals],filings:[...before.filings],heatmap:{...before.heatmap},indicatorLibrary:{...before.indicatorLibrary},indicatorTemplates:{...before.indicatorTemplates},globalExtension:{paperBalance:77,alerts:['new']}},working);
 const restored=historicalChartWorkspace(latest,historical);
 for(const key of ['layoutLibrary','watchBook','imports','scriptLibrary','news','calendar','fundamentals','filings','heatmap','indicatorLibrary','indicatorTemplates','globalExtension'])expect((restored as Record<string,unknown>)[key]).toBe((latest as Record<string,unknown>)[key]);
 expect(restored.layoutLibrary!.entries.some(row=>row.id===added.entry.id)).toBe(false);expect(restored.grid!.layout.name).toBe('Current name');expect(restored.grid!.cells[restored.grid!.layout.activeCellId].appearance.background).toBe(before.grid!.cells[before.grid!.layout.activeCellId].appearance.background);
 expect(changedChartGrid(latest,{...latest,globalExtension:{...latest.globalExtension,paperBalance:99}})).toBe(false);expect(changedChartGrid(latest,restored)).toBe(true);
 const foreign=structuredClone(historical);foreign.grid!.layout.id='another-opened-layout';expect(()=>historicalChartWorkspace(latest,foreign)).toThrow();
});
