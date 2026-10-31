import {rsiGainAt,rsiLossAt,rsiValue,finiteDifference,bandUpper,bandLower,calculateIndicator,sourceValueOf,smaStepper,emaStepper,rmaStepper,wmaStepper,windowDeviation,trueRangeAt,stochasticRawAt,obvStep,indicatorCalculationWork,indicatorSmoothingSettings,indicatorVolumeMaType,rsiDivergenceEnabled,type IndicatorId,type IndicatorInputs,type IndicatorResult,type IndicatorCalculationOptions,type SeriesAt,type Stepper,type ObvState} from './indicators';
import {parseIndicatorSource} from './indicator-source';
import {sealIndicatorValues} from './indicator-sealed-values';
import type {Bar,PriceSource} from './types';

/**
 * Incremental recalculation of the built-in indicators on live ticks.
 *
 * Every live tick used to recalculate each indicator over the whole history (about 4 to 20 ms per indicator at 20,000
 * bars). A live tick only replaces the forming bar, sometimes revises the bar just closed, or appends a bar, and these
 * built-ins are causal: the value at a bar depends only on that bar and earlier ones. A session (one per indicator
 * instance) therefore keeps, after a checkpoint bar RESUME_TAIL bars before the end, the exact state of every stepper the
 * calculation uses (src/domain/indicators.ts runs the very same steppers over the whole series), the plot values up to the
 * checkpoint, and the bar values they were computed from. When the next call's bars are identical up to the checkpoint
 * (every OHLCV and time value, Object.is), it copies the values up to the checkpoint and steps only the remaining bars.
 *
 * Exactness rules:
 * - A session is seeded by the reference calculateIndicator. The session then runs its own pipeline over the same bars
 *   and must reproduce every reference value (Object.is). Any difference disables the session for that configuration.
 * - Everything else falls back to calculateIndicator: an earlier bar changed, fewer bars than the checkpoint, a tail value
 *   the reference would refuse (nonfinite plot value, missing or negative volume where volume is required), any error, a
 *   workload or bar count over the reference limits, indicator-on-indicator sources, RSI divergence, catalog kinds, VWAP,
 *   VWMA averages, profile inputs.
 * - The returned result has the reference shape: same id, plot ids, labels and policies, fresh arrays every call.
 * - A session created with `sealed` (the chart indicator port) returns each plot's values as a fresh sealed (frozen)
 *   copy (src/domain/indicator-sealed-values.ts), so the readout proof and the legend copy need not lock or clone it. Other
 *   sessions keep returning fresh writable arrays.
 */
