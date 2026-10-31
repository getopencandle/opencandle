// Drawing spec harness (OpenCandle 0.8.1). Places a drawing the way the app restores a saved one (a serialized record
// loaded through the native DrawingStore, which is what chart.drawings.fromJSON does), projects it with the renderer's own
// CoordinateSystem + createProjector on a deterministic bar fixture, paints it through the installed (patched) DrawingPainter on
// a recording canvas, and converts what was painted back to bar-index / price space.
// SYNTHETIC bars and prices only.
import {createDrawing,DrawingStore} from '@luxalgo/vela';
import '../../../src/chart/lv-drawing-types';
import '../../../src/chart/fib-level-format-native';
import {registerPositionChartContext} from '../../../src/chart/lv-types/position-tool';
import {readFileSync,writeFileSync,mkdirSync,unlinkSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {resolve,dirname} from 'node:path';
import {randomUUID} from 'node:crypto';
import {DAY,HOUR,X0,PX_PER_BAR,WIDTH,HEIGHT,dailyTimes,hourlyTimes,dailyBars,hourlyBars,type Anchor,type ScaleId,SCALES} from '../../fixtures/drawing-spec/bars';

// ---------------------------------------------------------------- renderer pieces from the installed chunk
let renderer:Promise<any>|undefined;
/** The installed renderer chunk with its painter, projector and coordinate system exported. Its relative imports point at the
 *  same files the app loads, so the drawing classes and the type registry are the ones '@luxalgo/vela' returns. */
export function installedRenderer(){return renderer??=(async()=>{
 const path=resolve('node_modules/@luxalgo/vela/dist/chunk-UNUVPQFW.js'),source=readFileSync(path,'utf8'),temporary=resolve('.cache',`lv-drawing-spec-${randomUUID()}.mjs`);mkdirSync(dirname(temporary),{recursive:true});
 try{writeFileSync(temporary,source.replace(/(from\s+['"])(\.\/[^'"]+)(['"])/g,(_all,before,relative,after)=>before+pathToFileURL(resolve(dirname(path),relative)).href+after)+'\nexport { DrawingPainter as LVSpecPainter, createProjector as LVSpecProjector, CoordinateSystem as LVSpecCoordinates, createDrawing as LVSpecCreateDrawing };\n');
  return await import(/* @vite-ignore */ pathToFileURL(temporary).href);}
 finally{try{unlinkSync(temporary);}catch{/* already gone */}}
})();}

// ---------------------------------------------------------------- recording canvas
export type Pt=[number,number];
export interface Stroke{kind:'stroke';polys:Pt[][];curved:boolean;dash:number[]}
export interface Fill{kind:'fill';polys:Pt[][]}
export interface Text{kind:'text';text:string;x:number;y:number;align:string}
export type Op=Stroke|Fill|Text;
type M=[number,number,number,number,number,number];
const apply=(m:M,x:number,y:number):Pt=>[m[0]*x+m[2]*y+m[4],m[1]*x+m[3]*y+m[5]];
const mul=(a:M,b:M):M=>[a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3],a[0]*b[4]+a[2]*b[5]+a[4],a[1]*b[4]+a[3]*b[5]+a[5]];
export function recordingCanvas(){
 const ops:Op[]=[],stack:any[]=[];let polys:Pt[][]=[],cur:Pt[]|null=null,curved=false,m:M=[1,0,0,1,0,0],dash:number[]=[];
 const ctx:any={globalAlpha:1,lineWidth:1,fillStyle:'#000000',strokeStyle:'#000000',font:'12px sans-serif',textAlign:'left',textBaseline:'alphabetic',lineCap:'butt',lineJoin:'miter',shadowBlur:0,shadowColor:'',filter:'none',imageSmoothingEnabled:true,canvas:{width:WIDTH,height:HEIGHT}};
 ctx.save=()=>stack.push({s:{...ctx},m:[...m],dash:[...dash]});
 ctx.restore=()=>{const top=stack.pop();if(!top)return;for(const k of Object.keys(top.s))if(typeof top.s[k]!=='function')ctx[k]=top.s[k];m=top.m;dash=top.dash;};
 ctx.beginPath=()=>{polys=[];cur=null;curved=false;};
 const start=(x:number,y:number)=>{cur=[apply(m,x,y)];polys.push(cur);};
 ctx.moveTo=start;
 ctx.lineTo=(x:number,y:number)=>{if(!cur)start(x,y);else cur.push(apply(m,x,y));};
 ctx.closePath=()=>{if(cur&&cur.length)cur.push(cur[0]);};
 ctx.rect=(x:number,y:number,w:number,h:number)=>{start(x,y);ctx.lineTo(x+w,y);ctx.lineTo(x+w,y+h);ctx.lineTo(x,y+h);ctx.closePath();cur=null;};
 ctx.roundRect=(x:number,y:number,w:number,h:number)=>ctx.rect(x,y,w,h);
 const curve=(pts:Pt[])=>{curved=true;if(!cur)start(...pts[0]);for(const p of pts)cur!.push(apply(m,p[0],p[1]));};
 ctx.arc=(cx:number,cy:number,r:number,a0:number,a1:number,ccw?:boolean)=>{
  let sweep=a1-a0;if(ccw){if(sweep>0)sweep-=2*Math.PI*Math.ceil(sweep/(2*Math.PI));}else if(sweep<0)sweep+=2*Math.PI*Math.ceil(-sweep/(2*Math.PI));
  if(Math.abs(a1-a0)>=2*Math.PI)sweep=ccw?-2*Math.PI:2*Math.PI;
  const n=Math.max(2,Math.ceil(Math.abs(sweep)/(Math.PI/32)));const pts:Pt[]=[];for(let i=0;i<=n;i++){const a=a0+sweep*i/n;pts.push([cx+r*Math.cos(a),cy+r*Math.sin(a)]);}
  curved=true;if(cur)cur.push(apply(m,...pts[0]));else start(...pts[0]);for(const p of pts.slice(1))cur!.push(apply(m,p[0],p[1]));
 };
 ctx.ellipse=(cx:number,cy:number,rx:number,ry:number,rot:number,a0:number,a1:number,ccw?:boolean)=>{
  let sweep=a1-a0;if(ccw&&sweep>0)sweep-=2*Math.PI;if(!ccw&&sweep<0)sweep+=2*Math.PI;if(Math.abs(a1-a0)>=2*Math.PI)sweep=ccw?-2*Math.PI:2*Math.PI;
  const n=64,pts:Pt[]=[];for(let i=0;i<=n;i++){const a=a0+sweep*i/n,x=rx*Math.cos(a),y=ry*Math.sin(a);pts.push([cx+x*Math.cos(rot)-y*Math.sin(rot),cy+x*Math.sin(rot)+y*Math.cos(rot)]);}
  curved=true;if(cur)cur.push(apply(m,...pts[0]));else start(...pts[0]);for(const p of pts.slice(1))cur!.push(apply(m,p[0],p[1]));
 };
 ctx.arcTo=(x1:number,y1:number)=>{ctx.lineTo(x1,y1);};
 ctx.quadraticCurveTo=(cx:number,cy:number,x:number,y:number)=>{const p0=cur?.length?cur[cur.length-1]:apply(m,cx,cy);const inv=invert(m),q0=apply(inv,p0[0],p0[1]);const pts:Pt[]=[];for(let i=1;i<=16;i++){const t=i/16,u=1-t;pts.push([u*u*q0[0]+2*u*t*cx+t*t*x,u*u*q0[1]+2*u*t*cy+t*t*y]);}curve(pts);};
 ctx.bezierCurveTo=(c1x:number,c1y:number,c2x:number,c2y:number,x:number,y:number)=>{const p0=cur?.length?cur[cur.length-1]:apply(m,c1x,c1y);const inv=invert(m),q0=apply(inv,p0[0],p0[1]);const pts:Pt[]=[];for(let i=1;i<=24;i++){const t=i/24,u=1-t;pts.push([u*u*u*q0[0]+3*u*u*t*c1x+3*u*t*t*c2x+t*t*t*x,u*u*u*q0[1]+3*u*u*t*c1y+3*u*t*t*c2y+t*t*t*y]);}curve(pts);};
 ctx.clip=()=>{polys=[];cur=null;};
 ctx.translate=(x:number,y:number)=>{m=mul(m,[1,0,0,1,x,y]);};
 ctx.rotate=(a:number)=>{m=mul(m,[Math.cos(a),Math.sin(a),-Math.sin(a),Math.cos(a),0,0]);};
 ctx.scale=(x:number,y:number)=>{m=mul(m,[x,0,0,y,0,0]);};
 ctx.setTransform=(...v:number[])=>{m=v.length>=6?[v[0],v[1],v[2],v[3],v[4],v[5]] as M:[1,0,0,1,0,0];};
 ctx.resetTransform=()=>{m=[1,0,0,1,0,0];};
 ctx.getTransform=()=>({a:m[0],b:m[1],c:m[2],d:m[3],e:m[4],f:m[5]});
 ctx.setLineDash=(d:number[])=>{dash=[...d];};ctx.getLineDash=()=>[...dash];
 ctx.stroke=()=>{if(polys.length)ops.push({kind:'stroke',polys:polys.map(p=>[...p]),curved,dash:[...dash]});};
 ctx.fill=()=>{if(polys.length)ops.push({kind:'fill',polys:polys.map(p=>[...p])});};
 ctx.fillRect=(x:number,y:number,w:number,h:number)=>{ops.push({kind:'fill',polys:[[apply(m,x,y),apply(m,x+w,y),apply(m,x+w,y+h),apply(m,x,y+h)]]});};
 ctx.strokeRect=(x:number,y:number,w:number,h:number)=>{ops.push({kind:'stroke',curved:false,dash:[...dash],polys:[[apply(m,x,y),apply(m,x+w,y),apply(m,x+w,y+h),apply(m,x,y+h),apply(m,x,y)]]});};
 ctx.clearRect=()=>{};
 ctx.fillText=(text:string,x:number,y:number)=>{const p=apply(m,x,y);ops.push({kind:'text',text:String(text),x:p[0],y:p[1],align:ctx.textAlign});};
 ctx.strokeText=()=>{};
 ctx.measureText=(text:string)=>({width:String(text).length*6,actualBoundingBoxAscent:8,actualBoundingBoxDescent:2,fontBoundingBoxAscent:9,fontBoundingBoxDescent:3});
 ctx.drawImage=()=>{};ctx.createLinearGradient=()=>({addColorStop(){}});ctx.createRadialGradient=()=>({addColorStop(){}});ctx.createPattern=()=>null;
 ctx.getImageData=()=>({data:new Uint8ClampedArray(4)});ctx.putImageData=()=>{};ctx.isPointInPath=()=>false;
 return{ctx,ops};
}
function invert(m:M):M{const det=m[0]*m[3]-m[1]*m[2];return[m[3]/det,-m[1]/det,-m[2]/det,m[0]/det,(m[2]*m[5]-m[3]*m[4])/det,(m[1]*m[4]-m[0]*m[5])/det];}

