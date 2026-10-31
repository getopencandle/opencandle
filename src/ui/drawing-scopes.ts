import type {AssetClass,AdjustmentBasis,BarDataset} from '../domain/types';
import {drawingTypes} from '@luxalgo/vela';
import {splitDrawingDocumentTemplates,combineDrawingDocumentTemplates} from '../chart/drawing-document-bindings';
import {prepareWorkspaceJSON} from './workspace-json';

export const MAX_DRAWING_SCOPES=128;
export interface DrawingScopeBasis {
 exchange:string;symbol:string;synthetic:boolean;instrumentId:string;currency:string;assetClass:AssetClass;
 adjustment:AdjustmentBasis;coordinateModel:'time-price';unknownSource:{providerId:string;datasetId:string}|null;
}
export interface CellDrawingScopes {schemaVersion:1;activeBasis:DrawingScopeBasis;inactive:{basis:DrawingScopeBasis;document:Record<string,unknown>}[]}
export interface DrawingScopedCell {drawings:Record<string,unknown>;drawingScopes?:CellDrawingScopes}
const assets=['stock','etf','index','option','future','forex','crypto','commodity','bond','other'];
const adjustments=['raw','split-adjusted','total-return','unknown'];
const knownDrawings=new Set(drawingTypes().map(row=>String(row.type)));
function record(value:unknown):Record<string,unknown>{if(!value||typeof value!=='object'||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value)))throw Error('Drawing scope requires plain records.');return value as Record<string,unknown>;}
function own(value:unknown,key:string):unknown{const row=record(value),descriptor=Object.getOwnPropertyDescriptor(row,key);if(!descriptor||!descriptor.enumerable||!Object.hasOwn(descriptor,'value'))throw Error('Drawing scope field '+key+' requires an explicit data value.');return descriptor.value;}
function exact(value:unknown,keys:string[]){const row=record(value);if(Reflect.ownKeys(row).length!==keys.length||Reflect.ownKeys(row).some(key=>typeof key!=='string'||!keys.includes(key)))throw Error('Unsupported drawing scope fields.');for(const key of keys)own(row,key);return row;}
function text(value:unknown):string{if(typeof value!=='string'||!value.length||value.length>4096)throw Error('Invalid drawing scope identity.');return value;}
function basis(value:unknown):DrawingScopeBasis{
 const row=exact(value,['exchange','symbol','synthetic','instrumentId','currency','assetClass','adjustment','coordinateModel','unknownSource']);
 if(typeof row.synthetic!=='boolean'||typeof row.assetClass!=='string'||!assets.includes(row.assetClass)||typeof row.adjustment!=='string'||!adjustments.includes(row.adjustment)||row.coordinateModel!=='time-price'||typeof row.currency!=='string'||!/^[A-Z]{3}$/.test(row.currency))throw Error('Invalid drawing coordinate basis.');
 let unknownSource:DrawingScopeBasis['unknownSource']=null;
 if(row.adjustment==='unknown'){const source=exact(row.unknownSource,['providerId','datasetId']);unknownSource={providerId:text(source.providerId),datasetId:text(source.datasetId)};}
 else if(row.unknownSource!==null)throw Error('Known drawing adjustment must not use an ambiguous source bucket.');
 return{exchange:text(row.exchange),symbol:text(row.symbol),synthetic:row.synthetic,instrumentId:text(row.instrumentId),currency:row.currency,assetClass:row.assetClass as AssetClass,adjustment:row.adjustment as AdjustmentBasis,coordinateModel:'time-price',unknownSource};
}
/** Read only declared metadata. Bars and custom getters are never consulted. */
export function drawingScopeBasis(dataset:BarDataset):DrawingScopeBasis{
 const instrument=own(dataset,'instrument'),provenance=own(dataset,'provenance'),adjustment=own(provenance,'adjustment');
 return basis({exchange:own(instrument,'exchange'),symbol:own(instrument,'symbol'),synthetic:own(provenance,'fixture'),instrumentId:own(instrument,'id'),currency:own(instrument,'currency'),assetClass:own(instrument,'assetClass'),adjustment,coordinateModel:'time-price',unknownSource:adjustment==='unknown'?{providerId:own(provenance,'providerId'),datasetId:own(provenance,'datasetId')}:null});
}
export function drawingScopeKey(value:DrawingScopeBasis):string{return JSON.stringify(basis(value));}
function document(value:unknown):Record<string,unknown>{
 const doc=record(value);if(!Array.isArray(doc.drawings)||doc.drawings.length>10000)throw Error('Invalid scoped drawing document.');const ids=new Set<string>();
 for(const item of doc.drawings){const row=record(item),id=text(row.id),type=text(row.type);if(ids.has(id))throw Error('Duplicate scoped drawing identity.');ids.add(id);if(knownDrawings.has(type)&&(!Array.isArray(row.anchors)||!row.anchors.every(value=>{const point=record(value);return typeof point.time==='number'&&Number.isFinite(point.time)&&typeof point.price==='number'&&Number.isFinite(point.price);})))throw Error('Invalid scoped drawing anchors.');}
 return doc;
}
/** Only the exact empty format is disposable. Unknown metadata is user data. */
function empty(doc:Record<string,unknown>):boolean{
 if((doc.drawings as unknown[]).length||Object.keys(doc).some(key=>!['version','drawings','lvDrawingManager'].includes(key))||doc.version!==undefined&&doc.version!==1)return false;
 if(!Object.hasOwn(doc,'lvDrawingManager'))return true;const manager=record(doc.lvDrawingManager);
 return manager.schemaVersion===1&&Array.isArray(manager.groups)&&!manager.groups.length&&Array.isArray(manager.templates)&&!manager.templates.length&&Object.keys(manager).every(key=>['schemaVersion','groups','templates'].includes(key));
}
function normalizedCell(cell:DrawingScopedCell):{drawings:Record<string,unknown>;scopes:CellDrawingScopes|null}{
 const active=own(cell,'drawings'),hasScopes=Object.hasOwn(cell,'drawingScopes');
 const scopeInput=hasScopes?own(cell,'drawingScopes'):null;if(hasScopes&&scopeInput===undefined)throw Error('An explicit undefined drawing scope is invalid.');
 const normalized=prepareWorkspaceJSON({drawings:active,scopes:scopeInput}),drawings=document(normalized.drawings);
 if(!hasScopes)return{drawings,scopes:null};
 const raw=exact(normalized.scopes,['schemaVersion','activeBasis','inactive']);if(raw.schemaVersion!==1||!Array.isArray(raw.inactive)||raw.inactive.length>MAX_DRAWING_SCOPES)throw Error('Unsupported or excessive drawing scopes.');
 const activeBasis=basis(raw.activeBasis),keys=new Set([drawingScopeKey(activeBasis)]);
 const inactive=raw.inactive.map(value=>{const row=exact(value,['basis','document']),entryBasis=basis(row.basis),key=drawingScopeKey(entryBasis),doc=document(row.document);if(keys.has(key))throw Error('Duplicate active or inactive drawing scope.');keys.add(key);const separated=splitDrawingDocumentTemplates(doc);if(separated.library.templates.length)throw Error('An inactive drawing scope cannot own shared templates.');if(empty(doc))throw Error('An empty drawing scope must not be retained.');return{basis:entryBasis,document:doc};});
 const scopes:CellDrawingScopes={schemaVersion:1,activeBasis,inactive};assertCapacity(drawings,scopes);return{drawings,scopes};
}
function assertCapacity(drawings:Record<string,unknown>,scopes:CellDrawingScopes){
 // A future manager is retained and counts as nonempty. Only extraction on an
 // actual scope change needs to understand that future manager's template rules.
 const manager=drawings.lvDrawingManager;
 const active=manager&&typeof manager==='object'&&!Array.isArray(manager)&&(manager as Record<string,unknown>).schemaVersion!==1?drawings:splitDrawingDocumentTemplates(drawings).document;
 if(scopes.inactive.length+(empty(active)?0:1)>MAX_DRAWING_SCOPES)throw Error('This chart has too many saved drawing groups. Remove unused drawings before adding another.');
}
/** Missing is legacy. Explicit malformed fields never silently become legacy. */
export function validateCellDrawingScopes(cell:DrawingScopedCell,dataset:BarDataset):CellDrawingScopes|null{
 const value=normalizedCell(cell);if(value.scopes&&drawingScopeKey(value.scopes.activeBasis)!==drawingScopeKey(drawingScopeBasis(dataset)))throw Error('The active drawing scope does not match the selected chart source.');return value.scopes;
}
/** Pure preparation. The caller publishes this with the source in one transaction.
 * History restoration uses its stored cell and must not invoke this transition. */