const sealed=(values:readonly (number|null)[])=>sealIndicatorValues(values) as (number|null)[];
/** Replaces each plot's values with a sealed copy; a plot that is not a plain writable record keeps its array. */
function sealResult(result:IndicatorResult):IndicatorResult{
 if(!result||!Array.isArray(result.series))return result;
 for(const plot of result.series){if(!plot||typeof plot!=='object'||!Array.isArray(plot.values))continue;const field=Object.getOwnPropertyDescriptor(plot,'values');if(!field||!Object.hasOwn(field,'value')||!field.writable)continue;plot.values=sealed(plot.values);}
 return result;
}
const RESUME_TAIL=2;
/** Below this many bars a reference calculation is as cheap as the bookkeeping. */
const MIN_BARS=64;
const MAX_BARS=100000;
const WORK_LIMIT=20000000;
const finite=(value:unknown):value is number=>typeof value==='number'&&Number.isFinite(value);
type Values=(number|null)[];
/** One plot pipeline: per bar, the values of every plot in reference order, from its states and the outputs so far. */
interface Pipeline {plots:readonly string[];volume:boolean;create():unknown[];copy(states:readonly unknown[]):unknown[];step(states:unknown[],index:number,bars:readonly Bar[],out:readonly Values[]):Values}
function averageStepper(type:unknown,period:number):Stepper<unknown>|null{
 if(type==='SMA')return smaStepper(period) as Stepper<unknown>;
 if(type==='EMA')return emaStepper(period) as Stepper<unknown>;
 if(type==='EMA_SMA_SEED')return emaStepper(period,true) as Stepper<unknown>;// The EMA and MACD indicators
 if(type==='RMA')return rmaStepper(period) as Stepper<unknown>;
 if(type==='WMA')return wmaStepper(period) as Stepper<unknown>;
 return null;
}
const validLength=(value:unknown):value is number=>Number.isSafeInteger(value)&&(value as number)>=1&&(value as number)<=100000;
/** A step node: state slot `slot` of the pipeline, fed by series `x`. */
interface Node {stepper:Stepper<unknown>;slot:number}
function pipelineFor(kind:string,inputs:IndicatorInputs):Pipeline|null{
 const own=(key:string,fallback:unknown)=>Object.hasOwn(inputs,key)?inputs[key]:fallback;
 const steppers:Stepper<unknown>[]=[];
 const node=(stepper:Stepper<unknown>|null):Node|null=>{if(!stepper)return null;steppers.push(stepper);return {stepper,slot:steppers.length-1};};
 const average=(type:unknown,period:unknown):Node|null=>validLength(period)?node(averageStepper(type,period)):null;
 // The run being stepped: its bars, the plot outputs so far, the bar index, and the current value of the first two plots
 // (lookbacks of a plot read its earlier outputs and, at the current bar, the value just computed).
 let bars:readonly Bar[]=[],out:readonly Values[]=[],at=0,first:number|null=null,second:number|null=null,states:unknown[]=[];
 const run=(n:Node,value:number|null|undefined,index:number,series:SeriesAt)=>n.stepper.step(states[n.slot],value,index,series);
 const rawSource=own('source','close');
 if(typeof rawSource!=='string'||parseIndicatorSource(rawSource))return null;
 if(!['open','high','low','close','hl2','hlc3','ohlc4'].includes(rawSource))return null;
 const sourceOf=sourceValueOf(rawSource as PriceSource);
 const src:SeriesAt=j=>sourceOf(bars[j]),volumeAt:SeriesAt=j=>bars[j].volume,none:SeriesAt=()=>null;
 const firstAt:SeriesAt=j=>j===at?first:out[0][j];
 const values:Values=[];
 let plots:string[]=[],volume=false,base:((index:number)=>void)|null=null;
 if(kind==='sma'||kind==='ema'){
  const period=own('length',9),avg=kind==='sma'?average('SMA',period):average('EMA_SMA_SEED',period);if(!avg)return null;
  plots=[kind];base=index=>{first=run(avg,src(index),index,src);values[0]=first;};
 }else if(kind==='rsi'){
  if(rsiDivergenceEnabled(inputs))return null;
  const period=own('length',14),up=average('RMA',period),down=average('RMA',period);if(!up||!down)return null;
  plots=['rsi'];base=index=>{
   const value=src(index),prior=index?src(index-1):undefined;
   const gain=rsiGainAt(index,value,prior),loss=rsiLossAt(index,value,prior);
   const g=run(up,gain,index,none),l=run(down,loss,index,none);
   first=rsiValue(g,l);values[0]=first;
  };
 }else if(kind==='macd'){
  const osc=own('oscillatorType',undefined)??'EMA',sig=own('signalType',undefined)??'EMA';
  const seeded=(type:unknown)=>type==='EMA'?'EMA_SMA_SEED':type;// MACD EMAs use the SMA seed
  const fast=average(seeded(osc),own('fast',12)),slow=average(seeded(osc),own('slow',26)),signal=average(seeded(sig),own('signal',9));if(!fast||!slow||!signal)return null;
  plots=['macd','signal','histogram'];base=index=>{
   const value=src(index),a=run(fast,value,index,src),b=run(slow,value,index,src);
   first=finiteDifference(a,b);second=run(signal,first,index,firstAt);
   values[0]=first;values[1]=second;values[2]=finiteDifference(first,second);
  };
 }else if(kind==='volume'){
  let type:string;try{type=indicatorVolumeMaType(inputs);}catch{return null;}
  const ma=average(type,own('length',20));if(!ma)return null;
  plots=['volume','ma'];volume=true;base=index=>{const value=bars[index].volume;first=value;values[0]=value;values[1]=run(ma,value,index,volumeAt);};
 }else if(kind==='bb'){
  const period=own('length',20),multiplier=own('multiplier',2),basisType=own('basisType',undefined)??'SMA';
  if(!finite(multiplier)||multiplier<0||!validLength(period))return null;
  const basis=average(basisType,period);if(!basis)return null;
  const window:(number|null|undefined)[]=new Array(period);
  plots=['basis','upper','lower'];base=index=>{
   const b=run(basis,src(index),index,src);let deviation:number|null=null;
   if(index>=period-1){for(let k=0;k<period;k++)window[k]=src(index-period+1+k);deviation=windowDeviation(window,period);}
   first=b;values[0]=b;values[1]=bandUpper(b,deviation,multiplier);values[2]=bandLower(b,deviation,multiplier);
  };
 }else if(kind==='obv'){
  const slot=steppers.push({create:()=>({accumulator:0,priorClose:null}),copy:state=>({...(state as ObvState)}),step:()=>null})-1;
  plots=['obv'];volume=true;base=index=>{first=obvStep(states[slot] as ObvState,bars[index],sourceOf(bars[index]));values[0]=first;};
 }else if(kind==='atr'){
  const smoothing=own('smoothing',undefined)??'RMA',ma=average(smoothing,own('length',14));if(!ma)return null;
  const range:SeriesAt=j=>trueRangeAt(bars[j],j,bars);
  plots=['atr'];base=index=>{first=run(ma,range(index),index,range);values[0]=first;};
 }else if(kind==='stochastic'){
  const period=own('length',14);if(!validLength(period))return null;
  const k=average('SMA',own('smoothK',3)),d=average('SMA',own('smoothD',3));if(!k||!d)return null;
  const raw:SeriesAt=j=>stochasticRawAt(bars[j],j,bars,period);
  plots=['k','d'];base=index=>{first=run(k,raw(index),index,raw);second=run(d,first,index,firstAt);values[0]=first;values[1]=second;};
 }
 if(!base)return null;
 let extra:((index:number)=>void)|null=null;
 if(['sma','ema','rsi','obv'].includes(kind)){
  let smoothing:ReturnType<typeof indicatorSmoothingSettings>;try{smoothing=indicatorSmoothingSettings(inputs);}catch{return null;}
  const offset=plots.length;
  if(smoothing.type==='SMA+BB'){
   const ma=average('SMA',smoothing.length),period=smoothing.length,multiplier=smoothing.multiplier;if(!ma)return null;
   const window:(number|null|undefined)[]=new Array(period);
   plots.push('smooth','smoothUpper','smoothLower');
   extra=index=>{const b=run(ma,first,index,firstAt);let deviation:number|null=null;
    if(index>=period-1){for(let k=0;k<period;k++)window[k]=firstAt(index-period+1+k);deviation=windowDeviation(window,period);}
    values[offset]=b;values[offset+1]=bandUpper(b,deviation,multiplier);values[offset+2]=bandLower(b,deviation,multiplier);};
  }else if(smoothing.type!=='None'){
   const ma=average(smoothing.type,smoothing.length);if(!ma)return null;
   plots.push('smooth');extra=index=>{values[offset]=run(ma,first,index,firstAt);};
  }
 }
 const step=base,more=extra;
 return {plots,volume,
  create:()=>steppers.map(stepper=>stepper.create()),
  copy:list=>list.map((state,slot)=>steppers[slot].copy(state)),
  step:(list,index,runBars,runOut)=>{bars=runBars;out=runOut;states=list;at=index;first=null;second=null;step(index);if(more)more(index);return values;}};
}
/** Exact configuration key: kind, typed inputs, and the facts the built-ins receive. Null when not supported. */
function configurationKey(kind:string,inputs:IndicatorInputs,options:IndicatorCalculationOptions|undefined):string|null{
 if(!inputs||typeof inputs!=='object'||Array.isArray(inputs)||Object.getPrototypeOf(inputs)!==Object.prototype&&Object.getPrototypeOf(inputs)!==null)return null;
 const fields:unknown[]=[];
 for(const key of Object.keys(inputs).sort()){const descriptor=Object.getOwnPropertyDescriptor(inputs,key)!;if(!Object.hasOwn(descriptor,'value'))return null;const value=descriptor.value;
  if(typeof value==='number')fields.push(key,'n',Object.is(value,-0)?'-0':String(value));else if(typeof value==='string'||typeof value==='boolean')fields.push(key,typeof value,value);else return null;}
 if(Reflect.ownKeys(inputs).length!==Object.keys(inputs).length)return null;
 const facts=options??{};
 for(const key of Object.keys(facts))if(!['resolution','calendar'].includes(key)&&(facts as Record<string,unknown>)[key]!==undefined&&(facts as Record<string,unknown>)[key]!==null)return null;
 const resolution=facts.resolution??null,calendar=facts.calendar??null;
 if(resolution!==null&&typeof resolution!=='string'||calendar!==null&&typeof calendar!=='string')return null;
 return JSON.stringify([kind,fields,resolution,calendar]);
}
const SUPPORTED=new Set(['sma','ema','rsi','macd','volume','bb','obv','atr','stochastic']);
const FIELDS=6;
/** One indicator instance's incremental state. Not shared between instances. */
export class IncrementalIndicatorSession {
 private key:string|null=null;private pipeline:Pipeline|null=null;private disabled=false;
 private template:{id:string;labels:string[];policies:string[]}|null=null;
 private snapshot=new Float64Array(0);private count=0;
 /** Plot values by bar; `states` is the stepper state after bar `at`, or null while the pipeline is not yet verified. */
 private outputs:Values[]=[];private at=-1;private states:unknown[]|null=null;
 /** Diagnostics for tests: how the last call was answered ('adopt': the exact state of a pooled session for the same bars). */
 lastMode:'reference'|'seed'|'resume'|'adopt'|'prefix'='reference';
 /** A shared session (one per indicator instance of a chart) joins the session pool, see adopt(). */
 constructor(private readonly shared=false,private readonly sealedOutput=false){}
 /** A fresh copy of values (up to count): sealed for a sealed session, a plain array otherwise. */
 private out(values:readonly (number|null)[],count=values.length):(number|null)[]{return this.sealedOutput?sealed(count===values.length?values:values.slice(0,count)):values.slice(0,count);}
 private finish(result:IndicatorResult):IndicatorResult{return this.sealedOutput?sealResult(result):result;}
 calculate(kind:IndicatorId,bars:readonly Bar[],inputs:IndicatorInputs,options?:IndicatorCalculationOptions):IndicatorResult{
  const key=SUPPORTED.has(kind)?configurationKey(kind,inputs,options):null;
  if(key===null){this.lastMode='reference';return this.finish(calculateIndicator(kind,bars,inputs,options));}
  let fresh=false;
  if(key!==this.key){this.key=key;this.disabled=false;this.clear();let pipeline:Pipeline|null=null;try{pipeline=pipelineFor(kind,inputs);}catch{pipeline=null;}this.pipeline=pipeline;if(!pipeline)this.disabled=true;fresh=true;}
  if(this.disabled||!Array.isArray(bars)){this.lastMode='reference';return this.finish(calculateIndicator(kind,bars,inputs,options));}
  if(fresh&&this.shared){const adopted=this.adopt(kind,bars,inputs);if(adopted){this.publish();return adopted;}}
  const prefix=this.prefix(bars);if(prefix){this.lastMode='prefix';this.publish();return prefix;}
  const resumed=this.resume(kind,bars,inputs);if(resumed){this.lastMode='resume';this.publish();return resumed;}
  const result=this.seed(kind,bars,inputs,options);if(this.template)this.publish();return this.finish(result);
 }
 /**
  * Layout tabs. A tab switch builds the incoming charts anew, so every indicator used to recalculate from
  * scratch. A fresh shared session first looks for a pooled session (a chart of this or an earlier tab) with the same
  * configuration key whose recorded bars are this input: identical bars, so its plot values are the reference values for
  * them, returned as a copy; or identical up to its checkpoint, so its state resumes from there (the ordinary resume path,
  * same exactness rules). Anything else returns null and the caller calculates as before. State is copied, never shared.
  */
 private adopt(kind:IndicatorId,bars:readonly Bar[],inputs:IndicatorInputs):IndicatorResult|null{
  const count=bars.length;if(count<MIN_BARS||count>MAX_BARS)return null;
  for(let index=sessionPool.length-1;index>=0;index--){
   const other=sessionPool[index];if(other===this||other.key!==this.key||other.disabled||!other.template||other.count===0||!other.pipeline)continue;
   const from=other.firstChange(bars);
   if(from===other.count&&count===other.count){
    this.copyFrom(other);this.lastMode='adopt';
    return {id:other.template.id,series:other.pipeline.plots.map((id,plot)=>({id,label:other.template!.labels[plot],values:this.out(other.outputs[plot])})),diagnostics:[],policies:[...other.template.policies]};
   }
   if(from>other.at&&count-1-RESUME_TAIL>=other.at){this.copyFrom(other);const resumed=this.resume(kind,bars,inputs);if(resumed){this.lastMode='resume';return resumed;}this.clear();return null;}
  }
  return null;
 }
 private copyFrom(other:IncrementalIndicatorSession){
  this.template={id:other.template!.id,labels:[...other.template!.labels],policies:[...other.template!.policies]};
  this.snapshot=other.snapshot.slice(0,other.count*FIELDS);this.count=other.count;this.at=other.at;
  this.outputs=other.outputs.map(values=>values.slice());this.states=other.states&&this.pipeline?this.pipeline.copy(other.states):null;
 }
 private bytes():number{let total=this.snapshot.byteLength;for(const values of this.outputs)total+=values.length*8;return total;}
 private publish(){
  if(!this.shared)return;const at=sessionPool.indexOf(this);if(at>=0)sessionPool.splice(at,1);sessionPool.push(this);
  let total=0;for(const session of sessionPool)total+=session.bytes();
  while(sessionPool.length>SESSION_POOL_LIMIT||total>SESSION_POOL_BYTES&&sessionPool.length>1){const dropped=sessionPool.shift()!;total-=dropped.bytes();}
 }
 private clear(){this.template=null;this.count=0;this.outputs=[];this.at=-1;this.states=null;}
 /**
  * Reference calculation. Its values and bars are kept; the pipeline is verified against them on the first call that can
  * resume (a live tick), so a symbol, interval or settings change pays for one reference calculation only.
  */
 private seed(kind:IndicatorId,bars:readonly Bar[],inputs:IndicatorInputs,options?:IndicatorCalculationOptions):IndicatorResult{
  this.clear();this.lastMode='reference';
  const result=calculateIndicator(kind,bars,inputs,options),pipeline=this.pipeline!,count=bars.length;
  const keys=Object.keys(result);
  if(result.diagnostics.length||keys.length!==4||keys[0]!=='id'||keys[1]!=='series'||keys[2]!=='diagnostics'||keys[3]!=='policies')return result;
  if(result.series.length!==pipeline.plots.length||result.series.some((plot,index)=>plot.id!==pipeline.plots[index]||!Array.isArray(plot.values)||plot.values.length!==count)){this.disabled=true;return result;}
  if(count<MIN_BARS||count>MAX_BARS||!this.record(bars,0,count))return result;
  this.template={id:result.id,labels:result.series.map(plot=>plot.label),policies:[...result.policies]};
  this.outputs=result.series.map(plot=>plot.values.slice());this.at=count-1-RESUME_TAIL;this.count=count;this.lastMode='seed';
  return result;
 }
 /** Runs the pipeline over bars [0, at] (unchanged since the reference) and requires every reference value there. */
 private verify(bars:readonly Bar[]):unknown[]|null{
  const pipeline=this.pipeline!,at=this.at,reference=this.outputs,states=pipeline.create(),out:Values[]=pipeline.plots.map(()=>[]);
  try{
   for(let index=0;index<=at;index++){
    const values=pipeline.step(states,index,bars,out);
    for(let plot=0;plot<values.length;plot++){if(!Object.is(values[plot],reference[plot][index])){this.disabled=true;return null;}out[plot].push(values[plot]);}
   }
  }catch{this.disabled=true;return null;}
  return states;
 }
 /** Saves bar values [from, to) and checks they are plain numeric bars. */
 private record(bars:readonly Bar[],from:number,to:number):boolean{
  if(this.snapshot.length<to*FIELDS){const grown=new Float64Array(Math.max(to,this.count*2,1024)*FIELDS);grown.set(this.snapshot.subarray(0,this.count*FIELDS));this.snapshot=grown;}
  const snapshot=this.snapshot;
  for(let index=from;index<to;index++){
   const bar=bars[index];if(!bar||typeof bar!=='object')return false;
   const {time,open,high,low,close,volume}=bar;
   if(typeof time!=='number'||typeof open!=='number'||typeof high!=='number'||typeof low!=='number'||typeof close!=='number'||typeof volume!=='number')return false;
   const offset=index*FIELDS;snapshot[offset]=time;snapshot[offset+1]=open;snapshot[offset+2]=high;snapshot[offset+3]=low;snapshot[offset+4]=close;snapshot[offset+5]=volume;
  }
  return true;
 }
 /** First bar index whose values differ from the recorded ones (or a non-numeric bar: -1). */
 private firstChange(bars:readonly Bar[]):number{
  const limit=Math.min(bars.length,this.count),snapshot=this.snapshot;
  for(let index=0;index<limit;index++){
   const bar=bars[index];if(!bar||typeof bar!=='object')return -1;const offset=index*FIELDS;
   if(!Object.is(bar.time,snapshot[offset])||!Object.is(bar.open,snapshot[offset+1])||!Object.is(bar.high,snapshot[offset+2])||!Object.is(bar.low,snapshot[offset+3])||!Object.is(bar.close,snapshot[offset+4])||!Object.is(bar.volume,snapshot[offset+5]))return index;
  }
  return limit;
 }
 /**
  * A Bar Replay step back (or a forward step still inside the history already calculated) hands the
  * calculation a shorter input that is exactly a prefix of the recorded bars (every OHLCV and time value, Object.is). The
  * built-ins are causal, so their values for that prefix are the recorded values up to its length: the very values the
  * reference and the resume path produced for those bars. The recorded state is kept, so stepping forward again is a
  * prefix too. Anything else (a changed bar, fewer than MIN_BARS bars, not shorter) is not a prefix and falls through.
  */
 private prefix(bars:readonly Bar[]):IndicatorResult|null{
  const pipeline=this.pipeline,template=this.template,count=bars.length;
  if(!pipeline||!template||this.count===0||count<MIN_BARS||count>=this.count||this.outputs.some(values=>values.length!==this.count))return null;
  if(this.firstChange(bars)!==count)return null;
  return {id:template.id,series:pipeline.plots.map((id,plot)=>({id,label:template.labels[plot],values:this.out(this.outputs[plot],count)})),diagnostics:[],policies:[...template.policies]};
 }
 private resume(kind:IndicatorId,bars:readonly Bar[],inputs:IndicatorInputs):IndicatorResult|null{
  const pipeline=this.pipeline,template=this.template,count=bars.length,from0=this.at+1;
  if(!pipeline||!template||this.count===0||count<MIN_BARS||count>MAX_BARS)return null;
  try{if(indicatorCalculationWork(kind,count,inputs)>WORK_LIMIT)return null;}catch{return null;}
  const at=count-1-RESUME_TAIL;if(at<this.at)return null;
  const from=this.firstChange(bars);if(from<from0)return null;
  const checkpoint=this.states??this.verify(bars);if(!checkpoint)return null;this.states=checkpoint;
  const states=pipeline.copy(checkpoint),out=this.outputs.map(values=>values.slice(0,from0));let saved=at===this.at?pipeline.copy(checkpoint):null;
  try{
   for(let index=from0;index<count;index++){
    const bar=bars[index];if(!bar||typeof bar!=='object')return null;
    if(pipeline.volume&&(!finite(bar.volume)||bar.volume<0))return null;
    const values=pipeline.step(states,index,bars,out);
    for(let plot=0;plot<values.length;plot++){const value=values[plot];if(value!==null&&!finite(value))return null;out[plot].push(value);}
    if(index===at)saved=pipeline.copy(states);
   }
  }catch{return null;}
  if(!saved||!this.record(bars,from0,count))return null;
  this.outputs=out;this.at=at;this.states=saved;this.count=count;
  return {id:template.id,series:pipeline.plots.map((id,plot)=>({id,label:template.labels[plot],values:this.out(out[plot])})),diagnostics:[],policies:[...template.policies]};
 }
}
/** The most recently used shared sessions, oldest first (about 2 MB each at 20,000 bars and 5 plots). */
const SESSION_POOL_LIMIT=48,SESSION_POOL_BYTES=64*1024*1024;
const sessionPool:IncrementalIndicatorSession[]=[];
/** Test support: forget the pooled sessions. */
export function clearIncrementalSessionPool():void{sessionPool.length=0;}
/** shared: the session may adopt the state of a pooled session with the same configuration and bars (chart instances). */
export function createIncrementalIndicatorSession(options?:{shared?:boolean;sealed?:boolean}):IncrementalIndicatorSession{return new IncrementalIndicatorSession(options?.shared===true,options?.sealed===true);}
