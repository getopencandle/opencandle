import {demoDataLabel,demoDataMode} from '../domain/demo-mode';
import {attemptEveryCleanup} from './chart-retirement';
import type {ClaimNativeDescriptor} from './native-full-model';
import {registerNativeIndicator,unregisterNativeIndicator,stableSeriesId,type Vela,type NativeIndicatorDescriptor, type NativeIndicator,type NativeIndicatorContext,type IndicatorHandle,type VisibleRange} from '@luxalgo/vela';
import type {Bar,BarDataset} from '../domain/types';
import {setIndicatorNativeScale} from './indicator-scale';
import {priceScalePortFor} from './price-scale-port';
import {createAnalysisPublication,type AnalysisPublicationHost} from './analysis-publication';
import {isFredDatasetId,isLiveDatasetId,isLiveProviderId} from '../domain/live-provider';
import {ALPACA_SIP_PROVIDER_ID,ALPACA_STUB_PROVIDER_ID} from '../domain/alpaca-live';
export type ComparisonMode='absolute'|'percent'|'indexed';
/** The source tag of a comparison (series title, dialog legend). A live feed or the keyless Alpaca stub was
 * tagged LOCAL IMPORT before; AGENTS.md requires synthetic data to say SYNTHETIC everywhere, so the stub (fixture false, but
 * invented prices) is SYNTHETIC. The wording follows the chart heading's source words. */
export type ComparisonSourceTag='SYNTHETIC'|'FRED'|'LIVE'|'DELAYED'|'LOCAL IMPORT';
export function comparisonSourceTag(dataset:Pick<BarDataset,'provenance'>):ComparisonSourceTag{
  const p=dataset.provenance;
  if(p.fixture||p.providerId===ALPACA_STUB_PROVIDER_ID||/^SYNTHETIC/.test(p.providerName))return 'SYNTHETIC';
  if(p.providerId===ALPACA_SIP_PROVIDER_ID)return 'DELAYED';
  if(isFredDatasetId(p.datasetId))return 'FRED';
  if(isLiveDatasetId(p.datasetId)||isLiveProviderId(p.providerId))return 'LIVE';
  return 'LOCAL IMPORT';
}
/** The source words beside a symbol in the Compare symbols list. */
export function comparisonSourceText(dataset:Pick<BarDataset,'provenance'>):string{
  const p=dataset.provenance,tag=comparisonSourceTag(dataset);
  if(tag==='SYNTHETIC')return p.fixture?(demoDataMode()==='legacy'?'Synthetic demo':demoDataLabel()):/^SYNTHETIC/.test(p.providerName)?p.providerName:'SYNTHETIC · '+p.providerName;
  if(tag==='FRED')return 'FRED economic data · '+p.providerName;
  if(tag==='LIVE')return 'Live · '+p.providerName;
  if(tag==='DELAYED')return 'Delayed history (15 min) · '+p.providerName;
  return 'Local import';
}
/** Where a comparison is drawn. 'new-scale' is the original placement (the price pane, on its
 * own scale column; vela gives a merged indicator its own column) and is the value of an absent field, so older snapshots
 * keep their bytes. 'same-scale' shares the main series scale, drawn rebased onto the main series at the baseline bar so both
 * lines start together (a "same percent scale" look on any chart scale mode; the dialog also switches
 * the main scale to Percent, see sameScaleMainCommand). 'new-pane' keeps its own pane. */
export type ComparisonPlacement='same-scale'|'new-scale'|'new-pane';
export const COMPARISON_PLACEMENTS:readonly ComparisonPlacement[]=Object.freeze(['same-scale','new-scale','new-pane']);
/** The Compare dialog's three add-to choices. */
export const COMPARISON_PLACEMENT_LABELS:Readonly<Record<ComparisonPlacement,string>>=Object.freeze({'same-scale':'Same % scale','new-scale':'New price scale','new-pane':'New pane'});
/** The Compare dialog's default add-to choice, as in the reference (Same % scale). The port itself keeps
 * 'new-scale' as the value of an absent field, so saved snapshots keep their bytes. */
