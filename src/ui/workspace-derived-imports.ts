// Derived interval datasets (2m, 10m, 2h, 1W ... built by local aggregation) are kept in workspace.imports
// so the chart can find them, but they are rebuildable from their source. Saving their bars and bucket lineage made every
// demo interval switch add 0.3-1.4 MB to workspace.json (3 switches: 24 KB -> 2.8 MB), and each later save re-walked it.
// The saved file now holds only a recipe per derived dataset (source key, target interval, policy, list position); the
// bars are rebuilt from the source on load. A derived dataset is written as a recipe only when its source is regenerable
// (the synthetic demo daily or intraday series) or is itself a supplied import in the same file, and only when the rebuild
// reproduces the same dataset id. Anything else is saved exactly as before. Supplied imports are never touched.
import type {BarDataset} from '../domain/types';
import {chooseIntervalSource,intervalDatasetKey,restoreAggregationPolicy,type AggregationPolicy} from '../domain/intervals';
import {demoRecipeSources} from './workspace-grid';

export const DERIVED_IMPORTS_KEY='derivedImports';
export interface DerivedImportRecipe {at:number;sourceKey:string;target:string;policy:AggregationPolicy}

const DEMO_ID=/^lv-synthetic-v1:([A-Z0-9.^=_-]{1,40})(?::(1m|5m|15m|60m))?$/;
const isDerived=(row:BarDataset)=>!!row&&typeof row==='object'&&('derivation' in row||row.provenance?.providerId==='lv-local-aggregation');
const plain=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);

function parseKey(sourceKey:string):[string,string,string,string]|null{
 try{const key=JSON.parse(sourceKey);return Array.isArray(key)&&key.length===4&&key.every(item=>typeof item==='string'&&item.length>0&&item.length<=4096)?key as [string,string,string,string]:null;}catch{return null;}
}
/** The original sources a recipe may be rebuilt from: the demo series it names, or a supplied (non-derived) import. */
function sourcesFor(sourceKey:string,supplied:readonly BarDataset[]):BarDataset[]{
 const key=parseKey(sourceKey);if(!key)return[];
 const demo=key[1]==='lv-synthetic-v1'?DEMO_ID.exec(key[2]):null;
 /* Rebuilt from the generated series in every demo mode (the gated demoDataset is a bar-less placeholder
    when generated prices are hidden); the import is displayed through shownImport, which hides it outside example/legacy. */
 if(demo){const rows=demoRecipeSources(demo[1]!,!!demo[2]);return rows.filter(row=>intervalDatasetKey(row)===sourceKey);}
 return supplied.filter(row=>{try{return !isDerived(row)&&intervalDatasetKey(row)===sourceKey;}catch{return false;}});
}
/** Rebuilt datasets per source bars array, so repeated saves do not re-aggregate. Bounded by the sources' lifetime. */
const rebuilt=new WeakMap<object,Map<string,BarDataset>>(),built=new WeakSet<object>();
/** True only for a dataset object this module rebuilt (never for parsed or caller-supplied data). */
export function isRebuiltDerivedImport(row:unknown):boolean{return !!row&&typeof row==='object'&&built.has(row);}
/** A same-content copy of a rebuilt dataset (validation's own-document copy, same bars array) keeps the mark. */
export function carryRebuiltMark<T extends object>(from:object,to:T):T{if(built.has(from)&&to!==from&&(to as {bars?:unknown}).bars===(from as {bars?:unknown}).bars)built.add(to);return to;}
function rebuild(recipe:Omit<DerivedImportRecipe,'at'>,supplied:readonly BarDataset[]):BarDataset|null{
 const sources=sourcesFor(recipe.sourceKey,supplied);if(sources.length!==1)return null;
 const source=sources[0]!,memoKey=JSON.stringify([recipe.sourceKey,recipe.target,recipe.policy]),memo=rebuilt.get(source.bars)??new Map<string,BarDataset>();
 const hit=memo.get(memoKey);if(hit)return hit;
 const result=chooseIntervalSource([source],{instrumentId:source.instrument.id,target:recipe.target,sourceKey:recipe.sourceKey,policy:recipe.policy});
 if(!result.ok||result.kind!=='derived')return null;
 built.add(result.dataset);memo.set(memoKey,result.dataset);if(memo.size>64)memo.delete(memo.keys().next().value!);rebuilt.set(source.bars,memo);
 return result.dataset;
}
function recipeOf(row:BarDataset):Omit<DerivedImportRecipe,'at'>|null{
 const derivation=(row as {derivation?:unknown}).derivation;if(!plain(derivation))return null;
 const {sourceKey,target,policy}=derivation;if(typeof sourceKey!=='string'||typeof target!=='string'||sourceKey.length>20000||target.length>40)return null;
 try{return{sourceKey,target,policy:restoreAggregationPolicy(policy)};}catch{return null;}
}

