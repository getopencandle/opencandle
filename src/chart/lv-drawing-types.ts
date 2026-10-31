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
registerLvDrawingToolModules(LV_DRAWING_TOOL_MODULES);

/** Registration outcome per OpenCandle type, for diagnostics and tests. */
export function lvDrawingTypeStatus():readonly LvDrawingTypeStatus[]{return Object.freeze([...statuses]);}