export const DEFAULT_COMPARISON_PLACEMENT:ComparisonPlacement='same-scale';
/** Same % scale also switches the main price scale to Percent, as the reference does. The pinned renderer's
 * percent mode only relabels the axis: a value v reads 100*(v/b-1), b being the main close at the first visible bar. The
 * same-scale line is the comparison close rebased onto the main close at its first visible matching bar (compareRebased), so
 * on that axis it reads the comparison's own percent change. Indexed to 100 is already a relative scale and is kept. Returns
 * the price scale command to run, or null when the main scale needs no change. */
export function sameScaleMainCommand(mode:string):'percent'|null{return mode==='regular'||mode==='logarithmic'?'percent':null;}
/** A symbol chosen in Compare that is not loaded yet is opened through the chart loaders (App), which answer
 * with the dataset id the feed publishes under, or a plain refusal. */
export interface ComparisonLoadRequest {providerId:string;symbol:string;resolution:string}
export type ComparisonLoadResult={ok:true;datasetId:string}|{ok:false;message:string};
export type ComparisonLoadState={state:'ready'|'loading'|'unavailable';message:string};
/** The pending state of a loading comparison, read from the chart universe like the second-symbol alert
 * loader reads its feed: ready only once the feed has bars and is not still loading (never added as an empty or partial
 * line); a feed that failed, or one that was listed and then closed, is unavailable. Wording. */
