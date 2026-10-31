import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {Vela} from '@luxalgo/vela';
import {attemptEveryCleanup} from '../../src/chart/chart-retirement';

/** Actual adapter ownership/disposal bodies with a real SDK prototype and synthetic resource callbacks. No DOM construction. */
export function constructorOwnerFixture(options:{nativeError?:Error;releaseError?:Error}={}){
 const text=readFileSync(new URL('../../src/chart/adapter.ts',import.meta.url),'utf8').replace(/\r\n/g,'\n');
 const part=(from:string,to:string)=>{const a=text.indexOf(from),b=text.indexOf(to,a);if(a<0||b<a)throw Error('Actual constructor source boundary changed: '+from);return text.slice(a,b);};
 const wrapper=part('  let disposed = false,destroyStarted=false;','  // OpenCandle draws its own per-pane legend');
 const release=part('  let chartResourcesReleased=false;','  // Saved drawing tool defaults (Save as default)');
 const start=text.indexOf('  disposeChart=()=>{'),end=text.indexOf(';return {controller,dispose:disposeChart};',start);if(start<0||end<0)throw Error('Actual normal disposer boundary changed.');const normal=text.slice(start,end+1);
 const catchStart=text.lastIndexOf('  } catch(error) {'),catchEnd=text.indexOf('    throw error;',catchStart);if(catchStart<0||catchEnd<0)throw Error('Actual constructor catch boundary changed.');const failure=text.slice(catchStart+'  } catch(error) {'.length,catchEnd)+'throw error;';
 const session=part('  const sessionPaneUnsubscribes:Array<()=>void>=[];','  try{\n   if(typeof chart.renderer.onConfigChanged');
 const scale=part('   const ownedPriceScale=priceScalePort;','  disposeChart=()=>{');
 const code=stripTypeScriptTypes(`function build(chart,trace,options,attemptEveryCleanup){
 ${wrapper}
 const unsubscribes=[];${release}
 let seriesReadoutLease=null,seriesDayReader=null,axisLabelPort=null;
 const item=name=>({dispose(){trace.push(name);}}),dwb3Consumers=item('fields'),retireDrawingWorkspaceBinding=()=>trace.push('binding'),vwapPrefixSource=item('prefix'),fullModels=item('bridge'),statsSource=item('stats-source'),statsPainter=item('stats-painter'),fibTrendLine=item('fib-baseline'),inlineEditor=item('editor'),inlineGeometry=item('geometry'),nativeDrawingReset=item('reset'),drawingCommands=item('commands'),trendlineAnnotation=item('annotation'),indicatorDisplay={...item('display'),setOptions(){},setNameLabels(){}};
 const disposeAppearancePainters=()=>trace.push('appearance'),navigationSubscribers=new Set(),drawingSubscribers=new Set(),availabilitySubscribers=new Set(),contextMenus=item('menus'),drawingPreferences=item('preferences'),indicators=item('indicators'),scripts=item('scripts'),comparisons=item('comparisons'),rendererDrawingPort=null,originalDrawingSync=null,container={style:{}},originalBackground='';let disposeChart;
 const diagnostics=[],lastAppearance=null,gateIndicatorLabels=value=>value,indicatorDisplayOptionsFromAppearance=value=>value;
 const sessionPaneRefresh={dispose(){trace.push('session-refresh');}},queueSessionPaneRefresh=()=>{};
 ${session}
 function scaleResources(port){if(port){const priceScalePort=port;${scale}}
 ${normal}
 return{chart,normal:()=>disposeChart(),failure(error){${failure}},add(name,fail=false,reenter=false){unsubscribes.push(()=>{trace.push(name+':'+disposed);if(reenter)chart.destroy();if(fail)throw options.releaseError??Error('SYNTHETIC cleanup failure');});},scaleResources,pending:()=>unsubscribes.length,disposed:()=>disposed,trace};
 }`,{mode:'transform'});
 const trace:string[]=[],nativeReceiver:unknown[]=[];let nativeCalls=0;
 const orchestrator={destroy(){nativeReceiver.push(this);nativeCalls++;trace.push('native');if(options.nativeError)throw options.nativeError;}};
 const chart=Object.create(Vela.prototype) as Vela;Object.defineProperty(chart,'orchestrator',{value:orchestrator});
 const result=new Function(code+';return build;')()(chart,trace,options,attemptEveryCleanup) as {chart:Vela;normal():void;failure(error:Error):never;add(name:string,fail?:boolean,reenter?:boolean):void;scaleResources(port:any):void;pending():number;disposed():boolean;trace:string[]};
 return{...result,nativeCalls:()=>nativeCalls,nativeReceiver,orchestrator};
}
export function cleanupMessages(error:unknown):string[]{return error instanceof AggregateError?error.errors.flatMap(cleanupMessages):[error instanceof Error?error.message:String(error)];}
