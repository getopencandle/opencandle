import {restoreWorkspace} from './workspace-validation';
import {ensureWorkspaceGrid,projectGrid,workspaceDatasets} from './workspace-grid';
import {createInitialWorkspace,type Workspace} from './workspace-state';
import {prepareWorkspaceJSON,measureWorkspaceJSON} from './workspace-json';
import {type PaperAccount} from '../domain/paper';
import {restorePaperStateSafe,type PaperBook} from '../domain/paper-book';
import {restoreLocalAlerts,type LocalAlert} from '../domain/alerts';
import {drawingTypes} from '@luxalgo/vela';
import {sourceContextForDataset} from '../chart/source-context';
import {parseCompoundPrivateDocument,type CompoundPrivateDocument} from './compound-alert-document';
import {compactDerivedImports,expandDerivedImports,DERIVED_IMPORTS_KEY} from './workspace-derived-imports';
import type {BarDataset} from '../domain/types';

export const WORKSPACE_IMPORT_BYTES=64*1024*1024;
export interface WorkspaceReplacement {workspace:Workspace;paper:PaperAccount;paperBook:PaperBook|null;alerts:LocalAlert[];compoundAlerts?:CompoundPrivateDocument;data:Record<string,unknown>;summary:string[];migrations:string[]}
const required=['version','symbol','chartStyle','themeId','appearance','watchlist','drawings','indicators','imports','sourceId','script','strategy','chartOptions','paper','alerts'];
const optionalLegacy=['layoutLibrary','grid','watchBook','watchAdvanced','intervals','scriptLibrary','scriptBindings','drawingPreferences','drawingFavorites','indicatorLibrary','indicatorTemplates','chartTypeSettings','heatmap','portfolio','marketViews','calendar','fundamentals','fundamentalsPreferences','news','filings','comparisons','screener'];
const transient=['replay','replayPaper','storage','revision','expectedRevision','savedAt','schemaVersion','storageDirectory'];

/** Validate exported data without evaluating original scripts or contacting a provider. */
export function prepareWorkspaceReplacement(text:string):WorkspaceReplacement{
 if(typeof text!=='string'||text.length>WORKSPACE_IMPORT_BYTES||new TextEncoder().encode(text).length>WORKSPACE_IMPORT_BYTES)throw new Error('Workspace export text exceeds 64 MiB.');
 let envelope:unknown;try{envelope=JSON.parse(text);}catch{throw new Error('Choose valid workspace export JSON.');}
 if(!envelope||typeof envelope!=='object'||Array.isArray(envelope))throw new Error('Expected an exported workspace envelope.');
 const keys=Object.keys(envelope);if(keys.length!==2||!keys.includes('schemaVersion')||!keys.includes('data')||(envelope as any).schemaVersion!==1)throw new Error('Expected exactly schemaVersion 1 and data. Internal storage files are not exports.');
 return prepareWorkspaceData((envelope as {data:unknown}).data);
}
/** Shared complete saved/exported payload boundary. Missing core fields cannot
 * masquerade as a recovered workspace filled with synthetic initial defaults. */