// ---------------------------------------------------------------- projection
export type Interval='1D'|'1h';
export interface Frame{interval:Interval;scale:ScaleId;log?:boolean}
export async function projector(frame:Frame){
 const m=await installedRenderer(),coords=new m.LVSpecCoordinates();
 const times=frame.interval==='1D'?dailyTimes():hourlyTimes();
 coords.times=times;coords.intervalMs=frame.interval==='1D'?DAY:HOUR;
 coords.logicalToX=(l:number)=>X0+l*PX_PER_BAR;coords.xToLogical=(x:number)=>(x-X0)/PX_PER_BAR;
 coords.widthPx=WIDTH;coords.dataHeightPx=HEIGHT;
 const sc=SCALES[frame.scale],scale={min:sc.min,max:sc.max,log:!!frame.log};
 const pane={scale,bounds:{top:0,height:HEIGHT},collapsed:false};
 const bars=frame.interval==='1D'?dailyBars():hourlyBars();
 const barsInRange=(from:number,to:number)=>bars.filter(b=>b.time>=from&&b.time<=to).map(b=>({...b}));
 const p=m.LVSpecProjector(coords,(id:string)=>id==='price'||id===undefined?pane:null,()=>'price',barsInRange);
 p.width=WIDTH;p.height=HEIGHT;
 return{proj:p,coords,times,scale:sc};
}

