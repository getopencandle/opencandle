import Decimal from 'decimal.js';
import type {ChartExportFrame,ChartExportOverlay} from './image-export';
import type {WatermarkView} from './chart-watermark';
import {ALERT_LINE_FALLBACK,type AlertLineRow} from './alert-lines-data';
import {estimateLabelTextWidth,layoutLineLabels} from '../ui/line-label-layout';
import type {AxisLabelRect,AxisTagSpot} from './axis-tag-board';
import type {SnapshotPublishedScene} from './snapshot-scene';

export interface AlertSnapshotScene {rows:readonly AlertLineRow[];color?:string;tickSize:number;scaleSide:'left'|'right';obstacles:readonly AxisLabelRect[];tags:ReadonlyMap<string,AxisTagSpot>}
export interface ChartSnapshotScene {watermark:WatermarkView|null;watermarkFont:string;alerts:AlertSnapshotScene;paper?:ChartExportOverlay;legend?:SnapshotPublishedScene;events?:SnapshotPublishedScene;title?:SnapshotTitle}
/** The series line of the on-screen legend ("GME · 1D · SOURCE  O.. H.. L.. C.. change"), as one text the caller already formatted. */
export interface SnapshotTitle {text:string;color?:string}
const finite=(...values:number[])=>values.every(Number.isFinite);

export function paintSnapshotWatermark(ctx:CanvasRenderingContext2D,view:WatermarkView|null,font:string,frame:ChartExportFrame):number{
 if(!view)return 0;const k=frame.scale,viewport=frame.viewport??{left:0,top:0,width:frame.plot.left+frame.plot.width,height:frame.plot.top+frame.plot.height};
 if(!(k>0)||!finite(viewport.width,viewport.height)||viewport.width<=0||viewport.height<=0)return 0;
 const lines=view.lines.map(line=>{const size=Math.min(line.fontSize,Math.round(160/Math.max(1,line.text.length))*viewport.width/100);return{...line,size,height:size*line.lineHeight/line.fontSize};});
 let y=(viewport.height-lines.reduce((sum,line)=>sum+line.height,0))/2;
 ctx.save();try{ctx.fillStyle=view.color;ctx.textAlign='center';ctx.textBaseline='middle';for(const line of lines){ctx.font=`${line.size*k}px ${font}`;ctx.fillText(line.text,viewport.width*k/2,(y+line.height/2)*k);y+=line.height;}}finally{ctx.restore();}return lines.length;
}

/** Top-left of the price pane, in the caption/legend font style. Returns 1 when drawn. */
export function paintSnapshotTitle(ctx:CanvasRenderingContext2D,title:SnapshotTitle|undefined,frame:ChartExportFrame):number{
 const text=title?.text.replace(/[\r\n\t]/g,' ').trim().slice(0,200),k=frame.scale;if(!title||!text||!(k>0)||!(frame.plot.width>0))return 0;
 ctx.save();try{ctx.beginPath();ctx.rect(frame.plot.left*k,frame.plot.top*k,frame.plot.width*k,frame.plot.height*k);ctx.clip();ctx.globalAlpha=1;ctx.fillStyle=title.color??'#d1d4dc';ctx.font=`${12*k}px sans-serif`;ctx.textAlign='left';ctx.textBaseline='middle';ctx.fillText(text,(frame.plot.left+8)*k,(frame.plot.top+14)*k);}finally{ctx.restore();}return 1;
}