export function transitionDrawingScope<T extends DrawingScopedCell>(cell:T,before:BarDataset,next:BarDataset):T&{drawingScopes:CellDrawingScopes}{
 return transitionScope(cell,()=>drawingScopeBasis(before),()=>drawingScopeBasis(next));
}
/** Undo is not navigation: the same transition between two declared bases. History restoration uses it only to show a
 * restored cell on the source the user navigated to since; the restored archive itself is not re-derived. */
export function transitionDrawingScopeBasis<T extends DrawingScopedCell>(cell:T,before:DrawingScopeBasis,next:DrawingScopeBasis):T&{drawingScopes:CellDrawingScopes}{
 return transitionScope(cell,()=>basis(before),()=>basis(next));
}
/** The cell's drawing documents keyed by source scope, independent of which scope is active. Two cells with the same
 * bank hold the same drawings for every symbol; a symbol switch moves documents between active and inactive only. */
export function drawingScopeBank(cell:DrawingScopedCell):{library:unknown;scopes:[string,Record<string,unknown>][]}|null{
 const value=normalizedCell(cell);if(!value.scopes)return null;const separated=splitDrawingDocumentTemplates(value.drawings),scopes:[string,Record<string,unknown>][]=value.scopes.inactive.map(row=>[drawingScopeKey(row.basis),row.document]);
 if(!empty(separated.document))scopes.push([drawingScopeKey(value.scopes.activeBasis),separated.document]);
 scopes.sort((a,b)=>a[0]<b[0]?-1:a[0]>b[0]?1:0);return{library:separated.library,scopes};
}
function transitionScope<T extends DrawingScopedCell>(cell:T,beforeOf:()=>DrawingScopeBasis,nextOf:()=>DrawingScopeBasis):T&{drawingScopes:CellDrawingScopes}{
 // This generic cell is copied shallowly after the drawing payload is validated.
 // Refuse accessors before object spread, including unrelated cell properties.
 for(const key of Reflect.ownKeys(record(cell))){if(typeof key!=='string')throw Error('Drawing cells cannot contain symbol fields.');own(cell,key);}
 const value=normalizedCell(cell),beforeBasis=beforeOf(),nextBasis=nextOf(),beforeKey=drawingScopeKey(beforeBasis),nextKey=drawingScopeKey(nextBasis);
 if(value.scopes&&drawingScopeKey(value.scopes.activeBasis)!==beforeKey)throw Error('The opening drawing scope no longer owns this chart source.');
 if(beforeKey===nextKey){if(value.scopes)return cell as T&{drawingScopes:CellDrawingScopes};const scopes:CellDrawingScopes={schemaVersion:1,activeBasis:beforeBasis,inactive:[]};assertCapacity(value.drawings,scopes);return{...cell,drawings:value.drawings,drawingScopes:scopes};}
 const separated=splitDrawingDocumentTemplates(value.drawings),inactive=value.scopes?.inactive??[],target=inactive.find(row=>drawingScopeKey(row.basis)===nextKey);
 const retained=inactive.filter(row=>row!==target);if(!empty(separated.document))retained.push({basis:beforeBasis,document:separated.document});
 const drawings=combineDrawingDocumentTemplates(target?.document??{version:1,drawings:[]},separated.library),drawingScopes:CellDrawingScopes={schemaVersion:1,activeBasis:nextBasis,inactive:retained};
 assertCapacity(drawings,drawingScopes);prepareWorkspaceJSON({drawings,drawingScopes});
 return{...cell,drawings,drawingScopes};
}
