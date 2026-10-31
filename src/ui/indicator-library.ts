import type {IndicatorId} from '../domain/indicators';
import {INDICATOR_KINDS as DOMAIN_INDICATORS,indicatorCreationInputs,indicatorPlotIds,defaultIndicatorPresentation,validateIndicatorSettings,assertIndicatorRecord,assertIndicatorNewInputs,assertIndicatorNewOffset,type IndicatorInstanceSettings} from '../chart/indicator-settings';
import {defaultPlotStyle} from '../chart/indicator-port';
export type IndicatorDefault=Pick<IndicatorInstanceSettings,'inputs'|'plots'|'offset'|'visible'|'presentation'>;
export interface IndicatorLibrary {schemaVersion:1;favorites:IndicatorId[];defaults:Partial<Record<IndicatorId,IndicatorDefault>>}
export const INDICATOR_LIBRARY_BYTES=8*1024*1024;
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v)&&(Object.getPrototypeOf(v)===Object.prototype||Object.getPrototypeOf(v)===null);
export function createIndicatorLibrary():IndicatorLibrary{return {schemaVersion:1,favorites:[],defaults:{}};}
export function factoryIndicatorDefault(kind:IndicatorId):IndicatorDefault{
 if(!DOMAIN_INDICATORS.includes(kind))throw new Error('Unsupported indicator.');
 return {inputs:indicatorCreationInputs(kind),plots:Object.fromEntries(indicatorPlotIds[kind].map((plot,index)=>[plot,defaultPlotStyle(kind,plot,index)])),offset:0,visible:true,presentation:defaultIndicatorPresentation(kind)};
}
export function validateIndicatorDefault(kind:IndicatorId,value:unknown):IndicatorDefault{
 assertIndicatorRecord(value);
 if(!object(value)||Object.keys(value).some(key=>!['inputs','plots','offset','visible','presentation'].includes(key)))throw new Error('Invalid indicator default. Defaults cannot contain instance, source or pane ownership.');
 validateIndicatorSettings({id:'default-'+kind,kind,...value});return structuredClone(value) as unknown as IndicatorDefault;
}
export function restoreIndicatorLibrary(value:unknown):IndicatorLibrary{
 assertIndicatorRecord(value);
 if(Array.isArray(value.favorites)&&(Object.getPrototypeOf(value.favorites)!==Array.prototype||!Reflect.ownKeys(value.favorites).every(key=>typeof key==='string'&&(key==='length'||/^(0|[1-9]\d*)$/.test(key)&&Number(key)<(value.favorites as unknown[]).length)&&Object.hasOwn(Object.getOwnPropertyDescriptor(value.favorites!,key)!,'value'))))throw new Error('Invalid indicator favorites.');
 assertIndicatorRecord(value.defaults);
 if(!object(value)||value.schemaVersion!==1||Object.keys(value).some(key=>!['schemaVersion','favorites','defaults'].includes(key))||!Array.isArray(value.favorites)||value.favorites.length>DOMAIN_INDICATORS.length||new Set(value.favorites).size!==value.favorites.length||value.favorites.some(kind=>!DOMAIN_INDICATORS.includes(kind as IndicatorId))||!object(value.defaults))throw new Error('Invalid indicator library.');
 const defaults:IndicatorLibrary['defaults']={};for(const [kind,saved] of Object.entries(value.defaults)){if(!DOMAIN_INDICATORS.includes(kind as IndicatorId))throw new Error('Unsupported default indicator.');defaults[kind as IndicatorId]=validateIndicatorDefault(kind as IndicatorId,saved);}
 if(new TextEncoder().encode(JSON.stringify(value)).length>INDICATOR_LIBRARY_BYTES)throw new Error('Indicator library exceeds 8 MiB.');
 return {schemaVersion:1,favorites:[...value.favorites] as IndicatorId[],defaults};
}
export function toggleIndicatorFavorite(library:IndicatorLibrary,kind:IndicatorId):IndicatorLibrary{
 if(!DOMAIN_INDICATORS.includes(kind))throw new Error('Unsupported indicator.');
 return restoreIndicatorLibrary({...library,favorites:library.favorites.includes(kind)?library.favorites.filter(id=>id!==kind):[...library.favorites,kind]});
}
/**
 * Save as default. The record is validated as stored state, and every input or offset that is new input
 * meets the fact (edit) bounds: a value is restored state only when the instance it was copied from (`source`), the
 * default it replaces, or the factory default holds it. restoreIndicatorLibrary keeps loading pre-fix defaults.
 */
export function saveIndicatorDefault(library:IndicatorLibrary,kind:IndicatorId,value:unknown,source?:Pick<IndicatorDefault,'inputs'|'offset'>):IndicatorLibrary{
 const next=validateIndicatorDefault(kind,value),previous=library.defaults[kind],factory=factoryIndicatorDefault(kind);
 assertIndicatorNewInputs(kind,next.inputs,[source?.inputs,previous?.inputs,factory.inputs]);
 assertIndicatorNewOffset(kind,next.offset,[source?.offset,previous?.offset,factory.offset]);
 return restoreIndicatorLibrary({...library,defaults:{...library.defaults,[kind]:next}});
}
export function clearIndicatorDefault(library:IndicatorLibrary,kind:IndicatorId):IndicatorLibrary{const defaults={...library.defaults};delete defaults[kind];return restoreIndicatorLibrary({...library,defaults});}
export function instanceDefaults(library:IndicatorLibrary,kind:IndicatorId):IndicatorDefault{return structuredClone(library.defaults[kind]??factoryIndicatorDefault(kind));}
/** Ignore calculated values, but pin settings, placement and renderer incarnation. */
export function indicatorEditFingerprint(row:IndicatorInstanceSettings&{paneId:string|null;rendererId:string}):string{return JSON.stringify({id:row.id,kind:row.kind,inputs:row.inputs,plots:row.plots,offset:row.offset,visible:row.visible,...(row.presentation!==undefined?{presentation:row.presentation}:{}),paneId:row.paneId,rendererId:row.rendererId});}