export function paintSnapshotAlerts(ctx:CanvasRenderingContext2D,scene:AlertSnapshotScene,frame:ChartExportFrame):number{
 const {plot}=frame,k=frame.scale;if(!(k>0)||!(plot.width>0)||!(plot.height>0))return 0;
 const drawn=scene.rows.flatMap((row,index)=>{const y=frame.priceToY(row.price)-plot.top;return finite(row.price,y)&&y>=-10&&y<=plot.height+10?[{row,index,y,key:row.alertId+':'+row.slot}]:[];});
 drawn.sort((a,b)=>a.y-b.y||a.index-b.index);
 const spots=layoutLineLabels(drawn.map(({row,y,key})=>({id:key,y,height:16,left:8,right:8+estimateLabelTextWidth(row.label),step:'right' as const})),plot,scene.obstacles);
 const digits=Math.min(8,new Decimal(scene.tickSize).decimalPlaces());
 ctx.save();try{
  ctx.beginPath();ctx.rect(plot.left*k,plot.top*k,plot.width*k,plot.height*k);ctx.clip();ctx.font=`${11*k}px system-ui,sans-serif`;ctx.textBaseline='middle';
  for(const {row,y,key}of drawn){
   const py=(plot.top+y)*k,color=scene.color??ALERT_LINE_FALLBACK,spot=spots.get(key),center=spot?.center??y,left=plot.left+8+(spot?.dx??0),textWidth=ctx.measureText(row.label).width+12*k;
   ctx.strokeStyle=color;ctx.lineWidth=k;ctx.setLineDash([4*k,3*k]);ctx.beginPath();ctx.moveTo(plot.left*k,py);ctx.lineTo((plot.left+plot.width)*k,py);ctx.stroke();ctx.setLineDash([]);
   if(center!==y){ctx.beginPath();ctx.moveTo((left+4)*k,py);ctx.lineTo((left+4)*k,(plot.top+center)*k);ctx.stroke();}
   if(row.labelVisible!==false){ctx.globalAlpha=0.85;ctx.fillStyle=color;ctx.fillRect(left*k,(plot.top+center-8)*k,textWidth,16*k);ctx.fillStyle='#ffffff';ctx.textAlign='left';ctx.fillText(row.label,(left+6)*k,(plot.top+center)*k);ctx.globalAlpha=1;}
   const tag=scene.tags.get(key);if(tag?.hidden)continue;const value=row.price.toFixed(digits),width=ctx.measureText(value).width+10*k,tagLeft=scene.scaleSide==='left'?plot.left*k:(plot.left+plot.width)*k-width,tagY=(plot.top+(tag?.center??y))*k;
   ctx.fillStyle=color;ctx.fillRect(tagLeft,tagY-8*k,width,16*k);ctx.fillStyle='#000000';ctx.textAlign='left';ctx.fillText(value,tagLeft+5*k,tagY);
  }
 }finally{ctx.restore();}return drawn.length;
}

function paintPublished(ctx:CanvasRenderingContext2D,scene:SnapshotPublishedScene|undefined,frame:ChartExportFrame):void{
 if(!scene)return;const viewport=frame.viewport;if(!viewport)throw Error('The current chart viewport is unavailable for snapshot overlays.');const k=frame.scale;
 ctx.save();try{
  for(const box of scene.boxes){if(!finite(box.left,box.top,box.width,box.height,box.opacity)||box.width<=0||box.height<=0)continue;ctx.globalAlpha=box.opacity;ctx.fillStyle=box.color;ctx.fillRect((box.left-viewport.left)*k,(box.top-viewport.top)*k,box.width*k,box.height*k);}
  for(const text of scene.texts){if(!finite(text.left,text.top,text.width,text.height,text.opacity)||text.width<=0||text.height<=0)continue;ctx.globalAlpha=text.opacity;ctx.fillStyle=text.color;ctx.font=text.font;ctx.save();ctx.scale(k,k);ctx.textAlign='left';ctx.textBaseline='middle';ctx.fillText(text.text,text.left-viewport.left,text.top-viewport.top+text.height/2);ctx.restore();}
  ctx.globalAlpha=1;
  if(scene.badges.length){ctx.beginPath();ctx.rect(frame.plot.left*k,frame.plot.top*k,frame.plot.width*k,frame.plot.height*k);ctx.clip();}
  for(const badge of scene.badges){if(!finite(badge.left,badge.top,badge.size)||badge.size<=0)continue;const x=(badge.left-viewport.left+badge.size/2)*k,y=(badge.top-viewport.top+badge.size/2)*k,radius=(badge.size/2-0.5)*k;
   ctx.beginPath();ctx.arc(x,y,radius,0,Math.PI*2);ctx.fillStyle='rgba(24,26,32,0.85)';ctx.fill();ctx.strokeStyle=badge.color;ctx.lineWidth=k;ctx.stroke();ctx.fillStyle=badge.color;ctx.font=`600 ${10*k}px system-ui,sans-serif`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(badge.letter,x,y);
  }
 }finally{ctx.restore();}
}
/** Paint the current displayed layers in their LV stack order; interactions, tooltips and native crosshair are omitted. */
export function paintChartSnapshotScene(ctx:CanvasRenderingContext2D,scene:ChartSnapshotScene,frame:ChartExportFrame):void{
 paintSnapshotWatermark(ctx,scene.watermark,scene.watermarkFont,frame);scene.paper?.(ctx,frame);paintSnapshotTitle(ctx,scene.title,frame);paintSnapshotAlerts(ctx,scene.alerts,frame);paintPublished(ctx,scene.legend,frame);paintPublished(ctx,scene.events,frame);
}
