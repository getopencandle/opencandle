// OpenCandle drawing types built on pinned native Vela classes.
// Each type reuses a registered native class (placement, hit testing, serialization and its
// painter branch, which dispatches by class) and registers under its own type id so it keeps
// its own remembered tool defaults. A type that paints itself instead declares requiresPaintHook
// and implements lvPaint (LV-VELA-DRAWING-PAINT-HOOK-1, src/chart/lv-paint-hook.ts).
// Registration fails closed: when the installed Vela build no longer matches the pinned shape (or
// a hook type finds no paint hook), the type is NOT registered, its toolbar row reports it as
// unavailable, and saved drawings of that type stay retained but unrendered (the same lossless
// "no supported native renderer" path older OpenCandle builds use for unknown types).
//
// The types themselves live in per-tool modules (src/chart/lv-types/*.ts, listed in lv-types/index.ts);
// this module registers them in list order, then installs their factory defaults.
import {Drawing,getDrawingType,registerDrawingType} from '@luxalgo/vela';
// Factory defaults of the native types must be installed first: the types below clone their base's default style.
import {installFactoryDefaults} from './drawing-factory-defaults';
import {PinError,fail,lvKey} from './lv-drawing-pin';
import {installArrowMarkHitArea} from './arrow-mark-hit';
import {paintHookStatus} from './lv-paint-hook';
import {LV_DRAWING_TOOL_MODULES,type LvDrawingToolModule} from './lv-types';
import {LV_SHORT_POSITION} from './lv-types/short-position';
import {LV_DATE_RANGE,LV_PRICE_RANGE} from './lv-types/measure-ranges';
import {DRAWING_FIXES_081_LATE_MODULE,DRAWING_FIXES_081_MODULE} from './drawing-fixes/native-fixes';
import {ELLIOTT_ORIGIN_081_MODULE} from './drawing-fixes/elliott-origin';
import {applyContrastDefaults} from './drawing-fixes/contrast-defaults';

export {LV_SHORT_POSITION,LV_PRICE_RANGE,LV_DATE_RANGE};
export const LV_DRAWING_TYPE_IDS:readonly string[]=Object.freeze(LV_DRAWING_TOOL_MODULES.flatMap(module=>(module.types??[]).map(definition=>definition.type)));
export type LvDrawingTypeId=string;

export interface LvDrawingTypeStatus{readonly type:LvDrawingTypeId;readonly base:string;readonly state:'registered'|'unavailable';readonly reason?:string}

const statuses:LvDrawingTypeStatus[]=[];
/** Registers the types of `modules` in order (fail closed per type), then installs each module's factory defaults. */
export function registerLvDrawingToolModules(modules:readonly LvDrawingToolModule[]):readonly LvDrawingTypeStatus[]{
 const added:LvDrawingTypeStatus[]=[];
 for(const module of modules){
  for(const {type,base,define,requiresPaintHook,replacesNative} of module.types??[]){
   try{
    const existing=getDrawingType(lvKey(type));
    // A replacing type keeps the native id; its define() refuses a registration another module instance already replaced.
    if(replacesNative){if(type!==base)fail('a replacing type must keep its native type id');if(!existing)fail('native type is not registered: '+type);}
    else if(existing)fail('type id is already registered by another module instance');
    if(requiresPaintHook){const hook=paintHookStatus();if(!hook.available)fail('no drawing paint hook: '+hook.reason);}
    const meta=define();
    const probe=meta.create({id:'lv-drawing-type-probe',paneId:'price',createdAt:0});
    if(probe.type!==lvKey(type)||!(probe instanceof Drawing))fail('subclass did not adopt its type id');
    if(requiresPaintHook&&typeof (probe as {lvPaint?:unknown}).lvPaint!=='function')fail('paint hook type has no lvPaint method');
    registerDrawingType(Object.freeze(meta));
    added.push(Object.freeze({type,base,state:'registered'}));
   }catch(error){
    if(!(error instanceof PinError))added.push(Object.freeze({type,base,state:'unavailable',reason:'Unexpected native registration failure: '+String(error)}));
    else added.push(Object.freeze({type,base,state:'unavailable',reason:'The installed chart renderer no longer matches the pinned '+base+' model ('+error.message+').'}));
   }
  }
  for(const definition of module.factoryDefaults??[])installFactoryDefaults(definition);
 }
 statuses.push(...added);
 return Object.freeze(added);
}
installArrowMarkHitArea();
// 0.8.1 drawing fixes (src/chart/drawing-fixes): the geometry fixes replace their native registrations first, so the tool modules
// built on those bases inherit them; the Elliott origin replaces the native waves after the wave and pattern modules pinned them.
// Their statuses are kept apart from the tool module statuses (drawingFixStatus).
const fixStatuses:LvDrawingTypeStatus[]=[];
const registerFixes=(module:LvDrawingToolModule)=>{const before=statuses.length;fixStatuses.push(...registerLvDrawingToolModules([module]));statuses.splice(before);};
registerFixes(DRAWING_FIXES_081_MODULE);
registerLvDrawingToolModules(LV_DRAWING_TOOL_MODULES);
registerFixes(ELLIOTT_ORIGIN_081_MODULE);
registerFixes(DRAWING_FIXES_081_LATE_MODULE);
/** Types whose pale default colour was replaced for contrast on light charts (drawing-fixes/contrast-defaults.ts). */
export const CONTRAST_DEFAULT_TYPES:readonly string[]=Object.freeze(applyContrastDefaults());
/** Registration outcome of each 0.8.1 drawing fix (replaced native types), for diagnostics and tests. */
export function drawingFixStatus():readonly LvDrawingTypeStatus[]{return Object.freeze([...fixStatuses]);}

/** Registration outcome per OpenCandle type, for diagnostics and tests. */
export function lvDrawingTypeStatus():readonly LvDrawingTypeStatus[]{return Object.freeze([...statuses]);}
