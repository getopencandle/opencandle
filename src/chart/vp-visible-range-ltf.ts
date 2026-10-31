import {sessionRequestSource,sourceContextForDataset,sameChartSourceBasis,type ChartSourceContext} from './source-context';
import {barInputIdentity,liveLineageOf} from './bar-input-identity';
import {profileInputOriginal} from './profile-input-clone';
import {isLiveDatasetId} from '../domain/live-provider';
import {rawLiveSessionSource} from '../domain/live-session-source';
import type {Bar,BarDataset} from '../domain/types';
import type {FinerBarsLookup,LowerTimeframeBars} from '../domain/volume-profile';
import {parseInterval} from '../domain/intervals';
import {currentScriptRequestResolver,type ScriptRequestResolver} from '../ui/script-requests';

/**
 * Lower-timeframe source for the volume profile indicators: the finest compatible LOADED dataset of an owned primary
 * whose interval is strictly shorter than the chart's. The application publishes its loaded dataset list
 * (setProfileDatasets); nothing is fetched, and no finer bar is ever built. Without such a dataset the profile
 * distributes each chart bar over its own high-low range (volume-profile.ts).
 */
let datasets:readonly BarDataset[]=[],generation=0;
const listeners=new Set<()=>void>();
export interface ProfilePrimarySource {readonly kind:'profile-primary'}
interface PrimaryOwner {dataset:BarDataset;bars:readonly Bar[];originalBars:readonly Bar[];source:Readonly<ChartSourceContext>;frame:Readonly<Partial<ChartSourceContext>>;generation:number;list:readonly BarDataset[];sequence:number|undefined}
const primaryOwners=new WeakMap<object,PrimaryOwner>();
const frameCache=new WeakMap<object,{bars:readonly Bar[];originalBars:readonly Bar[]|null;generation:number;sequence:number|undefined;frame:Readonly<Partial<ChartSourceContext>>;proof:ProfilePrimarySource|undefined}>();
function own(object:unknown,key:string):any{if(!object||typeof object!=='object')throw Error('Profile source data is unavailable.');const field=Object.getOwnPropertyDescriptor(object,key);if(!field||!field.enumerable||!Object.hasOwn(field,'value'))throw Error('Profile source requires plain own data.');return field.value;}
function plainSource(source:Partial<ChartSourceContext>):void{if(![Object.prototype,null].includes(Object.getPrototypeOf(source))||Reflect.ownKeys(source).some(key=>{const field=Object.getOwnPropertyDescriptor(source,key);return typeof key!=='string'||!field?.enumerable||!Object.hasOwn(field,'value');}))throw Error('Profile context requires plain own source data.');}
function canonical(dataset:BarDataset):ChartSourceContext{
 rawLiveSessionSource(dataset);
 for(const key of ['bars','instrument','provenance','resolution'])own(dataset,key);
 const instrument=own(dataset,'instrument'),provenance=own(dataset,'provenance');
 for(const key of ['id','symbol','name','exchange','currency','assetClass','timezone','tickSize','lotSize'])own(instrument,key);
 for(const key of ['datasetId','revision','providerId','providerName','fixture','adjustment','session','timezone','coverage'])own(provenance,key);
 return sourceContextForDataset(dataset);
}
/** Recognition is nonportable. A copy of an otherwise identical context cannot acquire this capability. */
export function assertProfilePrimarySource(value:unknown):asserts value is ProfilePrimarySource{if(!value||typeof value!=='object'||!primaryOwners.has(value))throw Error('Profile primary source requires its exact owned capability.');}
function ownerOf(proof:ProfilePrimarySource|undefined):PrimaryOwner|null{
 try{assertProfilePrimarySource(proof);const owner=primaryOwners.get(proof)!;
  if(owner.generation!==generation||owner.list!==datasets||!datasets.includes(owner.dataset)||own(owner.dataset,'bars')!==owner.originalBars||liveLineageOf(owner.originalBars)?.seq!==owner.sequence||profileInputOriginal(owner.bars)!==owner.originalBars)return null;
  plainSource(owner.frame);const current=canonical(owner.dataset);return current.inputIdentity===barInputIdentity(owner.originalBars)&&owner.frame.inputIdentity===current.inputIdentity&&sameChartSourceBasis(owner.frame as ChartSourceContext,owner.source,true)&&sameChartSourceBasis(current,owner.source,true)?owner:null;
 }catch{return null;}
}
export function assertCurrentProfilePrimarySource(proof:ProfilePrimarySource):void{if(!ownerOf(proof))throw Error('The profile primary source is retired or changed.');}
/** Port factories supply the actual domain input array; a context borrowed from another chart cannot authorize it. */
export function profilePrimaryInputMatches(proof:ProfilePrimarySource,input:readonly Bar[]|undefined):boolean{assertProfilePrimarySource(proof);return Array.isArray(input)&&primaryOwners.get(proof)?.bars===input;}
function capturePrimary(source:Partial<ChartSourceContext>|null|undefined,bars:readonly Bar[]|undefined):ProfilePrimarySource|undefined{
 if(!source||!Array.isArray(bars)||source.sessionOverride)return undefined;
 const cached=frameCache.get(source);if(cached&&cached.bars===bars&&cached.generation===generation&&cached.sequence===(cached.originalBars?liveLineageOf(cached.originalBars)?.seq:undefined)&&cached.frame.inputIdentity===source.inputIdentity&&sameChartSourceBasis(source as ChartSourceContext,cached.frame as ChartSourceContext,true))return cached.proof;
 let proof:ProfilePrimarySource|undefined,originalBars:readonly Bar[]|null=null,sequence:number|undefined;
 try{originalBars=profileInputOriginal(bars);if(!originalBars||source.inputIdentity!==barInputIdentity(originalBars))return undefined;sequence=liveLineageOf(originalBars)?.seq;
  const matches=datasets.filter(dataset=>{try{return own(dataset,'bars')===originalBars&&sameChartSourceBasis(canonical(dataset),source as ChartSourceContext,true);}catch{return false;}});
  const unique=[...new Set(matches)];if(unique.length!==1)return undefined;const dataset=unique[0];
  // Aggregated or replay histories need their own original-source ownership proof, never an inferred family.
  if(Object.hasOwn(dataset,'derivation')||dataset.provenance.revision.includes('|replay-snapshot:'))return undefined;
  proof=Object.freeze({kind:'profile-primary' as const});primaryOwners.set(proof,{dataset,bars,originalBars,source:Object.freeze({...canonical(dataset)}),frame:source,generation,list:datasets,sequence});return proof;
 }catch{return undefined;}finally{frameCache.set(source,{bars,originalBars,generation,sequence,frame:Object.freeze({...source}),proof});}
}
function compatible(owner:PrimaryOwner,dataset:BarDataset):boolean{
 try{if(!owner.list.includes(dataset)||Object.hasOwn(dataset,'derivation'))return false;const source=canonical(dataset),left=JSON.parse(owner.source.basisIdentity!) as unknown[],right=JSON.parse(source.basisIdentity!) as unknown[];
  return source.label===owner.source.label&&left.every((value,index)=>index===9||index===10||value===right[index])&&isLiveDatasetId(source.datasetId)===isLiveDatasetId(owner.source.datasetId)&&!source.revision.includes('|replay-snapshot:');
 }catch{return false;}
}
/** The application's loaded datasets (the session view the charts use). Replaces the previous list. */
export function setProfileDatasets(list:readonly BarDataset[]|null|undefined):void{const next:BarDataset[]=[];if(Array.isArray(list))for(let index=0;index<list.length;index++)next.push(own(list,String(index)));datasets=Object.freeze(next);generation++;for(const listener of [...listeners])try{listener();}catch{/* A retired or unavailable port cannot block publication to other owners. */}}
export function subscribeProfileDatasets(listener:()=>void):()=>void{listeners.add(listener);return()=>{listeners.delete(listener);};}

