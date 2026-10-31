// The renderer's drawing settings popover (userDrawings.popup.panel, opened by a
// double-click) builds its rows from the drawing model's own schema, so the OpenCandle trend line rows (Middle point, Price
// labels, Stats, Stats position, Always show stats) were
// only in the full Settings dialog. This wraps the panel instance's `sections` (an own member, removed by the returned release)
// and adds an "Info" fold for a trend line. Its controls read and write through the same drawing editor the Settings dialog
// uses (props.lvTrendlineStats / props.lvTrendlineMarkers paths), never through the renderer model.
import {isTrendlineMarkersPath,isTrendlineStatsPath} from './drawing-port';

export interface TrendlineStatsFoldField {path:string;label:string;kind:string;options?:readonly {value:string;label:string}[]}
export interface TrendlineStatsFoldHost {
 /** The drawing editor of one drawing (fields and current values), as getDrawingEditor returns it. */
 editor(id:string):{fields:readonly TrendlineStatsFoldField[];values:Readonly<Record<string,unknown>>};
 /** Applies one property patch through the drawing edit path (updateDrawingProperties). */
 update(id:string,patch:Record<string,unknown>):unknown;
}
/** Reference order of the Info rows: Middle point, Price labels, the Stats items, Stats position, Always show stats. */
export const TRENDLINE_INFO_ORDER:readonly string[]=Object.freeze(['props.lvTrendlineMarkers.middlePoint','props.lvTrendlineMarkers.priceLabels','props.lvTrendlineStats.priceRange','props.lvTrendlineStats.percentChange','props.lvTrendlineMarkers.pips','props.lvTrendlineStats.barsRange','props.lvTrendlineStats.dateTimeRange','props.lvTrendlineMarkers.distance','props.lvTrendlineMarkers.angle','props.lvTrendlineStats.position','props.lvTrendlineStats.alwaysShow']);
/** The Info rows a trend line editor offers, in reference order (empty for any other drawing or an unreadable member). */
export function trendlineInfoFields(fields:readonly TrendlineStatsFoldField[]):TrendlineStatsFoldField[]{
 const own=fields.filter(field=>isTrendlineStatsPath(field.path)||isTrendlineMarkersPath(field.path));
 const rank=(path:string)=>{const at=TRENDLINE_INFO_ORDER.indexOf(path);return at<0?TRENDLINE_INFO_ORDER.length:at;};
 return own.sort((a,b)=>rank(a.path)-rank(b.path));
}
/** Fold summary: the shown stats in short form, or "Off". */
export function trendlineInfoSummary(fields:readonly TrendlineStatsFoldField[],values:Readonly<Record<string,unknown>>):string{
 const on=fields.filter(field=>field.kind==='boolean'&&values[field.path]===true&&field.path!=='props.lvTrendlineStats.alwaysShow').map(field=>field.label);
 return on.length?on.join(', '):'Off';
}

interface PanelBuild {live():{id?:unknown;type?:unknown};watch(fn:()=>void):void}
type FoldMethod=(this:unknown,b:PanelBuild,key:string,title:string,summary:()=>string,body:()=>HTMLElement[])=>HTMLElement;
type SectionsMethod=(this:unknown,b:PanelBuild)=>unknown;

function infoRows(id:string,host:TrendlineStatsFoldHost,b:PanelBuild):HTMLElement[]{
 const fields=trendlineInfoFields(host.editor(id).fields);
 return fields.map(field=>{
  const row=document.createElement('div');row.className='vela-dsp-row lv-dsp-info-row';
  const label=document.createElement('span');label.className='vela-dsp-lab';label.textContent=field.label;label.title=field.label;
  let control:HTMLInputElement|HTMLSelectElement;
  if(field.kind==='boolean'){
   const box=document.createElement('input');box.type='checkbox';box.className='lv-dsp-check';
   box.addEventListener('change',()=>{try{host.update(id,{[field.path]:box.checked});}catch{/* The edit path reports its own failure. */}});
   b.watch(()=>{try{box.checked=host.editor(id).values[field.path]===true;}catch{/* Drawing gone: the panel closes itself. */}});
   control=box;
  }else{
   const select=document.createElement('select');select.className='lv-dsp-select';
   for(const option of field.options??[]){const node=document.createElement('option');node.value=option.value;node.textContent=option.label;select.append(node);}
   select.addEventListener('change',()=>{try{host.update(id,{[field.path]:select.value});}catch{/* The edit path reports its own failure. */}});
   b.watch(()=>{try{select.value=String(host.editor(id).values[field.path]??'');}catch{/* Drawing gone. */}});
   control=select;
  }
  control.setAttribute('aria-label',field.label);control.dataset.property=field.path;
  const wrap=document.createElement('div');wrap.style.cssText='display:flex;flex:1;justify-content:flex-end;';wrap.append(control);
  row.append(label,wrap);return row;
 });
}

/** Installs the Info fold on one renderer settings panel instance. A panel without `sections` / `fold` is left unchanged. */
export function installTrendlineStatsFold(panel:unknown,host:TrendlineStatsFoldHost):()=>void{
 if(!panel||typeof panel!=='object')return()=>{};
 const target=panel as Record<string,unknown>,sections=target.sections,fold=target.fold;
 if(typeof sections!=='function'||typeof fold!=='function'||Object.hasOwn(target,'sections'))return()=>{};
 const own:SectionsMethod=function(b){
  const out=Reflect.apply(sections as SectionsMethod,this,[b]);
  try{
   const drawing=b.live(),id=drawing?.id;if(drawing?.type!=='trendline'||typeof id!=='string'||!Array.isArray(out))return out;
   const fields=trendlineInfoFields(host.editor(id).fields);if(!fields.length)return out;
   const summary=()=>{try{return trendlineInfoSummary(fields,host.editor(id).values);}catch{return '';}};
   const node=Reflect.apply(fold as FoldMethod,this,[b,'lv-info','Info',summary,()=>infoRows(id,host,b)]);
   // Before the Points and Show on folds (the last two sections), after the style, options and text sections.
   const at=Math.max(0,out.length-2);return [...out.slice(0,at),node,...out.slice(at)];
  }catch{return out;}
 };
 Object.defineProperty(target,'sections',{configurable:true,writable:true,value:own});
 return()=>{const now=Object.getOwnPropertyDescriptor(target,'sections');if(now&&now.value===own)delete target.sections;};
}