// ---------------------------------------------------------------- placing and painting
export interface Placement{type:string;anchors:Anchor[];props?:Record<string,unknown>;text?:string}
let tickRelease:(()=>void)|undefined;
/** The instrument tick the chart reports (the adapter registers the same context per chart). */
export function setTick(tick:number|undefined){tickRelease?.();tickRelease=undefined;if(tick!==undefined)tickRelease=registerPositionChartContext({owns:()=>true,tickSize:()=>tick});}

export const timeOfBar=(bar:number,interval:Interval='1D')=>{const t=interval==='1D'?dailyTimes():hourlyTimes();const lo=Math.floor(bar),f=bar-lo;if(lo>=t.length-1)return t[t.length-1]+(bar-(t.length-1))*(interval==='1D'?DAY:HOUR);return t[lo]+(t[lo+1]-t[lo])*f;};

/** The saved record a drawing placed at these anchors writes (what the workspace stores). */
export function savedRecord(placement:Placement,interval:Interval='1D'):Record<string,any>{
 const anchors=placement.anchors.map(a=>({time:Number.isInteger(a.bar)?timeOfBar(a.bar,interval):timeOfBar(a.bar,interval),price:a.price}));
 const init:Record<string,unknown>={id:'spec-'+placement.type,paneId:'price',anchors};
 if(placement.props)init.props=placement.props;
 if(placement.text!==undefined)init.text={value:placement.text};
 const d=createDrawing(placement.type as never,init as never) as any;
 if(!d)throw Error('createDrawing returned nothing for '+placement.type);
 return JSON.parse(JSON.stringify(d.serialize()));
}
/** Restores records the way the app does (chart.drawings.fromJSON -> DrawingStore.load). */
export function restore(records:Record<string,any>[]):any[]{
 const store=new DrawingStore() as any,doc={...store.serialize(),drawings:records};
 store.load(JSON.parse(JSON.stringify(doc)));
 return records.map(r=>store.get(r.id));
}
export function saveOf(model:any){return JSON.parse(JSON.stringify(model.serialize()));}

