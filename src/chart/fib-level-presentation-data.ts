/** Pure Fibonacci level-presentation data interpretation and copying.
 * Data interpretation/copying does not grant source, native, frame or publication
 * authority. The caller still owns the existing whole-document admission.
 */
import {measureWorkspaceJSON} from '../ui/workspace-json';

export const FIB_BACKGROUND_FIELD='lvFibBackground';
export const FIB_TEXT_FIELD='lvFibText';
export const FIB_BACKGROUND_DIAGNOSTIC='Unsupported Fibonacci background settings are retained; background editing and fill are unavailable.';
export const FIB_TEXT_DIAGNOSTIC='Unsupported Fibonacci custom-text settings are retained; custom-text editing and glyphs are unavailable.';
export interface FibBackgroundSettings {readonly schemaVersion:1;readonly opacity:number}
export type FibTextPosition='left'|'center'|'right';
export interface FibTextSettings {readonly schemaVersion:1;readonly enabled:boolean;readonly position:FibTextPosition}
export type FibState<T>=Readonly<{state:'legacy'|'supported';settings:Readonly<T>}>|Readonly<{state:'unavailable';message:string}>;
export const FIB_BACKGROUND_DEFAULTS:Readonly<FibBackgroundSettings>=Object.freeze({schemaVersion:1,opacity:6});
export const FIB_TEXT_DEFAULTS:Readonly<FibTextSettings>=Object.freeze({schemaVersion:1,enabled:true,position:'center'});
type Row=Record<string,unknown>;

function plain(value:unknown):value is Row{
 if(!value||typeof value!=='object'||Array.isArray(value))return false;
 const prototype=Object.getPrototypeOf(value);
 return prototype===Object.prototype||prototype===null;
}
function ownData(row:Row,key:string,message:string):PropertyDescriptor|undefined{
 const descriptor=Object.getOwnPropertyDescriptor(row,key);
 if(descriptor&&(!descriptor.enumerable||!Object.hasOwn(descriptor,'value')))throw Error(message);
 return descriptor;
}
function closed(value:unknown,keys:readonly string[],message:string):Row{
 if(!plain(value)||Reflect.ownKeys(value).length!==keys.length)throw Error(message);
 const result:Row={};
 for(let index=0;index<keys.length;index++){
  const key=keys[index],descriptor=ownData(value,key,message);
  if(!descriptor)throw Error(message);
  result[key]=descriptor.value;
 }
 return result;
}
function position(value:unknown):value is FibTextPosition{return value==='left'||value==='center'||value==='right';}

/** Percentage is an independent fill multiplier, not a change to band RGBA. */
export function fibBackgroundMultiplier(value:unknown):number{
 if(typeof value!=='number'||!Number.isFinite(value)||value<0||value>100)throw Error('Fibonacci background opacity must be a finite number from 0 to 100.');
 const alpha=value/100;
 if(value>0&&alpha===0)throw Error('Fibonacci background opacity is too small to represent.');
 return alpha;
}
export function composeFibBackgroundAlpha(incoming:unknown,opacity:unknown):number{
 if(typeof incoming!=='number'||!Number.isFinite(incoming)||incoming<0||incoming>1)throw Error('Fibonacci incoming canvas alpha must be finite from 0 to 1.');
 const multiplier=fibBackgroundMultiplier(opacity),result=incoming*multiplier;
 if(incoming>0&&multiplier>0&&result===0)throw Error('Fibonacci composed background opacity is too small to represent.');
 return result;
}
export function validateFibBackground(value:unknown):Readonly<FibBackgroundSettings>{
 const data=closed(value,['schemaVersion','opacity'],FIB_BACKGROUND_DIAGNOSTIC);
 if(data.schemaVersion!==1)throw Error(FIB_BACKGROUND_DIAGNOSTIC);
 fibBackgroundMultiplier(data.opacity);
 return Object.freeze({schemaVersion:1,opacity:data.opacity as number});
}
export function validateFibText(value:unknown):Readonly<FibTextSettings>{
 const data=closed(value,['schemaVersion','enabled','position'],FIB_TEXT_DIAGNOSTIC);
 if(data.schemaVersion!==1||typeof data.enabled!=='boolean'||!position(data.position))throw Error(FIB_TEXT_DIAGNOSTIC);
 return Object.freeze({schemaVersion:1,enabled:data.enabled,position:data.position});
}
function read<T>(props:unknown,key:string,defaults:Readonly<T>,validate:(input:unknown)=>Readonly<T>,message:string):FibState<T>{
 if(props===undefined)return Object.freeze({state:'legacy',settings:defaults});
 try{
  if(!plain(props))throw Error(message);
  const descriptor=ownData(props,key,message);
  return descriptor?Object.freeze({state:'supported',settings:validate(descriptor.value)}):Object.freeze({state:'legacy',settings:defaults});
 }catch{return Object.freeze({state:'unavailable',message});}
}
/** These readers intentionally inspect only their own member, not its sibling. */
export function readFibBackground(props:unknown):FibState<FibBackgroundSettings>{return read(props,FIB_BACKGROUND_FIELD,FIB_BACKGROUND_DEFAULTS,validateFibBackground,FIB_BACKGROUND_DIAGNOSTIC);}
export function readFibText(props:unknown):FibState<FibTextSettings>{return read(props,FIB_TEXT_FIELD,FIB_TEXT_DEFAULTS,validateFibText,FIB_TEXT_DIAGNOSTIC);}

