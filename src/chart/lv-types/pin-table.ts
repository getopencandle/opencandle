// Pin and Table (reference LineToolNote and LineToolTable) on the pinned native `note` class (PinnedLabel):
// one anchor, a text block (text.value, color, size, bold, italic) and the native line and fill fields. Placement, handle,
// body drag, serialization, undo, the text fields of the settings dialog and the inline text editor of a text drawing stay
// native. Both paint through LV-VELA-DRAWING-PAINT-HOOK-1 (lvPaint) and hit-test their own painted shape.
//
// Pin. Facts: static-drawing-defaults#creation.textTools lists LineToolNote as a text tool, and
// static-drawing-defaults-2#tool.LineToolNote.status confirms its floating toolbar settings Marker color, Text color and
// Font size. Those map to the inherited native fields style.lineColor (marker), text.color and text.size. Shape (
// the reference look is not recorded): a round marker head on a short stem whose tip is the anchor, and the text on a plate
// above the head (no plate while the text is empty). Factory defaults are unknown, so the native Note style and its
// "Note" text remain.
//
// Table. No setting or default is recorded (static-drawing-defaults-2#tool.LineToolTable.status). The table is
// written as text, one row per line (or per ';'), cells separated by '|'; it is drawn as a grid of equal-height rows whose
// column widths fit their widest cell, its top-left corner at the anchor. Border = line color and width, cell background
// = fill color, text = text color and size. Edit it inline or in the Text field of the settings dialog.
import type {DrawingTypeMeta} from '@luxalgo/vela';
import {cloneStyle,fail,lvKey,method,nativeBase,roles,type Init,type NativeModel,type Projector} from '../lv-drawing-pin';
import type {LvPaintTheme} from '../lv-paint-hook';
import {defineLvDrawingToolModule} from './contract';
import {approxTextWidth,inRect,lineHeight,namedPx,strokePath,type Rect} from './paint-helpers';

export const LV_PIN='lvpin';
export const LV_TABLE='lvtable';
const BASE='note';

interface NoteModel extends NativeModel{box(proj:Projector):Rect|null}
function pinNote(){
 const base=nativeBase(BASE);
 for(const key of ['box','labelText','defaultLabel','hitTest','hitHandle','handlePoints','bounds','priceRange','schema','serialize'])method(base.prototype,key);
 const sample=base.sample as NoteModel,shape=roles(sample);
 if(shape.min!==1||shape.max!==1||shape.roles!=='p')fail('note anchor schema changed: '+JSON.stringify(shape));
 const schema=sample.schema() as {fields:{path:string}[];textIsContent?:boolean};
 const paths=schema.fields.map(field=>field.path);
 for(const path of ['style.lineColor','style.lineWidth','style.fillColor','text.value','text.color','text.size'])if(!paths.includes(path))fail('note settings changed: '+paths.join());
 if(schema.textIsContent!==true||sample.text?.value!=='Note')fail('note text content changed');
 return base;
}
const fontOf=(text:NoteModel['text'],theme:{fontFamily:string})=>`${text?.bold?'bold ':''}${text?.italic?'italic ':''}${namedPx(text?.size)}px ${theme.fontFamily}`;

// ── Pin ──
export const PIN_HEAD_RADIUS=7,PIN_STEM=12;
export interface PinShape{readonly tip:[number,number];readonly head:[number,number];readonly plate:Rect|null}
/** Pin geometry in pixels (the text plate width is approximated from the text when no canvas measures it). */
export function pinShape(tip:[number,number],text:string,px:number,measure:(line:string)=>number=line=>approxTextWidth(line,px)):PinShape{
 const head:[number,number]=[tip[0],tip[1]-PIN_STEM-PIN_HEAD_RADIUS];
 const lines=text?text.split('\n'):[];
 if(!lines.length)return{tip,head,plate:null};
 const lh=lineHeight(px),w=Math.max(...lines.map(measure))+12,h=lines.length*lh+8;
 return{tip,head,plate:{x:head[0]-w/2,y:head[1]-PIN_HEAD_RADIUS-6-h,w,h}};
}

