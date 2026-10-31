import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {stripTypeScriptTypes} from 'node:module';
import {Vela,createDrawing} from '@luxalgo/vela';
import {attemptEveryCleanup} from '../../src/chart/chart-retirement';
import {chartPositionContext,registerPositionChartContext} from '../../src/chart/lv-types/position-tool';
import '../../src/chart/lv-drawing-types';

const finalize:Array<()=>void>=[];
export function cleanupPositionConstructionFixtures(){for(const off of finalize.splice(0).reverse())off();}
interface Options {failOn?:number;fault?:unknown;laterFailure?:boolean;cleanupFailure?:boolean;cleanupFault?:unknown;reenter?:boolean;canvas?:object}
/** Executes the actual wrapper, original acquisition array and catch against a real SDK destructor.
 * Native subscription faults are synthetic. Position membership and model lookup are actual production code.
 * The fixture observes returned public releases solely for cleanup AFTER assertions, including the broken baseline.
 */
export function partialPositionConstructor(options:Options={}){
 const file=process.env.LV_POSITION_CONSTRUCTOR_SOURCE_ROOT?resolve(process.env.LV_POSITION_CONSTRUCTOR_SOURCE_ROOT,'src/chart/adapter.ts'):new URL('../../src/chart/adapter.ts',import.meta.url);
 const source=readFileSync(file,'utf8').replace(/\r\n/g,'\n');
 const part=(from:string,to:string)=>{const a=source.indexOf(from),b=source.indexOf(to,a);if(a<0||b<a)throw Error('Actual position constructor source boundary changed');return source.slice(a,b);};
 const wrapper=part('  let disposed = false,destroyStarted=false;','  // OpenCandle draws its own per-pane legend');
 const initial=part('  const unsubscribes = [','\n  unsubscribes.push(disposePrimarySource');
 const registered=part('  let chartResourcesReleased=false;','  // Saved drawing tool defaults (Save as default)');
 const catchStart=source.lastIndexOf('  } catch(error) {'),catchEnd=source.indexOf('    throw error;',catchStart);
 if(catchStart<0||catchEnd<catchStart)throw Error('Actual constructor catch is absent');
 const failure=source.slice(catchStart+'  } catch(error) {'.length,catchEnd)+'throw error;';
 const canvas=options.canvas??{},trace:string[]=[],nativeOffs:number[]=[];
 let contains=0,positionOffs=0,nativeCalls=0,subscriptions=0,failureValue:unknown,failed=false;
 const container={contains(node:unknown){contains++;return node===canvas;}};
 const native={destroy(){nativeCalls++;trace.push('native');}};
 const chart=Object.create(Vela.prototype) as Vela;
 Object.defineProperty(chart,'orchestrator',{value:native});
 const subscribe=()=>{const number=++subscriptions;if(number===options.failOn)throw options.fault;let live=true;return()=>{if(!live)return;live=false;nativeOffs.push(number);};};
 Object.defineProperty(chart,'on',{value:subscribe});
 Object.defineProperty(chart,'renderer',{value:{onCrosshairMove:subscribe}});
 const register=(context:Parameters<typeof registerPositionChartContext>[0])=>{
  const off=registerPositionChartContext(context);finalize.push(off);
  return()=>{positionOffs++;trace.push('position');off();if(options.reenter)chart.destroy();if(options.cleanupFailure)throw options.cleanupFault;};
 };
 const code=stripTypeScriptTypes(`function construct(chart,container,options){
 ${wrapper}
 const dwb3Consumers={dispose(){}},retireDrawingWorkspaceBinding=()=>{},vwapPrefixSource=null,fullModels=null,statsSource=null,statsPainter=null,fibTrendLine=null,inlineEditor=null,inlineGeometry=null,nativeDrawingReset=null,drawingCommands=null,trendlineAnnotation=null,indicatorDisplay=null,disposeAppearancePainters=null;
 const currentSource={},sourceTickSize=()=>0.5,selectedDrawingIds=[],rendererHolder={current:null},rendererHoveredDrawingId=()=>null;
 const updateDocument=()=>{},textPlacementHold={};
 try{
 ${initial}
 ${registered}
 if(options.laterFailure)throw options.fault;
 return{retire:()=>chart.destroy()};
 }catch(error){${failure}}
 }`,{mode:'transform'});
 const construct=new Function('attemptEveryCleanup','chartPositionContext','registerPositionContextOwner','registerPositionChartContext',code+';return construct;')(attemptEveryCleanup,chartPositionContext,register,register) as (chart:Vela,container:object,options:Options)=>unknown;
 try{construct(chart,container,options);}catch(error){failed=true;failureValue=error;}
 finalize.push(()=>chart.destroy());
 function probe(){
  const t=1_700_000_000_000,model=createDrawing('position' as never,{paneId:'price',anchors:[{time:t,price:100},{time:t+86400000,price:90},{time:t+86400000,price:120}]}) as unknown as {lvPaint(context:unknown,projection:unknown,theme:unknown):void;lvTickSize():number};
  if(!model||typeof model.lvPaint!=='function')throw Error('Actual position model is unavailable');
  const noop=()=>{},context={canvas,globalAlpha:1,save:noop,restore:noop,beginPath:noop,stroke:noop,fill:noop,rect:noop,fillRect:noop,moveTo:noop,lineTo:noop,setLineDash:noop,measureText:(text:string)=>({width:text.length*7}),fillText:noop};
  model.lvPaint(context,{xOf:(time:number)=>(time-t)/86400000*20+10,yOf:(price:number)=>400-price*2,pxToPoint:()=>({time:t,price:100}),paneIdAtY:()=>'price'},{fontFamily:'sans-serif',textColor:'#000',background:'#fff'});
  return model.lvTickSize();
 }
 return{chart,canvas,failed,failure:failureValue,probe,contains:()=>contains,positionOffs:()=>positionOffs,nativeCalls:()=>nativeCalls,nativeOffs:()=>[...nativeOffs],subscriptions:()=>subscriptions,trace};
}
