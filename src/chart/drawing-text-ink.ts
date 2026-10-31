// The default ink of a new Text (and every drawing whose text has no color yet).
// The Text seed has no color so the renderer fills it at creation (vela UserDrawings.emit 'create':
// contrastColor(theme().background)). On a gradient background the adapter sets the renderer's layout background to
// transparent (the container paints the gradient), so the renderer read rgba(0,0,0,0) as black and gave white ink, also on the
// light Glacier & Sunlight template (about 1.2:1). The ink is now picked here from the background LV actually paints: the solid
// color, or both gradient ends. Rule: black or white, whichever has the higher worst-case WCAG contrast over those
// colors. Only a create whose text has no color is touched; a seeded or user color is kept.
type Rgb=[number,number,number];
/** #rgb, #rrggbb, #rrggbbaa, rgb() and rgba() to RGB; null for anything else or a fully transparent color. */
export function parseOpaqueColor(value:unknown):Rgb|null{
 if(typeof value!=='string')return null;const text=value.trim().toLowerCase();
 let m=/^#([0-9a-f]{3})$/.exec(text);if(m)return[...m[1]].map(c=>parseInt(c+c,16)) as Rgb;
 m=/^#([0-9a-f]{6})([0-9a-f]{2})?$/.exec(text);if(m){if(m[2]==='00')return null;return[0,2,4].map(i=>parseInt(m![1].slice(i,i+2),16)) as Rgb;}
 m=/^rgba?\(([^)]+)\)$/.exec(text);if(m){const parts=m[1].split(/[,\s/]+/).filter(Boolean).map(Number);if(parts.length<3||parts.slice(0,3).some(n=>!Number.isFinite(n)))return null;if(parts.length>3&&parts[3]===0)return null;return parts.slice(0,3).map(n=>Math.max(0,Math.min(255,n))) as Rgb;}
 return null;
}
const channel=(v:number)=>{const s=v/255;return s<=0.03928?s/12.92:((s+0.055)/1.055)**2.4;};
/** WCAG relative luminance. */
export function luminance(rgb:Rgb):number{return 0.2126*channel(rgb[0])+0.7152*channel(rgb[1])+0.0722*channel(rgb[2]);}
/** WCAG contrast ratio of two colors. */
export function contrastRatio(a:Rgb,b:Rgb):number{const x=luminance(a),y=luminance(b);return(Math.max(x,y)+0.05)/(Math.min(x,y)+0.05);}
/** Black or white ink for the painted background colors (worst case over all of them); null when none parses. */
export function textInkFor(backgrounds:readonly unknown[]):'#000000'|'#ffffff'|null{
 const colors=backgrounds.map(parseOpaqueColor).filter((c):c is Rgb=>c!==null);if(!colors.length)return null;
 const worst=(ink:Rgb)=>Math.min(...colors.map(c=>contrastRatio(ink,c)));
 return worst([0,0,0])>=worst([255,255,255])?'#000000':'#ffffff';
}
/** The colors LV paints behind the plot for appearance settings (paneProperties.*): both ends of a gradient, else the solid. */
export function paintedBackgrounds(settings:Record<string,unknown>|null|undefined):string[]{
 if(!settings)return[];
 if(settings['paneProperties.backgroundType']==='gradient')return[settings['paneProperties.backgroundGradientStartColor'],settings['paneProperties.backgroundGradientEndColor']].filter((v):v is string=>typeof v==='string');
 const solid=settings['paneProperties.background'];return typeof solid==='string'?[solid]:[];
}
interface Port{deps?:{emit?:(intent:unknown)=>unknown;[key:string]:unknown}}
type Defaults={style?:Record<string,unknown>;text?:Record<string,unknown>;props?:unknown};
/** The renderer remembers each tool's last look (vela DrawingsController.captureDefaults on create, in memory only) and seeds
 *  the next drawing from it. An ink this module picked is not a look the user chose: it is dropped from that memory, so the
 *  next Text is inked for the background it is placed on (after a template change too). A color the user picks, or a saved
 *  default (drawing-tool-defaults.ts), is never touched: only a remembered color equal to the picked ink goes. */
export function forgetPickedInk(facade:unknown,type:unknown,ink:string):boolean{
 const core=(facade as {ctrl?:{defaults?:unknown}}|null)?.ctrl,map=core?.defaults;
 if(typeof type!=='string'||!(map instanceof Map))return false;
 const remembered=map.get(type) as Defaults|undefined;
 if(!remembered||!remembered.text||remembered.text.color!==ink)return false;
 const {color:_color,...text}=remembered.text,next:Defaults={...remembered,text};
 if(!Object.keys(text).length)delete next.text;
 if(next.style||next.text||next.props!==undefined)map.set(type,next);else map.delete(type);
 return true;
}
/** Wraps the placement port's emit (UserDrawings.interaction.deps.emit, the one call site of a 'create' intent) so a create
 *  whose text has no color gets the ink for `backgrounds()`, falling back to the renderer theme background when that is
 *  opaque. UserDrawings.emit itself is left alone: the native Reset reserves that slot and refuses an own wrapper there, and
 *  UserDrawings.deps.theme is pinned by the trendline annotation. `forget` (forgetPickedInk on the drawings facade) runs once
 *  the create is through, and again on the next task in case the host stores the drawing later. Returns the uninstall. */
export function installTextInkDefault(renderer:unknown,backgrounds:()=>readonly unknown[],forget?:(type:unknown,ink:string)=>void):()=>void{
 const drawings=(renderer as {userDrawings?:unknown}|null)?.userDrawings as {interaction?:Port;deps?:{theme?:()=>{background?:unknown}}}|undefined;
 const deps=drawings?.interaction?.deps;
 if(!deps||typeof deps.emit!=='function')return()=>{};
 const previous=Object.getOwnPropertyDescriptor(deps,'emit'),native=deps.emit;
 let active=true;
 const emit=function(this:unknown,intent:unknown){
  let picked:{type:unknown;ink:string}|null=null;
  if(active)try{
   const row=intent as {kind?:unknown;doc?:{type?:unknown;text?:Record<string,unknown>}}|null;
   const text=row&&row.kind==='create'?row.doc?.text:undefined;
   if(text&&typeof text==='object'&&text.color===undefined){
    let ink=textInkFor(backgrounds());
    if(!ink)ink=textInkFor([drawings?.deps?.theme?.()?.background]);
    if(ink){row!.doc!.text={...text,color:ink};picked={type:row!.doc!.type,ink};}
   }
  }catch{/* The native default applies. */}
  const result=Reflect.apply(native,this,[intent]);
  if(picked&&forget){const done=picked,run=()=>{try{forget(done.type,done.ink);}catch{/* Memory keeps the ink. */}};run();setTimeout(run,0);}
  return result;
 };
 Object.defineProperty(deps,'emit',{configurable:true,writable:true,enumerable:previous?.enumerable??true,value:emit});
 // Anything that captured this wrapper keeps calling it after the uninstall; it then passes straight through.
 return()=>{active=false;if(deps.emit!==emit)return;if(previous)Object.defineProperty(deps,'emit',previous);else Reflect.deleteProperty(deps,'emit');};
}
