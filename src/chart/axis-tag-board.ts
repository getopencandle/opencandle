// One collision layout for the price-axis tags the DOM overlays draw (paper
// position, orders, take profit and stop loss; alert lines). They used to sit at their price whatever was there, so they
// covered the last price chip, indicator value tags and each other. The board lays all overlay tags out together with
// layoutAxisLabels, against the canvas-owned fixed ranges (last price chip, indicator tags) of the last painted frame, and
// publishes the placed tags back to the chart so the canvas labels (previous close, high/low, drawing labels, pre/post
// price) move away from them under "No overlapping labels". Canvas labels yield to overlay tags, never the reverse, so the
// two layouts cannot chase each other. All y values are pane-relative CSS px (0 = top of the price pane).
import {AXIS_LABEL_HEIGHT,layoutAxisLabels} from './axis-labels';

export interface AxisTagHost{
 /** Canvas-owned ranges of the last painted frame (last price chip, indicator tags), pane-relative. */
 fixed():readonly (readonly [number,number])[];
 /** Price scale "No overlapping labels". */
 noOverlap():boolean;
 /** Publishes the overlay tags the canvas labels must avoid (replaces the owner's previous ranges). */
 publish(owner:string,ranges:readonly (readonly [number,number])[]):void;
}
export interface AxisTagRequest{id:string;y:number;height?:number}
export interface AxisTagSpot{y:number;center:number;hidden:boolean}
/** Owners in layout priority: earlier owners keep their place first when space runs out. */
export const AXIS_TAG_OWNERS=Object.freeze(['paper','alerts'] as const);
export type AxisTagOwner=typeof AXIS_TAG_OWNERS[number];
export const OVERLAY_TAG_PUBLISHER='lv-overlay-tags';
export interface AxisTagBoard{
 submit(owner:AxisTagOwner,requests:readonly AxisTagRequest[],paneHeight:number):void;
 placements(owner:AxisTagOwner):ReadonlyMap<string,AxisTagSpot>;
 /** Changes whenever this owner's placements change; overlays poll it once per frame. */
 signature(owner:AxisTagOwner):string;
 /** The line labels (chips) an owner drew, pane-relative; an empty list releases them. */
 publishLabels?(owner:AxisTagOwner,rects:readonly AxisLabelRect[]):void;
 /** The labels of the owners before this one (AXIS_TAG_OWNERS order), which this owner's labels avoid. */
 labelObstacles?(owner:AxisTagOwner):readonly AxisLabelRect[];
 /** Changes whenever labelObstacles changes; overlays poll it once per frame. */
 labelSignature?(owner:AxisTagOwner):string;
}
export interface AxisLabelRect{left:number;top:number;right:number;bottom:number}
export function createAxisTagBoard(host:()=>AxisTagHost|null):AxisTagBoard{
 const requests=new Map<AxisTagOwner,{rows:AxisTagRequest[];height:number}>();
 const labels=new Map<AxisTagOwner,AxisLabelRect[]>();
 // The side (-1 above, 1 below) a tag took when a canvas range (the last price chip) covered its price. It keeps that
 // side while the range still covers it, so a price ticking back and forth across a line does not flip its tag.
 const sides=new Map<string,-1|1>();
 const labelObstacles=(owner:AxisTagOwner):AxisLabelRect[]=>AXIS_TAG_OWNERS.slice(0,AXIS_TAG_OWNERS.indexOf(owner)).flatMap(before=>labels.get(before)??[]);
 const compute=()=>{
  let current:AxisTagHost|null=null;try{current=host();}catch{current=null;}
  let fixed:(readonly [number,number])[]=[],noOverlap=true;
  if(current){try{fixed=[...current.fixed()];}catch{fixed=[];}try{noOverlap=current.noOverlap();}catch{noOverlap=true;}}
  const order:{owner:AxisTagOwner;row:AxisTagRequest}[]=[];let height=0;
  for(const owner of AXIS_TAG_OWNERS){const entry=requests.get(owner);if(!entry)continue;height=Math.max(height,entry.height);for(const row of entry.rows)order.push({owner,row});}
  const covering=order.map(({row})=>{const half=(row.height??AXIS_LABEL_HEIGHT)/2;return noOverlap?fixed.find(([a,b])=>Math.min(a,b)<row.y+half&&Math.max(a,b)>row.y-half):undefined;});
  const placed=layoutAxisLabels(fixed,order.map(({owner,row},index)=>{
   const range=covering[index],side=range?sides.get(owner+':'+row.id):undefined;let y=row.y;
   // The layout sends a tag to the side of the range centre its y is on. A tag on the other side of its remembered
   // side is laid out from just past the centre (price order among such tags kept), so it lands on the remembered side.
   if(range&&side){const centre=(range[0]+range[1])/2;if(side<0?y>=centre:y<=centre){const kept=centre+side*1e-3+(y-centre)*1e-6;if(kept>=0&&kept<=height)y=kept;}}
   return{id:String(index),y,height:row.height??AXIS_LABEL_HEIGHT};
  }),{top:0,bottom:height},noOverlap);
  const live=new Set<string>();
  placed.forEach((spot,index)=>{const {owner,row}=order[index],range=covering[index],key=owner+':'+row.id;if(!range||spot.hidden)return;live.add(key);if(!sides.has(key))sides.set(key,spot.center<(range[0]+range[1])/2?-1:1);});
  for(const key of [...sides.keys()])if(!live.has(key))sides.delete(key);
  const out=new Map<AxisTagOwner,Map<string,AxisTagSpot>>(),ranges:[number,number][]=[];
  placed.forEach((spot,index)=>{const {owner,row}=order[index],half=(row.height??AXIS_LABEL_HEIGHT)/2;let map=out.get(owner);if(!map){map=new Map();out.set(owner,map);}map.set(row.id,{y:row.y,center:spot.center,hidden:spot.hidden});if(!spot.hidden)ranges.push([spot.center-half,spot.center+half]);});
  if(current){try{current.publish(OVERLAY_TAG_PUBLISHER,ranges);}catch{/* The canvas labels keep their own layout. */}}
  return out;
 };
 const placements=(owner:AxisTagOwner):ReadonlyMap<string,AxisTagSpot>=>compute().get(owner)??new Map();
 return{
  submit(owner,rows,paneHeight){
   const clean=rows.filter(row=>typeof row.id==='string'&&Number.isFinite(row.y)).map(row=>({id:row.id,y:row.y,...(row.height===undefined?{}:{height:row.height})}));
   if(clean.length)requests.set(owner,{rows:clean,height:Number.isFinite(paneHeight)&&paneHeight>0?paneHeight:0});else requests.delete(owner);
   if(!requests.size){try{host()?.publish(OVERLAY_TAG_PUBLISHER,[]);}catch{/* Nothing to clear. */}}
  },
  placements,
  signature(owner){return JSON.stringify([...placements(owner)].map(([id,spot])=>[id,Math.round(spot.center*2)/2,spot.hidden]));},
  publishLabels(owner,rects){const clean=rects.filter(rect=>[rect.left,rect.top,rect.right,rect.bottom].every(Number.isFinite)).map(({left,top,right,bottom})=>({left,top,right,bottom}));if(clean.length)labels.set(owner,clean);else labels.delete(owner);},
  labelObstacles,
  labelSignature(owner){return JSON.stringify(labelObstacles(owner).map(rect=>[rect.left,rect.top,rect.right,rect.bottom].map(value=>Math.round(value*2)/2)));},
 };
}
/** The tag offset inside its line element (which sits at the price y): 0 when the tag stays at its price. */
export function axisTagOffset(spot:AxisTagSpot|undefined):number{return spot&&!spot.hidden?spot.center-spot.y:0;}
