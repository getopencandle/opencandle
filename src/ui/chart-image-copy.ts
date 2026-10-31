// Copy chart image. The clipboard is a separate guarded transport: no success until the clipboard write succeeds, and no
// diagnostic image is retained. The image is the same renderer
// canvas composite Save chart image uses (exportChartImage: LV background and the provenance caption). Only the PNG data
// crosses the trusted bridge; the main process decodes it and writes the OS clipboard. Nothing is written to disk.

export type ChartImageRender={ok:true;dataUrl:string}|{ok:false;diagnostic:{message:string}};
export interface ChartImageClipboardBridge{copyChartImage?(input:{pngDataUrl:string}):Promise<{ok:true;value:{bytes:number;width:number;height:number}}|{ok:false;error:{code:string;message:string}}>}
/** Status text after a successful copy (our own wording). */
export const CHART_IMAGE_COPIED='Chart image copied to the clipboard';
export const CHART_IMAGE_COPY_NEEDS_DESKTOP='Copying a chart image needs the desktop app.';

/** Renders the chart image and asks the main process to put it on the clipboard. `ok` is true only after the main process
 * reports the clipboard write. owner-approved 2026-10-29: live chart screenshots allowed for personal use, so a live chart copies
 * like a demo chart (datasetId is kept for callers; the CSV data export keeps its live-data refusal). */
export async function copyChartImage(input:{render:()=>ChartImageRender;datasetId:string|null|undefined;bridge:ChartImageClipboardBridge|null|undefined}):Promise<{ok:boolean;message:string}>{
 if(!input.bridge||typeof input.bridge.copyChartImage!=='function')return{ok:false,message:CHART_IMAGE_COPY_NEEDS_DESKTOP};
 let rendered:ChartImageRender;
 try{rendered=input.render();}catch(cause){return{ok:false,message:cause instanceof Error?cause.message:String(cause)};}
 if(!rendered.ok)return{ok:false,message:rendered.diagnostic.message};
 let result:Awaited<ReturnType<NonNullable<ChartImageClipboardBridge['copyChartImage']>>>;
 try{result=await input.bridge.copyChartImage({pngDataUrl:rendered.dataUrl});}catch(cause){return{ok:false,message:cause instanceof Error?cause.message:String(cause)};}
 return result&&result.ok===true?{ok:true,message:CHART_IMAGE_COPIED}:{ok:false,message:result&&result.ok===false&&typeof result.error?.message==='string'?result.error.message:'The chart image was not copied.'};
}