const DAY=86400;
function seconds(resolution:string):number|null{
 try{const spec=parseInterval(resolution);if(spec.kind!=='time')return null;return spec.seconds??spec.multiplier*(spec.unit==='day'?DAY:spec.unit==='week'?7*DAY:31*DAY);}catch{return null;}
}
/** Instrument id from a chart source basis identity (field 1 of the versioned tuple, source-context.ts). */
export function sourceInstrumentId(basisIdentity:string|undefined):string|undefined{
 try{const tuple=basisIdentity?JSON.parse(basisIdentity) as unknown[]:null,value=tuple?.[1];return typeof value==='string'&&value.length>0&&value.length<=4096?value:undefined;}catch{return undefined;}
}
/** Finer rows require an exact current primary capability; instrument-only calls cannot grant external data. */
export function profileLowerTimeframe(instrument:string|undefined,resolution:string|null|undefined,list:readonly BarDataset[]=datasets,proof?:ProfilePrimarySource):LowerTimeframeBars|null{
 const owner=ownerOf(proof);if(!owner||instrument!==owner.dataset.instrument.id||typeof resolution!=='string')return null;
 try{if(list.length!==datasets.length||datasets.some((dataset,index)=>own(list,String(index))!==dataset))return null;}catch{return null;}
 const chart=seconds(resolution);if(chart===null)return null;
 let best:{interval:string;seconds:number;dataset:BarDataset}|null=null,ambiguous=false;
 for(const dataset of owner.list){
  if(!compatible(owner,dataset)||!Array.isArray(dataset.bars)||!dataset.bars.length)continue;
  const own=seconds(dataset.resolution);if(own===null||own>=chart)continue;
  if(!best||own<best.seconds){best={interval:parseInterval(dataset.resolution).id,seconds:own,dataset};ambiguous=false;}else if(own===best.seconds&&dataset!==best.dataset)ambiguous=true;
 }
 return best&&!ambiguous&&ownerOf(proof)===owner?{interval:best.interval,bars:best.dataset.bars}:null;
}
/** The profile facts of a chart source for the indicator presentation context: tick size (field 15), instrument id and
 * the chart dataset id the finer-bar lookup starts from. */
