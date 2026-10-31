// Anchored text on the pinned native `text` class (TextLabel), painted through
// LV-VELA-DRAWING-PAINT-HOOK-1 (lvPaint).
//
// Behavior:
//  * Toolbar: section "Text and notes", favoritable, no hotkey; the row is always shown.
//  * Placement: one point, one click, then in-place text editing (placeholder
//    "Add text"); anchoredToScreen true; pointsCountKnown true.
//  * Defaults: fontsize 14, bold false, italic false, fillBackground false, drawBorder false,
//    wordWrap false, wordWrapWidth 200, text "", color #2962FF, backgroundColor #2962FF, borderColor #707070, backgroundTransparency 70,
//    anchored true. backgroundTransparency 70 is applied (not the 75 percent a palette alpha of 0.25 would give).
//  * Settings text fields: text color, font size, bold, italic, text area, Background (checkbox, color,
//    transparency), Border (checkbox, color), Text wrap. Tabs Text + Visibility (no Coordinates tab).
//
// LV mechanism:
//  * The single anchor is stored as fractions of the pane (x, y in [0, 1]) in props.lvScreenAnchor. lvPaint draws in pane space without
//    proj.xOf / proj.yOf, so the text stays put when the chart scrolls, zooms or changes symbol or interval. Paint, hit tests and bounds never
//    write the data-space anchor. Native drags still work: translateBody (body drag) moves the fractions by the pixel delta of
//    the drag from the press position, and constrainHandleDrag (handle drag) reads the fractions from the dragged anchor, both through the
//    last projector the drawing was shown with. The stored data anchor is informational after placement.
//  * timeExtent() and priceRange() are null, so the drawing is never culled by the visible range and never feeds autoscale.
//  * Vela opens its native inline editor for any TextLabel subclass, and this type is one, so placement opens the inline
//    editor in place and placement plus typing is one undo step (src/chart/text-placement-hold.ts). ANCHORED_TEXT_PLACEMENT is a stale record of the
//    old dialog approximation, kept only because the test file still imports it.
//  * Word wrap width is limited to 20..4000 px.
import type {DrawingText,DrawingTypeMeta,SettingsField} from '@luxalgo/vela';
import {supportedColor} from '../color-validation';
import {TV_BLUE} from '../drawing-default-constants';
import {ANCHORED_TEXT_PLACEHOLDER,ANCHORED_TEXT_SIZE_PX,approximateMeasure,layoutAnchoredText,paintAnchoredText,type AnchoredTextSpec} from '../anchored-text-painter';
import type {UnappliedDefault} from '../drawing-factory-defaults';
import {cloneStyle,fail,lvKey,method,nativeBase,roles,type Init,type NativeModel,type Projector} from '../lv-drawing-pin';
import type {LvPaintTheme} from '../lv-paint-hook';
import {defineLvDrawingToolModule} from './contract';

export const LV_ANCHORED_TEXT:string='lvanchoredtext';
export const ANCHORED_TEXT_TOOL_ID='LineToolTextAbsolute';
export const ANCHORED_TEXT_ROW='DW.ANNOTATION.ANCHORED_TEXT';
export const ANCHORED_TEXT_FACT_ID='tool.LineToolTextAbsolute.defaults';
export const SCREEN_ANCHOR_KEY='lvScreenAnchor';
export const ANCHORED_TEXT_WRAP_RANGE=Object.freeze({min:20,max:4000});

/** static-drawing-defaults#tool.LineToolTextAbsolute.defaults, transcribed. */
export const ANCHORED_TEXT_FACT_DEFAULTS=Object.freeze({
 fontsize:14,bold:false,italic:false,fillBackground:false,drawBorder:false,wordWrap:false,wordWrapWidth:200,text:'',
 color:TV_BLUE,backgroundColor:TV_BLUE,borderColor:'#707070',backgroundTransparency:70,anchored:true,
});
/** The fact's own disagreement between backgroundColor alpha and backgroundTransparency (recorded, not asserted). */
export const ANCHORED_TEXT_FACT_DISCREPANCY=Object.freeze({backgroundColorAlpha:0.25,backgroundTransparency:70,applied:'backgroundTransparency'});
/** Stale: the old dialog approximation; placement now opens the inline editor. Unused by src; imported by tests. */
export const ANCHORED_TEXT_PLACEMENT=Object.freeze({mode:'dialog' as const,tab:'Text' as const,placeholder:ANCHORED_TEXT_PLACEHOLDER,approximation:'DWB2-SA-1'});

