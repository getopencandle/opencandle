// OpenCandle's own sticker set for the Stickers tool (reference LineToolSticker, the Stickers tab of the Icons group).
//
// ORIGINAL ART ONLY. Every sticker below is drawn from a handful of plain shapes (polygons, circles, lines, text) written here in a
// 100 x 100 unit box. No reference sticker image, icon asset or artwork is copied, traced or bundled: the reference catalog is
// artwork and is deliberately not recorded in the facts (visual-dialogs-drawing-flyouts#flyout.linetool-group-font-icons). The set,
// its names, colors and grouping are OpenCandle's choice. One list feeds both the chart painter (canvas) and the picker (SVG).
export type StickerShape=
 |{readonly k:'poly';readonly pts:readonly number[];readonly fill?:string;readonly stroke?:string;readonly width?:number}
 |{readonly k:'line';readonly pts:readonly number[];readonly stroke:string;readonly width:number}
 |{readonly k:'circle';readonly cx:number;readonly cy:number;readonly r:number;readonly fill?:string;readonly stroke?:string;readonly width?:number}
 |{readonly k:'text';readonly x:number;readonly y:number;readonly size:number;readonly text:string;readonly fill:string};
export interface Sticker{readonly id:string;readonly label:string;readonly shapes:readonly StickerShape[]}

const GREEN='#089981',RED='#f23645',AMBER='#f5a623',WHITE='#ffffff',INK='#1e1e1e',GOLD='#ffc107',BLUE='#2962ff';
const round=(value:number)=>Math.round(value*100)/100;
/** A rounded rectangle as a polygon (corner arcs sampled every 15 degrees). */
function roundRect(x:number,y:number,w:number,h:number,r:number):number[]{
 const pts:number[]=[],corners:[number,number,number][]=[[x+w-r,y+r,-90],[x+w-r,y+h-r,0],[x+r,y+h-r,90],[x+r,y+r,180]];
 for(const [cx,cy,start] of corners)for(let step=0;step<=6;step++){const a=(start+step*15)*Math.PI/180;pts.push(round(cx+r*Math.cos(a)),round(cy+r*Math.sin(a)));}
 return pts;
}
/** A regular star (n points) or, with inner===outer, a regular polygon. */
function star(cx:number,cy:number,outer:number,inner:number,n:number,turn=-90):number[]{
 const pts:number[]=[],count=inner===outer?n:n*2;
 for(let i=0;i<count;i++){const r=inner===outer||i%2===0?outer:inner,a=(turn+i*360/count)*Math.PI/180;pts.push(round(cx+r*Math.cos(a)),round(cy+r*Math.sin(a)));}
 return pts;
}
/** The classic parametric heart curve, scaled into the box. */
function heart():number[]{
 const pts:number[]=[];
 for(let i=0;i<48;i++){const t=i/48*Math.PI*2,x=16*Math.sin(t)**3,y=13*Math.cos(t)-5*Math.cos(2*t)-2*Math.cos(3*t)-Math.cos(4*t);pts.push(round(50+x*2.7),round(48-y*2.7));}
 return pts;
}
const badge=(id:string,label:string,fill:string,text:string,ink=WHITE):Sticker=>({id,label,shapes:[{k:'poly',pts:roundRect(4,27,92,46,12),fill,stroke:WHITE,width:3},{k:'text',x:50,y:51,size:text.length>3?24:28,text,fill:ink}]});
const disc=(fill:string,...rest:StickerShape[]):StickerShape[]=>[{k:'circle',cx:50,cy:50,r:45,fill,stroke:WHITE,width:3},...rest];