const theme={fontFamily:'sans-serif',background:'#101010',textColor:'#ffffff'};
export async function paintModel(model:any,frame:Frame):Promise<Op[]>{
 const m=await installedRenderer(),{proj}=await projector(frame),rec=recordingCanvas();
 new m.LVSpecPainter().paintAll(rec.ctx,[model],proj,theme,{});
 return rec.ops;
}

// ---------------------------------------------------------------- back to bar / price space
export function toBar(x:number){return (x-X0)/PX_PER_BAR;}
export function toPrice(y:number,frame:Frame){const s=SCALES[frame.scale];if(frame.log){const lo=Math.log(s.min);return Math.exp(lo+(1-y/HEIGHT)*(Math.log(s.max)-lo));}return s.min+(s.max-s.min)*(1-y/HEIGHT);}
export function xOfBar(bar:number){return X0+bar*PX_PER_BAR;}
export function yOfPrice(price:number,frame:Frame){const s=SCALES[frame.scale];if(frame.log){const lo=Math.log(s.min);return HEIGHT*(1-(Math.log(price)-lo)/(Math.log(s.max)-lo));}return HEIGHT*(1-(price-s.min)/(s.max-s.min));}

/** Straight pieces of every stroke (curves are sampled; their pieces are flagged curved). */
export function segments(ops:Op[]):{a:Pt;b:Pt;curved:boolean;dashed:boolean}[]{
 const out:{a:Pt;b:Pt;curved:boolean;dashed:boolean}[]=[];
 for(const op of ops)if(op.kind==='stroke')for(const poly of op.polys)for(let i=1;i<poly.length;i++){const a=poly[i-1],b=poly[i];if(Math.hypot(a[0]-b[0],a[1]-b[1])<1e-9)continue;out.push({a,b,curved:op.curved,dashed:op.dash.length>0});}
 return out;
}
export const texts=(ops:Op[])=>ops.filter((o):o is Text=>o.kind==='text');
export const fills=(ops:Op[])=>ops.filter((o):o is Fill=>o.kind==='fill');