interface Fraction{x:number;y:number}
interface State{
 fillBackground:boolean;drawBorder:boolean;wordWrap:boolean;wordWrapWidth:number;
 backgroundColor:string;backgroundTransparency:number;borderColor:string;
 frac:Fraction|null;proj:Projector|null;dragOrig:object|null;dragFrac:Fraction|null;
 /** Props exactly as read: unknown keys are written back untouched. */
 raw:Record<string,unknown>|null;
}
const fresh=():State=>({
 fillBackground:ANCHORED_TEXT_FACT_DEFAULTS.fillBackground,drawBorder:ANCHORED_TEXT_FACT_DEFAULTS.drawBorder,wordWrap:ANCHORED_TEXT_FACT_DEFAULTS.wordWrap,wordWrapWidth:ANCHORED_TEXT_FACT_DEFAULTS.wordWrapWidth,
 backgroundColor:ANCHORED_TEXT_FACT_DEFAULTS.backgroundColor,backgroundTransparency:ANCHORED_TEXT_FACT_DEFAULTS.backgroundTransparency,borderColor:ANCHORED_TEXT_FACT_DEFAULTS.borderColor,
 frac:null,proj:null,dragOrig:null,dragFrac:null,raw:null,
});
const states=new WeakMap<object,State>();
const st=(model:object)=>{let state=states.get(model);if(!state){state=fresh();states.set(model,state);}return state;};
const clamp01=(value:number)=>value<0?0:value>1?1:value;
const isFraction=(value:unknown):value is Fraction=>!!value&&typeof value==='object'&&Number.isFinite((value as Fraction).x)&&Number.isFinite((value as Fraction).y)&&(value as Fraction).x>=0&&(value as Fraction).x<=1&&(value as Fraction).y>=0&&(value as Fraction).y<=1;

interface PaneBox{top:number;height:number;width:number}
function paneBox(proj:Projector,paneId:string):PaneBox|null{
 const rect=proj.paneRect?.(paneId),top=rect?rect.top:0,height=rect?rect.height:proj.height;
 return height>0&&proj.width>0?{top,height,width:proj.width}:null;
}

interface TextModel extends NativeModel{
 text?:DrawingText;
 fillBackground:boolean;drawBorder:boolean;wordWrap:boolean;wordWrapWidth:number;backgroundColor:string;backgroundTransparency:number;borderColor:string;
}

/** Pixel position of the box's top-left corner, from the stored pane fractions. The fractions come from the placement click (the anchor)
 *  the first time and are never derived from the anchor again: nothing here writes the anchor or the props. */
function resolve(model:TextModel,proj:Projector){
 const s=st(model),pane=paneBox(proj,model.paneId);if(!pane)return null;
 s.proj=proj;
 if(!s.frac){
  const anchor=model.anchors[0];if(!anchor)return null;
  const y=proj.yOf(anchor.price,model.paneId);if(y==null)return null;
  s.frac={x:clamp01(proj.xOf(anchor.time)/pane.width),y:clamp01((y-pane.top)/pane.height)};
 }
 return{x:s.frac.x*pane.width,y:pane.top+s.frac.y*pane.height,pane};
}
function specOf(model:TextModel):AnchoredTextSpec{
 const s=st(model),text=model.text;
 return{
  text:text?.value??'',sizePx:ANCHORED_TEXT_SIZE_PX[text?.size??'normal']??ANCHORED_TEXT_FACT_DEFAULTS.fontsize,
  bold:text?.bold===true,italic:text?.italic===true,color:text?.color??TV_BLUE,
  wordWrap:s.wordWrap,wordWrapWidth:s.wordWrapWidth,fillBackground:s.fillBackground,backgroundColor:s.backgroundColor,backgroundTransparency:s.backgroundTransparency,drawBorder:s.drawBorder,borderColor:s.borderColor,
 };
}
function boxOf(model:TextModel,proj:Projector){
 const at=resolve(model,proj);if(!at)return null;
 const spec=specOf(model),layout=layoutAnchoredText(spec,approximateMeasure(spec.sizePx));
 return{x:at.x,y:at.y,w:layout.width,h:layout.height};
}