export function comparisonLoadState(dataset:Pick<BarDataset,'bars'|'provenance'|'instrument'>|null|undefined,symbol:string,seen=false):ComparisonLoadState{
  if(!dataset)return seen?{state:'unavailable',message:symbol+' stopped loading. Choose it again to retry.'}:{state:'loading',message:'Loading '+symbol+'.'};
  const state=dataset.provenance.state,bars=Array.isArray(dataset.bars)?dataset.bars.length:0;
  if(bars&&state!=='loading')return{state:'ready',message:''};
  if(!bars&&(state==='error'||state==='unavailable')){const note=dataset.provenance.notes?.find(item=>typeof item==='string'&&item.trim());return{state:'unavailable',message:note?symbol+' could not be loaded: '+note:symbol+' could not be loaded.'};}
  return{state:'loading',message:'Loading '+symbol+'.'};
}
/** Labels for the stored mode ids (the select used to show the raw ids). */
export const COMPARISON_MODE_LABELS:Readonly<Record<ComparisonMode,string>>=Object.freeze({percent:'Percent change (%)',indexed:'Indexed to 100',absolute:'Price'});
const withPlacement=(settings:ComparisonSettings):ComparisonSettings=>{if(settings.placement!=='new-scale')return settings;const {placement:_default,...rest}=settings;return rest;};
export interface ComparisonSettings {id:string;dataset:BarDataset;mode:ComparisonMode;color:string;width:number;visible:boolean;baseline:'first-visible-match'|'first-loaded-match';placement?:ComparisonPlacement}
function rejectBuiltInPresentation(value:object){if(Object.hasOwn(value,'presentation')||Object.hasOwn(value,'visibility'))throw new Error('Built-in indicator presentation and interval visibility are unsupported on comparisons.');}
export function validateComparisonSettings(settings:ComparisonSettings){rejectBuiltInPresentation(settings);if(!settings.id||!settings.dataset?.instrument?.symbol||!Array.isArray(settings.dataset?.bars)||!['absolute','percent','indexed'].includes(settings.mode)||!Number.isFinite(settings.width)||settings.width<=0||typeof settings.color!=='string'||!settings.color.trim()||typeof settings.visible!=='boolean'||!['first-visible-match','first-loaded-match'].includes(settings.baseline)||settings.placement!==undefined&&!COMPARISON_PLACEMENTS.includes(settings.placement))throw new Error('Invalid comparison settings');}
/** The comparison close rebased onto the main series at the first matching bar at or after fromTime (same-scale). */
export function compareRebased(primary:readonly Bar[],comparison:readonly Bar[],fromTime=-Infinity):Array<{time:number;value:number|null}>{
  const byTime=new Map(comparison.map(bar=>[bar.time,bar.close]));
  const first=primary.find(bar=>bar.time>=fromTime&&byTime.has(bar.time)),base=first?byTime.get(first.time):undefined,anchor=first?.close;
  return primary.map(bar=>{const close=byTime.get(bar.time);return {time:bar.time,value:close===undefined||base===undefined||base===0||anchor===undefined?null:anchor*close/base};});
}
export function compareAligned(primary:readonly Bar[],comparison:readonly Bar[],mode:ComparisonMode,fromTime=-Infinity):Array<{time:number;value:number|null}>{
  const byTime=new Map(comparison.map(bar=>[bar.time,bar.close]));
  const first=primary.find(bar=>bar.time>=fromTime&&byTime.has(bar.time));const base=first?byTime.get(first.time):undefined;
  return primary.map(bar=>{const close=byTime.get(bar.time);return {time:bar.time,value:close===undefined?null:mode==='absolute'?close:base===undefined||base===0?null:mode==='percent'?100*(close/base-1):100*close/base};});
}
class ComparisonIndicator implements NativeIndicator{
  ctx:NativeIndicatorContext|null=null;handle:IndicatorHandle|null=null;removed=false;range:VisibleRange|null=null;mountedToPrice=false;
  /** A same-scale share the renderer refused at mount (the comparison then keeps its own scale column). */
  placementError:unknown=null;
  /** The live snapshot the settings were last copied from (refreshSource skips the same object). */
  source:BarDataset|null=null;
  constructor(public settings:ComparisonSettings,private changed:()=>void,private mutation:<T>(action:()=>T)=>T){}
  start(ctx:NativeIndicatorContext){this.ctx=ctx;this.removed=false;this.mountedToPrice=false;this.compute();}
  onBars(){this.compute();}
  onViewport(range:VisibleRange){return this.mutation(()=>{this.range=range;this.compute();});}
  setInputs(){}
  suspend(){return this.mutation(()=>{this.settings.visible=false;this.changed();});}
  resume(){return this.mutation(()=>{this.settings.visible=true;this.compute();});}
  stop(){this.ctx=null;}
  compute(){return this.mutation(()=>this.computeOwned());}
  private computeOwned(){if(!this.ctx)return;const primary=this.ctx.bars().map(bar=>({...bar,time:bar.time/1000,volume:bar.volume??NaN}));
    const from=this.settings.baseline==='first-visible-match'&&this.range?this.range.from/1000:-Infinity;
    const shared=this.settings.placement==='same-scale';
    const points=(shared?compareRebased(primary,this.settings.dataset.bars,from):compareAligned(primary,this.settings.dataset.bars,this.settings.mode,from)).map(point=>({...point,time:point.time*1000}));
    const label=`${this.settings.dataset.instrument.symbol} · ${comparisonSourceTag(this.settings.dataset)} · ${shared?'rebased':this.settings.mode}`;
    this.ctx.emit({series:[{id:stableSeriesId({instanceId:this.settings.id,kind:'line',title:'comparison-close',ordinal:0}),title:label,paneId:'',kind:'line',points,style:{color:this.settings.color,width:this.settings.width,lineStyle:'solid'}}]});this.changed();
  }
}
let sequence=0;
export function createComparisonPort(chart:Vela,claimNative?:ClaimNativeDescriptor,publicationHost?:AnalysisPublicationHost){
  const prefix=`lv-compare-${++sequence}`,models=new Map<string,{type:string;model:ComparisonIndicator;release?:()=>void}>();let disposed=false;const notifications=createAnalysisPublication('Comparison',publicationHost),changed=notifications.changed;
  /** The first mount places the comparison: the price pane (own column or the shared main scale) or its own pane. */
  const shareMain=(model:ComparisonIndicator,shared:boolean)=>{if(model.handle)setIndicatorNativeScale(chart,model.handle.id,!shared);};
  const mountPlacement=(model:ComparisonIndicator)=>{const placement=model.settings.placement??'new-scale';if(placement==='new-pane')return;model.handle!.moveTo('price');if(placement==='same-scale'){try{shareMain(model,true);model.placementError=null;}catch(error){model.placementError=error;}}};
  /** A placement edit on a mounted comparison. Unmounted ones take the new placement at their first mount. */
  const movePlacement=(model:ComparisonIndicator,from:ComparisonPlacement,to:ComparisonPlacement)=>{
    if(from===to||!model.handle||!model.mountedToPrice)return;
    if(to==='new-pane'){model.handle.moveTo({newPane:true});return;}
    if(from==='new-pane')model.handle.moveTo('price');
    if(to==='same-scale')shareMain(model,true);else if(from==='same-scale')shareMain(model,false);
  };
  /** Same % scale switches the main scale to Percent (sameScaleMainCommand). The
   * mode it had before the first same-scale comparison is remembered here, and when the last one is removed (or moved off the
   * shared scale) the main scale returns to it, as the reference returns to Regular. Only while the scale still reads Percent:
   * a mode the user picked meanwhile is kept. Workspace restores (undo, layout switch) never move the scale here. */
  let priorMainMode:'regular'|'logarithmic'|null=null,restoring=0,restoreTimer:ReturnType<typeof setTimeout>|null=null;
  const sameScaleCount=()=>[...models.values()].filter(entry=>!entry.model.removed&&entry.model.settings.placement==='same-scale').length;
  const mainScale=()=>{try{return priceScalePortFor((chart as unknown as {renderer?:object}).renderer);}catch{return null;}};
  const rememberMainMode=()=>{if(restoring||priorMainMode!==null||sameScaleCount()>0)return;try{const mode=mainScale()?.state('price').mode;priorMainMode=mode==='regular'||mode==='logarithmic'?mode:null;}catch{priorMainMode=null;}};
  const settleMainMode=()=>{
    if(restoring||disposed||priorMainMode===null||sameScaleCount()>0)return;
    const target=priorMainMode;priorMainMode=null;let tries=0;if(restoreTimer)clearTimeout(restoreTimer);
    // Deferred: the removal runs inside the host's save, which holds the scale ("right now"); retried briefly like the switch.
    const attempt=()=>{restoreTimer=null;if(disposed)return;const scale=mainScale();if(!scale)return;
      try{if(scale.state('price').mode!=='percent')return;}catch{return;}
      let result:{ok:boolean;message?:string};try{result=scale.execute(target,{paneId:'price',origin:'toolbar'});}catch(error){result={ok:false,message:error instanceof Error?error.message:String(error)};}
      if(!result.ok&&/right now/i.test(result.message??'')&&++tries<30)restoreTimer=setTimeout(attempt,100);};
    restoreTimer=setTimeout(attempt,0);
  };
  const port={
    beginExternalTransaction:notifications.beginExternalTransaction,
    policies:['Comparison aligns exact supplied bar timestamps; unmatched timestamps remain gaps. It does not infer exchange sessions or fill missing observations.','Percent/indexed modes use the declared first-visible or first-loaded matching observation. Default is an explicit OpenCandle first-visible policy, pending reference comparison.','Comparison gets a separate renderer price scale when merged into the price pane. Different currency values are never converted.'],
    subscribe:notifications.subscribe,
    list(){return [...models.values()].filter(entry=>!entry.model.removed).map(({model})=>({...structuredClone(model.settings),rendererId:model.handle?.id??''}));},
    add(dataset:BarDataset,options:Partial<Omit<ComparisonSettings,'dataset'>>={}){
      return notifications.transaction(()=>{
      rejectBuiltInPresentation(options);
      const id=options.id??crypto.randomUUID();if(models.has(id))throw new Error('Duplicate comparison ID');if(options.placement==='same-scale')rememberMainMode();
      const settings:ComparisonSettings={id,dataset:structuredClone(dataset),mode:options.mode??'percent',color:options.color??'#ffb74d',width:options.width??2,visible:options.visible??true,baseline:options.baseline??'first-visible-match',...(options.placement!==undefined&&options.placement!=='new-scale'?{placement:options.placement}:{})};
      validateComparisonSettings(settings);
      const type=`${prefix}:${id}`,model:ComparisonIndicator=new ComparisonIndicator(settings,()=>{if(model.ctx&&model.handle&&!model.mountedToPrice){model.mountedToPrice=true;mountPlacement(model);}changed();},notifications.transaction);models.set(id,{type,model});model.source=dataset;
      const descriptor:NativeIndicatorDescriptor={type,title:`${dataset.instrument.symbol} ${comparisonSourceTag(dataset)}`,paneHint:'new',overlay:false,reactsToViewport:true,inputsSchema:()=>[],defaultInputs:()=>({}),create:()=>model};
      registerNativeIndicator(descriptor);
      try{models.get(id)!.release=claimNative?.(descriptor);model.handle=chart.addNativeIndicator(type);model.range=chart.getVisibleRange();model.compute();if(model.placementError)throw model.placementError;if(!settings.visible)model.handle.setVisible(false);changed();return id;}
      catch(error){try{model.handle?.remove();}finally{models.get(id)?.release?.();unregisterNativeIndicator(type);models.delete(id);}throw error;}
      });
    },
    update(id:string,patch:Partial<Omit<ComparisonSettings,'id'|'dataset'>>){return notifications.transaction(()=>{rejectBuiltInPresentation(patch);const model=models.get(id)?.model;if(!model||model.removed)throw new Error('Unknown comparison');const next=withPlacement({...model.settings,...patch});if(next.placement==='same-scale'&&model.settings.placement!=='same-scale')rememberMainMode();validateComparisonSettings(next);const previous=model.settings;model.settings=next;try{if(patch.visible!==undefined)model.handle?.setVisible(patch.visible);movePlacement(model,previous.placement??'new-scale',next.placement??'new-scale');model.compute();}catch(error){model.settings=previous;try{movePlacement(model,next.placement??'new-scale',previous.placement??'new-scale');model.handle?.setVisible(previous.visible);model.compute();}catch(rollback){throw new AggregateError([error,rollback],'Comparison edit and native recovery were incomplete');}throw error;}settleMainMode();});},
    restore(records:readonly ComparisonSettings[]){return notifications.transaction(()=>{const ids=new Set<string>();for(const settings of records){validateComparisonSettings(settings);if(ids.has(settings.id))throw new Error('Duplicate comparison snapshot ID');ids.add(settings.id);}const previous=port.list().map(({rendererId,...settings})=>settings);if(JSON.stringify(previous)===JSON.stringify(records))return{changed:false};const apply=(rows:readonly ComparisonSettings[])=>{for(const id of [...models.keys()])port.remove(id);for(const {dataset,...settings} of rows)port.add(dataset,settings);};restoring++;try{apply(records);}catch(error){try{apply(previous);}catch(restoreError){throw new AggregateError([error,restoreError],'Comparison restore failed and rollback was incomplete.');}throw error;}finally{restoring--;if(!sameScaleCount())priorMainMode=null;changed();}return{changed:true};});},
    /** A live comparison follows its feed. Each comparison of the same live dataset id (and symbol) takes the
     * newer snapshot's bars and recomputes. Saved settings keep only the dataset id, so this is not a configuration edit.
     * Imports and synthetic data never change here (their bars are exact supplied sources). True when a comparison changed. */
    refreshSource(dataset:BarDataset):boolean{
      const datasetId=dataset?.provenance?.datasetId;
      if(disposed||!isLiveDatasetId(datasetId)||!Array.isArray(dataset.bars))return false;
      const targets=[...models.values()].filter(({model})=>!model.removed&&model.source!==dataset&&model.settings.dataset.provenance.datasetId===datasetId&&model.settings.dataset.instrument.symbol===dataset.instrument.symbol);
      if(!targets.length)return false;
      return notifications.transaction(()=>{for(const {model} of targets){model.source=dataset;model.settings={...model.settings,dataset:structuredClone(dataset)};model.compute();}changed();return true;});
    },
    remove(id:string){return notifications.transaction(()=>{const entry=models.get(id);if(!entry)return;try{entry.model.handle?.remove();}finally{entry.release?.();unregisterNativeIndicator(entry.type);}models.delete(id);changed();settleMainMode();});},
    dispose(){if(disposed)return;disposed=true;priorMainMode=null;if(restoreTimer)clearTimeout(restoreTimer);restoreTimer=null;notifications.dispose();const cleanup:Array<()=>void>=[...nativeRemoved?[nativeRemoved]:[]];for(const {model,type,release}of models.values()){model.removed=true;cleanup.push(()=>model.handle?.remove(),()=>{try{release?.();}finally{unregisterNativeIndicator(type);model.ctx=null;}});}try{attemptEveryCleanup(cleanup,'Comparison disposal was incomplete');}finally{models.clear();}},
  };const nativeRemoved=typeof chart.on==='function'?chart.on('indicator:removed',({id})=>{/* A foreign id (an indicator port's model removed while a retired chart disposes) opens no publication; an owned id keeps every check. */if(![...models.values()].some(entry=>entry.model.handle?.id===id))return;notifications.transaction(()=>{for(const [key,entry]of models)if(entry.model.handle?.id===id){models.delete(key);entry.release?.();unregisterNativeIndicator(entry.type);changed();}settleMainMode();});}):null;return port;
}
/** Same % scale switches the main price scale to Percent once the comparison is saved. Right after the add,
 * the workspace save still holds the chart, so the scale refuses ("cannot save a scale change right now"); the switch is
 * retried on a short timer (about 3 s in all) until it lands, the scale is already relative, or another refusal ends it.
 * `report` gets only the final refusal. Returns a cancel function. */