/** Narrow recognized-field guard. Other patch names remain the port's concern. */
export function assertFibLevelPresentationPatchValues(patch:unknown):void{
 if(!plain(patch))throw Error('Fibonacci presentation patch requires a plain record.');
 const keys=Reflect.ownKeys(patch);
 for(let index=0;index<keys.length;index++){
  const key=keys[index];if(typeof key!=='string')continue;
  const background=key===FIB_BACKGROUND_FIELD||key.startsWith(FIB_BACKGROUND_FIELD+'.')||key==='props.'+FIB_BACKGROUND_FIELD||key.startsWith('props.'+FIB_BACKGROUND_FIELD+'.');
  const text=key===FIB_TEXT_FIELD||key.startsWith(FIB_TEXT_FIELD+'.')||key==='props.'+FIB_TEXT_FIELD||key.startsWith('props.'+FIB_TEXT_FIELD+'.');
  if(!background&&!text)continue;
  const message=background?FIB_BACKGROUND_DIAGNOSTIC:FIB_TEXT_DIAGNOSTIC;
  const descriptor=ownData(patch,key,message);if(!descriptor)throw Error(message);
  if(key===FIB_BACKGROUND_FIELD+'.opacity')fibBackgroundMultiplier(descriptor.value);
  else if(key===FIB_TEXT_FIELD+'.enabled'){if(typeof descriptor.value!=='boolean')throw Error(message);}
  else if(key===FIB_TEXT_FIELD+'.position'){if(!position(descriptor.value))throw Error(message);}
  else throw Error(message);
 }
}

/** Same bounded JSON-shape admission used by existing semantic member retention.
 * The copy deliberately preserves enumerable own undefined and signed zero.
 * It does not use JSON.stringify, toJSON, structuredClone or raw array methods.
 * Proxies/hostile global intrinsic replacement are not authenticated here.
 */
export function cloneFibPresentationMember(value:unknown):unknown{
 measureWorkspaceJSON({member:value});
 function copy(item:unknown):unknown{
  if(!item||typeof item!=='object')return item;
  const array=Array.isArray(item),output:unknown[]|Row=array?[]:{};
  const keys=Reflect.ownKeys(item);
  for(let index=0;index<keys.length;index++){
   const key=keys[index];if(array&&key==='length')continue;
   const descriptor=Object.getOwnPropertyDescriptor(item,key)!;
   // Admission has rejected accessors/hidden fields/custom array members.
   Object.defineProperty(output,key,{value:copy(descriptor.value),enumerable:true,writable:true,configurable:true});
  }
  return output;
 }
 return copy(value);
}

function sameBackground(a:Readonly<FibBackgroundSettings>,b:Readonly<FibBackgroundSettings>):boolean{return a.schemaVersion===b.schemaVersion&&Object.is(a.opacity,b.opacity);}
function sameText(a:Readonly<FibTextSettings>,b:Readonly<FibTextSettings>):boolean{return a.schemaVersion===b.schemaVersion&&a.enabled===b.enabled&&a.position===b.position;}
/** Pure proposed merge. No transaction, native model or publication is touched.
 * A legacy effective-default request leaves the member absent. A requested
 * unknown member refuses atomically, but an untouched unknown sibling is copied.
 */
export function patchFibLevelPresentationProps(props:unknown,patch:unknown):unknown{
 assertFibLevelPresentationPatchValues(patch);
 measureWorkspaceJSON({patch});
 if(props!==undefined&&!plain(props))throw Error('Fibonacci props require a plain record.');
 const input=patch as Row,bg=Object.getOwnPropertyDescriptor(input,FIB_BACKGROUND_FIELD+'.opacity'),enabled=Object.getOwnPropertyDescriptor(input,FIB_TEXT_FIELD+'.enabled'),place=Object.getOwnPropertyDescriptor(input,FIB_TEXT_FIELD+'.position');
 let nextBackground:Readonly<FibBackgroundSettings>|undefined,nextText:Readonly<FibTextSettings>|undefined;
 if(bg){
  const current=readFibBackground(props);if(current.state==='unavailable')throw Error(current.message);
  const next=validateFibBackground({schemaVersion:1,opacity:bg.value});
  if(!sameBackground(current.settings,next))nextBackground=next;
 }
 if(enabled||place){
  const current=readFibText(props);if(current.state==='unavailable')throw Error(current.message);
  const next=validateFibText({schemaVersion:1,enabled:enabled?enabled.value:current.settings.enabled,position:place?place.value:current.settings.position});
  if(!sameText(current.settings,next))nextText=next;
 }
 if(!nextBackground&&!nextText)return props;
 const result=(props===undefined?{}:cloneFibPresentationMember(props)) as Row;
 if(nextBackground)result[FIB_BACKGROUND_FIELD]={...nextBackground};
 if(nextText)result[FIB_TEXT_FIELD]={...nextText};
 return result;
}

