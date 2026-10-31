import {NativeRenderer,getNativeIndicator,seriesShownOn,type Vela} from '@luxalgo/vela';
import type {ChartDiagnostic} from './contracts';
import {acquireIndicatorDisplayPort,type IndicatorDisplayOwner} from './indicator-display-source';
import {acquireScriptPriceScaleSource,type ScriptPriceScaleFrame,type ScriptPriceScaleOwner,type ScriptPriceScaleEndpoint} from './script-presentation-proof';
import {latestPricePresentation,realLastPrice} from './appearance-price';
import {INDICATOR_MAX_INSTANCES,indicatorInputSchema} from './indicator-settings';
import type {IndicatorId} from '../domain/indicators';
import {parseIndicatorSource} from '../domain/indicator-source';
import {formatIndicatorNumber,isIndicatorPrecision,type IndicatorPrecision} from './indicator-number-format';
import {withIndicatorTickPrecision,type IndicatorPrecisionAxis} from './indicator-precision-native';
import {labelTextColor,publishReservedAxisRanges} from './axis-labels';

type Row=Record<string,any>;
type Method=(this:any,...args:any[])=>any;
type DisplayRow=Pick<IndicatorDisplayOwner,'id'|'rendererId'|'plots'|'precision'|'valueSuffix'>&{series:readonly object[]};
export interface IndicatorDisplayOptions {labelsVisible:boolean;valuesVisible:boolean}
/** setNameLabels: "Indicators and financials name labels" (default off). */
export interface IndicatorDisplayController {setOptions(options:IndicatorDisplayOptions):void;setNameLabels(on:boolean):void;diagnostics():ChartDiagnostic[];dispose():void}
const activeInstallations=new WeakSet<object>();
const MAX_PLOTS=16,MAX_DIAGNOSTICS=24,MASTER_WIDTH=64,COLUMN_WIDTH=56,MAX_NAME_CHARS=64;
/** Allocation arithmetic only. These numbers cannot acquire a port, header, source or native owner. */
export function scriptPriceScaleAdmission(builtinOwners:number,builtinPlots:number,scriptOwners:number,scriptPlots:number):boolean{
 const counts=[builtinOwners,builtinPlots,scriptOwners,scriptPlots];return counts.every(value=>Number.isSafeInteger(value)&&value>=0)&&Number.isSafeInteger(builtinOwners+scriptOwners)&&Number.isSafeInteger(builtinPlots+scriptPlots)&&builtinOwners+scriptOwners<=INDICATOR_MAX_INSTANCES&&builtinPlots+scriptPlots<=INDICATOR_MAX_INSTANCES*MAX_PLOTS;
}
function own(value:unknown,key:string,optional=false):any{
 if(value===null||typeof value!=='object')throw Error('Indicator display owner is unavailable: '+key);
 const field=Object.getOwnPropertyDescriptor(value,key);if(!field){if(optional)return undefined;throw Error('Indicator display field is unavailable: '+key);}
 if(!Object.hasOwn(field,'value'))throw Error('Indicator display fields must be data: '+key);return field.value;
}
function method(value:object,key:string,unclaimed=false):Method{
 if(unclaimed&&Object.hasOwn(value,key))throw Error('Indicator display method already has an owner: '+key);
 for(let next:object|null=value;next;next=Object.getPrototypeOf(next)){const field=Object.getOwnPropertyDescriptor(next,key);if(field){if(!Object.hasOwn(field,'value')||typeof field.value!=='function')throw Error('Indicator display method changed: '+key);return field.value;}}
 throw Error('Indicator display method is unavailable: '+key);
}
function finite(value:unknown,label:string):number{if(typeof value!=='number'||!Number.isFinite(value))throw Error('Invalid indicator label '+label);return value;}
function map(value:unknown,label:string):Map<string,any>{if(!(value instanceof Map)||Object.getPrototypeOf(value)!==Map.prototype)throw Error('Indicator display '+label+' changed');return value;}
function options(value:unknown):IndicatorDisplayOptions{
 if(!value||typeof value!=='object'||Object.getPrototypeOf(value)!==Object.prototype||Reflect.ownKeys(value).length!==2)throw Error('Indicator display options require exactly two booleans.');
 const fields=['labelsVisible','valuesVisible'] as const;for(const key of fields){const field=Object.getOwnPropertyDescriptor(value,key);if(!field?.enumerable||!Object.hasOwn(field,'value')||typeof field.value!=='boolean')throw Error('Indicator display options require explicit data booleans.');}
 return{labelsVisible:own(value,'labelsVisible'),valuesVisible:own(value,'valuesVisible')};
}
function compact(value:number):string{const magnitude=Math.abs(value);for(const [unit,scale]of [['B',1e9],['M',1e6],['K',1e3]] as const)if(magnitude>=scale)return Number((value/scale).toFixed(2))+unit;return Number(value.toFixed(2)).toString();}
interface Candidate {id:string;x:number;width:number;y:number;top:number;bottom:number;text:string;name:string;color:string;paneId:string;column:number;assertCurrent():void;assertBatch?():void}
/** Constant-size intervals replace an array of every empty vertical label slot. */
function labelSlots(top:number,bottom:number,height:number,reserved:readonly [number,number][]){
 const count=Math.floor((bottom-top)/height),blocked=reserved.map(([from,to])=>[Math.max(0,Math.floor((from-top)/height)),Math.min(count,Math.ceil((to-top)/height))] as const).filter(([from,to])=>to>from).sort((a,b)=>a[0]-b[0]);
 const segments:Array<{from:number;size:number;start:number}>=[];let cursor=0,total=0;for(const [from,to]of blocked){if(from>cursor){segments.push({from:cursor,size:from-cursor,start:total});total+=from-cursor;}cursor=Math.max(cursor,to);}if(cursor<count){segments.push({from:cursor,size:count-cursor,start:total});total+=count-cursor;}
 const at=(ordinal:number)=>{for(const segment of segments)if(ordinal>=segment.start&&ordinal<segment.start+segment.size)return top+(segment.from+ordinal-segment.start+.5)*height;throw Error('Indicator label slot is unavailable.');};
 return{length:total,at,nearest(value:number,first:number,last:number){let low=first,high=last;while(low<high){const mid=Math.floor((low+high)/2);if(at(mid)<value)low=mid+1;else high=mid;}return low>first&&Math.abs(at(low-1)-value)<=Math.abs(at(low)-value)?low-1:low;}};
}