function pinText(){
 const base=nativeBase('text');
 for(const key of ['anchorSchema','hitTest','hitHandle','handlePoints','bounds','priceRange','timeExtent','schema','serialize','readProps','writeProps','applySettings','onPlaced','translateBody'])method(base.prototype,key);
 const shape=roles(base.sample);
 if(shape.min!==1||shape.max!==1||shape.roles!=='p')fail('text anchor schema changed: '+JSON.stringify(shape));
 const schema=base.sample.schema() as {fields:Array<{path:string}>;textIsContent?:boolean};
 const paths=schema.fields.map(field=>field.path).join();
 if(paths!=='text.value,text.color,text.size,text.bold,text.italic'||schema.textIsContent!==true)fail('text settings schema changed: '+paths);
 if(base.sample.serialize().props!==undefined)fail('text now writes props of its own');
 return base;
}

function defineAnchoredText():DrawingTypeMeta{
 const base=pinText();
 const Base=base.ctor as unknown as new(init:Init)=>TextModel;
 const flag=(label:string,value:unknown)=>{if(typeof value!=='boolean')throw Error(label+' must be on or off.');return value;};
 const color=(label:string,value:unknown)=>{if(!supportedColor(value))throw Error(label+' must be a supported color.');return value;};
 class LvAnchoredText extends Base{
  constructor(init:Init){
   super(init);(this as {type:string}).type=LV_ANCHORED_TEXT;
   if(!init.text)this.text={value:'',size:'normal',hAlign:'left',vAlign:'top',color:TV_BLUE,bold:false,italic:false};
  }
  get fillBackground():boolean{return st(this).fillBackground;}
  set fillBackground(value:boolean){st(this).fillBackground=flag('Background',value);}
  get drawBorder():boolean{return st(this).drawBorder;}
  set drawBorder(value:boolean){st(this).drawBorder=flag('Border',value);}
  get wordWrap():boolean{return st(this).wordWrap;}
  set wordWrap(value:boolean){st(this).wordWrap=flag('Text wrap',value);}
  get wordWrapWidth():number{return st(this).wordWrapWidth;}
  set wordWrapWidth(value:number){
   if(typeof value!=='number'||!Number.isFinite(value)||value<ANCHORED_TEXT_WRAP_RANGE.min||value>ANCHORED_TEXT_WRAP_RANGE.max)throw Error('Wrap width must be between '+ANCHORED_TEXT_WRAP_RANGE.min+' and '+ANCHORED_TEXT_WRAP_RANGE.max+'.');
   st(this).wordWrapWidth=value;
  }
  get backgroundColor():string{return st(this).backgroundColor;}
  set backgroundColor(value:string){st(this).backgroundColor=color('Background color',value);}
  get borderColor():string{return st(this).borderColor;}
  set borderColor(value:string){st(this).borderColor=color('Border color',value);}
  get backgroundTransparency():number{return st(this).backgroundTransparency;}
  set backgroundTransparency(value:number){
   if(typeof value!=='number'||!Number.isFinite(value)||value<0||value>100)throw Error('Background transparency must be between 0 and 100.');
   st(this).backgroundTransparency=value;
  }
  // The stored pane fractions (read-only view for tests and the host).
  get screenAnchor():Fraction|null{const f=st(this).frac;return f?{...f}:null;}
  // ---- geometry: all of it from the pane fractions
  onPlaced(proj:Projector):void{resolve(this,proj);}
  translateBody(dt:number,dp:number,orig:Array<{time:number;price:number}>){
   const s=st(this),moved=super.translateBody(dt,dp,orig),proj=s.proj,pane=proj?paneBox(proj,this.paneId):null,a=orig[0];
   if(s.frac&&proj&&pane&&a){
    // One drag passes the same orig array on every move: remember the fractions at the press and move them by the pixel delta of the drag.
    if(s.dragOrig!==orig){s.dragOrig=orig;s.dragFrac={...s.frac};}
    const y0=proj.yOf(a.price,this.paneId),y1=proj.yOf(a.price+dp,this.paneId),base=s.dragFrac!;
    if(y0!=null&&y1!=null)s.frac={x:clamp01(base.x+(proj.xOf(a.time+dt)-proj.xOf(a.time))/pane.width),y:clamp01(base.y+(y1-y0)/pane.height)};
   }
   return moved;
  }
  constrainHandleDrag(_index:number):void{
   const s=st(this),proj=s.proj,a=this.anchors[0],pane=proj?paneBox(proj,this.paneId):null;
   if(!proj||!pane||!a)return;
   const y=proj.yOf(a.price,this.paneId);if(y==null)return;
   s.frac={x:clamp01(proj.xOf(a.time)/pane.width),y:clamp01((y-pane.top)/pane.height)};
  }
  timeExtent():null{return null;}
  priceRange():null{return null;}
  hitTest(px:number,py:number,proj:Projector,tol:number):boolean{
   const box=boxOf(this,proj);
   return !!box&&px>=box.x-tol&&px<=box.x+box.w+tol&&py>=box.y-tol&&py<=box.y+box.h+tol;
  }
  handlePoints(proj:Projector):Array<[number,number]>{const at=resolve(this,proj);return at?[[at.x,at.y]]:[];}
  hitHandle(px:number,py:number,proj:Projector,tol:number):number{
   const points=this.handlePoints(proj);
   return points.length&&Math.hypot(px-points[0][0],py-points[0][1])<=tol+3?0:-1;
  }
  bounds(proj:Projector){return boxOf(this,proj);}
  schema(){
   const inherited=super.schema() as {fields:SettingsField[];textIsContent?:boolean};
   const extra:SettingsField[]=[
    {path:'fillBackground',label:'Background',kind:'boolean',group:'text'},
    {path:'backgroundColor',label:'Background color',kind:'color',group:'text'},
    {path:'backgroundTransparency',label:'Background transparency',kind:'number',min:0,max:100,step:1,group:'text'},
    {path:'drawBorder',label:'Border',kind:'boolean',group:'text'},
    {path:'borderColor',label:'Border color',kind:'color',group:'text'},
    {path:'wordWrap',label:'Text wrap',kind:'boolean',group:'text'},
    {path:'wordWrapWidth',label:'Wrap width',kind:'number',min:ANCHORED_TEXT_WRAP_RANGE.min,max:ANCHORED_TEXT_WRAP_RANGE.max,step:10,group:'text'},
   ];
   return{...inherited,fields:[...inherited.fields,...extra]} as ReturnType<NativeModel['schema']>;
  }
  protected readProps(props:Record<string,unknown>):void{
   const s=st(this),next=fresh();
   next.raw=props&&typeof props==='object'?structuredClone(props):null;
   if(props&&typeof props==='object'){
    if(isFraction(props[SCREEN_ANCHOR_KEY]))next.frac={x:props[SCREEN_ANCHOR_KEY].x,y:props[SCREEN_ANCHOR_KEY].y};
    for(const key of ['fillBackground','drawBorder','wordWrap'] as const)if(typeof props[key]==='boolean')next[key]=props[key] as boolean;
    if(typeof props.wordWrapWidth==='number'&&Number.isFinite(props.wordWrapWidth)&&props.wordWrapWidth>=ANCHORED_TEXT_WRAP_RANGE.min&&props.wordWrapWidth<=ANCHORED_TEXT_WRAP_RANGE.max)next.wordWrapWidth=props.wordWrapWidth;
    for(const key of ['backgroundColor','borderColor'] as const)if(supportedColor(props[key]))next[key]=props[key] as string;
    if(typeof props.backgroundTransparency==='number'&&props.backgroundTransparency>=0&&props.backgroundTransparency<=100)next.backgroundTransparency=props.backgroundTransparency;
   }
   Object.assign(s,next);
  }
  protected writeProps():Record<string,unknown>{
   const s=st(this),out:Record<string,unknown>=s.raw?structuredClone(s.raw):{};
   if(s.frac)out[SCREEN_ANCHOR_KEY]={x:s.frac.x,y:s.frac.y};
   out.fillBackground=s.fillBackground;out.drawBorder=s.drawBorder;out.wordWrap=s.wordWrap;out.wordWrapWidth=s.wordWrapWidth;
   out.backgroundColor=s.backgroundColor;out.backgroundTransparency=s.backgroundTransparency;out.borderColor=s.borderColor;
   return out;
  }
  lvPaint(ctx:CanvasRenderingContext2D,proj:Projector,theme:LvPaintTheme):void{
   const at=resolve(this,proj);if(!at)return;
   paintAnchoredText(ctx,specOf(this),at.x,at.y,theme.fontFamily);
  }
 }
 const probe=new LvAnchoredText({id:'lv-drawing-type-probe',paneId:'price',createdAt:0});
 if(probe.type!==LV_ANCHORED_TEXT||probe.text?.size!=='normal')fail('text subclass did not adopt its defaults');
 return{type:lvKey(LV_ANCHORED_TEXT),group:base.meta.group,label:'Anchored text',icon:base.meta.icon,defaultStyle:cloneStyle(base.meta),create:init=>new LvAnchoredText(init)};
}