/** Restore only these two semantic members after an existing normalizer.
 * Complete source/prepared row identity is a precondition, not owner authority.
 * Other raw fields are not smuggled around their existing preparation policy.
 */
export function retainFibLevelPresentationMembers<T>(rawRow:unknown,preparedRow:T):T{
 if(!plain(rawRow))return preparedRow;
 const type=ownData(rawRow,'type','Fibonacci raw type requires data.');if(type?.value!=='fibretracement')return preparedRow;
 const propsDescriptor=ownData(rawRow,'props','Fibonacci raw props require data.');if(!propsDescriptor||propsDescriptor.value===undefined)return preparedRow;
 const rawProps=propsDescriptor.value;if(!plain(rawProps))throw Error('Fibonacci raw props require a plain record.');
 const background=ownData(rawProps,FIB_BACKGROUND_FIELD,FIB_BACKGROUND_DIAGNOSTIC),text=ownData(rawProps,FIB_TEXT_FIELD,FIB_TEXT_DIAGNOSTIC);
 if(!background&&!text)return preparedRow;
 const id=ownData(rawRow,'id','Fibonacci raw identity requires data.')?.value;
 if(typeof id!=='string'||!id||!plain(preparedRow)||ownData(preparedRow,'type','Fibonacci prepared type requires data.')?.value!=='fibretracement'||!Object.is(id,ownData(preparedRow,'id','Fibonacci prepared identity requires data.')?.value))throw Error('Fibonacci presentation projection row identity changed.');
 const result=cloneFibPresentationMember(preparedRow) as Row;
 const prior=Object.getOwnPropertyDescriptor(result,'props')?.value;
 if(prior!==undefined&&!plain(prior))throw Error('Fibonacci prepared props require a plain record.');
 const props=(prior??{}) as Row;
 if(background)Object.defineProperty(props,FIB_BACKGROUND_FIELD,{value:cloneFibPresentationMember(background.value),enumerable:true,writable:true,configurable:true});
 if(text)Object.defineProperty(props,FIB_TEXT_FIELD,{value:cloneFibPresentationMember(text.value),enumerable:true,writable:true,configurable:true});
 Object.defineProperty(result,'props',{value:props,enumerable:true,writable:true,configurable:true});
 return result as T;
}

export interface FibCustomTextPlacement {readonly x:number;readonly y:number;readonly align:FibTextPosition}
/** Actual native resolved entry only. No anchors, projector or future data. */
export function placeFibCustomText(entry:unknown,requested:unknown):Readonly<FibCustomTextPlacement>{
 if(!position(requested)||!plain(entry))throw Error('Fibonacci custom-text placement is unavailable.');
 const values:Row={};
 for(const key of ['x1','x2','y1','y2']){
  const descriptor=ownData(entry,key,'Fibonacci resolved entry requires data.');
  if(!descriptor||typeof descriptor.value!=='number'||!Number.isFinite(descriptor.value))throw Error('Fibonacci resolved endpoints must be finite.');
  values[key]=descriptor.value;
 }
 const x1=values.x1 as number,x2=values.x2 as number,y1=values.y1 as number,y2=values.y2 as number;
 if(y1!==y2)throw Error('Fibonacci custom text requires a horizontal resolved entry.');
 const lo=Math.min(x1,x2),hi=Math.max(x1,x2),width=hi-lo,padding=Math.min(4,width/2),middle=(x1+x2)/2,y=y1-7;
 const x=requested==='left'?lo+padding:requested==='right'?hi-padding:middle;
 if(!Number.isFinite(width)||!Number.isFinite(middle)||!Number.isFinite(x)||!Number.isFinite(y))throw Error('Fibonacci resolved placement overflow.');
 return Object.freeze({x,y,align:requested});
}