/** Original guarded Canvas2D labels. Native scale/readout code remains authoritative. */
export function installIndicatorDisplay(renderer:NativeRenderer,chart:Vela,port:object,scriptPort?:object):IndicatorDisplayController{
 const source=acquireIndicatorDisplayPort(port,chart),scriptSource=scriptPort?acquireScriptPriceScaleSource(scriptPort,chart):null;
 const scriptRows=new WeakMap<object,{frame:ScriptPriceScaleFrame;owner:ScriptPriceScaleOwner;endpoints:Map<object,ScriptPriceScaleEndpoint>}>();
 if(!(renderer instanceof NativeRenderer)||activeInstallations.has(renderer))throw Error('Indicator display renderer is invalid or already installed.');
 const host=renderer as unknown as Row,core=own(chart,'orchestrator'),registry=own(core,'registry'),getRecord=method(registry,'get');
 const scene=own(host,'scene'),chrome=own(host,'chrome'),backend=own(host,'backend'),scheduler=own(host,'scheduler');
 if(own(core,'renderer')!==renderer||own(backend,'kind')!=='canvas2d')throw Error('Indicator display requires the current Canvas2D renderer.');
 const models=map(own(scene,'indicators'),'models'),panes=map(own(scene,'panes'),'panes'),scales=map(own(scene,'indicatorScales'),'scales');
 const originalPaint=method(chrome,'drawMergedScaleColumns',true),originalAxes=method(chrome,'drawPriceAxes',true),originalReadout=method(host,'readoutRowsFor',true),format=method(host,'dataWindowFmt'),invalidate=method(scheduler,'invalidate'),mergedForPane=method(scene,'ownScaleIndicatorsForPane'),offsetOf=method(scene,'offsetOf');
 // LV-VELA-SCALE-GROUPS-1: a member of a shared extra scale draws on the column and slot of the member that holds it.
 const scaleKeyOf=(()=>{try{return method(scene,'lvScaleKey');}catch{return null;}})(),scaleSlot=(id:string):string=>{if(!scaleKeyOf)return id;const key=Reflect.apply(scaleKeyOf,scene,[id]);return typeof key==='string'?key:id;};
 // Left-placed private scales (LV-VELA-SCALE-PLACEMENT-1; a left group through its holder) get value labels on their
 // left gutter column. A renderer without a left gutter keeps the old behaviour (no left labels, a diagnostic).
 const placementOf=(()=>{try{return method(host,'lvIndicatorScalePlacement');}catch{return null;}})();
 const leftForPane=(()=>{try{return method(scene,'lvLeftScaleIndicatorsForPane');}catch{return null;}})(),originalLeft=(()=>{try{return method(chrome,'lvDrawLeftScale',true);}catch{return null;}})();
 function leftColumnOf(paneId:string,pane:Row,holder:unknown):number{
  if(!leftForPane||holder===undefined)return -1;const list=Reflect.apply(leftForPane,scene,[paneId]);assertOwner();
  if(!Array.isArray(list)||list.length>INDICATOR_MAX_INSTANCES)throw Error('Indicator left scale-column bound exceeded.');
  const at=list.indexOf(holder);return at<0?-1:at+(own(scene,'lvMainScaleLeft',true)===true&&own(pane,'kind')==='price'?1:0);
 }
 let active=true,quarantined=false,optionsBusy=false,painting=false,reading=false,names=false,studyTagPanes=new Set<string>(),current:IndicatorDisplayOptions={labelsVisible:true,valuesVisible:true},lastDiagnostics:ChartDiagnostic[]=[],leftDiagnostics:ChartDiagnostic[]=[],pendingAxisFailures:unknown[]=[];
 const diagnostic=(message:string):ChartDiagnostic=>({code:'INDICATOR_DISPLAY_UNAVAILABLE',feature:'indicator value labels',message:message.slice(0,700),severity:'unavailable'});
 function assertOwner(receiver?:unknown,expected?:object){
  source.assertCurrent();if(!active||quarantined||receiver!==undefined&&receiver!==expected||own(chart,'orchestrator')!==core||own(core,'registry')!==registry||own(core,'renderer')!==renderer||own(host,'scene')!==scene||own(host,'chrome')!==chrome||own(host,'backend')!==backend||own(host,'scheduler')!==scheduler||own(scene,'indicators')!==models||own(scene,'panes')!==panes||own(scene,'indicatorScales')!==scales||own(chrome,'drawMergedScaleColumns')!==paint||own(chrome,'drawPriceAxes')!==axesPaint||own(host,'readoutRowsFor')!==readout||originalLeft!==null&&own(chrome,'lvDrawLeftScale')!==leftPaint)throw Error('Indicator display owner retired or changed.');
 }
 function precisionFor(row:DisplayRow):IndicatorPrecision{const value=Object.hasOwn(row,'precision')?own(row,'precision'):'auto';if(!isIndicatorPrecision(value))throw Error('Managed indicator precision metadata is invalid.');return value;}
 function report(error:unknown){const message=error instanceof Error?error.message:String(error);if(!lastDiagnostics.some(row=>row.message===message)&&lastDiagnostics.length<MAX_DIAGNOSTICS)lastDiagnostics.push(diagnostic(message));}
 function modelFor(row:DisplayRow):Row|null{
  const script=scriptRows.get(row);if(script){script.frame.assertGeneration();script.owner.assertCurrent();return script.owner.model as Row;}
  // Only actual builtin source rows reach this branch; scripts require the private weak association above.
  const builtin=row as IndicatorDisplayOwner;
  const record=Reflect.apply(getRecord,registry,[row.rendererId]);assertOwner();if(!record)throw Error('Managed indicator registry record is missing.');
  if(own(record,'hidden',true)===true)return null;
  const native=own(record,'native'),model=own(record,'model',true);if(!model)throw Error('Managed indicator native model is missing.');if(!models.has(row.rendererId))throw Error('Managed indicator scene model is missing.');
  const handle=own(record,'renderHandle');
  if(own(native,'type')!==builtin.type||own(native,'descriptor')!==builtin.descriptor||own(native,'instance')!==builtin.instance||getNativeIndicator(builtin.type)!==builtin.descriptor||own(handle,'id')!==row.rendererId||own(model,'id')!==row.rendererId||own(own(model,'native'),'type')!==builtin.type||models.get(row.rendererId)!==model||own(model,'series')!==row.series||own(core,'bars')!==builtin.input||Object.hasOwn(row,'precision')&&Object.hasOwn(builtin.instance,'displayPrecision')&&own(builtin.instance,'displayPrecision')!==precisionFor(row))throw Error('A managed indicator display is waiting for its exact accepted model and source prefix.');
  return model;
 }
 function collect(coords:Row,dataWidth:number,theme:Row,add:(message:string)=>void,side:'right'|'left'='right'):Candidate[]{
  const result:Candidate[]=[],builtinOwners=source.read();if(builtinOwners.length>INDICATOR_MAX_INSTANCES)throw Error('Indicator display instance bound exceeded.');
  let builtinPlots=0;for(const row of builtinOwners){if(row.plots.length>MAX_PLOTS||(builtinPlots+=row.plots.length)>INDICATOR_MAX_INSTANCES*MAX_PLOTS)throw Error('Indicator label bound exceeded.');}
  let owners:readonly DisplayRow[]=builtinOwners,scriptFrame:ScriptPriceScaleFrame|null=null,scriptFailed=false;
  const scriptCandidates=new Set<Candidate>(),scriptGeometry:Array<()=>void>=[];
  if(scriptSource)try{
   const header=scriptSource.header();if(!scriptPriceScaleAdmission(builtinOwners.length,builtinPlots,header.ownerCount,header.plotCount))throw Error('Script scale labels exceed the existing combined display envelope.');
   if(header.plotCount){scriptFrame=scriptSource.read(header);const rows:DisplayRow[]=[];
    for(const owner of scriptFrame.owners){const endpoints=new Map<object,ScriptPriceScaleEndpoint>(),plots=owner.plots.map(endpoint=>{const plot={id:String(endpoint.ordinal),nativeId:'',value:endpoint.value,color:endpoint.color};endpoints.set(plot,endpoint);return plot;});
     // Only this local weak association selects the genuine script path; no owner-shaped metadata can acquire it.
     const row:DisplayRow={id:'script:'+owner.rendererId,rendererId:owner.rendererId,series:owner.series,plots};scriptRows.set(row,{frame:scriptFrame,owner,endpoints});rows.push(row);
    }owners=[...builtinOwners,...rows];
   }
  }catch(error){scriptFailed=true;add(error instanceof Error?error.message:String(error));}
  const columns=new Map<string,Row[]>();let total=0;
  for(const row of owners){
   const script=scriptRows.get(row);if((!script&&row.plots.length>MAX_PLOTS)||(total+=row.plots.length)>INDICATOR_MAX_INSTANCES*MAX_PLOTS)throw Error('Indicator label bound exceeded.');
   if(!row.plots.length)continue;
   try{
    const model=modelFor(row);if(!model)continue;const scalePlacement=script&&placementOf?Reflect.apply(placementOf,host,[row.rendererId]):null;if(script&&scalePlacement==='none')continue;
    const paneId=own(model,'paneId');if(typeof paneId!=='string'||!panes.has(paneId))throw Error('Managed indicator pane is missing.');
    const pane=panes.get(paneId);if(own(pane,'collapsed',true)===true)continue;
    const bounds=own(pane,'bounds'),top=finite(own(bounds,'top'),'pane top'),height=finite(own(bounds,'height'),'pane height');if(height<=0)continue;if(top<0||top>100000||height>100000)throw Error('Indicator pane geometry exceeds the bounded display area.');
    const axisFormat=own(pane,'axisFormat',true);if(axisFormat==='none')continue;
    let scale=own(pane,'scale'),column=0;
    const ownScale=own(model,'ownScale',true);if(ownScale!==undefined&&typeof ownScale!=='boolean')throw Error('Managed indicator scale ownership is invalid.');
    if(ownScale){
     if(!columns.has(paneId)){const ordered=Reflect.apply(mergedForPane,scene,[paneId]);assertOwner();if(modelFor(row)!==model)throw Error('Indicator display model changed during column preparation.');if(!Array.isArray(ordered)||ordered.length>INDICATOR_MAX_INSTANCES)throw Error('Indicator scale-column bound exceeded.');columns.set(paneId,ordered);}
     const slot=scaleSlot(row.rendererId),holder=models.get(slot),ordered=columns.get(paneId)!,matches=ordered.reduce<number[]>((found,item,index)=>item===holder?[...found,index]:found,[]);
     const leftAt=matches.length===0?leftColumnOf(paneId,pane,holder):-1;
     if(leftAt<0&&matches.length!==1||!scales.has(slot))throw Error('Managed indicator scale column is missing or ambiguous.');column=leftAt>=0?-(leftAt+1):matches[0]+1;scale=own(scales.get(slot),'scale');
    }
    if((column<0)!==(side==='left'))continue;
    const low=finite(own(scale,'min'),'scale minimum'),high=finite(own(scale,'max'),'scale maximum');if(!(high>low))throw Error('Managed indicator scale range is unavailable.');
    const logarithmic=own(scale,'log',true)===true;if(logarithmic&&low<=0)throw Error('Indicator logarithmic scale requires positive resolved bounds.');
    const mode=column?'price':own(pane,'kind')==='price'?own(scene,'scaleMode'):own(pane,'scaleMode',true)??'price';
    if(!['price','percent','indexed'].includes(mode))throw Error('Indicator scale mode is unavailable.');
    const baseline=mode==='price'?null:finite(own(pane,'percentBaseline',true),'percent baseline');if(baseline===0)throw Error('Indicator percent/indexed baseline is zero.');
    // A left column k (0 next to the plot) spans the gutter from its right edge leftwards; dataWidth is then the gutter width.
    const leftK=-column-1,x=column>0?dataWidth+MASTER_WIDTH+(column-1)*COLUMN_WIDTH:column<0?dataWidth-(leftK===0?0:MASTER_WIDTH+(leftK-1)*COLUMN_WIDTH)-(leftK===0?MASTER_WIDTH:COLUMN_WIDTH):dataWidth,width=column>0?COLUMN_WIDTH:column<0?(leftK===0?MASTER_WIDTH:COLUMN_WIDTH):MASTER_WIDTH;
    const invert=own(scale,'invert',true),resolvedLog=own(scale,'log',true);
    const assertCurrent=()=>{assertOwner();script?.frame.assertGeneration();script?.frame.format.assertCurrent();if(script&&placementOf&&(method(host,'lvIndicatorScalePlacement')!==placementOf||Reflect.apply(placementOf,host,[row.rendererId])!==scalePlacement))throw Error('Script scale placement changed.');if(modelFor(row)!==model||panes.get(paneId)!==pane||own(model,'paneId')!==paneId||own(model,'ownScale',true)!==ownScale||own(pane,'collapsed',true)===true||own(pane,'bounds')!==bounds||own(bounds,'top')!==top||own(bounds,'height')!==height||own(pane,'axisFormat',true)!==axisFormat||(column?own(scales.get(scaleSlot(row.rendererId)),'scale'):own(pane,'scale'))!==scale||own(scale,'min')!==low||own(scale,'max')!==high||own(scale,'invert',true)!==invert||own(scale,'log',true)!==resolvedLog||(column?'price':own(pane,'kind')==='price'?own(scene,'scaleMode'):own(pane,'scaleMode',true)??'price')!==mode||(baseline!==null&&own(pane,'percentBaseline',true)!==baseline))throw Error('Indicator display source, accepted model or geometry changed during preparation.');};
    assertCurrent();
    if(script)scriptGeometry.push(()=>{assertCurrent();if(ownScale){const holder=models.get(scaleSlot(row.rendererId));if(column<0){if(leftColumnOf(paneId,pane,holder)!==-column-1)throw Error('Script left scale placement changed.');}else{const ordered=Reflect.apply(mergedForPane,scene,[paneId]);if(!Array.isArray(ordered)||ordered.length>INDICATOR_MAX_INSTANCES||ordered[column-1]!==holder)throw Error('Script scale holder ordering changed.');}assertCurrent();}});
    const formattedPane=Object.create(pane);Object.defineProperty(formattedPane,'scale',{value:scale});
    for(const plot of row.plots){
     const endpoint=script?.endpoints.get(plot),native=endpoint?endpoint.native:row.series.find(item=>own(item,'id')===plot.nativeId);endpoint?.assertCurrent();if(!native||own(native,'visible',true)===false||own(own(native,'display'),'priceScale')!==true)throw Error('Managed indicator plot is not in its accepted output.');
     const value=finite(plot.value,'endpoint');if(logarithmic&&value<=0){add('A nonpositive indicator value cannot be labeled on a logarithmic scale.');continue;}
     const y=finite(Reflect.apply(method(coords,'priceToY'),coords,[value,scale,bounds]),'position');assertCurrent();if(y<top||y>top+height){add('Offscale indicator labels are withheld rather than pinned to a false price.');continue;}
     let text:string;const precision=precisionFor(row);
     if(script){const valueShown=baseline===null?value:(value/baseline-(mode==='percent'?1:0))*100;if(!Number.isFinite(valueShown))throw Error('Script scale value cannot be represented.');text=script.frame.format.format(valueShown);if(mode==='percent')text=(!text.startsWith('-')?'+':'')+text+'%';}
     else if(mode==='percent'||mode==='indexed'){const transformed=(value/baseline!-(mode==='percent'?1:0))*100;if(!Number.isFinite(transformed)){add('Indicator percent/indexed value is not representable.');continue;}if(precision==='auto')text=mode==='percent'?(transformed>=0?'+':'-')+Math.abs(transformed).toFixed(2)+'%':transformed.toFixed(2);else{text=formatIndicatorNumber(transformed,precision);text=(mode==='percent'&&!text.startsWith('-')?'+':'')+text+(mode==='percent'?'%':'');}}
     else text=precision!=='auto'?formatIndicatorNumber(value,precision)+(row.valueSuffix??''):!column&&axisFormat==='volume'?compact(value):Reflect.apply(format,host,[value,formattedPane]);
     assertCurrent();
     if(typeof text!=='string'||!text||text.length>128)throw Error('Indicator automatic label text is unavailable.');
     // The name label reads the plot title the legend and Data Window show (our own length cap).
     const title=own(native,'title',true)||own(model,'title',true),name=typeof title==='string'?title.slice(0,MAX_NAME_CHARS):'';
     const candidate:Candidate={id:JSON.stringify([row.id,plot.id]),x,width,y,top,bottom:top+height,text,name,color:plot.color,paneId,column,assertCurrent:()=>{assertCurrent();endpoint?.assertCurrent();}};result.push(candidate);if(script)scriptCandidates.add(candidate);
    }
   }catch(error){if(script)scriptFailed=true;add(error instanceof Error?error.message:String(error));}
  }
  // No script glyph is emitted until every owner's formatter/coordinate work has completed and the whole batch revalidates.
  if(scriptFrame&&!scriptFailed){const frame=scriptFrame,validate=()=>{frame.assertCurrent();for(const check of scriptGeometry)check();for(const candidate of scriptCandidates)candidate.assertCurrent();frame.assertCurrent();};for(const candidate of scriptCandidates)candidate.assertBatch=validate;try{validate();}catch(error){scriptFailed=true;add(error instanceof Error?error.message:String(error));}}
  return scriptFailed?result.filter(candidate=>!scriptCandidates.has(candidate)):result;
 }
 function precisionAxes(kind:'master'|'private',coords:Row,dataWidth:number):IndicatorPrecisionAxis[]{
  const owners=source.read();if(owners.length>INDICATOR_MAX_INSTANCES)throw Error('Indicator display instance bound exceeded.');
  const numerical=owners.filter(row=>precisionFor(row)!=='auto');if(!numerical.length)return [];
  const ticks=own(chrome,'axisTicks'),hook=own(ticks,'fn');if(kind==='master'&&hook!==null)return [];
  if(models.size>INDICATOR_MAX_INSTANCES*3)throw Error('Indicator tick ownership inventory exceeds its local bound.');
  const zOrder=map(own(scene,'seriesZ'),'z order'),members=[...models].map(([id,model])=>({id,model,paneId:own(model,'paneId'),ownScale:own(model,'ownScale',true),z:zOrder.get(id)}));
  const columns=new Map<string,Row[]>(),result:IndicatorPrecisionAxis[]=[];let work=0;
  const assertMembers=()=>{assertOwner();if(own(host,'coords')!==coords||own(chrome,'axisTicks')!==ticks||own(ticks,'fn')!==hook||own(scene,'seriesZ')!==zOrder||models.size!==members.length)throw Error('Indicator tick scene ownership changed.');
   work+=members.length;if(work>500000)throw Error('Indicator tick ownership checks exceed the bounded frame workload.');
   for(const member of members)if(models.get(member.id)!==member.model||own(member.model,'paneId')!==member.paneId||own(member.model,'ownScale',true)!==member.ownScale||zOrder.get(member.id)!==member.z)throw Error('Indicator tick pane, scale owner or column ordering changed.');
  };
  for(const row of numerical){
   const model=modelFor(row);if(!model)continue;
   const ownsScale=own(model,'ownScale',true)===true;if((kind==='private')!==ownsScale)continue;
   const paneId=own(model,'paneId'),pane=panes.get(paneId);if(!pane)throw Error('Indicator precision pane is missing.');
   if(own(pane,'collapsed',true)===true||own(pane,'axisFormat',true)==='none')continue;
   if(kind==='master'&&(own(pane,'kind')==='price'||members.filter(member=>member.paneId===paneId&&member.ownScale!==true).length!==1))continue;
   const bounds=own(pane,'bounds'),top=finite(own(bounds,'top'),'tick pane top'),height=finite(own(bounds,'height'),'tick pane height');if(height<=0)continue;
   if(top<0||top>100000||height>100000)throw Error('Indicator tick pane geometry exceeds its local bound.');
   let scale=own(pane,'scale'),column=0;
   if(kind==='private'){
    if(scaleSlot(row.rendererId)!==row.rendererId)continue;/* The holder of a shared scale sets its column ticks */
    if(!columns.has(paneId)){const ordered=Reflect.apply(mergedForPane,scene,[paneId]);assertMembers();if(!Array.isArray(ordered)||ordered.length>INDICATOR_MAX_INSTANCES)throw Error('Indicator precision column inventory exceeds its bound.');columns.set(paneId,ordered);}
    const ordered=columns.get(paneId)!,found=ordered.map((value,index)=>value===model?index:-1).filter(index=>index>=0);if(!found.length&&leftColumnOf(paneId,pane,model)>=0)continue;/* Left columns keep native ticks */if(found.length!==1||!scales.has(row.rendererId))throw Error('Indicator precision private column is missing or ambiguous.');
    column=found[0]+1;scale=own(scales.get(row.rendererId),'scale');
   }
   const min=finite(own(scale,'min'),'tick scale minimum'),max=finite(own(scale,'max'),'tick scale maximum'),log=own(scale,'log',true),invert=own(scale,'invert',true);if(!(max>min)||log===true&&min<=0)throw Error('Indicator precision scale geometry is unavailable.');
   const mode=kind==='private'?'price':own(pane,'scaleMode',true)??'price';if(!['price','percent','indexed'].includes(mode))throw Error('Indicator precision axis mode is unsupported.');
   const baseline=mode==='price'?null:finite(own(pane,'percentBaseline',true),'tick baseline');if(baseline===0)throw Error('Indicator precision axis baseline is zero.');
   const precision=precisionFor(row) as number,format=own(pane,'axisFormat',true);
   const assertCurrent=()=>{assertMembers();if(modelFor(row)!==model||panes.get(paneId)!==pane||own(pane,'bounds')!==bounds||own(bounds,'top')!==top||own(bounds,'height')!==height||own(pane,'collapsed',true)===true||own(pane,'axisFormat',true)!==format||(kind==='private'?own(scales.get(row.rendererId),'scale'):own(pane,'scale'))!==scale||own(scale,'min')!==min||own(scale,'max')!==max||own(scale,'log',true)!==log||own(scale,'invert',true)!==invert||(kind==='private'?'price':own(pane,'scaleMode',true)??'price')!==mode||baseline!==null&&own(pane,'percentBaseline',true)!==baseline)throw Error('Indicator precision accepted owner or geometry changed.');assertOwner();};
   assertCurrent();result.push({scale,bounds,x:kind==='private'?dataWidth+MASTER_WIDTH+(column-1)*COLUMN_WIDTH+5:dataWidth+6,maxWidth:(kind==='private'?COLUMN_WIDTH:MASTER_WIDTH)-10,precision,suffix:mode==='percent'?'%':(row.valueSuffix??''),signed:mode==='percent',transform(value){return baseline===null?value:(value/baseline-(mode==='percent'?1:0))*100;},assertCurrent});
  }
  return result;
 }
 function formattedReadout(model:Row,index:number,pane:unknown,surface:'legend'|'dataWindow'){
  const owners=source.read();if(owners.length>INDICATOR_MAX_INSTANCES)throw Error('Indicator display instance bound exceeded.');
  const id=own(model,'id'),matching=owners.filter(row=>row.rendererId===id);if(matching.length>1)throw Error('Indicator readout owner is ambiguous.');
  const row=matching[0];if(!row||precisionFor(row)==='auto'){const result=Reflect.apply(originalReadout,host,[model,index,pane,surface]);assertOwner();return result;}
  const precision=precisionFor(row) as number,actual=modelFor(row);if(!actual)return [];if(actual!==model)throw Error('Indicator readout is not the exact accepted native model.');
  if(!Number.isSafeInteger(index)||index<0||!row.input||index>=row.input.length)throw Error('Indicator readout index is outside its accepted source prefix.');
  const offset=Reflect.apply(offsetOf,scene,[id]);assertOwner();if(!Number.isSafeInteger(offset))throw Error('Indicator native readout offset is invalid.');
  const ordinal=index-offset,expected:Array<{series:Row;points:Row[];point:Row;value:number;label:string;color:string}>=[];
  for(const item of row.series){
   const series=item as unknown as Row;if(!seriesShownOn(item,surface))continue;
   if(!['line','area','step','histogram','columns','circles','cross'].includes(own(series,'kind')))throw Error('Indicator readout plot kind is outside the owned formatting contract.');
   const points=own(series,'points');if(!Array.isArray(points))throw Error('Indicator native readout points are unavailable.');const descriptor=Object.getOwnPropertyDescriptor(points,String(ordinal));if(!descriptor)continue;if(!Object.hasOwn(descriptor,'value'))throw Error('Indicator readout points cannot be accessors.');
   const point=descriptor.value,value=own(point,'value',true);if(value===null||value===undefined||typeof value==='number'&&!Number.isFinite(value))continue;if(typeof value!=='number')throw Error('Indicator native readout value is invalid.');
   expected.push({series,points,point,value,label:own(series,'title',true)||own(model,'title'),color:own(point,'color',true)??own(own(series,'style'),'color')});
  }
  const assertCurrent=()=>{assertOwner();if(modelFor(row)!==model)throw Error('Indicator readout ownership changed.');const aligned=Reflect.apply(offsetOf,scene,[id]);assertOwner();if(aligned!==offset||modelFor(row)!==model)throw Error('Indicator readout ownership or alignment changed.');for(const item of expected){const property=Object.getOwnPropertyDescriptor(item.points,String(ordinal));if(own(item.series,'points')!==item.points||!property||!Object.hasOwn(property,'value')||property.value!==item.point||own(item.point,'value')!==item.value)throw Error('Indicator indexed readout changed during formatting.');}assertOwner();};
  assertCurrent();const result=Reflect.apply(originalReadout,host,[model,index,pane,surface]);assertCurrent();
  if(!Array.isArray(result)||result.length!==expected.length)throw Error('Indicator native readout rows no longer match the exact accepted plots.');
  const formatted=result.map((item,index)=>{const point=expected[index];if(own(item,'label')!==point.label||own(item,'color')!==point.color||typeof own(item,'value')!=='string')throw Error('Indicator native readout row correspondence changed.');return{...item,value:formatIndicatorNumber(point.value,precision)+(row.valueSuffix??'')};});
  assertCurrent();return formatted;
 }
 function paintLabels(ctx:CanvasRenderingContext2D,coords:Row,dataWidth:number){
  const frameOptions=current,frameNames=names;const assertFrame=()=>{assertOwner();if(current!==frameOptions||names!==frameNames)throw Error('Indicator display options changed during painting.');};
  const counts=new Map<string,number>();const add=(message:string)=>{const text=message.slice(0,500);if(counts.has(text)||counts.size<MAX_DIAGNOSTICS)counts.set(text,(counts.get(text)??0)+1);};
  // Drawn main-price-column tags are published so LV axis labels avoid them; [] while the tags are hidden.
  const drawnTags:Array<[number,number]>=[];publishReservedAxisRanges(scene,'indicators',drawnTags);
  // Study-pane master-column tags (RSI) are published per pane too; every pane
  // published last frame is cleared first, so a removed or hidden tag never keeps its tick blanked.
  for(const paneId of studyTagPanes)publishReservedAxisRanges(scene,'indicators',[],paneId);studyTagPanes.clear();const studyTags=new Map<string,Array<[number,number]>>();
  if(!current.labelsVisible&&!frameNames||own(scene,'showAxisLabels')===false){lastDiagnostics=[];return;}
  const drawText=method(ctx,'fillText');
  const theme=own(host,'theme'),fontSize=finite(own(own(scene,'style'),'fontSize'),'font size');if(fontSize<1||fontSize>100)throw Error('Indicator label font is outside the bounded renderer policy.');
  const candidates=collect(coords,dataWidth,theme,add),groups=new Map<string,Candidate[]>(),height=Math.max(16,fontSize+4);
  assertFrame();for(const candidate of candidates)candidate.assertCurrent();
  for(const item of candidates){const key=JSON.stringify([item.paneId,item.column]);if(!groups.has(key))groups.set(key,[]);groups.get(key)!.push(item);}
  const prepareSlots=(rows:Candidate[])=>{
   const first=rows[0],pane=panes.get(first.paneId),reserved:Array<[number,number]>=[];
   if(first.column===0&&own(pane,'kind')==='price'&&!own(scene,'candlesHidden')&&(own(scene,'showPriceLabel')||own(scene,'showCountdown'))){
    try{const presentation=latestPricePresentation(scene,coords,theme,pane,realLastPrice(own(scene,'priceStyle'),own(own(scene,'style'),'chartTypes',true)?.['lv-appearance'],Object.getOwnPropertyDescriptor(host,'lvRealBars')?.value,own(scene,'bars')));if(presentation){const center=finite(Reflect.apply(method(coords,'priceToY'),coords,[presentation.value,own(pane,'scale'),own(pane,'bounds')]),'main label position');if(center>=first.top&&center<=first.bottom)reserved.push([center-8,center+(own(scene,'showCountdown')?24:8)]);}}
    catch{add('Main price label bounds are unavailable; master-column indicator labels are withheld.');return null;}
   }
   return{pane,slots:labelSlots(first.top,first.bottom,height,reserved)};
  };
  const validateBatch=candidates.find(candidate=>candidate.assertBatch)?.assertBatch,prepared=new Map<Candidate[],ReturnType<typeof prepareSlots>>(),nameWidths=new Map<Candidate,number>();let scriptBatchValid=true;
  for(const rows of groups.values())rows.sort((a,b)=>a.y-b.y||(a.id<b.id?-1:a.id>b.id?1:0));
  if(validateBatch){
   // Resolve every callback-bearing preparation (including the main price exclusion and names) before any script glyph.
   for(const rows of groups.values())prepared.set(rows,prepareSlots(rows));
   if(frameNames){ctx.save();try{ctx.font=`${fontSize}px ${own(theme,'fontFamily')}`;for(const candidate of candidates)if(candidate.name)nameWidths.set(candidate,finite(ctx.measureText(candidate.name).width,'name width')+8);}finally{ctx.restore();}}
   try{assertFrame();validateBatch();}catch(error){scriptBatchValid=false;add(error instanceof Error?error.message:String(error));}
  }
  for(const originalRows of groups.values()){
   const rows=scriptBatchValid?originalRows:originalRows.filter(row=>!row.assertBatch);if(!rows.length)continue;
   const layout=validateBatch?prepared.get(originalRows):prepareSlots(rows);if(!layout)continue;const{pane,slots}=layout;
   assertFrame();for(const row of rows)row.assertCurrent();
   let slot=0,hidden=0;
   for(let index=0;index<rows.length;index++){
    const row=rows[index];assertFrame();row.assertCurrent();if(slot>=slots.length){hidden++;continue;}
    const keep=Math.min(rows.length-index,slots.length-slot),last=slots.length-keep;slot=slots.nearest(row.y,slot,last);
    const center=slots.at(slot++);
    // Geometry: the name chip sits just left of the price axis at the value tag's slot,
    // in the plot color, like the symbol name label beside the last price chip. It is drawn with or without the value tag.
    if(frameNames&&row.name){ctx.save();try{ctx.beginPath();ctx.rect(0,row.top,dataWidth,row.bottom-row.top);ctx.clip();ctx.globalAlpha=1;ctx.font=`${fontSize}px ${own(theme,'fontFamily')}`;ctx.textBaseline='middle';ctx.textAlign='center';
     const w=nameWidths.get(row)??finite(ctx.measureText(row.name).width,'name width')+8,x=dataWidth-w;ctx.fillStyle=row.color;ctx.fillRect(x,center-height/2,w,height);ctx.fillStyle=labelTextColor(row.color);if(method(ctx,'fillText')!==drawText)throw Error('Indicator label glyph method changed.');assertFrame();row.assertCurrent();Reflect.apply(drawText,ctx,[row.name,x+w/2,center]);
    }finally{ctx.restore();}}
    if(!frameOptions.labelsVisible)continue;
    if(row.column===0&&own(pane,'kind')==='price'){drawnTags.push([center-height/2,center+height/2]);publishReservedAxisRanges(scene,'indicators',drawnTags);}
    else if(row.column===0){const list=studyTags.get(row.paneId)??[];studyTags.set(row.paneId,list);list.push([center-height/2,center+height/2]);studyTagPanes.add(row.paneId);publishReservedAxisRanges(scene,'indicators',list,row.paneId);}
   ctx.save();try{ctx.beginPath();ctx.rect(row.x+1,row.top,row.width-2,row.bottom-row.top);ctx.clip();ctx.globalAlpha=1;ctx.font=`${fontSize}px ${own(theme,'fontFamily')}`;ctx.textBaseline='middle';ctx.textAlign='center';
     ctx.strokeStyle=row.color;ctx.lineWidth=1;ctx.setLineDash([]);if(center!==row.y){ctx.beginPath();ctx.moveTo(row.x+1,row.y);ctx.lineTo(row.x+5,center);ctx.stroke();}
     ctx.fillStyle=own(theme,'background');ctx.fillRect(row.x+5,center-height/2,row.width-7,height);ctx.strokeStyle=row.color;ctx.strokeRect(row.x+5.5,center-height/2+.5,row.width-8,height-1);ctx.fillStyle=own(theme,'textColor');if(method(ctx,'fillText')!==drawText)throw Error('Indicator label glyph method changed.');assertFrame();row.assertCurrent();Reflect.apply(drawText,ctx,[row.text,row.x+5+(row.width-7)/2,center,row.width-11]);
    }finally{ctx.restore();}
   }
   if(hidden)add(`${hidden} indicator labels in one scale column exceed its visible height and are withheld.`);
  }
  lastDiagnostics=[...counts].map(([message,count])=>diagnostic(message+(count>1?` (${count} occurrences)` :'')));
 }
 /** Value labels of left-placed private scales, on the left scale gutter canvas. The box mirrors a right column tag:
  *  it hugs the plot side of its column (our own geometry). Name chips stay with the right side. The canvas is touched only
  *  when there is a label to draw. */
 function paintLeftLabels(context:()=>CanvasRenderingContext2D|null,coords:Row,gutter:number){
  const counts=new Map<string,number>();const add=(message:string)=>{const text=message.slice(0,500);if(counts.has(text)||counts.size<MAX_DIAGNOSTICS)counts.set(text,(counts.get(text)??0)+1);};
  const publish=()=>{leftDiagnostics=[...counts].map(([message,count])=>diagnostic(message+(count>1?` (${count} occurrences)`:'')));};
  leftDiagnostics=[];if(!current.labelsVisible||own(scene,'showAxisLabels')===false)return;
  const frameOptions=current,theme=own(host,'theme'),fontSize=finite(own(own(scene,'style'),'fontSize'),'font size');if(fontSize<1||fontSize>100)throw Error('Indicator label font is outside the bounded renderer policy.');
  const candidates=collect(coords,gutter,theme,add,'left'),groups=new Map<string,Candidate[]>(),height=Math.max(16,fontSize+4);
  publish();if(!candidates.length)return;const ctx=context();if(!ctx)return;
  for(const item of candidates){const key=JSON.stringify([item.paneId,item.column]);if(!groups.has(key))groups.set(key,[]);groups.get(key)!.push(item);}
  const drawText=method(ctx,'fillText'),assertFrame=()=>{assertOwner();if(current!==frameOptions)throw Error('Indicator display options changed during painting.');};
  let scriptBatchValid=true;try{candidates.find(candidate=>candidate.assertBatch)?.assertBatch?.();}catch(error){scriptBatchValid=false;add(error instanceof Error?error.message:String(error));}
  if(!scriptBatchValid)for(const [key,rows]of groups)groups.set(key,rows.filter(row=>!row.assertBatch));
  ctx.save();try{
   const dpr=finite(coords.dpr,'device pixel ratio');ctx.setTransform(dpr,0,0,dpr,0,0);
   for(const rows of groups.values()){
    if(!rows.length)continue;rows.sort((a,b)=>a.y-b.y||(a.id<b.id?-1:a.id>b.id?1:0));const first=rows[0],slots=labelSlots(first.top,first.bottom,height,[]);
    let slot=0,hidden=0;
    for(let index=0;index<rows.length;index++){
     const row=rows[index];assertFrame();row.assertCurrent();if(slot>=slots.length){hidden++;continue;}
     const keep=Math.min(rows.length-index,slots.length-slot),last=slots.length-keep;slot=slots.nearest(row.y,slot,last);
     const center=slots.at(slot++),edge=row.x+row.width;
     ctx.save();try{ctx.beginPath();ctx.rect(row.x+1,row.top,row.width-2,row.bottom-row.top);ctx.clip();ctx.globalAlpha=1;ctx.font=`${fontSize}px ${own(theme,'fontFamily')}`;ctx.textBaseline='middle';ctx.textAlign='center';
      ctx.strokeStyle=row.color;ctx.lineWidth=1;ctx.setLineDash([]);if(center!==row.y){ctx.beginPath();ctx.moveTo(edge-1,row.y);ctx.lineTo(edge-5,center);ctx.stroke();}
      ctx.fillStyle=own(theme,'background');ctx.fillRect(row.x+2,center-height/2,row.width-7,height);ctx.strokeStyle=row.color;ctx.strokeRect(row.x+2.5,center-height/2+.5,row.width-8,height-1);ctx.fillStyle=own(theme,'textColor');if(method(ctx,'fillText')!==drawText)throw Error('Indicator label glyph method changed.');assertFrame();row.assertCurrent();Reflect.apply(drawText,ctx,[row.text,row.x+2+(row.width-7)/2,center,row.width-11]);
     }finally{ctx.restore();}
    }
    if(hidden)add(`${hidden} indicator labels in one scale column exceed its visible height and are withheld.`);
   }
  }finally{ctx.restore();}
  publish();
 }
 const leftPaint:Method=function(incoming:unknown,coords:Row,...rest:unknown[]){
  assertOwner(this,chrome);if(incoming!==scene||own(host,'coords')!==coords)throw Error('Indicator display left scale scene or coordinates changed.');
  const result=Reflect.apply(originalLeft!,chrome,[incoming,coords,...rest]);
  if(painting)return result;painting=true;
  try{if(coords.barCount!==0){const left=own(chrome,'lvLeftScale',true);if(left&&typeof left==='object'){const canvas=own(left,'canvas'),gutter=finite(own(left,'width'),'left gutter width');if(gutter>0)paintLeftLabels(()=>{const context=canvas.getContext('2d');return context&&typeof context==='object'?context as CanvasRenderingContext2D:null;},coords,gutter);}}}
  catch(error){leftDiagnostics=[diagnostic(error instanceof Error?error.message:String(error))];}
  finally{painting=false;}
  return result;
 };
 const paint:Method=function(ctx:CanvasRenderingContext2D,incoming:unknown,coords:Row,dataWidth:number){
  assertOwner(this,chrome);if(incoming!==scene||own(host,'coords')!==coords||own(chrome,'ctx')!==ctx)throw Error('Indicator display scene, coordinates or canvas identity changed.');
  if(painting)throw Error('Indicator display painter is already in progress.');painting=true;try{
  let result:unknown;const failures:unknown[]=pendingAxisFailures;pendingAxisFailures=[];ctx.save();try{const axes=precisionAxes('private',coords,finite(dataWidth,'axis origin'));result=axes.length?withIndicatorTickPrecision(ctx,coords,axes,()=>assertOwner(this,chrome),(context,coordinates)=>Reflect.apply(originalPaint,chrome,[context,incoming,coordinates,dataWidth])):Reflect.apply(originalPaint,chrome,[ctx,incoming,coords,dataWidth]);}catch(error){failures.push(error);}finally{ctx.restore();}
  ctx.save();try{paintLabels(ctx,coords,finite(dataWidth,'axis origin'));}catch(error){lastDiagnostics=[diagnostic(error instanceof Error?error.message:String(error))];}finally{ctx.restore();}for(const failure of failures)report(failure);return result;
  }finally{painting=false;}
 };
 const axesPaint:Method=function(ctx:CanvasRenderingContext2D,incoming:unknown,coords:Row,theme:unknown,dataWidth:number,paneList:unknown){assertOwner(this,chrome);if(incoming!==scene||own(host,'coords')!==coords||own(chrome,'ctx')!==ctx)throw Error('Indicator display axis scene, coordinates or canvas identity changed.');if(painting)throw Error('Indicator display painter is already in progress.');painting=true;try{pendingAxisFailures=[];ctx.save();try{const axes=precisionAxes('master',coords,finite(dataWidth,'axis origin'));return axes.length?withIndicatorTickPrecision(ctx,coords,axes,()=>assertOwner(this,chrome),(context,coordinates)=>Reflect.apply(originalAxes,chrome,[context,incoming,coordinates,theme,dataWidth,paneList])):Reflect.apply(originalAxes,chrome,[ctx,incoming,coords,theme,dataWidth,paneList]);}catch(error){pendingAxisFailures=[error];report(error);}finally{ctx.restore();}}finally{painting=false;}};
 const readout:Method=function(model:Row,index:number,pane:unknown,surface:unknown){assertOwner(this,host);if(surface==='legend'&&!current.valuesVisible)return [];if(reading)throw Error('Indicator readout formatting is already in progress.');reading=true;const before=current;try{const result=surface==='legend'||surface==='dataWindow'?formattedReadout(model,index,pane,surface):Reflect.apply(originalReadout,host,[model,index,pane,surface]);assertOwner(this,host);if(current!==before)throw Error('Indicator display options changed during readout.');return result;}catch(error){report(error);return [];}finally{reading=false;}};
 Object.defineProperty(chrome,'drawMergedScaleColumns',{configurable:true,writable:true,value:paint});
 try{Object.defineProperty(chrome,'drawPriceAxes',{configurable:true,writable:true,value:axesPaint});Object.defineProperty(host,'readoutRowsFor',{configurable:true,writable:true,value:readout});if(originalLeft)Object.defineProperty(chrome,'lvDrawLeftScale',{configurable:true,writable:true,value:leftPaint});}catch(error){active=false;const cleanup:unknown[]=[];for(const [owner,key,expected]of [[chrome,'drawMergedScaleColumns',paint],[chrome,'drawPriceAxes',axesPaint],[host,'readoutRowsFor',readout],[chrome,'lvDrawLeftScale',leftPaint]] as const){try{if(!Object.hasOwn(owner,key))continue;if(own(owner,key)!==expected)throw Error('Indicator display installation preserved a foreign method: '+key);delete owner[key];}catch(failure){cleanup.push(failure);}}if(cleanup.length)throw new AggregateError([error,...cleanup],'Indicator display installation and cleanup failed.');throw error;}
 activeInstallations.add(renderer);
 const controller:IndicatorDisplayController={
  setOptions(next){if(this!==controller)throw Error('Indicator display controller receiver changed.');assertOwner();if(optionsBusy)throw Error('Indicator display option transaction is already in progress.');const candidate=options(next),previous=current,previousDiagnostics=lastDiagnostics;if(candidate.labelsVisible===current.labelsVisible&&candidate.valuesVisible===current.valuesVisible)return;
   optionsBusy=true;try{current=candidate;lastDiagnostics=[];try{Reflect.apply(invalidate,scheduler,[4]);assertOwner();}catch(error){current=previous;lastDiagnostics=previousDiagnostics;try{assertOwner();Reflect.apply(invalidate,scheduler,[4]);assertOwner();}catch(recovery){quarantined=true;lastDiagnostics=[diagnostic('Indicator display repaint recovery failed; reopen this chart.')];throw new AggregateError([error,recovery],'Indicator display options and repaint recovery failed.');}throw error;}}finally{optionsBusy=false;}
  },
  setNameLabels(on){if(this!==controller)throw Error('Indicator display controller receiver changed.');if(typeof on!=='boolean')throw Error('Indicator name labels require a boolean.');assertOwner();if(optionsBusy)throw Error('Indicator display option transaction is already in progress.');if(on===names)return;
   optionsBusy=true;try{const previous=names;names=on;try{Reflect.apply(invalidate,scheduler,[4]);assertOwner();}catch(error){names=previous;throw error;}}finally{optionsBusy=false;}
  },
  diagnostics(){if(this!==controller)throw Error('Indicator display controller receiver changed.');if(!active)throw Error('Indicator display controller is retired.');return [...lastDiagnostics,...leftDiagnostics.filter(row=>!lastDiagnostics.some(other=>other.message===row.message))].map(row=>({...row}));},
  dispose(){if(this!==controller)throw Error('Indicator display controller receiver changed.');if(!active)return;active=false;activeInstallations.delete(renderer);const failures:unknown[]=[];for(const [owner,key,expected]of [[chrome,'drawMergedScaleColumns',paint],[chrome,'drawPriceAxes',axesPaint],[host,'readoutRowsFor',readout],...(originalLeft?[[chrome,'lvDrawLeftScale',leftPaint] as const]:[])] as const){try{if(own(owner,key)!==expected)throw Error('Indicator display cleanup preserved a foreign method: '+key);delete owner[key];}catch(error){failures.push(error);}}if(failures.length)throw new AggregateError(failures,'Indicator display cleanup was incomplete.');},
 };
 return controller;
}