/** Split imports for saving: derived rows that rebuild to the same dataset id become recipes. `full` is the import list as it
 * will be after loading (rebuilt rows in place of the originals), for validation; `kept` is what is written. */
export function compactDerivedImports(imports:readonly BarDataset[]):{kept:BarDataset[];recipes:DerivedImportRecipe[];full:BarDataset[]}{
 const supplied=imports.filter(row=>!isDerived(row)),kept:BarDataset[]=[],recipes:DerivedImportRecipe[]=[],full:BarDataset[]=[];
 imports.forEach((row,at)=>{
  const recipe=isDerived(row)?recipeOf(row):null,again=recipe?rebuild(recipe,supplied):null;
  if(recipe&&again&&again.provenance.datasetId===row.provenance?.datasetId&&again.resolution===row.resolution){recipes.push({at,...recipe});full.push(again);}
  else{kept.push(row);full.push(row);}
 });
 return{kept,recipes,full};
}
/** The import rows a save actually writes (derived rows that become recipes left out), per imports array.
 * Size guards that run on every commit measure this instead of walking derived bars that are never written. */
const writtenCache=new WeakMap<readonly BarDataset[],BarDataset[]>();
export function writtenImports(imports:readonly BarDataset[]):BarDataset[]{
 const hit=writtenCache.get(imports);if(hit)return hit;
 const kept=imports.some(isDerived)?compactDerivedImports(imports).kept:imports as BarDataset[];writtenCache.set(imports,kept);return kept;
}
/** The workspace as a save writes it, for measuring: identical when no derived row is left out. */
export function writtenWorkspaceShape<T extends object>(workspace:T):T{
 const imports=(workspace as {imports?:unknown}).imports;if(!Array.isArray(imports))return workspace;
 const kept=writtenImports(imports as BarDataset[]);return kept===imports?workspace:{...workspace,imports:kept};
}
/** Load side: put the rebuilt datasets back at their saved positions. A recipe that cannot be rebuilt fails the load with
 * its reason (the saved file is left as it is and the recovery path applies); no other data is substituted. */
export function expandDerivedImports(imports:readonly BarDataset[],input:unknown):BarDataset[]{
 if(!Array.isArray(input)||input.length>1000)throw new Error('Invalid derived interval recipes.');
 const supplied=imports.filter(row=>!isDerived(row)),result=[...imports],placed:{at:number;row:BarDataset}[]=[];
 for(const value of input){
  if(!plain(value)||Object.keys(value).some(key=>!['at','sourceKey','target','policy'].includes(key))||!Number.isSafeInteger(value.at)||(value.at as number)<0||typeof value.sourceKey!=='string'||typeof value.target!=='string')throw new Error('Invalid derived interval recipe.');
  let policy:AggregationPolicy;try{policy=restoreAggregationPolicy(value.policy);}catch{throw new Error('Invalid derived interval recipe policy.');}
  const row=rebuild({sourceKey:value.sourceKey,target:value.target,policy},supplied);
  if(!row)throw new Error('A saved '+value.target+' interval could not be rebuilt from its source. The saved file was not changed.');
  if(result.some(item=>item.provenance?.datasetId===row.provenance.datasetId)||placed.some(item=>item.row.provenance.datasetId===row.provenance.datasetId))throw new Error('Duplicate derived interval recipe.');
  placed.push({at:value.at as number,row});
 }
 for(const item of placed.sort((a,b)=>a.at-b.at))result.splice(Math.min(item.at,result.length),0,item.row);
 return result;
}
