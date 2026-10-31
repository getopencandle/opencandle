// Cursor kinds of the left toolbar Cursors group: Cross (the default), Dot, Arrow and Demonstration.
//
// Behavior:
//  * The cursor tools are cursor, arrow, dot, performance, demonstration (performance is hidden).
//  * Cursor classes: cursor (Cross) is the crosshair with no class; dot -> class `dot`; arrow -> class `default`;
//    demonstration -> class `demonstration`. "While a drawing tool is armed the pane keeps the class of the last chosen cursor tool."
//  * With the Arrow cursor the crosshair lines are not drawn for mouse input (still drawn for touch).
//  * Demonstration (hold Alt for temporary drawing): the catalog row arms the Demonstration cursor and carries the hint.
//  * The Presentation highlighter (smooth 5, fades out) takes its color, width and
//    duration from the crosshair demonstration controller; Values are used
//    (src/chart/demonstration-trail.ts; painted by src/ui/DemonstrationOverlay.tsx).
//
// LV mechanism (not a fact): the renderer setter lvSetCursorKind of patch LV-VELA-CURSOR-KIND-1 (cumulative plan LV-VELA-COMPAT-6). This module holds the per-chart cursor-kind state, remembers the last chosen cursor kind while
// a drawing tool is armed, and bridges to the renderer. It fails closed: when the renderer has no setter (the patch is absent) the kind stays
// Cross and the reason is reported.
//
// Esc after a drawing tool returns to the last chosen cursor kind (Cross by default); Esc while Dot, Arrow or
// Demonstration is the active cursor (no drawing tool armed) leaves the kind unchanged.

// Magic is the cross cursor with a magnetic crosshair (src/chart/magic-cursor.ts). The
// renderer receives kind cross; the magnet is a separate renderer flag that is off while a drawing tool is armed.
import {hasMagicCrosshair,installMagicCursor,type MagicRenderer} from './magic-cursor';
export type CursorKind='cross'|'dot'|'arrow'|'demonstration'|'magic';
export const CURSOR_KINDS:readonly CursorKind[]=Object.freeze(['cross','dot','arrow','demonstration','magic']);
export const MAGIC_UNAVAILABLE='The chart renderer has no crosshair magnet support, so the Magic cursor is unavailable.';
export const isCursorKind=(value:unknown):value is CursorKind=>typeof value==='string'&&(CURSOR_KINDS as readonly string[]).includes(value);

/** static-drawing-defaults#cursor.classes. Cross has no class (the plain crosshair). */
export const CURSOR_CLASS:Readonly<Record<CursorKind,string|null>>=Object.freeze({cross:null,dot:'dot',arrow:'default',demonstration:'demonstration',magic:null});
/** Catalog row id -> cursor kind (the rows of src/ui/drawing-tool-catalog.ts). */
export const CURSOR_ROW_KIND:Readonly<Record<string,CursorKind>>=Object.freeze({'DW.CURSOR.CROSS':'cross','DW.CURSOR.DOT':'dot','DW.CURSOR.ARROW_CURSOR':'arrow','DW.CURSOR.DEMONSTRATION':'demonstration','DW.CURSOR.MAGIC':'magic'});
/** Scope text for the evidence entry of the Demonstration record. */
export const DEMONSTRATION_SCOPE='cursor class and Alt hint from facts; highlighter color, width and duration OpenCandle-defined';

/** static-drawing-defaults#cursor.arrow.lines. Only a mouse hides the lines; touch (and any other pointer) keeps them. */
export function crosshairLinesVisible(kind:CursorKind,pointerType:string|null|undefined):boolean{return !(kind==='arrow'&&pointerType==='mouse');}

/** The renderer seam of patch LV-VELA-CURSOR-KIND-1. */
export interface CursorKindRenderer{lvSetCursorKind(kind:Exclude<CursorKind,'magic'>):void}
export interface CursorKindStatus{readonly available:boolean;readonly reason?:string}
export type CursorChoice={readonly ok:true;readonly kind:CursorKind}|{readonly ok:false;readonly kind:CursorKind;readonly reason:string};

