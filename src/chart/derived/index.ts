// Dispatcher for the LV derived (non-time) chart transforms.
import type {Bar} from '../../domain/types';
import {isDerivedStyle,resolveStep,unavailable,validBars,type DerivedBar,type DerivedResult,type DerivedStyle} from './common';
import {renko,type RenkoSettings} from './renko';
import {kagi,type KagiSettings} from './kagi';
import {pointFigure,type PointFigureSettings} from './pointfigure';
import {lineBreak,type LineBreakSettings} from './linebreak';
import {rangeBars,type RangeSettings} from './range';
export * from './common';

export interface DerivedContext {
  /** Instrument tick size; required by Range. */
  tickSize?:number;
  /** Treat the last source bar as still forming: display bars CONFIRMED by it (confirmedAt, not span end) move to projection. */
  lastBarOpen?:boolean;
  /** A step (box size or reversal amount) pinned by the caller for ATR and Percentage methods. */
  pinnedStep?:number;
}
/** The step inputs of the types that resolve one (resolveStep). */
const STEP_KEYS:Readonly<Partial<Record<DerivedStyle,{method:string;fixed:string}>>>={renko:{method:'boxMethod',fixed:'boxSize'},kagi:{method:'reversalMethod',fixed:'reversalAmount'},pointfigure:{method:'boxMethod',fixed:'boxSize'}};
const moving=(method:unknown)=>method==='ATR'||method==='Percentage';
/** The pin key of an ATR or Percentage step for one live subscription (input identity) and one setting set; null when nothing is pinned. */
export function derivedStepPinKey(style:string,settings:Record<string,unknown>,identity:string|null|undefined):string|null{
  const keys=isDerivedStyle(style)?STEP_KEYS[style]:undefined;if(!keys||!identity||!moving(settings[keys.method]))return null;
  return style+'|'+identity+'|'+JSON.stringify(Object.keys(settings).sort().map(key=>[key,settings[key]]));
}
/** ATR and Percentage steps never move with the forming bar: a pinned step wins, then the completed bars, then every bar (the transform resolves it). */
function stableStepSettings(style:DerivedStyle,bars:readonly Bar[],settings:Record<string,unknown>,context:DerivedContext):{ok:true;settings:Record<string,unknown>}|{ok:false;result:DerivedResult}{
  const keys=STEP_KEYS[style];if(!keys||!moving(settings[keys.method]))return {ok:true,settings};
  let value:number|null=null;
  if(context.pinnedStep!==undefined){if(!Number.isFinite(context.pinnedStep)||context.pinnedStep<=0)return {ok:false,result:unavailable(style,'DERIVED_STEP_UNAVAILABLE','The resolved step is not a positive finite price.')};value=context.pinnedStep;}
  else if(context.lastBarOpen&&bars.length>1){const completed=resolveStep(style,bars.slice(0,-1),settings[keys.method],{atrLength:settings.atrLength,fixed:settings[keys.fixed],percentage:settings.percentage});if(completed.ok)value=completed.value;}
  return {ok:true,settings:value===null?settings:{...settings,[keys.method]:'Traditional',[keys.fixed]:value}};
}
export function computeDerived(style:DerivedStyle,bars:readonly Bar[],settings:Record<string,unknown>,context:DerivedContext={}):DerivedResult{
  if(!isDerivedStyle(style))return unavailable(String(style),'DERIVED_STYLE_UNKNOWN','This chart type has no derived construction.');
  if(!validBars(bars))return unavailable(style,'DERIVED_INPUT_INVALID','Source bars must have finite prices with high at or above low.');
  const stable=stableStepSettings(style,bars,settings,context);if(!stable.ok)return stable.result;settings=stable.settings;
  const result=style==='renko'?renko(bars,settings as unknown as RenkoSettings):style==='kagi'?kagi(bars,settings as unknown as KagiSettings):style==='pointfigure'?pointFigure(bars,settings as unknown as PointFigureSettings):style==='linebreak'?lineBreak(bars,settings as unknown as LineBreakSettings):rangeBars(bars,settings as unknown as RangeSettings,context);
  if(!result.ok||!context.lastBarOpen)return result;
  const last=bars.length-1,value=result.value,final=(bar:DerivedBar)=>(bar.confirmedAt??last)<last;
  const moved=value.confirmed.filter(bar=>!final(bar)).map(({confirmedAt:_confirmedAt,...bar})=>({...bar,projection:true}));
  return {ok:true,value:{...value,confirmed:value.confirmed.filter(final),projection:[...moved,...value.projection]}};
}