const u=(property:string,value:unknown,reason:UnappliedDefault['reason'],note:string):UnappliedDefault=>Object.freeze({toolId:ANCHORED_TEXT_TOOL_ID,factId:ANCHORED_TEXT_FACT_ID,property,value,reason,note});

export const ANCHORED_TEXT_MODULE=defineLvDrawingToolModule({
 id:'anchored-text',
 types:[{type:LV_ANCHORED_TEXT,base:'text',define:defineAnchoredText,requiresPaintHook:true}],
 // static-drawing-defaults#tool.LineToolTextAbsolute.defaults: color #2962FF, fontsize 14 (named size "normal" is 14 px), not bold, not italic.
 // The background, border and wrap values are the model's own fresh state (ANCHORED_TEXT_FACT_DEFAULTS), which the probe below verifies.
 factoryDefaults:[{type:LV_ANCHORED_TEXT,toolId:ANCHORED_TEXT_TOOL_ID,factId:ANCHORED_TEXT_FACT_ID,style:{},text:{color:TV_BLUE,size:'normal',bold:false,italic:false},
  probe:sample=>{
   const model=sample as unknown as TextModel;
   const same=model.fillBackground===ANCHORED_TEXT_FACT_DEFAULTS.fillBackground&&model.drawBorder===ANCHORED_TEXT_FACT_DEFAULTS.drawBorder&&model.wordWrap===ANCHORED_TEXT_FACT_DEFAULTS.wordWrap
    &&model.wordWrapWidth===ANCHORED_TEXT_FACT_DEFAULTS.wordWrapWidth&&model.backgroundColor===ANCHORED_TEXT_FACT_DEFAULTS.backgroundColor&&model.borderColor===ANCHORED_TEXT_FACT_DEFAULTS.borderColor
    &&model.backgroundTransparency===ANCHORED_TEXT_FACT_DEFAULTS.backgroundTransparency;
   return same?undefined:'anchored text background, border or wrap defaults changed';
  }}],
 retiresUnapplied:[{toolId:ANCHORED_TEXT_TOOL_ID,reason:'no-type'}],
 unappliedDefaults:[
  u('backgroundColor alpha',0.25,'unverified','The fact lists the palette alpha 0.25 for the background color but stores backgroundTransparency 70 (alpha 0.30). The two disagree, so only the stored transparency 70 is applied.'),
  u('anchored',true,'intrinsic','The type is always anchored to the screen; no setting is stored.'),
 ],
 catalog:[{rowId:ANCHORED_TEXT_ROW,type:LV_ANCHORED_TEXT,note:'Click the chart to place text. It stays where you put it on the screen when the chart scrolls or zooms.'}],
 dialog:[{toolId:ANCHORED_TEXT_TOOL_ID,types:[LV_ANCHORED_TEXT],text:{
  color:'text.color',fontsize:'text.size',bold:'text.bold',italic:'text.italic',text:'text.value',
  fillBackground:'fillBackground',backgroundColor:'backgroundColor',backgroundTransparency:'backgroundTransparency',drawBorder:'drawBorder',borderColor:'borderColor',wordWrap:'wordWrap',
 }}],
});