export const CURSOR_PATCH_ABSENT='The chart renderer has no cursor-kind support, so the cross cursor stays active.';

export interface CursorKindController{
 /** Connects the renderer (anything with lvSetCursorKind). A renderer without it leaves the controller unavailable and on Cross. */
 connect(renderer:unknown):CursorKindStatus;
 status():CursorKindStatus;
 /** The cursor kind in effect on the pane. */
 kind():CursorKind;
 /** The last cursor tool the user chose (Cross until one is chosen). Equals kind(): a drawing tool never changes the pane class. */
 lastChosen():CursorKind;
 /** True while a drawing tool is armed. */
 toolArmed():boolean;
 /** The user chose a cursor tool from the Cursors group (this also ends any armed drawing tool). */
 choose(kind:CursorKind):CursorChoice;
 /** A drawing tool was armed: the pane keeps the class of the last chosen cursor tool. */
 armTool():void;
 /** The drawing tool finished or was cancelled by anything other than Esc. */
 disarmTool():void;
 /** Esc. Returns the kind in effect afterwards. */
 escape():CursorKind;
 /** Whether the crosshair lines are drawn for a pointer type under the active kind. */
 linesVisible(pointerType:string|null|undefined):boolean;
 /** The pane class for the active kind (null for Cross), as in static-drawing-defaults#cursor.classes. */
 paneClass():string|null;
}

export function createCursorKindController():CursorKindController{
 let renderer:CursorKindRenderer|null=null,status:CursorKindStatus={available:false,reason:CURSOR_PATCH_ABSENT};
 let chosen:CursorKind='cross',armed=false,magic:MagicRenderer|null=null;
 const syncMagic=()=>{try{magic?.lvSetMagicCrosshair(chosen==='magic'&&!armed);}catch{/* the magnet is optional; the cross cursor stays */}};
 const apply=(kind:CursorKind):CursorChoice=>{
  if(!renderer)return{ok:false,kind:'cross',reason:status.reason??CURSOR_PATCH_ABSENT};
  if(kind==='magic'&&!magic)return{ok:false,kind:chosen,reason:MAGIC_UNAVAILABLE};
  try{renderer.lvSetCursorKind(kind==='magic'?'cross':kind);}
  catch{
   status={available:false,reason:'The chart renderer refused the cursor change, so the cross cursor stays active.'};
   renderer=null;magic=null;chosen='cross';
   return{ok:false,kind:'cross',reason:status.reason!};
  }
  return{ok:true,kind};
 };
 return{
  connect(candidate){
   if(candidate&&typeof candidate==='object'&&typeof (candidate as Partial<CursorKindRenderer>).lvSetCursorKind==='function'){
    renderer=candidate as CursorKindRenderer;status={available:true};
    magic=installMagicCursor(Object.getPrototypeOf(candidate))&&hasMagicCrosshair(candidate)?candidate:null;
    if(chosen==='magic'&&!magic)chosen='cross';
    apply(chosen);syncMagic();
    return status;
   }
   renderer=null;magic=null;chosen='cross';armed=false;status={available:false,reason:CURSOR_PATCH_ABSENT};
   return status;
  },
  status:()=>status,
  kind:()=>chosen,
  lastChosen:()=>chosen,
  toolArmed:()=>armed,
  choose(kind){
   if(!isCursorKind(kind))return{ok:false,kind:chosen,reason:'Unknown cursor.'};
   armed=false;
   if(kind==='cross'&&!renderer){chosen='cross';return{ok:true,kind:'cross'};}
   const result=apply(kind);
   if(result.ok)chosen=kind;
   syncMagic();
   return result;
  },
  armTool(){armed=true;syncMagic();},
  disarmTool(){armed=false;syncMagic();},
  escape(){armed=false;syncMagic();return chosen;},
  linesVisible:pointerType=>crosshairLinesVisible(chosen,pointerType),
  paneClass:()=>CURSOR_CLASS[chosen],
 };
}
