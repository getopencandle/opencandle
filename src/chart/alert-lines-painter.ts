// WSX alert lines painter. A renderer layer installed on the main-series pane through the same seam as the appearance
// layer (the install is a root diff in adapter.ts: registerAlertLinesLayer() once, then setNativeData(ALERT_LINES_LAYER,
// payload) with alertLinesPayload()). It never creates drawing rows and never uses the drawing lvPaint hook.
import {registerRendererLayer,type RendererLayerArgs,type RendererLayerInstance} from '@luxalgo/vela';
import {ALERT_LINES_LAYER,ALERT_LINE_FALLBACK,ALERT_LINE_TOKEN,ALERT_STATE_TOKEN,AlertBlinkTracker,type AlertLineRow,type AlertLinesPayload} from './alert-lines-data';

export interface AlertLineBounds {readonly left:number;readonly right:number;readonly top:number;readonly bottom:number}
export interface AlertLineProjection {yOf(price:number):number}
export interface AlertLineOp {
 readonly alertId:string;readonly slot:AlertLineRow['slot'];readonly y:number;readonly x1:number;readonly x2:number;
 readonly color:string;readonly width:number;readonly dash:readonly number[];
 readonly label:{readonly text:string;readonly x:number;readonly y:number;readonly align:'right';readonly visible:boolean;readonly state:NonNullable<AlertLineRow['state']>};
}
const DASH:readonly number[]=[6,4];
const LABEL_INSET=6;
/** One horizontal line per row at its projected price, with the label inside the pane at its right edge. Rows whose
 * projection is not finite or falls outside the pane are skipped. Never throws. */
export function planAlertLines(rows:readonly AlertLineRow[],proj:AlertLineProjection,bounds:AlertLineBounds,options:{color?:string}):AlertLineOp[]{
 const out:AlertLineOp[]=[];
 for(const row of rows){
  let y:number;try{y=proj.yOf(row.price);}catch{continue;}
  if(!Number.isFinite(y)||y<bounds.top||y>bounds.bottom)continue;
  out.push({alertId:row.alertId,slot:row.slot,y,x1:bounds.left,x2:bounds.right,color:row.color??options.color??ALERT_LINE_FALLBACK,width:1,dash:row.dashed?DASH:[],label:{text:row.label,x:bounds.right-LABEL_INSET,y:y-3,align:'right',visible:row.labelVisible!==false,state:row.state??'active'}});
 }
 return out;
}
function tokenColor():string|undefined{
 try{if(typeof document==='undefined')return undefined;const value=getComputedStyle(document.documentElement).getPropertyValue(ALERT_LINE_TOKEN).trim();return value||undefined;}catch{return undefined;}
}
function stateColor(state:NonNullable<AlertLineRow['state']>,fallback:string):string{
 if(state==='active')return fallback;
 try{if(typeof document==='undefined')return fallback;return getComputedStyle(document.documentElement).getPropertyValue(ALERT_STATE_TOKEN[state]).trim()||fallback;}catch{return fallback;}
}
const isPayload=(value:unknown):value is AlertLinesPayload=>!!value&&typeof value==='object'&&(value as AlertLinesPayload).schemaVersion===1&&Array.isArray((value as AlertLinesPayload).rows);
class AlertLinesLayer implements RendererLayerInstance {
 private canvas:HTMLCanvasElement|null=null;private blink=new AlertBlinkTracker();private frame=0;private last:RendererLayerArgs|null=null;
 mount(canvas:HTMLCanvasElement){this.canvas=canvas;canvas.dataset.lvLayer=ALERT_LINES_LAYER;}
 render(args:RendererLayerArgs){
  const canvas=this.canvas;if(!canvas)return;const ctx=canvas.getContext('2d');if(!ctx)return;
  ctx.clearRect(0,0,canvas.width,canvas.height);
  const rows=isPayload(args.data)?args.data.rows:[],now=Date.now();this.last=args;this.blink.observe(rows,now);
  const plan=planAlertLines(rows,{yOf:price=>args.coords.priceToY(price,args.scale,args.bounds)},{left:0,right:args.coords.width,top:args.bounds.top,bottom:args.bounds.top+args.bounds.height},{color:tokenColor()});
  ctx.save();ctx.scale(args.coords.dpr,args.coords.dpr);ctx.beginPath();ctx.rect(0,args.bounds.top,args.coords.width,args.bounds.height);ctx.clip();
  ctx.font='11px sans-serif';ctx.textBaseline='bottom';
  for(const op of plan){
   ctx.strokeStyle=op.color;ctx.fillStyle=op.color;ctx.lineWidth=op.width;ctx.setLineDash([...op.dash]);
   ctx.beginPath();ctx.moveTo(op.x1,op.y);ctx.lineTo(op.x2,op.y);ctx.stroke();
   if(!op.label.visible)continue;
   ctx.setLineDash([]);ctx.textAlign=op.label.align;ctx.fillStyle=stateColor(op.label.state,op.color);ctx.globalAlpha=this.blink.alpha(op.alertId,now);ctx.fillText(op.label.text,op.label.x,op.label.y);ctx.globalAlpha=1;
  }
  ctx.restore();canvas.dataset.lvAlertLines=String(plan.length);
  if(this.blink.active(now)&&!this.frame&&typeof requestAnimationFrame==='function')this.frame=requestAnimationFrame(()=>{this.frame=0;if(this.last&&this.canvas)this.render(this.last);});
 }
 destroy(){if(this.frame&&typeof cancelAnimationFrame==='function')cancelAnimationFrame(this.frame);this.frame=0;this.canvas=null;this.last=null;}
}
let registered=false;
/** Idempotent. Renderers mounted after registration pick the layer up. */
export function registerAlertLinesLayer(){
 if(registered)return;registered=true;
 registerRendererLayer({id:ALERT_LINES_LAYER,placement:'above-data',create:()=>new AlertLinesLayer()});
}
