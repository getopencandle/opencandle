// Demonstration cursor temporary drawing. Pure model of the fading trail the Demonstration cursor draws
// while Alt is held; src/ui/DemonstrationOverlay.tsx feeds it pointer positions and paints it.
//
// Behavior:
//  * The hint "Hold {key} for temporary drawing", {key} = Alt.
//  * The temporary drawing is a presentation highlighter with
//    smooth 5 and fadesOut true, and it cannot be hidden (it is not a drawing record: nothing is saved, listed in the
//    object tree, undone or synced). Its color, width and duration are our own choice (below).
//  * The highlighter family ignores points closer than 2 px.
// Not facts: the trail follows the pointer while Alt is held (no button press, so panning and drawing are
// untouched); color #F23645, width 4 px, round caps, each point fades out linearly over 1500 ms; "smooth 5" is read as a
// moving average over the last 5 raw points.
export const DEMONSTRATION_KEY='Alt';
export const DEMONSTRATION_HINT='Hold '+DEMONSTRATION_KEY+' for temporary drawing';
export const DEMONSTRATION_SMOOTH=5;
export const DEMONSTRATION_MIN_SPACING_PX=2;
export const DEMONSTRATION_STYLE=Object.freeze({color:'#F23645',width:4,fadeMs:1500});
/** Bound on the retained points (a long Alt hold at a high pointer rate stays bounded). */
export const DEMONSTRATION_MAX_POINTS=600;

export interface TrailPoint{readonly x:number;readonly y:number;readonly t:number}
export interface DemonstrationTrail{
 /** A pointer sample. `held` is whether Alt is down; a release ends the current stroke (the next hold starts a new one). */
 add(x:number,y:number,t:number,held:boolean):void;
 /** Drops points that have fully faded by time `t`. Returns whether anything is left to paint. */
 prune(t:number):boolean;
 /** Strokes to paint at time `t`: smoothed points, each with its opacity (1 fresh .. 0 faded). */
 strokes(t:number):readonly (readonly {x:number;y:number;alpha:number}[])[];
 clear():void;
}

export function createDemonstrationTrail(style:{fadeMs:number}=DEMONSTRATION_STYLE):DemonstrationTrail{
 let strokes:{raw:TrailPoint[];smooth:TrailPoint[]}[]=[];let open=false;
 const total=()=>strokes.reduce((sum,stroke)=>sum+stroke.smooth.length,0);
 return{
  add(x,y,t,held){
   if(!held||!Number.isFinite(x)||!Number.isFinite(y)){open=false;return;}
   if(!open){strokes.push({raw:[],smooth:[]});open=true;}
   const stroke=strokes[strokes.length-1],last=stroke.raw[stroke.raw.length-1];
   if(last&&Math.hypot(x-last.x,y-last.y)<DEMONSTRATION_MIN_SPACING_PX)return;
   stroke.raw.push({x,y,t});
   const window=stroke.raw.slice(-DEMONSTRATION_SMOOTH);
   stroke.smooth.push({x:window.reduce((s,p)=>s+p.x,0)/window.length,y:window.reduce((s,p)=>s+p.y,0)/window.length,t});
   if(stroke.raw.length>DEMONSTRATION_SMOOTH)stroke.raw.shift();
   while(total()>DEMONSTRATION_MAX_POINTS){const first=strokes[0];first.smooth.shift();if(!first.smooth.length&&strokes.length>1)strokes.shift();}
  },
  prune(t){
   for(const stroke of strokes)stroke.smooth=stroke.smooth.filter(p=>t-p.t<style.fadeMs);
   strokes=strokes.filter((stroke,index)=>stroke.smooth.length>0||(open&&index===strokes.length-1));
   if(!strokes.length)open=false;
   return strokes.some(stroke=>stroke.smooth.length>0);
  },
  strokes(t){return strokes.map(stroke=>stroke.smooth.filter(p=>t-p.t<style.fadeMs).map(p=>({x:p.x,y:p.y,alpha:Math.max(0,Math.min(1,1-(t-p.t)/style.fadeMs))}))).filter(points=>points.length>0);},
  clear(){strokes=[];open=false;},
 };
}

/** Paints the strokes: one segment per consecutive pair, at the newer point's opacity. */
export function paintDemonstrationTrail(ctx:CanvasRenderingContext2D,strokes:ReturnType<DemonstrationTrail['strokes']>,style:{color:string;width:number}=DEMONSTRATION_STYLE):number{
 let painted=0;
 ctx.save();ctx.strokeStyle=style.color;ctx.lineWidth=style.width;ctx.lineCap='round';ctx.lineJoin='round';ctx.setLineDash([]);
 for(const points of strokes){
  if(points.length===1){ctx.globalAlpha=points[0].alpha;ctx.beginPath();ctx.moveTo(points[0].x,points[0].y);ctx.lineTo(points[0].x+0.01,points[0].y);ctx.stroke();painted++;continue;}
  for(let i=1;i<points.length;i++){ctx.globalAlpha=points[i].alpha;ctx.beginPath();ctx.moveTo(points[i-1].x,points[i-1].y);ctx.lineTo(points[i].x,points[i].y);ctx.stroke();painted++;}
 }
 ctx.restore();
 return painted;
}