// ── Table ──
export const TABLE_PAD_X=6,TABLE_PAD_Y=4;
/** Rows and cells of the table text (our own syntax: rows by line break or ';', cells by '|'). */
export function tableCells(text:string):string[][]{
 const rows=text.split(/\r?\n|;/).map(row=>row.trim()).filter(row=>row.length>0).map(row=>row.split('|').map(cell=>cell.trim()));
 const columns=Math.max(0,...rows.map(row=>row.length));
 return rows.map(row=>[...row,...Array(columns-row.length).fill('')]);
}
export interface TableLayout{readonly x:number;readonly y:number;readonly columns:readonly number[];readonly rowHeight:number;readonly rows:number;readonly w:number;readonly h:number}
export function tableLayout(origin:[number,number],cells:readonly string[][],px:number,measure:(text:string)=>number=text=>approxTextWidth(text,px)):TableLayout|null{
 if(!cells.length)return null;
 const columns=cells[0].map((_,c)=>Math.max(...cells.map(row=>measure(row[c])))+TABLE_PAD_X*2);
 const rowHeight=lineHeight(px)+TABLE_PAD_Y*2;
 return{x:origin[0],y:origin[1],columns,rowHeight,rows:cells.length,w:columns.reduce((a,b)=>a+b,0),h:rowHeight*cells.length};
}

function defineNoteTool(type:typeof LV_PIN|typeof LV_TABLE):DrawingTypeMeta{
 const base=pinNote();
 const Base=base.ctor as unknown as new(init:Init)=>NoteModel;
 const anchorPx=(model:NoteModel,proj:Projector):[number,number]|null=>{const a=model.anchors[0];if(!a)return null;const y=proj.yOf(a.price,model.paneId),x=proj.xOf(a.time);return y==null||!Number.isFinite(x)||!Number.isFinite(y)?null:[x,y];};
 class LvPin extends Base{
  constructor(init:Init){super(init);(this as {type:string}).type=LV_PIN;}
  shape(proj:Projector):PinShape|null{const tip=anchorPx(this,proj);return tip?pinShape(tip,this.text?.value??'',namedPx(this.text?.size)):null;}
  box(proj:Projector):Rect|null{
   const s=this.shape(proj);if(!s)return null;
   const head:Rect={x:s.head[0]-PIN_HEAD_RADIUS,y:s.head[1]-PIN_HEAD_RADIUS,w:PIN_HEAD_RADIUS*2,h:s.tip[1]-s.head[1]+PIN_HEAD_RADIUS};
   if(!s.plate)return head;
   const x=Math.min(head.x,s.plate.x),y=s.plate.y;
   return{x,y,w:Math.max(head.x+head.w,s.plate.x+s.plate.w)-x,h:head.y+head.h-y};
  }
  hitTest(px:number,py:number,proj:Projector,tol:number):boolean{
   const s=this.shape(proj);if(!s)return false;
   if(Math.hypot(px-s.head[0],py-s.head[1])<=PIN_HEAD_RADIUS+tol)return true;
   if(Math.abs(px-s.tip[0])<=tol&&py>=s.head[1]&&py<=s.tip[1]+tol)return true;
   return !!s.plate&&inRect(px,py,s.plate);
  }
  lvPaint(ctx:CanvasRenderingContext2D,proj:Projector,theme:LvPaintTheme):void{
   const tip=anchorPx(this,proj);if(!tip)return;
   ctx.save();
   ctx.font=fontOf(this.text,theme);
   const s=pinShape(tip,this.text?.value??'',namedPx(this.text?.size),line=>ctx.measureText(line).width);
   const marker=this.style.lineColor;
   strokePath(ctx,{lineColor:marker,lineWidth:2,lineStyle:'solid'},()=>{ctx.moveTo(s.tip[0],s.tip[1]);ctx.lineTo(s.head[0],s.head[1]);});
   ctx.fillStyle=marker;ctx.beginPath();ctx.arc(s.head[0],s.head[1],PIN_HEAD_RADIUS,0,Math.PI*2);ctx.fill();
   ctx.fillStyle=theme.background;ctx.beginPath();ctx.arc(s.head[0],s.head[1],PIN_HEAD_RADIUS/3,0,Math.PI*2);ctx.fill();
   if(s.plate){
    const lines=(this.text?.value??'').split('\n'),lh=lineHeight(namedPx(this.text?.size));
    ctx.fillStyle=this.style.fillColor??theme.background;ctx.beginPath();ctx.rect(s.plate.x,s.plate.y,s.plate.w,s.plate.h);ctx.fill();
    strokePath(ctx,{lineColor:marker,lineWidth:1,lineStyle:'solid'},()=>ctx.rect(s.plate!.x,s.plate!.y,s.plate!.w,s.plate!.h));
    ctx.fillStyle=this.text?.color??theme.textColor;ctx.textAlign='center';ctx.textBaseline='middle';
    lines.forEach((line,i)=>ctx.fillText(line,s.head[0],s.plate!.y+4+lh*i+lh/2));
   }
   ctx.restore();
  }
 }
 class LvTable extends Base{
  constructor(init:Init){
   super(init);(this as {type:string}).type=LV_TABLE;
   // A fresh table starts as a 2 x 2 example instead of the note's single word.
   if(!init.text&&this.text)this.text={...this.text,value:'Item | Value\nEntry | Target'};
  }
  defaultLabel(){return 'Item | Value';}
  layout(proj:Projector,measure?:(text:string)=>number):TableLayout|null{const o=anchorPx(this,proj);return o?tableLayout(o,tableCells(this.text?.value??''),namedPx(this.text?.size),measure):null;}
  box(proj:Projector):Rect|null{const l=this.layout(proj);if(l)return{x:l.x,y:l.y,w:l.w,h:l.h};const o=anchorPx(this,proj);return o?{x:o[0],y:o[1],w:24,h:16}:null;}
  hitTest(px:number,py:number,proj:Projector,tol:number):boolean{const b=this.box(proj);return !!b&&inRect(px,py,b,tol);}
  lvPaint(ctx:CanvasRenderingContext2D,proj:Projector,theme:LvPaintTheme):void{
   ctx.save();
   ctx.font=fontOf(this.text,theme);
   const cells=tableCells(this.text?.value??''),l=this.layout(proj,text=>ctx.measureText(text).width);
   if(!l){const o=anchorPx(this,proj);if(o)strokePath(ctx,this.style,()=>ctx.rect(o[0],o[1],24,16));ctx.restore();return;}
   if(this.style.fillColor){ctx.fillStyle=this.style.fillColor;ctx.fillRect(l.x,l.y,l.w,l.h);}
   strokePath(ctx,this.style,()=>{
    ctx.rect(l.x,l.y,l.w,l.h);
    for(let r=1;r<l.rows;r++){ctx.moveTo(l.x,l.y+r*l.rowHeight);ctx.lineTo(l.x+l.w,l.y+r*l.rowHeight);}
    let x=l.x;for(const width of l.columns.slice(0,-1)){x+=width;ctx.moveTo(x,l.y);ctx.lineTo(x,l.y+l.h);}
   });
   ctx.fillStyle=this.text?.color??theme.textColor;ctx.textAlign='left';ctx.textBaseline='middle';
   cells.forEach((row,r)=>{let x=l.x;row.forEach((cell,c)=>{ctx.fillText(cell,x+TABLE_PAD_X,l.y+r*l.rowHeight+l.rowHeight/2);x+=l.columns[c];});});
   ctx.restore();
  }
 }
 const Model=type===LV_PIN?LvPin:LvTable;
 return{type:lvKey(type),group:base.meta.group,label:type===LV_PIN?'Pin':'Table',icon:base.meta.icon,defaultStyle:cloneStyle(base.meta),create:init=>new Model(init)};
}