// Legend title and arguments. Pure formatting: the legend row reads
// "RSI 14 close"; the status line settings Titles and Inputs toggles gate each part on its own.
const legendValue=(value:unknown)=>typeof value==='number'?(Number.isFinite(value)?String(value):'?'):typeof value==='string'?value:'';
/** The three-input cap (the source is extra) and the excluded smoothing, band, kernel and timezone keys (no fact lists which inputs the
 * reference shows). The leading non-boolean inputs of an instance (at most three), saved values over schema defaults.
 * sourceLabel names the instance behind an indicator-on-indicator source; a null result reads as a missing source. */
export function indicatorLegendArguments(kind:IndicatorId,inputs:Record<string,unknown>,sourceLabel:(instance:string,plot:string)=>string|null=()=>null):string[]{
 const shown=indicatorInputSchema(kind).filter(field=>field.type!=='bool'&&!/^(smoothing|band|kernelVersion|timezone|divergence)/.test(field.key));
 // The source does not use up the three-input cap (RCI ribbon reads 10 30 50 close), and a
 // source declared ahead of the lengths reads after them, as the reference legend does.
 let picked=shown.filter(field=>field.key!=='source').slice(0,3);const source=shown.find(field=>field.key==='source');
 if(source){const at=shown.indexOf(source);picked=at===0?[...picked,source]:[...picked.filter(field=>shown.indexOf(field)<at),source,...picked.filter(field=>shown.indexOf(field)>at)];}
 return picked.map(field=>{
  const value=Object.hasOwn(inputs,field.key)?inputs[field.key]:field.defval,ref=field.key==='source'?parseIndicatorSource(value):null;
  if(!ref)return legendValue(value);
  return sourceLabel(ref.instance,ref.plot)??'missing source';
 }).filter(Boolean);
}
export interface IndicatorLegendReadout {title:string;arguments:string;text:string}
/** Title and arguments joined for the legend row, each part gated by its own toggle. */
export function indicatorLegendReadout(row:{acronym:string;arguments:readonly string[]},show:{titles:boolean;inputs:boolean}):IndicatorLegendReadout{
 const title=show.titles?row.acronym:'',args=show.inputs?row.arguments.join(' '):'';
 return{title,arguments:args,text:[title,args].filter(Boolean).join(' ')};
}