export function profileSourceContext(source:Partial<ChartSourceContext>|null|undefined,bars?:readonly Bar[]):{tickSize?:number;instrument?:string;datasetId?:string;requestSource?:ChartSourceContext;profileSource?:ProfilePrimarySource}{
 if(source)plainSource(source);
 let tickSize:number|undefined;try{const tuple=source?.basisIdentity?JSON.parse(source.basisIdentity) as unknown[]:null,value=tuple?.[15];if(typeof value==='number'&&Number.isFinite(value)&&value>0)tickSize=value;}catch{tickSize=undefined;}
 const instrument=sourceInstrumentId(source?.basisIdentity);
 const datasetId=typeof source?.datasetId==='string'&&source.datasetId.length>0&&source.datasetId.length<=4096?source.datasetId:undefined;
 const profileSource=capturePrimary(source,bars);
 return {...(source?.sessionOverride?{requestSource:sessionRequestSource(source as ChartSourceContext)}:{}),...(profileSource?{profileSource}:{}),...(tickSize!==undefined?{tickSize}:{}),...(instrument!==undefined?{instrument}:{}),...(datasetId!==undefined?{datasetId}:{})};
}

/**
 * Finer bars on demand for the profile kinds. The lookup reads the installed script request
 * resolver, the one a script's ctx.request and the Bar Magnifier read: the loaded datasets (the exact interval, or one finer
 * source of the same provider aggregated by the interval menu rule) and, for a live chart's own symbol, the app's history
 * loader (the second-symbol feeds, with their limits). A "loading" answer is the pending state: `onLoading` is told, and
 * the profile recalculates when the resolver reports new data (subscribeScriptRequestResolver). The lookup is chart owned,
 * so the feed stays open while a profile is on the chart (script-request-demand.ts). Without a dataset id or a resolver
 * there is nothing to ask, and the answer is unavailable.
 * Per-chart requestSource routing is unchanged. Legacy replies additionally require exact compatible published row ownership;
 * copied/aggregated or replay rows without that proof remain unavailable instead of inferring a source family.
 */
export function profileFinerLookup(datasetId:string|undefined,resolution:string|null|undefined,onLoading?:()=>void,resolver?:ScriptRequestResolver|null,requestSource?:ChartSourceContext,proof?:ProfilePrimarySource):FinerBarsLookup|null{
 if(!datasetId||typeof resolution!=='string'||!resolution)return null;
 return interval=>{
  const active=resolver===undefined?currentScriptRequestResolver():resolver;
  if(!active)return {state:'unavailable',bars:null,message:'No loaded data can be read here.'};
  const primary=requestSource?null:ownerOf(proof);
  if(!requestSource&&(!primary||primary.source.datasetId!==datasetId))return{state:'unavailable',bars:null,message:'Finer history requires the current exact chart source.'};
  try{const series=active({id:'volume-profile',symbol:null,interval},{datasetId,resolution,owner:'chart',...(requestSource?{source:requestSource,sessionOverride:requestSource.sessionOverride}:{})});
   if(requestSource)return {state:'ready',bars:series.bars,message:null};
   const wanted=parseInterval(interval).id,actual=parseInterval(own(series,'resolution')).id,bars=own(series,'bars'),fixture=own(series,'fixture');
   const matches=primary!.list.filter(dataset=>compatible(primary!,dataset)&&parseInterval(dataset.resolution).id===wanted&&dataset.bars===bars&&dataset.provenance.fixture===fixture);
   if(actual!==wanted||new Set(matches).size!==1||ownerOf(proof)!==primary)return{state:'unavailable',bars:null,message:'Finer history does not have exact compatible loaded-source ownership.'};
   return {state:'ready',bars,message:null};}
  catch(cause){
   const message=(cause instanceof Error?cause.message:String(cause)).slice(0,300);
   if(/\bloading\b/i.test(message)){onLoading?.();return {state:'loading',bars:null,message};}
   return {state:'unavailable',bars:null,message};
  }
 };
}