export const PIN_MODULE=defineLvDrawingToolModule({
 id:'pin',
 types:[{type:LV_PIN,base:BASE,define:()=>defineNoteTool(LV_PIN),requiresPaintHook:true}],
 unappliedDefaults:[Object.freeze({toolId:'LineToolNote',factId:'tool.LineToolNote.creation',property:'pointsCount',value:null,reason:'unverified' as const,
  note:'The reference anchor count is not recorded (pointsCountKnown false). Slice approximation pending reference observation: OpenCandle places 1 point, the pin tip, and draws a marker with the text above it. Marker color, text color and font size map to the native line color, text color and text size. Factory defaults are unknown (static-drawing-defaults-2#tool.LineToolNote.status), so nothing is seeded and the native Note style and text remain; those are OpenCandle renderer defaults.'})],
 catalog:[{rowId:'DW.ANNOTATION.PIN',type:LV_PIN,note:'Click to place a pin. Double-click it to write its note.'}],
});
export const TABLE_MODULE=defineLvDrawingToolModule({
 id:'table',
 types:[{type:LV_TABLE,base:BASE,define:()=>defineNoteTool(LV_TABLE),requiresPaintHook:true}],
 unappliedDefaults:[Object.freeze({toolId:'LineToolTable',factId:'tool.LineToolTable.creation',property:'pointsCount',value:null,reason:'unverified' as const,
  note:'The reference anchor count and table editor are not recorded (pointsCountKnown false). Slice approximation pending reference observation: OpenCandle places 1 point, the top-left corner, and draws a grid from text (rows by line, cells by |). Factory defaults are unknown (static-drawing-defaults-2#tool.LineToolTable.status), so nothing is seeded and the native Note style remains; those are OpenCandle renderer defaults.'})],
 catalog:[{rowId:'DW.ANNOTATION.TABLE',type:LV_TABLE,note:'Click to place the top-left corner. Type one row per line and separate cells with |.'}],
});
