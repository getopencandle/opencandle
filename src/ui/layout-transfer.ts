import type {Workspace} from './workspace-state';
import type {MultiChartState} from './MultiChartGrid';
import {createLayoutLibrary,layoutName,layoutOwnedCounts} from './layout-library';
import {projectGrid,workspaceDatasets} from './workspace-grid';
import {prepareWorkspaceJSON,measureWorkspaceJSON} from './workspace-json';
import {restoreWorkspace} from './workspace-validation';
import {sourceContextForDataset,sameChartSourceBasis,type ChartSourceContext} from '../chart/source-context';
export const LAYOUT_EXPORT_BYTES=20*1024*1024;
export type LayoutSourceReference=Omit<ChartSourceContext,'inputIdentity'>;
export interface LayoutFile {schemaVersion:1;kind:'lv-layout';name:string;grid:MultiChartState;sources:LayoutSourceReference[]}
function sources(workspace:Workspace,grid:MultiChartState):LayoutSourceReference[]{
 if(!grid||!grid.cells||typeof grid.cells!=='object'||Array.isArray(grid.cells)||!Array.isArray(grid.layout?.cells))throw new Error('Invalid layout source graph.');
 for(const cell of Object.values(grid.cells))if(!cell||typeof cell.datasetId!=='string'||!Array.isArray(cell.comparisons)||cell.comparisons.some(row=>!row||typeof row.datasetId!=='string'))throw new Error('Invalid layout chart source or comparison reference.');
 const available=workspaceDatasets({...workspace,grid}),ids=new Set(Object.values(grid.cells).flatMap(cell=>[cell.datasetId,...cell.comparisons.map(row=>row.datasetId)]));
 return [...ids].sort().map(id=>{const rows=available.filter(row=>row.provenance.datasetId===id);if(rows.length!==1)throw new Error('Exact layout source is missing or ambiguous: '+id+'.');const {inputIdentity:runtimeOnly,...portable}=sourceContextForDataset(rows[0]);return portable;});
}
export function exportLayoutText(workspace:Workspace):string{
 if(!workspace.grid)throw new Error('No chart layout is available.');const file:LayoutFile={schemaVersion:1,kind:'lv-layout',name:workspace.grid.layout.name,grid:workspace.grid,sources:sources(workspace,workspace.grid)};
 const text=JSON.stringify(prepareWorkspaceJSON(file));if(new TextEncoder().encode(text).length>LAYOUT_EXPORT_BYTES)throw new Error('This layout exceeds the 20 MiB layout-file export limit. Use the full workspace export.');return text;
}
export function previewLayoutText(text:string,workspace:Workspace):{file:LayoutFile;summary:string[]}{
 if(typeof text!=='string'||text.length>32*1024*1024||new TextEncoder().encode(text).length>32*1024*1024)throw new Error('Layout import exceeds 32 MiB.');let raw:unknown;try{raw=JSON.parse(text);}catch{throw new Error('Choose a valid layout JSON file.');}measureWorkspaceJSON(raw);
 const file=raw as LayoutFile;if(Object.keys(file).sort().join(',')!=='grid,kind,name,schemaVersion,sources'||file.schemaVersion!==1||file.kind!=='lv-layout'||layoutName(file.name)!==file.name||!file.grid||file.name!==file.grid.layout?.name||!Array.isArray(file.sources))throw new Error('Unsupported layout file.');
 const expected=sources(workspace,file.grid);if(expected.length!==file.sources.length||expected.some((source,index)=>{const actual=file.sources[index];return !actual||Object.keys(actual).sort().join(',')!=='basisIdentity,datasetId,fixture,label,resolution,revision'||!sameChartSourceBasis(source,actual,true);}))throw new Error('A layout source is missing, corrected or uses a different price/session basis. Supply the exact referenced data before importing.');
 const next=projectGrid({...workspace,layoutLibrary:createLayoutLibrary(file.grid)},file.grid);restoreWorkspace(next,workspace);
 const counts=layoutOwnedCounts(file.grid);return{file:structuredClone(file),summary:[file.name+': '+counts.charts+' charts, '+counts.drawings+' drawings and '+counts.studies+' studies.',expected.filter(row=>row.fixture).length+' synthetic source(s), '+expected.filter(row=>!row.fixture).length+' local imported source(s). No source bars are included in this file.','References match the declared provider, revision and price/session basis. They are not a checksum of the underlying bars.','Adds a separate saved layout with new layout and chart identities. Names may repeat. Existing layouts and global collections are retained.','Applied CandleScript bindings can execute only when the imported layout is opened. No script runs during this preview.']};
}