const freeze=<T>(value:T):T=>{if(value&&typeof value==='object'){for(const key of Object.keys(value))freeze((value as Record<string,unknown>)[key]);Object.freeze(value);}return value;};
export const STICKERS:readonly Sticker[]=freeze([
 badge('buy','Buy',GREEN,'BUY'),
 badge('sell','Sell',RED,'SELL'),
 badge('hold','Hold',AMBER,'HOLD',INK),
 {id:'long',label:'Up arrow',shapes:disc(GREEN,{k:'poly',pts:[50,16,80,48,62,48,62,82,38,82,38,48,20,48],fill:WHITE})},
 {id:'short',label:'Down arrow',shapes:disc(RED,{k:'poly',pts:[50,84,80,52,62,52,62,18,38,18,38,52,20,52],fill:WHITE})},
 {id:'check',label:'Check',shapes:disc(GREEN,{k:'line',pts:[27,52,43,68,74,34],stroke:WHITE,width:10})},
 {id:'cross',label:'Cross',shapes:disc(RED,{k:'line',pts:[32,32,68,68],stroke:WHITE,width:10},{k:'line',pts:[68,32,32,68],stroke:WHITE,width:10})},
 {id:'target',label:'Target',shapes:[{k:'circle',cx:50,cy:50,r:45,fill:RED},{k:'circle',cx:50,cy:50,r:33,fill:WHITE},{k:'circle',cx:50,cy:50,r:21,fill:RED},{k:'circle',cx:50,cy:50,r:9,fill:WHITE}]},
 {id:'stop',label:'Stop',shapes:[{k:'poly',pts:star(50,50,46,46,8,-67.5),fill:'#d32f2f',stroke:WHITE,width:4},{k:'text',x:50,y:51,size:24,text:'STOP',fill:WHITE}]},
 {id:'warning',label:'Warning',shapes:[{k:'poly',pts:[50,8,95,88,5,88],fill:GOLD,stroke:INK,width:4},{k:'text',x:50,y:64,size:42,text:'!',fill:INK}]},
 {id:'question',label:'Question',shapes:disc(BLUE,{k:'text',x:50,y:52,size:58,text:'?',fill:WHITE})},
 {id:'star',label:'Star',shapes:[{k:'poly',pts:star(50,53,47,19,5),fill:GOLD,stroke:'#e09b00',width:3}]},
 {id:'heart',label:'Heart',shapes:[{k:'poly',pts:heart(),fill:'#e91e63',stroke:WHITE,width:3}]},
 {id:'fire',label:'Flame',shapes:[{k:'poly',pts:[50,5,66,29,62,40,76,33,83,58,73,82,50,95,27,82,17,58,26,35,38,44,36,23],fill:'#ff7043'},{k:'poly',pts:[50,46,61,63,59,80,50,87,41,80,39,63],fill:'#ffca28'}]},
 {id:'rocket',label:'Rocket',shapes:[{k:'poly',pts:[40,68,50,95,60,68],fill:'#ff9800'},{k:'poly',pts:[36,46,20,72,36,67],fill:RED},{k:'poly',pts:[64,46,80,72,64,67],fill:RED},{k:'poly',pts:[50,5,65,26,65,68,35,68,35,26],fill:'#eceff1',stroke:'#455a64',width:3},{k:'circle',cx:50,cy:36,r:7,fill:'#42a5f5',stroke:'#455a64',width:2}]},
 {id:'gem',label:'Gem',shapes:[{k:'poly',pts:[30,14,70,14,92,38,50,92,8,38],fill:'#4fc3f7',stroke:'#0277bd',width:3},{k:'line',pts:[8,38,92,38],stroke:'#0277bd',width:2},{k:'line',pts:[30,14,40,38,50,92,60,38,70,14],stroke:'#0277bd',width:2}]},
 {id:'idea',label:'Idea',shapes:[{k:'poly',pts:roundRect(37,66,26,22,5),fill:'#90a4ae'},{k:'circle',cx:50,cy:40,r:30,fill:'#ffeb3b',stroke:'#f9a825',width:3},{k:'line',pts:[43,58,50,44,57,58],stroke:'#f9a825',width:3}]},
 {id:'flag',label:'Finish flag',shapes:[{k:'line',pts:[18,8,18,94],stroke:INK,width:5},{k:'poly',pts:[20,10,86,10,74,30,86,50,20,50],fill:RED,stroke:INK,width:3}]},
]);
export const STICKER_IDS:readonly string[]=Object.freeze(STICKERS.map(row=>row.id));
export const DEFAULT_STICKER='buy';
export const stickerById=(id:string)=>STICKERS.find(row=>row.id===id);

/** Paints `sticker` fitted (aspect kept, centred) into the pixel box. An unknown id paints a dashed placeholder square. */
export function paintSticker(ctx:CanvasRenderingContext2D,sticker:Sticker|undefined,box:{x:number;y:number;w:number;h:number},fontFamily:string){
 const side=Math.min(Math.abs(box.w),Math.abs(box.h));if(!(side>0))return;
 const ox=box.x+(Math.abs(box.w)-side)/2,oy=box.y+(Math.abs(box.h)-side)/2,k=side/100;
 const X=(value:number)=>ox+value*k,Y=(value:number)=>oy+value*k;
 ctx.save();
 ctx.setLineDash([]);
 if(!sticker){ctx.setLineDash([4,3]);ctx.strokeStyle='#808080';ctx.lineWidth=1;ctx.beginPath();ctx.rect(ox,oy,side,side);ctx.stroke();ctx.restore();return;}
 const path=(pts:readonly number[],close:boolean)=>{ctx.beginPath();for(let i=0;i<pts.length;i+=2)i?ctx.lineTo(X(pts[i]),Y(pts[i+1])):ctx.moveTo(X(pts[i]),Y(pts[i+1]));if(close)ctx.closePath();};
 const finish=(fill?:string,stroke?:string,width?:number)=>{if(fill){ctx.fillStyle=fill;ctx.fill();}if(stroke&&width){ctx.strokeStyle=stroke;ctx.lineWidth=width*k;ctx.stroke();}};
 for(const shape of sticker.shapes){
  if(shape.k==='poly'){path(shape.pts,true);finish(shape.fill,shape.stroke,shape.width);}
  else if(shape.k==='line'){path(shape.pts,false);finish(undefined,shape.stroke,shape.width);}
  else if(shape.k==='circle'){ctx.beginPath();ctx.arc(X(shape.cx),Y(shape.cy),shape.r*k,0,Math.PI*2);finish(shape.fill,shape.stroke,shape.width);}
  else{ctx.font=`bold ${Math.max(1,Math.round(shape.size*k))}px ${fontFamily}`;ctx.fillStyle=shape.fill;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(shape.text,X(shape.x),Y(shape.y));}
 }
 ctx.restore();
}

// Picker selection (one per app session), like the Emojis picker: the sticker the next placed Stickers drawing gets.
let selected=DEFAULT_STICKER;
const listeners=new Set<()=>void>();
export const selectedSticker=()=>selected;
/** Picks `id` for the next sticker. Returns false for an id that is not in the set. */
export function pickSticker(id:string):boolean{
 if(!STICKER_IDS.includes(id))return false;
 selected=id;for(const listener of [...listeners])listener();return true;
}
export function onStickerPicked(listener:()=>void):()=>void{listeners.add(listener);return()=>{listeners.delete(listener);};}
/** Test hook: back to the default sticker. */
export function resetStickerPicker(){selected=DEFAULT_STICKER;for(const listener of [...listeners])listener();}