// Label layout, font size and the log-scale option (props.lvFibLayout).
// Facts: tool.LineToolFibRetracement.defaults (horzLabelsAlign left, vertLabelsAlign middle, horzTextAlign center, vertTextAlign middle,
// labelFontSize 12, fibLevelsBasedOnLogScale false), dialog.LineToolFibRetracement.style.9/.10/.11/.12 and dialog.common.fontSizes.fib.
// Absent means the behaviour before this wave; nothing is written until the user edits one of these.
// A single closed member holds the six rows; font sizes are stored as the recorded numbers.
// Slice approximation: the member and placeFibLabelBlock are the data and geometry layer. The native Fibonacci painter replay
// (fib-level-presentation-painter) does not read it yet, so font size, label alignment and log-scale levels are stored and edited but not
// yet applied to the picture; this module does not claim those settings.
export const FIB_LAYOUT_FIELD='lvFibLayout';
export const FIB_LAYOUT_DIAGNOSTIC='Unsupported Fibonacci layout settings are retained; layout editing is unavailable.';
export const FIB_LABEL_FONT_SIZES:readonly number[]=Object.freeze([8,10,11,12,14,16,18,20,22,24]);
export type FibAlignH='left'|'center'|'right';
export type FibAlignV='top'|'middle'|'bottom';
export interface FibLayoutSettings {readonly schemaVersion:1;readonly fontSize:number;readonly labelHorz:FibAlignH;readonly labelVert:FibAlignV;readonly textHorz:FibAlignH;readonly textVert:FibAlignV;readonly logScale:boolean}
export const FIB_LAYOUT_DEFAULTS:Readonly<FibLayoutSettings>=Object.freeze({schemaVersion:1,fontSize:12,labelHorz:'left',labelVert:'middle',textHorz:'center',textVert:'middle',logScale:false});
const layoutKeys=['schemaVersion','fontSize','labelHorz','labelVert','textHorz','textVert','logScale'] as const;
export const FIB_ALIGN_H:readonly FibAlignH[]=Object.freeze(['left','center','right']);
export const FIB_ALIGN_V:readonly FibAlignV[]=Object.freeze(['top','middle','bottom']);
export function validateFibLayout(value:unknown):Readonly<FibLayoutSettings>{
 const data=closed(value,layoutKeys,FIB_LAYOUT_DIAGNOSTIC);
 if(data.schemaVersion!==1||typeof data.fontSize!=='number'||!FIB_LABEL_FONT_SIZES.includes(data.fontSize)||!FIB_ALIGN_H.includes(data.labelHorz as FibAlignH)||!FIB_ALIGN_H.includes(data.textHorz as FibAlignH)||!FIB_ALIGN_V.includes(data.labelVert as FibAlignV)||!FIB_ALIGN_V.includes(data.textVert as FibAlignV)||typeof data.logScale!=='boolean')throw Error(FIB_LAYOUT_DIAGNOSTIC);
 return Object.freeze({...data}) as unknown as Readonly<FibLayoutSettings>;
}
export function readFibLayout(props:unknown):FibState<FibLayoutSettings>{return read(props,FIB_LAYOUT_FIELD,FIB_LAYOUT_DEFAULTS,validateFibLayout,FIB_LAYOUT_DIAGNOSTIC);}
/** Pure proposed merge of already-typed layout values (keys without the member prefix). A semantic no-op returns the same props. */
export function patchFibLayoutProps(props:unknown,changes:Readonly<Record<string,unknown>>):unknown{
 measureWorkspaceJSON({changes});
 if(props!==undefined&&!plain(props))throw Error('Fibonacci props require a plain record.');
 const current=readFibLayout(props);if(current.state==='unavailable')throw Error(current.message);
 const next=validateFibLayout({...current.settings,...changes});
 if(layoutKeys.every(key=>Object.is(current.settings[key],next[key])))return props;
 const result=(props===undefined?{}:cloneFibPresentationMember(props)) as Row;
 result[FIB_LAYOUT_FIELD]={...next};
 return result;
}
export interface FibLabelBlock {readonly x:number;readonly y:number;readonly align:CanvasTextAlign;readonly baseline:CanvasTextBaseline}
/** Where a level label block sits relative to its level line (style.9 labels, style.10 text). Top and bottom sit just outside the line. */
export function placeFibLabelBlock(line:{readonly x1:number;readonly x2:number;readonly y:number},horz:FibAlignH,vert:FibAlignV,fontSize:number):Readonly<FibLabelBlock>{
 if(!FIB_ALIGN_H.includes(horz)||!FIB_ALIGN_V.includes(vert)||![line.x1,line.x2,line.y,fontSize].every(Number.isFinite)||fontSize<=0)throw Error('Fibonacci label placement is unavailable.');
 const lo=Math.min(line.x1,line.x2),hi=Math.max(line.x1,line.x2),x=horz==='left'?lo:horz==='right'?hi:(lo+hi)/2,gap=fontSize/2;
 const y=vert==='middle'?line.y:vert==='top'?line.y-gap:line.y+gap;
 return Object.freeze({x,y,align:horz,baseline:vert==='middle'?'middle':vert==='top'?'bottom':'top'});
}