export interface SameScalePercentTarget {state(paneId?:string):{mode:string};execute(command:'percent',options:{paneId:string;origin:'toolbar'}):{ok:boolean;message?:string}}
export function applySameScalePercent(scale:SameScalePercentTarget,options:{report?:(message:string)=>void;attempts?:number;delayMs?:number;schedule?:(run:()=>void,ms:number)=>unknown}={}):()=>void{
  const attempts=Math.max(1,options.attempts??30),delay=options.delayMs??100,schedule=options.schedule??((run,ms)=>setTimeout(run,ms));
  let cancelled=false,tries=0;
  const attempt=()=>{
    if(cancelled)return;tries++;
    let command:'percent'|null;try{command=sameScaleMainCommand(scale.state('price').mode);}catch{return;}
    if(!command)return;
    let result:{ok:boolean;message?:string};try{result=scale.execute(command,{paneId:'price',origin:'toolbar'});}catch(error){result={ok:false,message:error instanceof Error?error.message:String(error)};}
    if(result.ok)return;
    // Only the busy refusal is transient; a closed chart, an unbound scale or a disabled command is final.
    if(/right now/i.test(result.message??'')&&tries<attempts)schedule(attempt,delay);else options.report?.(result.message??'');
  };
  attempt();
  return()=>{cancelled=true;};
}
