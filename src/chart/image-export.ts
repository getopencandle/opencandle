import type {AppearanceSettings} from './appearance';
import type {ChartSourceContext} from './adapter';
import {sourceContextTag} from '../domain/source-tag';
import {chartPngWithProvenance,type ChartPngProvenance} from './png-provenance';
import {shortIntervalText} from '../ui/interval-display';
const exportSources=new WeakMap<HTMLCanvasElement,Readonly<ChartPngProvenance>>();
export function chartExportProvenance(canvas:HTMLCanvasElement){return exportSources.get(canvas);}
export function chartExportPngDataUrl(canvas:HTMLCanvasElement):string{const source=exportSources.get(canvas);if(!source)throw Error('Chart image provenance is unavailable.');return chartPngWithProvenance(canvas.toDataURL('image/png'),source);}
/** The price pane of an export in container CSS px (the canvas origin); `scale` turns them into canvas px. */
export interface ChartExportFrame {scale:number;viewport?:{left:number;top:number;width:number;height:number};plot:{left:number;top:number;width:number;height:number};priceToY:(price:number)=>number;timeToX:(seconds:number)=>number|null}
/** Footer facts shown right-aligned in the caption strip, with a small original OpenCandle mark. The caller supplies them (the date is its own, never read here). */
export interface ChartExportFooter {symbol:string;interval:string;dateText:string}
export function chartExportFooterText(footer:ChartExportFooter):string{return[footer.symbol,shortIntervalText(String(footer.interval??'')),footer.dateText].map(part=>String(part).replace(/[\r\n\t]/g,' ').trim()).filter(Boolean).join(' · ').slice(0,120);}
export type ChartExportOverlay=(ctx:CanvasRenderingContext2D,frame:ChartExportFrame)=>void;
/** Called only for a user's explicit chart export. Produces an in-memory canvas; never writes captures. `overlay`
 * paints over the chart pixels, clipped to them, before the caption. */
export function composeChartExport(native:HTMLCanvasElement,appearance:AppearanceSettings|null,source:ChartSourceContext,createCanvas:()=>HTMLCanvasElement,scale=1,overlay?:(ctx:CanvasRenderingContext2D)=>void,footer?:ChartExportFooter){
 if(native.width<=0||native.height<=0||!Number.isFinite(scale)||scale<=0)throw new Error('Chart export has no usable rendered surface');
 const out=createCanvas();out.width=native.width;out.height=native.height+Math.ceil(28*scale);const ctx=out.getContext('2d');if(!ctx)throw new Error('Canvas export is unavailable');
 if(appearance?.['paneProperties.backgroundType']==='gradient'){const gradient=ctx.createLinearGradient(0,0,0,native.height);gradient.addColorStop(0,String(appearance['paneProperties.backgroundGradientStartColor']));gradient.addColorStop(1,String(appearance['paneProperties.backgroundGradientEndColor']));ctx.fillStyle=gradient;}
 else ctx.fillStyle=String(appearance?.['paneProperties.background']??'#131722');
 ctx.fillRect(0,0,out.width,out.height);ctx.drawImage(native,0,0);
 if(overlay){ctx.save();try{ctx.beginPath();ctx.rect(0,0,native.width,native.height);ctx.clip();overlay(ctx);}finally{ctx.restore();}}
 ctx.save();ctx.beginPath();ctx.rect(0,native.height,out.width,out.height-native.height);ctx.clip();ctx.fillStyle=String(appearance?.['scalesProperties.textColor']??'#d1d4dc');ctx.font=`${12*scale}px sans-serif`;ctx.textBaseline='middle';
 const label=`OpenCandle · ${sourceContextTag(source)} · ${source.label}`.replace(/[\r\n\t]/g,' ').slice(0,300);ctx.fillText(label,8*scale,native.height+14*scale);
 if(footer)paintExportFooter(ctx,footer,out.width,native.height,scale);
 ctx.restore();exportSources.set(out,Object.freeze({schemaVersion:1,datasetId:source.datasetId,revision:source.revision,fixture:source.fixture,label:source.label,...(source.basisIdentity?{basisIdentity:source.basisIdentity}:{}),...(source.inputIdentity?{inputIdentity:source.inputIdentity}:{})}));return out;
}

/** Right side of the caption strip: "SYMBOL · interval · date" and a small drawn OpenCandle flame mark (original artwork). */
function paintExportFooter(ctx:CanvasRenderingContext2D,footer:ChartExportFooter,width:number,top:number,scale:number):void{
 const size=16*scale,right=width-8*scale,markLeft=right-size,y=top+14*scale;
 ctx.save();
 // OpenCandle flame mark: a simplified drawn flame (outer orange body, inner pale core); no async image load in this canvas path.
 const cx=markLeft+size/2,top0=y-size/2,u=size/16;
 ctx.fillStyle='#f59e0b';ctx.beginPath();ctx.moveTo(cx,top0);ctx.bezierCurveTo(cx+2*u,top0+4*u,cx+7*u,top0+7*u,cx+7*u,top0+11*u);ctx.bezierCurveTo(cx+7*u,top0+14*u,cx+4*u,top0+16*u,cx,top0+16*u);ctx.bezierCurveTo(cx-4*u,top0+16*u,cx-7*u,top0+14*u,cx-7*u,top0+11*u);ctx.bezierCurveTo(cx-7*u,top0+8*u,cx-4*u,top0+6*u,cx-3*u,top0+3*u);ctx.bezierCurveTo(cx-1*u,top0+4*u,cx-1*u,top0+2*u,cx,top0);ctx.closePath();ctx.fill();
 ctx.fillStyle='#fde68a';ctx.beginPath();ctx.moveTo(cx,top0+8*u);ctx.bezierCurveTo(cx+2*u,top0+10*u,cx+3.5*u,top0+11.5*u,cx+3.5*u,top0+13*u);ctx.bezierCurveTo(cx+3.5*u,top0+15*u,cx+1.5*u,top0+16*u,cx,top0+16*u);ctx.bezierCurveTo(cx-1.5*u,top0+16*u,cx-3.5*u,top0+15*u,cx-3.5*u,top0+13*u);ctx.bezierCurveTo(cx-3.5*u,top0+11.5*u,cx-2*u,top0+10*u,cx,top0+8*u);ctx.closePath();ctx.fill();
 ctx.restore();
 ctx.save();ctx.textAlign='right';ctx.textBaseline='middle';ctx.font=`${12*scale}px sans-serif`;ctx.fillText(chartExportFooterText(footer),markLeft-8*scale,y);ctx.restore();
}
