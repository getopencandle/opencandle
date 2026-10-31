import {parseInterval,STANDARD_INTERVALS,type IntervalSpec} from '../domain/intervals';
import type {ChartDiagnostic} from './contracts';
export interface DrawingIntervalVisibility {schemaVersion:1;mode:'all'|'include'|'exclude';resolutions:string[]}
const legacyBands=['s','1','5','15','60','240','D','W','M'];
const legacyThresholds=[0,60,300,900,3600,14400,86400,604800,2419200];
const unsupportedLegacy=(value:unknown)=>value!==undefined&&(!Array.isArray(value)||value.some(item=>typeof item!=='string'||!legacyBands.includes(item))||new Set(value).size!==value.length);
export function validateDrawingVisibility(value:unknown):DrawingIntervalVisibility{
 if(!value||typeof value!=='object'||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value)))throw new Error('Unsupported interval visibility object');
 const row=value as Record<string,unknown>;if(Object.values(Object.getOwnPropertyDescriptors(row)).some(field=>field.get||field.set)||Object.keys(row).some(key=>!['schemaVersion','mode','resolutions'].includes(key))||row.schemaVersion!==1||!['all','include','exclude'].includes(String(row.mode))||!Array.isArray(row.resolutions)||row.resolutions.length>100)throw new Error('Unsupported interval visibility schema');
 const resolutions=row.resolutions.map(value=>{if(typeof value!=='string'||value.length>4096)throw new Error('Invalid interval visibility key');const canonical=parseInterval(value).id;if(canonical!==value)throw new Error('Visibility keys must be canonical intervals');return canonical;});if(new Set(resolutions).size!==resolutions.length||row.mode==='all'&&resolutions.length)throw new Error('Duplicate or contradictory interval visibility keys');
 return{schemaVersion:1,mode:row.mode as DrawingIntervalVisibility['mode'],resolutions};
}
export function makeDrawingVisibility(mode:DrawingIntervalVisibility['mode'],values:readonly string[]):DrawingIntervalVisibility{return validateDrawingVisibility({schemaVersion:1,mode,resolutions:values.map(value=>parseInterval(value).id)});}
/** LvIntervalVisibility schemaVersion 2, one checkbox plus from/to range per unit (VDD#dialog.common.visibility.*). Ticks and ranges are checkbox only. */
export interface VisibilityRange{enabled:boolean;from:number;to:number}
export interface DrawingIntervalVisibilityV2{schemaVersion:2;ticks:boolean;seconds:VisibilityRange;minutes:VisibilityRange;hours:VisibilityRange;days:VisibilityRange;weeks:VisibilityRange;months:VisibilityRange;ranges:boolean}
export type DrawingVisibilityRule=DrawingIntervalVisibility|DrawingIntervalVisibilityV2;
export const VISIBILITY_UNITS=['seconds','minutes','hours','days','weeks','months'] as const;
export type VisibilityUnit=typeof VISIBILITY_UNITS[number];
/** VDD#dialog.common.visibility: seconds [1,59], minutes [1,59], hours [1,24], days [1,366], weeks [1,52], months [1,12]. */
export const VISIBILITY_BOUNDS:Readonly<Record<VisibilityUnit,readonly [number,number]>>={seconds:[1,59],minutes:[1,59],hours:[1,24],days:[1,366],weeks:[1,52],months:[1,12]};
export const VISIBILITY_CUSTOM_NOTICE='This drawing uses a custom interval list. Reset to edit by ranges.';
export function defaultDrawingVisibilityV2():DrawingIntervalVisibilityV2{const range=(unit:VisibilityUnit):VisibilityRange=>({enabled:true,from:VISIBILITY_BOUNDS[unit][0],to:VISIBILITY_BOUNDS[unit][1]});return{schemaVersion:2,ticks:true,seconds:range('seconds'),minutes:range('minutes'),hours:range('hours'),days:range('days'),weeks:range('weeks'),months:range('months'),ranges:true};}
export function validateDrawingVisibilityV2(value:unknown):DrawingIntervalVisibilityV2{
 if(!value||typeof value!=='object'||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value)))throw new Error('Unsupported interval visibility object');
 const row=value as Record<string,unknown>,keys=['schemaVersion','ticks','seconds','minutes','hours','days','weeks','months','ranges'];
 if(Object.values(Object.getOwnPropertyDescriptors(row)).some(field=>field.get||field.set)||Object.keys(row).length!==keys.length||keys.some(key=>!Object.hasOwn(row,key))||row.schemaVersion!==2||typeof row.ticks!=='boolean'||typeof row.ranges!=='boolean')throw new Error('Unsupported interval visibility schema');
 const out:Record<string,unknown>={schemaVersion:2,ticks:row.ticks,ranges:row.ranges};
 for(const unit of VISIBILITY_UNITS){
  const range=row[unit] as Record<string,unknown>,[low,high]=VISIBILITY_BOUNDS[unit];
  if(!range||typeof range!=='object'||Array.isArray(range)||![Object.prototype,null].includes(Object.getPrototypeOf(range))||Object.keys(range).length!==3||typeof range.enabled!=='boolean'||!Number.isInteger(range.from)||!Number.isInteger(range.to))throw new Error('Unsupported interval visibility schema');
  const from=range.from as number,to=range.to as number;if(from<low||to>high||from>to)throw new Error('Interval visibility range is outside its allowed bounds');
  out[unit]={enabled:range.enabled,from,to};
 }
 return out as unknown as DrawingIntervalVisibilityV2;
}
/** Accepts the v1 list rule or the v2 range rule. The strict v1 validator above is what an older build runs, so a newer rule meeting it stays retained as an unavailable diagnostic. */
export function validateDrawingVisibilityRule(value:unknown):DrawingVisibilityRule{return value&&typeof value==='object'&&(value as Record<string,unknown>).schemaVersion===2?validateDrawingVisibilityV2(value):validateDrawingVisibility(value);}
const isV2=(rule:DrawingVisibilityRule):rule is DrawingIntervalVisibilityV2=>rule.schemaVersion===2;
/** Resolution to unit mapping. Hours are minute intervals divisible by 60; other minute intervals above 59 have no v2 unit. */
function unitOf(spec:IntervalSpec):{unit:VisibilityUnit|'ticks'|'ranges';value:number}{
 if(spec.unit==='tick')return{unit:'ticks',value:spec.multiplier};if(spec.unit==='range')return{unit:'ranges',value:spec.multiplier};
 if(spec.unit==='minute'&&spec.multiplier%60===0)return{unit:'hours',value:spec.multiplier/60};
 return{unit:({second:'seconds',minute:'minutes',day:'days',week:'weeks',month:'months'} as const)[spec.unit as 'second'],value:spec.multiplier};
}
function ruleAllows(rule:DrawingVisibilityRule,spec:IntervalSpec):boolean{
 if(!isV2(rule))return rule.mode==='all'||(rule.mode==='include'?rule.resolutions.includes(spec.id):!rule.resolutions.includes(spec.id));
 const {unit,value}=unitOf(spec);if(unit==='ticks'||unit==='ranges')return rule[unit];
 const range=rule[unit];return range.enabled&&value>=range.from&&value<=range.to;
}
const unrestricted=(rule:DrawingVisibilityRule)=>isV2(rule)?rule.ticks&&rule.ranges&&VISIBILITY_UNITS.every(unit=>rule[unit].enabled&&rule[unit].from===VISIBILITY_BOUNDS[unit][0]&&rule[unit].to===VISIBILITY_BOUNDS[unit][1]):rule.mode==='all';
/** A v1 rule maps to v2 only when both show the same set of LV intervals; otherwise the tab is read-only with the custom-list notice and Reset writes the v2 default. */
export function visibilityV2Candidate(rule:DrawingIntervalVisibility):{rule:DrawingIntervalVisibilityV2;exact:boolean}{
 const universe=STANDARD_INTERVALS.filter(spec=>spec.unit!=='minute'||spec.multiplier<=1440);
 const next=defaultDrawingVisibilityV2() as unknown as Record<string,unknown>;
 const seen=new Map<string,number[]>();for(const spec of universe){if(!ruleAllows(rule,spec))continue;const {unit,value}=unitOf(spec);seen.set(unit,[...(seen.get(unit)??[]),value]);}
 next.ticks=seen.has('ticks');next.ranges=seen.has('ranges');
 for(const unit of VISIBILITY_UNITS){const values=seen.get(unit)??[],[low,high]=VISIBILITY_BOUNDS[unit];next[unit]=values.length?{enabled:true,from:Math.max(low,Math.min(...values)),to:Math.min(high,Math.max(...values))}:{enabled:false,from:low,to:high};}
 const candidate=validateDrawingVisibilityV2(next);
 return{rule:candidate,exact:universe.every(spec=>ruleAllows(candidate,spec)===ruleAllows(rule,spec))};
}
export interface VisibilityTabRow{unit:VisibilityUnit|'ticks'|'ranges';label:string;enabled:boolean;from?:number;to?:number;bounds?:readonly [number,number];optional?:boolean}
/** Model for the Visibility tab. Order and labels follow VDD#dialog.common.visibility.*. A rule never written by the user keeps its effective visibility. */
export function visibilityTabModel(stored:unknown):{readOnly:boolean;notice?:string;rule:DrawingIntervalVisibilityV2;rows:VisibilityTabRow[];reset:DrawingIntervalVisibilityV2}{
 let rule:DrawingIntervalVisibilityV2,readOnly=false;
 try{const checked=stored===undefined?undefined:validateDrawingVisibilityRule(stored);if(!checked)rule=defaultDrawingVisibilityV2();else if(isV2(checked))rule=checked;else{const candidate=visibilityV2Candidate(checked);rule=candidate.rule;readOnly=!candidate.exact;}}catch{rule=defaultDrawingVisibilityV2();readOnly=true;}
 const range=(unit:VisibilityUnit,label:string):VisibilityTabRow=>({unit,label,enabled:rule[unit].enabled,from:rule[unit].from,to:rule[unit].to,bounds:VISIBILITY_BOUNDS[unit]});
 const rows:VisibilityTabRow[]=[{unit:'ticks',label:'Ticks',enabled:rule.ticks,optional:true},{...range('seconds','Seconds'),optional:true},range('minutes','Minutes'),range('hours','Hours'),range('days','Days'),range('weeks','Weeks'),range('months','Months'),{unit:'ranges',label:'Ranges',enabled:rule.ranges}];
 return{readOnly,...(readOnly?{notice:VISIBILITY_CUSTOM_NOTICE}:{}),rule,rows,reset:defaultDrawingVisibilityV2()};
}
export function commitDrawingVisibility(host:{read:()=>Record<string,unknown>;write:(document:Record<string,unknown>)=>void;project:()=>void;notify:()=>void;known:(type:string)=>boolean},ids:readonly string[],rule:DrawingVisibilityRule){
 const checked=validateDrawingVisibilityRule(rule),previous=host.read(),rows=previous.drawings as Record<string,unknown>[];
 if(!ids.length||new Set(ids).size!==ids.length||ids.some(id=>!rows.some(row=>row.id===id&&host.known(String(row.type)))))throw new Error('Select unique supported drawing IDs');
 for(const row of rows)if(ids.includes(String(row.id))&&row.lvIntervalVisibility!==undefined)validateDrawingVisibilityRule(row.lvIntervalVisibility);
 const next={...previous,drawings:rows.map(row=>ids.includes(String(row.id))?{...row,lvIntervalVisibility:structuredClone(checked)}:row)};if(JSON.stringify(previous)===JSON.stringify(next))return;
 try{host.write(next);host.project();}catch(error){host.write(previous);try{host.project();}catch(rollback){throw new AggregateError([error,rollback],'Drawing visibility document rollback failed');}throw error;}host.notify();
}
export function drawingVisibility(row:Record<string,unknown>,resolution?:string):{visible:boolean;diagnostic?:ChartDiagnostic}{
 const unavailable=(message:string)=>({visible:false,diagnostic:{code:'DRAWING_VISIBILITY_UNAVAILABLE',feature:'drawing '+String(row.id),severity:'unavailable' as const,message}});
 if(row.visible!==undefined&&typeof row.visible!=='boolean')return unavailable('Invalid intended visibility is retained without interpretation');
 let rule:DrawingVisibilityRule|undefined;try{if(row.lvIntervalVisibility!==undefined)rule=validateDrawingVisibilityRule(row.lvIntervalVisibility);}catch(error){return unavailable(String(error)+'; original rule retained');}
 const legacy=row.showOn;if(unsupportedLegacy(legacy))return unavailable('Unsupported legacy SDK visibility bands retained without sanitization');
 const restricted=rule&&!unrestricted(rule)||legacy!==undefined;if(!restricted)return{visible:row.visible!==false};
 if(resolution===undefined)return unavailable('Declared source interval is unknown; restricted visibility cannot be evaluated');
 let spec;try{spec=parseInterval(resolution);}catch(error){return unavailable('Declared source interval is invalid: '+String(error));}
 let eligible=rule?ruleAllows(rule,spec):true;
 if(legacy!==undefined){if(spec.kind==='event')return unavailable('Legacy time bands have no declared event-interval equivalent');const seconds=spec.seconds??spec.multiplier*(spec.unit==='day'?86400:spec.unit==='week'?604800:2419200);let index=0;for(let i=0;i<legacyThresholds.length;i++)if(seconds>=legacyThresholds[i])index=i;eligible=eligible&&(legacy as string[]).includes(legacyBands[index]);}
 return{visible:row.visible!==false&&eligible};
}
/** Project solely at the public renderer boundary. Core/persisted visibility and undo stay untouched. */
export function createDrawingVisibilityProjection<T extends Record<string,unknown>>(host:{read:()=>Record<string,unknown>[];resolution:()=>string|undefined;push:(rows:T[])=>void;eligible?:(row:T)=>boolean;
 /** Toolbar overlay for Hide drawings and Lock all drawings. Applied to the renderer copy only; canonical rows, the saved document and undo never see it. */
 overlay?:()=>{hidden?:boolean;locked?:boolean};
 /** Called after every successful renderer push (sync, refresh, overlay toggle, resolution change) so a renderer-side layer can repaint from the same projection. */
 applied?:()=>void;
 /** The settings dialog's live preview (drawing-preview.ts). Renderer copy only, like the overlay. */
 preview?:(row:T)=>T}){
 let last:T[]=[],source:T[]=[];let diagnostics=new Map<string,ChartDiagnostic>();
 const prepare=(rows:T[])=>{const over=host.overlay?.()??{};const canonical=new Map(host.read().map(row=>[String(row.id),row])),nextDiagnostics=new Map<string,ChartDiagnostic>();const projectedRows=rows.filter(row=>host.eligible?.(row)!==false).map(stored=>{const row=host.preview?host.preview(stored):stored,prior=canonical.get(String(row.id)),merged:Record<string,unknown>={...prior,...row};if(prior?.lvIntervalVisibility!==undefined)merged.lvIntervalVisibility=prior.lvIntervalVisibility;
   // The SDK may already have sanitized opaque legacy metadata in its core loader.
   if(prior&&unsupportedLegacy(prior.showOn))merged.showOn=prior.showOn;
   const result=drawingVisibility(merged,host.resolution());if(result.diagnostic)nextDiagnostics.set(String(row.id),result.diagnostic);const projected:Record<string,unknown>={...structuredClone(row),visible:result.visible&&!over.hidden};delete projected.showOn;if(over.locked)projected.locked=true;return projected as T;
 });return{rows:projectedRows,diagnostics:nextDiagnostics};};
 return{sync(rows:T[]){const previous=last,previousDiagnostics=diagnostics,next=prepare(rows);try{host.push(next.rows);last=structuredClone(next.rows);source=structuredClone(rows);diagnostics=next.diagnostics;}catch(error){diagnostics=previousDiagnostics;try{host.push(previous);}catch(rollback){throw new AggregateError([error,rollback],'Drawing visibility renderer rollback failed');}throw error;}host.applied?.();},
  /** The ids the renderer paints right now: eligible, not hidden by interval visibility, and not hidden by the Hide all drawings overlay. */
  visibleIds:():Set<string>=>new Set(last.filter(row=>row.visible!==false).map(row=>String(row.id))),/** Re-project the last rows after an overlay toggle (no history, no canonical write). */refresh(){this.sync(structuredClone(source));},diagnostics:()=>[...diagnostics.values()],nativeRowsSnapshot:()=>structuredClone(last),
  canonicalNativeRows(rows:Record<string,unknown>[]){const prior=new Map(host.read().map(row=>[String(row.id),row]));return rows.map(row=>{const previous=prior.get(String(row.id)),next=structuredClone(row);if(previous&&!Object.hasOwn(previous,'visible')&&row.visible===true)delete next.visible;
   if(previous&&unsupportedLegacy(previous.showOn))next.showOn=structuredClone(previous.showOn);
   // A projected overlay value that leaked back from the renderer never becomes canonical: the row's own stored value wins.
   const over=host.overlay?.()??{};if(previous&&over.locked&&next.locked===true&&previous.locked!==true){if(Object.hasOwn(previous,'locked'))next.locked=previous.locked;else delete next.locked;}
   if(previous&&over.hidden&&next.visible===false&&previous.visible!==false){if(Object.hasOwn(previous,'visible'))next.visible=previous.visible;else delete next.visible;}
   return next;});}
 };
}
