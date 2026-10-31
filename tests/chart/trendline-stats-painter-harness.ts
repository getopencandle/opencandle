import {readFileSync,writeFileSync,mkdirSync,unlinkSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {randomUUID} from 'node:crypto';
import {NativeRenderer,type SerializedDrawing,type Vela} from '@luxalgo/vela';
import {annotationNativeHarness,annotationRecord} from './trendline-annotation-native-harness';
import {nativeDrawingHarness,drawingCommands} from './drawing-native-harness';
import {LosslessDrawingDocument} from '../../src/chart/contracts';
import {installTrendlineAnnotation} from '../../src/chart/trendline-annotation';
import {installTrendlineStatistics} from '../../src/chart/trendline-stats-painter';
import {createTrendlineStatisticsSource} from '../../src/chart/trendline-stats-source';
import {captureTrendlineStatisticsNativeOwner} from '../../src/chart/trendline-stats-owner';
import {TRENDLINE_STATS_DEFAULTS,type TrendlineStatsSettings} from '../../src/chart/trendline-stats-data';
import type {DerivedDrawingLens} from '../../src/chart/derived/derived-drawings';

let schedulerModule:Promise<any>|undefined;
async function loadScheduler(){const file=resolve('node_modules/@luxalgo/vela/dist/chunk-UNUVPQFW.js'),source=readFileSync(file,'utf8'),temporary=resolve('.cache',`lv-stats-scheduler-${randomUUID()}.mjs`);mkdirSync(dirname(temporary),{recursive:true});try{writeFileSync(temporary,source.replace(/(from\s+['"])(\.\/[^'"]+)(['"])/g,(_all,before,relative,after)=>before+pathToFileURL(resolve(dirname(file),relative)).href+after)+'\nexport { Scheduler as LVOriginalScheduler };\n');return await import(/* @vite-ignore */pathToFileURL(temporary).href);}finally{unlinkSync(temporary);}}
export function statsRecord(settings:Partial<TrendlineStatsSettings>={priceRange:true,alwaysShow:true}):SerializedDrawing{const row=annotationRecord(false);row.props={...row.props,lvTrendlineStats:{...TRENDLINE_STATS_DEFAULTS,...settings}};return row;}
/** Original core store/sync, UserDrawingController, Scheduler/renderFrame/paintData and painter bodies; ancillary graphics services controlled. */
/** options.lens (additive): a derived chart; rows are source time, the renderer is fed through the lens. */
export async function statsPainterHarness(rows:SerializedDrawing[]=[statsRecord()],options:{lens?:DerivedDrawingLens;hostMap?:boolean}={}){
 const lens=options.lens;
 const f=await annotationNativeHarness(),core=await nativeDrawingHarness(),document=new LosslessDrawingDocument(),coords=f.createNativeCoordinates(),renderer=f.renderer as any;
 coords.setSize(400,300,1);coords.setBars([1000000,1120000,1240000]);coords.setViewport({barSpacing:100,rightOffset:0});
 const pane={id:'price',bounds:{top:0,height:300},scale:{min:0,max:300,log:false,invert:false},collapsed:false};
 const callbacks:Array<FrameRequestCallback>=[],scheduler=new (await(schedulerModule??=loadScheduler())).LVOriginalScheduler(()=>{}),composites:string[][]=[],notices:string[]=[];let epoch={},source={},allCalls=0,bindCalls=0,gridReads=0;
 Object.assign(scheduler,{raf:(callback:FrameRequestCallback)=>{callbacks.push(callback);return callbacks.length;},cancel(){},onFrame:(level:number)=>Reflect.apply((NativeRenderer.prototype as any).renderFrame,renderer,[level])});
 let inspectComposite:((slices:Map<string,any[]>)=>void)|undefined;
 Object.assign(renderer,{coords,theme:{fontFamily:'sans-serif',background:'#101010',textColor:'#ffffff'},scene:{panes:new Map([['price',pane]]),indicators:new Map(),bars:[],timezone:'UTC',orderedPanes:()=>[pane]},scheduler,bars:[],extLayers:[],animator:{active:false},modelAlpha:1,candleBodyAlpha:1,candleStructureAlpha:1,syncLayerCanvasOrder(){},stampScaleInvert(){},nativeLayerPane:()=>null,volumeRenderer:{render(){}},vpvrRenderer:{render(){}},indicatorSlices:{prepare:()=>new Map()},backdropRenderer:{render(){}},backend:{render(scene:any){inspectComposite?.(scene.drawingSlices);composites.push([...scene.drawingSlices.values()].flatMap((slices:any)=>slices.flatMap((slice:any)=>slice.canvas.record.commands.filter((command:any)=>command.op==='fillText').map((command:any)=>command.values[0]))));}},chrome:{render(){}},axisSurface:()=>({}),trackMarkPopover(){},computeScales(){},renderCrosshairLayer(){},updateLegendValues(){}});
 f.controller.deps.projector=()=>renderer.drawingProjector();f.controller.deps.theme=()=>renderer.theme;f.controller.deps.dpr=()=>coords.dpr;f.controller.deps.requestDataPaint=()=>scheduler.invalidate(3);f.controller.deps.requestScaleUpdate=()=>scheduler.invalidate(3);
 core.controller.port.syncDrawings=(docs:SerializedDrawing[])=>f.sync(lens?docs.map(doc=>lens.toNativeRow(doc)):docs);
 const originalAll=document.all.bind(document);document.all=()=>{allCalls++;return originalAll();};
 const annotation=installTrendlineAnnotation(renderer,f.chart as unknown as Vela,f.host),basis=()=>({epoch,source,bars:[1000,1120,1240].map(time=>({time,open:100,high:200,low:100,close:200,volume:1})),style:'candles',temporal:true,disposed:false});
 let bars=basis().bars;const sourceBridge=createTrendlineStatisticsSource({renderer,readBasis:()=>({...basis(),bars})});
 let sourceAssertionHook=()=>{};
 const stats=installTrendlineStatistics(renderer,f.chart as unknown as Vela,{document,captureSource(){const current=sourceBridge.capture();return Object.freeze({identity:current.identity,pricePaneId:current.pricePaneId,timezone:current.timezone,assertCurrent(){current.assertCurrent();sourceAssertionHook();},readGrid(){gridReads++;return current.readGrid();}});},captureNativeOwner(canonical,projected,owner,assertSource){bindCalls++;return captureTrendlineStatisticsNativeOwner({ctrl:core.controller},canonical,projected,owner,assertSource);},reportUnavailable(message){notices.push(message);},...(lens&&options.hostMap!==false?{rendererRowToSource:(row:SerializedDrawing)=>lens.toSourceRow(row)}:{})});
 let records:()=>ReturnType<typeof drawingCommands>=drawingCommands;
 const fakeDocument={createElement(tag:string){if(tag!=='canvas')throw Error('SYNTHETIC stats harness admits slice canvases only');const record=records();for(const key of ['setTransform','clearRect']){const original=record.ctx[key];record.ctx[key]=(...values:any[])=>{if(typeof original==='function'){Reflect.apply(original,record.ctx,values);return;}if(key==='clearRect')record.commands.length=0;record.commands.push({op:key,values});};}f.slices.push(record);return{width:400,height:300,record,getContext:()=>record.ctx};}};
 const withDocument=<T>(action:()=>T):T=>{const previous=globalThis.document;try{globalThis.document=fakeDocument as unknown as Document;return action();}finally{globalThis.document=previous;}};
 const drain=()=>withDocument(()=>{let count=0;while(callbacks.length){if(++count>16)throw Error('SYNTHETIC scheduler repaint loop');callbacks.shift()!(0);}return count;});
 document.load({version:1,drawings:rows});core.controller.fromJSON({version:1,drawings:rows});
 return{...f,renderer,core,document,pane,coords,annotation,stats,notices,composites,callbacks,drain,withDocument,counts:()=>({allCalls,bindCalls,gridReads}),onStatsSourceAssert(action:()=>void){sourceAssertionHook=action;},replaceInput(next:typeof bars){epoch={};source={};f.retire();bars=next;Object.assign(renderer,{introRaf:null,introPlayed:true,didInitialFit:true,zoomAnchorLogical:0,hoverLogical:null});renderer.setBars(next.map(row=>({...row,time:row.time*1000})),{preserveView:true});},counterRecords(factory:()=>ReturnType<typeof drawingCommands>,composite?:(slices:Map<string,any[]>)=>void){records=factory;inspectComposite=composite;const top=factory();f.top.ctx=top.ctx;f.top.commands=top.commands;f.controller.ctx=top.ctx;f.controller.canvas.getContext=()=>top.ctx;f.controller.sliceCache.clear();f.slices.length=0;},retireSource(){epoch={};source={};f.retire();},canonical(rows:SerializedDrawing[]){document.load({version:1,drawings:rows});},cleanup(){stats.dispose();sourceBridge.dispose();annotation.dispose();core.dispose();scheduler.destroy();f.dispose();}};
}