export function prepareWorkspaceData(input:unknown):WorkspaceReplacement{
 // IPC/JSON.parse already detached ordinary JSON data. Validate before any
 // domain reads without allocating a redundant complete bar-history clone.
 // Derived interval datasets are written as recipes (workspace-derived-imports.ts) and rebuilt here, so the
 // JSON walks below cover only what is written. A file saved before this change has its derived rows rebuilt the same way
 // and written back as recipes on the next save (the persisted bars are never trusted or kept for those rows).
 let data=input as Record<string,unknown>,derived:ReturnType<typeof compactDerivedImports>|null=null;
 const field=(key:string)=>data&&typeof data==='object'?Object.getOwnPropertyDescriptor(data,key):undefined,importsField=field('imports'),recipesField=field(DERIVED_IMPORTS_KEY);
 if(data&&typeof data==='object'&&!Array.isArray(data)&&Object.getPrototypeOf(data)===Object.prototype&&importsField&&Object.hasOwn(importsField,'value')&&(!recipesField||Object.hasOwn(recipesField,'value'))&&Array.isArray(importsField.value)&&(importsField.value as unknown[]).every(row=>!!row&&typeof row==='object'&&!Array.isArray(row))){
  // Every other field is measured through its own descriptors, so an accessor is refused without being invoked.
  const fields=Object.getOwnPropertyDescriptors(data) as Record<string,PropertyDescriptor>;delete fields.imports;delete fields[DERIVED_IMPORTS_KEY];
  measureWorkspaceJSON(Object.defineProperties({},fields));if(recipesField)measureWorkspaceJSON({recipes:recipesField.value});
  const recipes=recipesField?.value,stored=importsField.value as BarDataset[],rest=Object.defineProperties({},fields) as Record<string,unknown>;
  derived=compactDerivedImports(Object.hasOwn(data,DERIVED_IMPORTS_KEY)?expandDerivedImports(stored,recipes):stored);
  measureWorkspaceJSON({imports:derived.kept});data={...rest,imports:derived.full};
 }else{if(data&&typeof data==='object'&&Object.hasOwn(data,DERIVED_IMPORTS_KEY))throw new Error('Invalid derived interval recipes.');measureWorkspaceJSON(input);}
 // Private compound data is validated here without constructing stores or
 // replaying notifications. Its canonical runtime book stays outside Workspace.
 const compoundAlerts=Object.hasOwn(data,'compoundAlerts')?parseCompoundPrivateDocument(JSON.stringify(data.compoundAlerts)):undefined;
 for(const key of required)if(!Object.hasOwn(data,key))throw new Error('Workspace export is missing '+key+'.');
 for(const key of transient)if(Object.hasOwn(data,key))throw new Error('Workspace export cannot contain '+key+'.');
 const defaults=createInitialWorkspace();
 const restored=ensureWorkspaceGrid(restoreWorkspace(data,defaults));
 const workspace=projectGrid(restored,restored.grid),paperState=restorePaperStateSafe(data.paper,data.paperBook),paper=paperState.paper,alerts=restoreLocalAlerts(data.alerts);
 if(paper.mode!=='paper'||paper.virtual!==true)throw new Error('The ordinary workspace slot requires a local virtual paper account. Replay accounts cannot replace it.');
 delete workspace.paper;delete workspace.alerts;delete (workspace as Record<string,unknown>).paperBook;delete (workspace as Record<string,unknown>).paperBookQuarantine;
 delete workspace.compoundAlerts;
 const ids=new Set(workspace.grid!.layout.cells.map(cell=>cell.id));
 if(Object.keys(workspace.grid!.cells).some(id=>!ids.has(id)))throw new Error('Workspace has chart settings outside the declared layout.');
 const datasets=workspaceDatasets(workspace),available=new Set(datasets.map(dataset=>dataset.provenance.datasetId));
 datasets.forEach(dataset=>sourceContextForDataset(dataset));
 for(const cell of Object.values(workspace.grid!.cells))for(const comparison of cell.comparisons)if(!available.has(comparison.datasetId))throw new Error('A comparison source is missing: '+comparison.datasetId+'.');
 // Revalidate the final complete payload after migrations and domain normalization.
 const quarantine=paperState.quarantined?paperState.quarantined.raw:data.paperBookQuarantine;
 const recipeRows=new Set(derived?.recipes.map(row=>row.at)??[]),written=derived?.recipes.length?{imports:workspace.imports.filter((_,index)=>!recipeRows.has(index)),[DERIVED_IMPORTS_KEY]:derived.recipes}:{};
 const prepared=prepareWorkspaceJSON({...workspace,...written,paper,alerts,...(paperState.book?{paperBook:paperState.book}:{}),...(quarantine!==undefined?{paperBookQuarantine:quarantine}:{}),...(compoundAlerts?{compoundAlerts}:{})});
 const cells=Object.values(workspace.grid!.cells),chartSources=workspace.grid!.layout.cells.map(cell=>datasets.find(dataset=>dataset.provenance.datasetId===workspace.grid!.cells[cell.id].datasetId)!);
 const migrations=optionalLegacy.filter(key=>!Object.hasOwn(data,key)).map(key=>'Legacy export: initialized '+key+' using documented local defaults.');
 if(paperState.notice)migrations.push(paperState.notice);
 const originalGrid=data.grid as Workspace['grid'];if(originalGrid)for(const row of originalGrid.layout.cells)if(!Object.hasOwn(originalGrid.cells[row.id],'drawingScopes'))migrations.push('Legacy chart '+row.id+': assigned its drawings only to the exact saved source.');
 const archived=cells.flatMap(cell=>cell.drawingScopes?.inactive??[]),drawings=cells.reduce((total,cell)=>total+(cell.drawings.drawings as unknown[]).length,0),archivedDrawings=archived.reduce((total,row)=>total+(row.document.drawings as unknown[]).length,0),indicators=cells.reduce((total,cell)=>total+cell.indicators.length,0),bindings=cells.reduce((total,cell)=>total+(cell.scriptBindings?.length??0),0);
 const knownDrawings=new Set(drawingTypes().map(row=>String(row.type))),documents=[...cells.map(cell=>cell.drawings),...archived.map(row=>row.document)],opaque=documents.reduce((total,doc)=>total+(doc.drawings as Array<{type:string}>).filter(row=>!knownDrawings.has(row.type)).length,0);
 const summary=[
  workspace.symbol+' · '+workspace.grid!.layout.cells.find(cell=>cell.id===workspace.grid!.layout.activeCellId)!.interval+' · '+cells.length+' chart(s).',
  workspace.imports.length+' imported source(s), '+workspace.imports.reduce((sum,dataset)=>sum+dataset.bars.length,0).toLocaleString()+' imported bars. Schema checks do not establish data rights or price accuracy.',
  chartSources.filter(dataset=>dataset.provenance.fixture).length+' chart(s) use labeled synthetic fixtures; '+chartSources.filter(dataset=>!dataset.provenance.fixture).length+' use supplied history.',
  workspace.drawingFavorites.length+' favorite drawing tools.',
  drawings+' drawings, '+indicators+' built-in indicators, '+bindings+' script bindings and '+workspace.scriptLibrary.documents.length+' script documents.',
  archivedDrawings+' additional drawing(s) retained in '+archived.length+' inactive symbol/basis archives. Templates remain available across this chart\'s symbols.',
  opaque+' unsupported drawing(s) retained in the export but unavailable to render or edit with this version.',
  (paperState.book?paperState.book.inactive.length+1:1)+' virtual account(s), '+(paperState.book?.presets?.length??0)+' order preset(s).',
  workspace.watchBook.lists.length+' watchlist(s), '+alerts.length+' local alerts, '+paper.orders.length+' virtual orders and '+paper.fills.length+' virtual fills.',
  'Included scripts may run after you replace the workspace. Nothing runs during preview.',
  'This replaces the local workspace and virtual trading state. Replay and chart Undo history are cleared. Export a copy first if needed.',
  ...migrations
 ];
 if(compoundAlerts)summary.push(compoundAlerts.records.length+' all-conditions alerts. Restricted live alert history remains private local data.');
 return {workspace,paper,paperBook:paperState.book,alerts,...(compoundAlerts?{compoundAlerts}:{}),data:prepared,summary,migrations};
}
