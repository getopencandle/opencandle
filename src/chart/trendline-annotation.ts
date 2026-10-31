import {NativeRenderer,Drawing,deserializeDrawing,type SerializedDrawing,type Vela} from '@luxalgo/vela';
import type {ChartDiagnostic} from './contracts';
import {readTrendlineAnnotation as flag,type TrendlineAnnotationState as Flag} from './trendline-annotation-data';
import {measureWorkspaceJSON,prepareWorkspaceJSON} from '../ui/workspace-json';
import {assertNativeFibTrendLineModel,nativeFibTrendLineDefaults} from './fib-level-format-native';
import {FIB_TREND_LINE_FIELD,readFibTrendLine} from './fib-trend-line-data';
import type {FibTrendLineHitLease} from './fib-trend-line-runtime';
import {paintFibLevelPresentation,type FibLevelPresentationPaint} from './fib-level-presentation-painter';
export interface TrendlineAnnotationHost{captureOwner:()=>()=>void;unavailable:(message:string)=>void;/** Passive queue-only notification; never synchronously render or acquire layout here. */afterPaint?:(kind:'render'|'slices',outcome:Readonly<{succeeded:boolean;cause?:unknown}>)=>void}
export interface OwnedDrawingRenderObserver{before(kind:'render'|'slices'):void;after(kind:'render'|'slices',outcome:{succeeded:boolean;cause?:unknown}):void}
export interface OwnedDrawingRenderObservation{assertCurrent():void;dispose():void}
/** One synchronous delete query. The private registration owns its continuation. */
export interface OwnedDrawingDeleteInvocation{readonly args:readonly unknown[];invoke():unknown}
export interface OwnedDrawingDeleteDispatch{dispatch(invocation:OwnedDrawingDeleteInvocation):unknown}
export interface OwnedDrawingDeleteRegistration{assertCurrent():void;dispose():void}
type Data=Record<string,any>;
type Method=(this:any,...args:any[])=>any;
interface Claim{model:Data;text:unknown;flag:Flag}
interface Frame{checkSource:()=>void;drawings:Data[];external:unknown;claims:Map<object,Claim>;ordinals:Map<object,number>;transients:Set<object>;stats?:OwnedTrendlineStatisticsPass;statisticsToken?:object}
const installations=new WeakSet<object>();
const renderObservers=new WeakMap<object,(observer:OwnedDrawingRenderObserver)=>OwnedDrawingRenderObservation>();
const deleteDispatchers=new WeakMap<object,(hooks:OwnedDrawingDeleteDispatch)=>OwnedDrawingDeleteRegistration>();
/** Compose with the annotation-owned hit query without replacing its native slot. */
export function registerOwnedDrawingDeleteDispatch(renderer:NativeRenderer,hooks:OwnedDrawingDeleteDispatch):OwnedDrawingDeleteRegistration{const register=deleteDispatchers.get(renderer);if(!register)throw Error('Owned drawing delete query installation unavailable.');return register(hooks);}
export interface OwnedTrendlineLabelTarget{readonly id:string}
export interface OwnedTrendlineLabelEnvironment{
 readonly width:number;readonly height:number;readonly dpr:number;readonly globalAlpha:number;
 readonly clip:{left:number;top:number;right:number;bottom:number};
 readonly textState:Readonly<Record<string,string|undefined>>;
}
export interface OwnedTrendlineLabelAccessHost{
 captureDrawingOwner(id:string,record:Readonly<SerializedDrawing>):()=>void;
 captureLayoutOwner(paneId:string):()=>void;
 resolveInheritedDirection?(canvas:unknown):'ltr'|'rtl';
}
export interface OwnedTrendlineLabelAccess{
 withBudget<T>(action:()=>T):T;
 targets():readonly OwnedTrendlineLabelTarget[];
 describe(target:OwnedTrendlineLabelTarget):{readonly record:Readonly<SerializedDrawing>;readonly ordinal:number};
 assertCurrent(target:OwnedTrendlineLabelTarget):void;
 probe(target:OwnedTrendlineLabelTarget,value:string,context:CanvasRenderingContext2D):OwnedTrendlineLabelEnvironment;
 assertMeasurementContext(context:CanvasRenderingContext2D):void;
 mute(target:OwnedTrendlineLabelTarget):()=>void;
 dispose():void;
}
export interface OwnedTrendlineStatisticsTarget {
 readonly identity:object;readonly id:string;readonly paneId:string;
 readonly selected:boolean;readonly layer:'top'|'slice'|'selected-overlay';
 readonly anchors:readonly {time:number;price:number}[];
 assertCurrent():void;
 projected():Readonly<SerializedDrawing>;
}
export interface OwnedTrendlineStatisticsPass {
 paint(target:OwnedTrendlineStatisticsTarget,context:CanvasRenderingContext2D,projector:Readonly<Record<string,any>>,theme:Readonly<Record<string,any>>):void;
 dispose():void;
}
export interface OwnedTrendlineStatisticsHooks {
 begin(kind:'render'|'slices',assertFrame:()=>void,frameToken?:object):OwnedTrendlineStatisticsPass|undefined;
}
export interface OwnedTrendlineStatisticsRegistration{assertCurrent():void;invalidate():void;dispose():void}
export interface OwnedStatisticsFrameParts{assertSource(statisticsSource?:()=>void):void;assertLocal():void}
const statisticsFrames=new WeakMap<object,{renderer:NativeRenderer;registration:OwnedTrendlineStatisticsRegistration;parts:OwnedStatisticsFrameParts;retire():void}>();
const statisticsTargets=new WeakMap<object,{renderer:NativeRenderer;registration:OwnedTrendlineStatisticsRegistration;frameToken:object;local:()=>void}>();
/** Private exact frame/target provenance; these read-only components grant no publication authority. */
export function resolveOwnedStatisticsFrame(renderer:NativeRenderer,registration:OwnedTrendlineStatisticsRegistration,token:object):OwnedStatisticsFrameParts{const proof=statisticsFrames.get(token);if(!proof||proof.renderer!==renderer||proof.registration!==registration)throw Error('Statistics frame local proof has another owner');proof.parts.assertLocal();return proof.parts;}
export function resolveOwnedStatisticsTarget(renderer:NativeRenderer,registration:OwnedTrendlineStatisticsRegistration,token:object,target:OwnedTrendlineStatisticsTarget):()=>void{const proof=statisticsTargets.get(target);if(!proof||proof.renderer!==renderer||proof.registration!==registration||proof.frameToken!==token)throw Error('Statistics target local proof has another owner');proof.local();return proof.local;}
const statisticsSources=new WeakMap<object,(hooks:OwnedTrendlineStatisticsHooks)=>OwnedTrendlineStatisticsRegistration>();
/** One derived painter on the existing annotation installation; no native/model mutation authority. */
export function registerOwnedTrendlineStatistics(renderer:NativeRenderer,hooks:OwnedTrendlineStatisticsHooks):OwnedTrendlineStatisticsRegistration{const register=statisticsSources.get(renderer);if(!register)throw Error('Owned statistics annotation installation unavailable');return register(hooks);}
const labelSources=new WeakMap<object,(host:OwnedTrendlineLabelAccessHost)=>OwnedTrendlineLabelAccess>();
export interface OwnedFibTrendLineTarget {
 readonly identity:object;readonly id:string;readonly paneId:string;
 readonly scope:object;
 readonly mode:'committed'|'moving'|'clone'|'placing';
 readonly anchors:readonly {time:number;price:number}[];
 assertCurrent():void;assertLocal():void;
 projected():Readonly<SerializedDrawing>;
 origin():Readonly<SerializedDrawing>|undefined;
}
export interface OwnedFibTrendLineHooks {
 paint(target:OwnedFibTrendLineTarget,context:CanvasRenderingContext2D,projector:Record<string,any>,stroke:Function):void;
 paintWithLevels?(target:OwnedFibTrendLineTarget,context:CanvasRenderingContext2D,projector:Record<string,any>,theme:Record<string,any>,stroke:Function,invokeNative:(this:OwnedFibTrendLineTarget,options:FibLevelPresentationPaint)=>void):void;
 hit(target:OwnedFibTrendLineTarget,projector:Record<string,any>):FibTrendLineHitLease|undefined;
}
export interface OwnedFibTrendLineRegistration {assertCurrent():void;invalidate():void;dispose():void}
const fibSources=new WeakMap<object,(hooks:OwnedFibTrendLineHooks)=>OwnedFibTrendLineRegistration>();
const fibProjectors=new WeakMap<object,(model:Drawing)=>FibTrendLineHitLease|undefined>();
// A tail proves only its immediate return point, never an opaque callback or a
// later Canvas operation. No caller can mint a target or an after-local entry.
const fibProofTargets=new WeakMap<object,{local:()=>void;afterLocal:()=>void;adjacent:()=>boolean}>();
const fibProofTails=new WeakMap<Function,object>();
// The full ownership-graph walk runs
// once when a target is admitted and once when its frame or query completes,
// not on every local proof. Mid-frame mutation is still refused once per frame.
const fibGraphFinals=new WeakMap<object,()=>void>();
const proofGet=WeakMap.prototype.get,proofSet=WeakMap.prototype.set,proofApply=Reflect.apply;
const proofDescriptor=Object.getOwnPropertyDescriptor,proofPrototype=Object.getPrototypeOf,proofIs=Object.is;
const proofProviders:{owner:object;key:PropertyKey;descriptor:PropertyDescriptor;prototype:object|null}[]=[];
let fibProofProviderAdmission=true;
// Removed checks themselves use these mutable providers. A substituted provider
// must still run through the exhaustive path, including its callback effects.
for(const [owner,keys] of [
 [globalThis,['Object','Reflect','Array','Number','String','Map','WeakSet']],
 [Object,['getOwnPropertyDescriptor','getPrototypeOf','hasOwn','is']],
 [Reflect,['ownKeys','apply']],[Array,['isArray']],[Number,['isFinite']],
 [Array.prototype,[Symbol.iterator,'some','includes','at']],
 [Object.getPrototypeOf([][Symbol.iterator]()),['next']],
 [Map.prototype,['get']],[WeakSet.prototype,['has']],
] as readonly (readonly [object,readonly PropertyKey[]])[]){for(const key of keys){const descriptor=proofDescriptor(owner,key);if(!descriptor||!proofDescriptor(descriptor,'value'))fibProofProviderAdmission=false;else proofProviders.push({owner,key,descriptor,prototype:proofPrototype(owner)});}}
function fibProofProvidersCurrent():boolean{
 if(!fibProofProviderAdmission)return false;
 for(let i=0;i<proofProviders.length;i++){const pin=proofProviders[i],a=pin.descriptor,b=proofDescriptor(pin.owner,pin.key);if(proofPrototype(pin.owner)!==pin.prototype||!b||!proofIs(a.value,b.value)||a.get!==b.get||a.set!==b.set||a.writable!==b.writable||a.enumerable!==b.enumerable||a.configurable!==b.configurable)return false;}return true;
}
/** Opaque prefix, followed unconditionally by this genuine target's full local
 * proof. Reuse is limited to adjacent checks inside this synchronous composition. */
export function composeOwnedFibTargetProof(target:OwnedFibTrendLineTarget,prefix:()=>void,source:()=>void):Readonly<{local:()=>void;check:()=>void}>{
 const targetProof=proofApply(proofGet,fibProofTargets,[target]);if(!targetProof||typeof prefix!=='function'||typeof source!=='function')throw Error('Fibonacci proof composition requires a genuine target.');
 let retired=false,checking=false,localRunning=false;
 const runLocal=()=>{if(retired||localRunning){retired=true;throw Error('Fibonacci composed local proof retired or reentered.');}localRunning=true;try{prefix();if(retired)throw Error('Fibonacci composed local proof retired.');targetProof.local();if(retired)throw Error('Fibonacci composed local proof retired.');}catch(error){retired=true;throw error;}finally{localRunning=false;}};
 const local=()=>{if(checking){retired=true;throw Error('Fibonacci composed proof reentered.');}runLocal();};
 const check=()=>{if(retired||checking||localRunning){retired=true;throw Error('Fibonacci composed proof retired or reentered.');}checking=true;try{runLocal();targetProof.afterLocal();source();runLocal();}catch(error){retired=true;throw error;}finally{checking=false;}};
 proofApply(proofSet,fibProofTails,[local,target]);return Object.freeze({local,check});
}
/** The once-per-frame full ownership-graph walk that the annotation
 * runs when a genuine target's frame or query completes. Copied targets refuse. */
export function assertOwnedFibTargetGraph(target:OwnedFibTrendLineTarget):void{
 const final=proofApply(proofGet,fibGraphFinals,[target]);if(!final)throw Error('Fibonacci graph proof requires a genuine target.');final();
}
/** Only native drawingProjector invocations inside our query scope populate this
 * private map. Public-shaped projectors and callbacks cannot mint a hit lease. */
export function acquireOwnedFibTrendLineHit(model:Drawing,projector:object):FibTrendLineHitLease|undefined{return fibProjectors.get(projector)?.(model);}
export function registerOwnedFibTrendLine(renderer:NativeRenderer,hooks:OwnedFibTrendLineHooks):OwnedFibTrendLineRegistration{
 const acquire=fibSources.get(renderer);if(!acquire)throw Error('Owned Fibonacci annotation installation unavailable.');return acquire(hooks);
}
export const OWNED_TRENDLINE_STRUCTURAL_WORK=64000000;
/** Exclusive read/probe capability. Tokens expose no live model and never authorize publication. */
export function acquireOwnedTrendlineLabels(renderer:NativeRenderer,host:OwnedTrendlineLabelAccessHost):OwnedTrendlineLabelAccess{const acquire=labelSources.get(renderer);if(!acquire)throw Error('Owned Trendline label installation unavailable');return acquire(host);}
/** Exclusive lifecycle-bound observation; exposes no drawing claims or frame authority. */
export function observeOwnedDrawingRender(renderer:NativeRenderer,observer:OwnedDrawingRenderObserver):OwnedDrawingRenderObservation{const acquire=renderObservers.get(renderer);if(!acquire)throw Error('Owned annotation render installation unavailable');return acquire(observer);}
function own(value:unknown,key:string,optional=false):any{if(!value||typeof value!=='object')throw Error('Annotation owner unavailable: '+key);const d=Object.getOwnPropertyDescriptor(value,key);if(!d){if(optional)return undefined;throw Error('Annotation field unavailable: '+key);}if(!Object.hasOwn(d,'value'))throw Error('Annotation ownership requires data members: '+key);return d.value;}
function method(value:object,key:string,unclaimed=false):Method{if(unclaimed&&Object.hasOwn(value,key))throw Error('Annotation method already has an owner: '+key);for(let next:object|null=value;next;next=Object.getPrototypeOf(next)){const d=Object.getOwnPropertyDescriptor(next,key);if(d){if(!Object.hasOwn(d,'value')||typeof d.value!=='function')throw Error('Annotation method must be data: '+key);return d.value;}}throw Error('Annotation method unavailable: '+key);}

/** Original scoped wrappers around pinned native methods. Native render/layout/interaction bodies delegate intact. */
export function installTrendlineAnnotation(renderer:NativeRenderer,chart:Vela,host:TrendlineAnnotationHost):{diagnostics():ChartDiagnostic[];dispose():void}{
 if(!(renderer instanceof NativeRenderer)||installations.has(renderer))throw Error('Annotation renderer invalid or already installed');
 const afterPaint=own(host,'afterPaint',true);if(afterPaint!==undefined&&typeof afterPaint!=='function')throw Error('Annotation afterPaint requires a data callback');
 const core=own(chart,'orchestrator'),controller=own(renderer,'userDrawings'),painter=own(controller,'painter'),interaction=own(controller,'interaction'),sliceCache=own(controller,'sliceCache');
 if(own(core,'renderer')!==renderer||!(sliceCache instanceof Map)||Object.getPrototypeOf(sliceCache)!==Map.prototype)throw Error('Annotation renderer/controller ownership unavailable');
 const slots:Array<{owner:Data;key:string;original:Method;wrapper?:Method}>=[];
 const reserve=(owner:Data,key:string)=>{const slot={owner,key,original:method(owner,key,true),wrapper:undefined as Method|undefined};slots.push(slot);return slot;};
 const renderSlot=reserve(controller,'render'),sliceSlot=reserve(controller,'prepareSlices'),clonesSlot=reserve(interaction,'dragClones'),ghostSlot=reserve(interaction,'ghost'),labelSlot=reserve(painter,'paintLabel'),allSlot=reserve(painter,'paintAll'),paintGhostSlot=reserve(painter,'paintGhost');
 const fibPaintSlot=reserve(painter,'paintFibRatios'),fibProjectorSlot=reserve(renderer as unknown as Data,'drawingProjector');
 const fibQuerySlots=[reserve(interaction,'hitAt'),reserve(controller,'deleteAt'),reserve(controller,'updateHover'),reserve(controller,'dblClick')];
 let active=true,notifying=false,frames:Frame[]=[],diagnostics:ChartDiagnostic[]=[];
 let deleteDispatch:{hooks:OwnedDrawingDeleteDispatch;field:PropertyDescriptor;capture:PropertyDescriptor;live:boolean;assert:()=>void}|undefined;
 let deleteInvocation:{live:boolean}|undefined;
 let observer:{before:Method;after:Method;receiver:OwnedDrawingRenderObserver;retired:boolean}|undefined;
 let labelAccess:{retire():void;muted(model:Data):boolean}|undefined;
 let statistics:{hooks:OwnedTrendlineStatisticsHooks;begin:Method;live:boolean;registration?:OwnedTrendlineStatisticsRegistration}|undefined;
 let fib:{hooks:OwnedFibTrendLineHooks;paint:Method;paintWithLevels?:Method;hit:Method;live:boolean;registration?:OwnedFibTrendLineRegistration}|undefined;
 const fibQueries:{source:()=>void;active:boolean;releases:(()=>void)[];models:Map<object,()=>void>}[]=[],fibIdentities=new WeakMap<object,object>();
 const fibStroke=method(painter,'stroke'),fibApplyStroke=method(painter,'applyStroke'),fibBoundStroke=(...args:any[])=>Reflect.apply(fibStroke,painter,args);
 // Committed drawings paint inside the native pane clip scope; the placement preview reuses it.
 const ghostClip=method(painter,'paintClipped');
 interface FibNode {object:object;prototype:object|null;keys:PropertyKey[];descriptors:PropertyDescriptorMap}
 function fibGraph(root:object):FibNode[]{const result:FibNode[]=[],seen=new Set<object>();let count=0;function walk(value:object,depth:number){if(seen.has(value))return;seen.add(value);const descriptors=Object.getOwnPropertyDescriptors(value),keys=Reflect.ownKeys(descriptors);count+=keys.length;if(depth>32||count>50000)throw Error('Fibonacci ownership graph bound exceeded.');result.push({object:value,prototype:Object.getPrototypeOf(value),keys,descriptors});for(const key of keys){const d=descriptors[key as string];if(!Object.hasOwn(d,'value'))throw Error('Fibonacci ownership requires data descriptors.');if(d.value&&typeof d.value==='object')walk(d.value,depth+1);}}walk(root,0);return result;}
 function fibGraphCurrent(graph:FibNode[]){for(const node of graph){if(Object.getPrototypeOf(node.object)!==node.prototype)throw Error('Fibonacci target prototype changed.');const keys=Reflect.ownKeys(node.object);if(keys.length!==node.keys.length||keys.some((key,index)=>key!==node.keys[index]))throw Error('Fibonacci target fields changed.');for(const key of keys){const before=node.descriptors[key as string],after=Object.getOwnPropertyDescriptor(node.object,key);if(!after||!Object.hasOwn(after,'value')||!Object.is(before.value,after.value)||before.writable!==after.writable||before.enumerable!==after.enumerable||before.configurable!==after.configurable)throw Error('Fibonacci target data changed.');}}}
 function fibQueryTuple(model:Data):()=>void{
  assertNativeFibTrendLineModel(model);const nodes:{object:object;prototype:object|null;descriptors:PropertyDescriptorMap;keys:string[];closed:boolean}[]=[];
  const take=(object:object,keys:string[],closed=false)=>{const descriptors:PropertyDescriptorMap={};for(const key of keys){const d=Object.getOwnPropertyDescriptor(object,key);if(!d||!Object.hasOwn(d,'value'))throw Error('Fibonacci query requires data fields.');descriptors[key]=d;}nodes.push({object,prototype:Object.getPrototypeOf(object),descriptors,keys,closed});};
  take(model,['id','type','paneId','visible','locked','anchors',FIB_TREND_LINE_FIELD]);const anchors=own(model,'anchors');if(!Array.isArray(anchors)||anchors.length!==2)throw Error('Fibonacci query requires two original anchors.');take(anchors,['0','1','length']);for(let index=0;index<2;index++)take(own(anchors,String(index)),['time','price']);
  const baseline=own(model,FIB_TREND_LINE_FIELD);if(readFibTrendLine({[FIB_TREND_LINE_FIELD]:baseline},nativeFibTrendLineDefaults()).state==='unavailable')throw Error('Fibonacci query baseline is unsupported.');take(baseline,['schemaVersion','enabled','color','width','style'],true);let retired=false;
  return()=>{if(retired)throw Error('Fibonacci query model retired.');try{assertNativeFibTrendLineModel(model);for(const node of nodes){if(Object.getPrototypeOf(node.object)!==node.prototype||node.closed&&Reflect.ownKeys(node.object).length!==node.keys.length)throw Error('Fibonacci query shape changed.');for(const key of node.keys){const a=node.descriptors[key],b=Object.getOwnPropertyDescriptor(node.object,key);if(!b||!Object.hasOwn(b,'value')||!Object.is(a.value,b.value)||a.writable!==b.writable||a.enumerable!==b.enumerable||a.configurable!==b.configurable)throw Error('Fibonacci query geometry changed.');}}}catch(error){retired=true;throw error;}};
 }
 function fibTarget(model:Data,source:()=>void,scopeLocal:()=>void,frame?:Frame):OwnedFibTrendLineTarget|undefined{
  if(!fib||own(model,'type',true)!=='fibretracement')return;
  if(!frame){const query=fibQueries.at(-1),initial=query?.models.get(model);if(!initial)throw Error('Fibonacci model was not admitted before native query callbacks.');initial();}
  assertNativeFibTrendLineModel(model);const value=fib,state=own(interaction,'state'),kind=own(state,'kind'),array=own(controller,'drawings');if(!Array.isArray(array)||array.length>10000)throw Error('Fibonacci drawing capacity exceeded.');
  const ordinal=array.indexOf(model),id=own(model,'id'),paneId=own(model,'paneId'),serialize=method(model,'serialize'),graph=fibGraph(model),stateGraph=fibGraph(state);
  const ordinalKey=''+ordinal,ordinalDescriptor=ordinal>=0?proofDescriptor(array,ordinalKey):undefined;
  const adjacent=()=>{if(!fibProofProvidersCurrent())return false;if(ordinal<0)return true;const a=ordinalDescriptor,b=proofDescriptor(array,ordinalKey);return proofPrototype(array)===Array.prototype&&!!a&&!!b&&proofIs(a.value,model)&&proofIs(b.value,model)&&a.get===undefined&&a.set===undefined&&b.get===undefined&&b.set===undefined&&a.writable===b.writable&&a.enumerable===b.enumerable&&a.configurable===b.configurable;};
  let mode:OwnedFibTrendLineTarget['mode']='committed',originalAnchors:unknown;
  if(ordinal>=0&&kind==='pressed'&&own(state,'moved')===true&&!own(state,'clones',true)){
   if(own(state,'id')===id){mode='moving';originalAnchors=own(state,'orig');}
   else{const riders=own(state,'riders');if(Array.isArray(riders)){const rider=riders.find(row=>own(row,'id')===id);if(rider){mode='moving';originalAnchors=own(rider,'orig');}}}
  }else if(ordinal<0){
   if(!frame||!frame.transients.has(model))throw Error('Fibonacci transient has no frame provenance.');
   if(kind==='pressed'){const clones=own(state,'clones',true);if(Array.isArray(clones)){const clone=clones.find(row=>own(row,'d')===model);if(clone){mode='clone';originalAnchors=own(clone,'orig');}}}
   if(mode==='committed'&&kind==='placing'&&frame.transients.has(model)){assertNativeFibTrendLineModel(own(state,'draft'));mode='placing';}
   if(mode==='committed')throw Error('Fibonacci transient interaction is unavailable.');
  }
  if(typeof id!=='string'||typeof paneId!=='string')throw Error('Fibonacci target identity unavailable.');
  const anchors=own(model,'anchors');if(!Array.isArray(anchors)||anchors.length!==2)return;
  const points=Object.freeze(anchors.map(point=>Object.freeze({time:own(point,'time'),price:own(point,'price')})));
  let identity=fibIdentities.get(model);if(!identity){identity=Object.freeze({});fibIdentities.set(model,identity);}let retired=false,checking=false,graphDue=true;
  const graphs=()=>{fibGraphCurrent(graph);fibGraphCurrent(stateGraph);};
  const local=()=>{if(retired)throw Error('Fibonacci target retired.');try{scopeLocal();assertInstalled();if(fib!==value||!value.live||own(value.hooks,'paint')!==value.paint||own(value.hooks,'paintWithLevels',true)!==value.paintWithLevels||own(value.hooks,'hit')!==value.hit||own(controller,'drawings')!==array||own(interaction,'state')!==state||method(model,'serialize')!==serialize||method(painter,'stroke')!==fibStroke||method(painter,'applyStroke')!==fibApplyStroke||ordinal>=0&&array[ordinal]!==model||frame&&frames.at(-1)!==frame)throw Error('Fibonacci target owner changed.');assertNativeFibTrendLineModel(model);if(graphDue){graphDue=false;graphs();}}catch(error){retired=true;throw error;}};
  const final=()=>{if(retired)throw Error('Fibonacci target retired.');try{local();graphs();}catch(error){retired=true;throw error;}};
  const checkAfterLocal=(reuse:boolean)=>{if(retired)throw Error('Fibonacci target retired.');if(checking){retired=true;throw Error('Fibonacci target assertion reentered.');}checking=true;try{if(!reuse||!adjacent())local();source();local();}catch(error){retired=true;throw error;}finally{checking=false;}};
  const check=()=>checkAfterLocal(false);
  const projected=()=>{check();const raw=Reflect.apply(serialize,model,[]) as SerializedDrawing;check();const metrics=measureWorkspaceJSON({raw});if(metrics.bytes>1024*1024||metrics.nodes>50000||metrics.depth>32)throw Error('Fibonacci projection bound exceeded.');const record=structuredClone(raw);check();return record;};
  check();const target=Object.freeze({identity,scope:frame??fibQueries.at(-1)!,id,paneId,mode,anchors:points,assertCurrent:check,assertLocal:local,projected,origin(){const record=projected();if(mode==='placing')return;if(mode==='committed')return record;measureWorkspaceJSON({anchors:originalAnchors});const origin={...record,anchors:structuredClone(originalAnchors) as SerializedDrawing['anchors']};check();return origin;}});proofApply(proofSet,fibProofTargets,[target,{local,afterLocal:()=>checkAfterLocal(true),adjacent}]);proofApply(proofSet,fibGraphFinals,[target,final]);return target;
 }
 const statsTokens=new WeakMap<object,object>();
 const statsDiagnosticOwners=new WeakMap<ChartDiagnostic,()=>void>();
 const visibleDiagnostic=(row:ChartDiagnostic)=>{if(row.code!=='TRENDLINE_STATS_UNAVAILABLE')return true;try{const proof=statsDiagnosticOwners.get(row);if(!proof)return false;proof();return true;}catch{return false;}};
 function assertObserver(value:NonNullable<typeof observer>){assertInstalled();if(value.retired||observer!==value)throw Error('Owned drawing render observer retired');}
 function note(error:unknown){const message=String(error).slice(0,700);if(!diagnostics.some(d=>d.message===message))diagnostics=[...diagnostics.slice(-15),{code:'TRENDLINE_ANNOTATION_UNAVAILABLE',feature:'Trendline Text enabled',severity:'unavailable',message}];}
 function assertInstalled(){if(!active||own(chart,'orchestrator')!==core||own(core,'renderer')!==renderer||own(renderer,'userDrawings')!==controller||own(controller,'painter')!==painter||own(controller,'interaction')!==interaction||own(controller,'sliceCache')!==sliceCache||slots.some(slot=>own(slot.owner,slot.key,true)!==slot.wrapper))throw Error('Annotation painter ownership retired or changed');}
 function check(frame:Frame){assertInstalled();frame.checkSource();assertInstalled();if(own(controller,'drawings')!==frame.drawings||own(controller,'externalGhost',true)!==frame.external)throw Error('Annotation frame models changed');}
 function claim(frame:Frame,model:unknown){if(!model||typeof model!=='object'||own(model,'type',true)!=='trendline')return;const text=own(model,'text',true),value=flag(text);if(value.state==='unavailable')note(value.message);frame.claims.set(model,{model:model as Data,text,flag:value});}
 function notifyPaint(frame:Frame,kind:'render'|'slices',outcome:{succeeded:boolean;cause?:unknown}){
  if(!afterPaint||frames.length)return;
  try{check(frame);if(own(host,'afterPaint',true)!==afterPaint)throw Error('Annotation afterPaint callback changed');notifying=true;try{Reflect.apply(afterPaint,host,[kind,Object.freeze(outcome)]);}finally{notifying=false;}check(frame);if(own(host,'afterPaint',true)!==afterPaint)throw Error('Annotation afterPaint callback changed');}
  catch(error){notifying=false;try{check(frame);const message=('Inline settled-paint notification failed: '+String(error)).slice(0,700);if(!diagnostics.some(value=>value.message===message))diagnostics=[...diagnostics.slice(-15),{code:'TRENDLINE_INLINE_REFRESH_UNAVAILABLE',feature:'Trendline inline text',severity:'unavailable',message}];}catch{/* Retired paint cannot notify or report through a replacement. */}}
 }
 function scoped(slot:typeof renderSlot):Method{return function(...args:any[]){
  if(this!==slot.owner)return Reflect.apply(slot.original,this,args);if(notifying)throw Error('Annotation passive notification cannot render synchronously');assertInstalled();const source=host.captureOwner();assertInstalled();if(typeof source!=='function')throw Error('Annotation source lease unavailable');source();assertInstalled();
  const drawings=own(controller,'drawings');if(!Array.isArray(drawings)||drawings.length>10000)throw Error('Annotation frame drawing capacity exceeded');
  const frame:Frame={checkSource:source,drawings,external:own(controller,'externalGhost',true),claims:new Map(),ordinals:new Map(drawings.map((model,index)=>[model,index])),transients:new Set()};check(frame);for(const model of drawings){claim(frame,model);check(frame);}if(frame.external){frame.transients.add(frame.external as object);claim(frame,frame.external);}check(frame);
  const observed=observer,kind=slot===renderSlot?'render':'slices';let afterCalled=false,completion:{succeeded:boolean;cause?:unknown}={succeeded:false};
  const after=(outcome:{succeeded:boolean;cause?:unknown})=>{afterCalled=true;if(observed){assertObserver(observed);Reflect.apply(observed.after,observed.receiver,[kind,outcome]);assertObserver(observed);}};
  frames.push(frame);try{if(observed){assertObserver(observed);Reflect.apply(observed.before,observed.receiver,[kind]);assertObserver(observed);check(frame);}frame.stats=beginStatistics(frame,kind);const result=Reflect.apply(slot.original,slot.owner,args);check(frame);if(kind==='render')paintStatisticsOverlay(frame);check(frame);after({succeeded:true});check(frame);completion={succeeded:true};return result;}catch(cause){let error=cause;if(observed&&!afterCalled)try{after({succeeded:false,cause});}catch(cleanup){error=new AggregateError([cause,cleanup],'Owned drawing render and observer cleanup failed');}completion={succeeded:false,cause:error};note(error);try{check(frame);if(observed)assertObserver(observed);host.unavailable('Trendline annotation painting failed. Reopen the chart. '+String(error));}catch{/* A retired owner cannot quarantine its replacement. */}throw error;}finally{endStatistics(frame);const current=frames.pop();frame.claims.clear();if(current!==frame&&active){frames=[];throw Error('Annotation frame stack changed');}notifyPaint(frame,kind,completion);}
 };}
 renderSlot.wrapper=scoped(renderSlot);sliceSlot.wrapper=scoped(sliceSlot);
 function transient(slot:typeof ghostSlot,many:boolean):Method{return function(...args:any[]){if(this!==slot.owner)return Reflect.apply(slot.original,this,args);assertInstalled();const frame=frames.at(-1);if(frame)check(frame);const result=Reflect.apply(slot.original,slot.owner,args);assertInstalled();if(frame){check(frame);if(many&&result!==null){if(!Array.isArray(result)||result.length>10000)throw Error('Annotation transient capacity exceeded');for(const model of result){frame.transients.add(model);claim(frame,model);check(frame);}}else if(result){frame.transients.add(result);claim(frame,result);}check(frame);}return result;};}
 clonesSlot.wrapper=transient(clonesSlot,true);ghostSlot.wrapper=transient(ghostSlot,false);
 function fibQuery(slot:typeof fibQuerySlots[number],receiver:unknown,args:any[]){
  if(receiver!==slot.owner||!fib)return Reflect.apply(slot.original,receiver,args);
  assertInstalled();const expected=fib,captured=host.captureOwner();
  const source=()=>{assertInstalled();if(fib!==expected||!expected.live)throw Error('Fibonacci query registration changed.');captured();assertInstalled();if(fib!==expected||!expected.live)throw Error('Fibonacci query registration changed.');};
  source();const models=new Map<object,()=>void>(),drawings=own(controller,'drawings');if(!Array.isArray(drawings)||drawings.length>10000)throw Error('Fibonacci query capacity exceeded.');for(const model of drawings)if(own(model,'type',true)==='fibretracement'){try{models.set(model,fibQueryTuple(model));}catch(error){models.set(model,()=>{throw error;});}}source();const query={source,active:true,releases:[] as (()=>void)[],models};fibQueries.push(query);
  try{return Reflect.apply(slot.original,slot.owner,args);}finally{query.active=false;const errors:unknown[]=[];for(const release of query.releases.reverse())try{release();}catch(error){errors.push(error);}if(fibQueries.pop()!==query)errors.push(Error('Fibonacci query stack changed.'));if(errors.length)throw new AggregateError(errors,'Fibonacci query cleanup failed.');}
 }
 for(const slot of fibQuerySlots)slot.wrapper=function(...args:any[]){
  const dispatch=slot.owner===controller&&slot.key==='deleteAt'?deleteDispatch:undefined;
  if(!dispatch)return fibQuery(slot,this,args);
  if(this!==controller)throw Error('Owned drawing delete query receiver changed.');
  dispatch.assert();if(deleteInvocation){deleteInvocation.live=false;throw Error('Owned drawing delete query reentered.');}
  const token={live:true};deleteInvocation=token;let live=true,checking=false,used=false,completed=false,nativeResult:unknown,source:()=>unknown;
  const current=()=>{if(checking){live=false;throw Error('Owned drawing delete source assertion reentered.');}checking=true;try{dispatch.assert();if(!live||!token.live||deleteInvocation!==token)throw Error('Owned drawing delete continuation retired.');const result=source();if(result!==undefined)throw Error('Owned drawing delete source must finish synchronously.');dispatch.assert();if(!live||!token.live||deleteInvocation!==token)throw Error('Owned drawing delete continuation changed.');}catch(error){live=false;throw error;}finally{checking=false;}};
  let invocation:OwnedDrawingDeleteInvocation;
  invocation=Object.freeze({args:Object.freeze([...args]),invoke(this:OwnedDrawingDeleteInvocation){if(this!==invocation)throw Error('Foreign drawing delete continuation receiver.');if(used)throw Error('Owned drawing delete continuation consumed.');used=true;current();nativeResult=fibQuery(slot,controller,args);current();completed=true;return nativeResult;}});
  try{source=Reflect.apply(dispatch.capture.value,host,[]);dispatch.assert();if(typeof source!=='function')throw Error('Owned drawing delete source unavailable.');current();const result=Reflect.apply(dispatch.field.value,dispatch.hooks,[invocation]);current();if(!used||!completed||typeof result!=='boolean'||result!==nativeResult)throw Error('Owned drawing delete dispatch must return its synchronous native result.');return result;}
  finally{live=false;if(deleteInvocation===token)deleteInvocation=undefined;}
 };
 fibProjectorSlot.wrapper=function(...args:any[]){
  if(this!==renderer)return Reflect.apply(fibProjectorSlot.original,this,args);
  assertInstalled();const query=fibQueries.at(-1),result=Reflect.apply(fibProjectorSlot.original,renderer,args);assertInstalled();
  if(query&&fib){query.source();assertInstalled();if(!query.active||fibQueries.at(-1)!==query)throw Error('Fibonacci projector query retired.');
   if(fibProjectors.has(result))throw Error('Fibonacci projector already has an invocation.');
   const acquire=(model:Drawing)=>{if(!query.active||fibQueries.at(-1)!==query)throw Error('Fibonacci query projector retired.');query.source();assertInstalled();const target=fibTarget(model as unknown as Data,query.source,()=>{if(!query.active||fibQueries.at(-1)!==query)throw Error('Fibonacci query retired.');});if(!target||!fib)return;target.assertCurrent();let lease:FibTrendLineHitLease|undefined;try{lease=Reflect.apply(fib.hit,fib.hooks,[target,result]);target.assertCurrent();proofApply(proofGet,fibGraphFinals,[target])();return lease;}catch(error){try{lease?.dispose();}catch{/* No accepted action is returned after failed acquisition. */}throw error;}};
   fibProjectors.set(result,acquire);query.releases.push(()=>{if(fibProjectors.get(result)===acquire)fibProjectors.delete(result);});
  }return result;
 };
 fibPaintSlot.wrapper=function(ctx:CanvasRenderingContext2D,model:Data,proj:Data,theme:Data){
  if(this!==painter||!fib||own(model,'type',true)!=='fibretracement')return Reflect.apply(fibPaintSlot.original,this,[ctx,model,proj,theme]);
  assertInstalled();const frame=frames.at(-1);if(frame){check(frame);contextOwned(frame,ctx);const target=fibTarget(model,frame.checkSource,()=>checkFibFrameLocal(frame),frame);if(target){
   target.assertCurrent();const registration=fib;
   if(registration.paintWithLevels){
    let activeInvocation=true,used=false,invoking=false,retired=false;
    const proof=proofApply(proofGet,fibProofTargets,[target]);
    const assert=()=>{if(retired||!activeInvocation||frames.at(-1)!==frame||fib!==registration||!registration.live||own(registration.hooks,'paintWithLevels',true)!==registration.paintWithLevels)throw Error('Fibonacci native paint continuation retired.');target.assertCurrent();if(!proof?.adjacent()){checkFibFrameLocal(frame);target.assertLocal();}};
    const invoke=function(this:OwnedFibTrendLineTarget,options:FibLevelPresentationPaint){
     if(this!==target||used||invoking){retired=true;throw Error('Fibonacci native paint continuation reused or borrowed.');}used=true;invoking=true;
     try{assert();const operation=own(options,'check'),local=own(options,'local'),note=own(options,'note'),background=own(options,'background'),text=own(options,'text'),layout=own(options,'layout',true);if(typeof operation!=='function'||typeof local!=='function'||typeof note!=='function')throw Error('Fibonacci paint operation unavailable.');
      const tail=()=>{Reflect.apply(local,options,[]);if(proofApply(proofGet,fibProofTails,[local])!==target||!proof?.adjacent()){checkFibFrameLocal(frame);target.assertLocal();}};
      const owned=()=>{assert();Reflect.apply(operation,options,[]);assert();tail();};owned();const live=()=>{if(retired||!activeInvocation||frames.at(-1)!==frame)throw Error('Fibonacci native paint continuation retired.');frame.checkSource();};
      paintFibLevelPresentation(painter,fibPaintSlot.original,ctx,model,proj,theme,{background,text,layout,check:owned,local:tail,source:live,note(error){owned();Reflect.apply(note,options,[error]);owned();}});owned();
     }catch(error){retired=true;throw error;}finally{invoking=false;}
    };
    try{assert();const result=Reflect.apply(registration.paintWithLevels,registration.hooks,[target,ctx,proj,theme,fibBoundStroke,invoke]);assert();if(result!==undefined)throw Error('Fibonacci paint hook must complete synchronously without a returned value.');if(!used)throw Error('Fibonacci native paint continuation was not consumed.');proofApply(proofGet,fibGraphFinals,[target])();return result;}finally{activeInvocation=false;}
   }
   Reflect.apply(fib.paint,fib.hooks,[target,ctx,proj,fibBoundStroke]);target.assertCurrent();proofApply(proofGet,fibGraphFinals,[target])();
  }}
  return Reflect.apply(fibPaintSlot.original,painter,[ctx,model,proj,theme]);
 };
 function checkFibFrameLocal(frame:Frame){assertInstalled();if(frames.at(-1)!==frame||own(controller,'drawings')!==frame.drawings||own(controller,'externalGhost',true)!==frame.external)throw Error('Fibonacci paint frame retired.');}
 function contextOwned(frame:Frame,ctx:unknown){check(frame);if(ctx===own(controller,'ctx'))return;if(sliceCache.size>10000)throw Error('Annotation slice capacity exceeded');for(const canvas of sliceCache.values()){const get=method(canvas,'getContext'),actual=Reflect.apply(get,canvas,['2d']);check(frame);if(actual===ctx)return;}throw Error('Annotation frame canvas ownership unavailable');}
 /** A preview belongs to one pane exactly like its committed drawing: run the native
  * ghost body inside the native paintClipped scope for the ghost's paneId (hidden pane
  * paints nothing; a projector without pane rectangles keeps the unclipped body). */
 function ghostClipped(ctx:CanvasRenderingContext2D,args:any[]){
  if(method(painter,'paintClipped')!==ghostClip)throw Error('Annotation ghost pane clip changed');
  const ghost=args[0],proj=args[1];if(!ghost||typeof ghost!=='object'||!proj||typeof proj!=='object')return Reflect.apply(paintGhostSlot.original,painter,[ctx,...args]);
  let result:unknown;Reflect.apply(ghostClip,painter,[ctx,ghost,proj,()=>{result=Reflect.apply(paintGhostSlot.original,painter,[ctx,...args]);}]);return result;
 }
 function painting(slot:typeof allSlot):Method{const invoke=(ctx:CanvasRenderingContext2D,args:any[])=>slot===paintGhostSlot?ghostClipped(ctx,args):Reflect.apply(slot.original,slot.owner,[ctx,...args]);return function(ctx:CanvasRenderingContext2D,...args:any[]){if(this!==slot.owner)return Reflect.apply(slot.original,this,[ctx,...args]);assertInstalled();const frame=frames.at(-1);if(!frame)return invoke(ctx,args);check(frame);contextOwned(frame,ctx);const targets=own(painter,'targets');ctx.save();try{check(frame);return invoke(ctx,args);}finally{ctx.restore();painter.targets=targets;}};}
 allSlot.wrapper=painting(allSlot);paintGhostSlot.wrapper=painting(paintGhostSlot);
 function assertClaimFields(frame:Frame,model:Data){
  const captured=frame.claims.get(model);if(!captured)throw Error('Annotation model has no private frame claim');if(own(model,'type',true)!=='trendline')throw Error('Annotation model type changed during its owned frame');const text=own(model,'text',true),current=flag(text);
  if(text!==captured.text||current.state!==captured.flag.state||current.enabled!==captured.flag.enabled||current.member!==captured.flag.member)throw Error('Annotation flag changed during its owned frame');return current;
 }
 function assertClaim(frame:Frame,model:Data){check(frame);const current=assertClaimFields(frame,model);check(frame);return current;}
 function statsIssue(frame:Frame,error:unknown){try{check(frame);const message=('Trendline statistics unavailable: '+String(error)).slice(0,700);check(frame);diagnostics=diagnostics.filter(visibleDiagnostic);check(frame);if(!diagnostics.some(row=>row.code==='TRENDLINE_STATS_UNAVAILABLE'&&row.message===message)){const row:ChartDiagnostic={code:'TRENDLINE_STATS_UNAVAILABLE',feature:'Trendline statistics',severity:'unavailable',message};statsDiagnosticOwners.set(row,()=>check(frame));diagnostics=[...diagnostics.slice(-15),row];}}catch{/* No diagnostic through a retired frame. */}}

 function beginStatistics(frame:Frame,kind:'render'|'slices'){
  if(!statistics)return;const value=statistics;let pass:OwnedTrendlineStatisticsPass|undefined,retired=false;
  const local=()=>{if(retired)throw Error('Statistics frame retired');try{assertInstalled();if(frames.at(-1)!==frame||statistics!==value||!value.live||!value.registration||own(value.hooks,'begin')!==value.begin||own(controller,'drawings')!==frame.drawings||own(controller,'externalGhost',true)!==frame.external)throw Error('Statistics frame retired');}catch(error){retired=true;throw error;}};
  const source=(statisticsSource?:()=>void)=>{local();try{if(statisticsSource){statisticsSource();local();}frame.checkSource();local();}catch(error){retired=true;throw error;}};
  try{check(frame);if(!value.live||!value.registration||own(value.hooks,'begin')!==value.begin)throw Error('Statistics hook retired');const assert=()=>{source();};assert();
   const token=Object.freeze({}),parts=Object.freeze({assertSource:source,assertLocal:local});frame.statisticsToken=token;statisticsFrames.set(token,{renderer,registration:value.registration,parts,retire(){retired=true;}});
   pass=Reflect.apply(value.begin,value.hooks,[kind,assert,token]);assert();if(pass!==undefined&&(typeof own(pass,'paint')!=='function'||typeof own(pass,'dispose')!=='function'))throw Error('Statistics pass unavailable');return pass;
  }catch(error){retired=true;let problem=error;if(pass)try{Reflect.apply(method(pass,'dispose'),pass,[]);}catch(cleanup){problem=new AggregateError([error,cleanup],'Statistics pass acquisition and cleanup failed');}statsIssue(frame,problem);}
 }

 function endStatistics(frame:Frame){const pass=frame.stats;frame.stats=undefined;if(frame.statisticsToken){statisticsFrames.get(frame.statisticsToken)?.retire();statisticsFrames.delete(frame.statisticsToken);}if(pass)try{Reflect.apply(method(pass,'dispose'),pass,[]);}catch(error){statsIssue(frame,error);}}
 function statisticsTarget(frame:Frame,model:Data,layer:OwnedTrendlineStatisticsTarget['layer']):OwnedTrendlineStatisticsTarget|undefined{
  check(frame);if(frames.at(-1)!==frame||!frame.stats||!frame.claims.has(model))return;const ordinal=frame.ordinals.get(model);if(ordinal===undefined||frame.transients.has(model)||own(model,'type')!=='trendline'||own(model,'visible')!==true)return;
  const selectedSet=own(controller,'selectedIds'),state=own(interaction,'state'),stateKind=own(state,'kind'),moving=Reflect.apply(method(interaction,'movingIds'),interaction,[]);check(frame);
  if(!(selectedSet instanceof Set)||Object.getPrototypeOf(selectedSet)!==Set.prototype||!(moving instanceof Set)||Set.prototype.has.call(moving,own(model,'id')))return;
  const selected=Set.prototype.has.call(selectedSet,own(model,'id')),anchors=own(model,'anchors');if(!Array.isArray(anchors)||anchors.length<2)return;
  const points=anchors.slice(0,2).map(point=>Object.freeze({time:own(point,'time'),price:own(point,'price')}));if(points.some(point=>!Number.isFinite(point.time)||!Number.isFinite(point.price)))throw Error('Statistics anchors unavailable');
  const paneId=own(model,'paneId'),id=own(model,'id'),serialize=method(model,'serialize');let token=statsTokens.get(model);if(!token){token=Object.freeze({});statsTokens.set(model,token);}let retired=false;
  const fields=()=>{if(frames.at(-1)!==frame||!frame.stats||frame.drawings[ordinal]!==model||own(model,'type')!=='trendline'||own(model,'id')!==id||own(model,'paneId')!==paneId||own(model,'visible')!==true||own(controller,'selectedIds')!==selectedSet||Set.prototype.has.call(selectedSet,id)!==selected||own(interaction,'state')!==state||own(state,'kind')!==stateKind||own(model,'anchors')!==anchors||method(model,'serialize')!==serialize||points.some((point,index)=>own(anchors[index],'time')!==point.time||own(anchors[index],'price')!==point.price))throw Error('Statistics target changed');};
  const local=()=>{if(retired)throw Error('Statistics target retired');try{const proof=frame.statisticsToken&&statisticsFrames.get(frame.statisticsToken);if(!proof)throw Error('Statistics target frame retired');proof.parts.assertLocal();fields();assertClaimFields(frame,model);}catch(error){retired=true;throw error;}};
  const assert=()=>{if(retired)throw Error('Statistics target retired');try{check(frame);fields();assertClaim(frame,model);}catch(error){retired=true;throw error;}};
  assert();const target=Object.freeze({identity:token,id,paneId,selected,layer,anchors:Object.freeze(points),assertCurrent:assert,projected(){assert();const raw=Reflect.apply(serialize,model,[]);assert();const metrics=measureWorkspaceJSON({raw});if(metrics.bytes>1024*1024||metrics.nodes>50000||metrics.depth>32)throw Error('Statistics projection bound exceeded');const record=prepareWorkspaceJSON({raw}).raw as SerializedDrawing;const freeze=(value:any):any=>{if(value&&typeof value==='object'){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;};freeze(record);assert();return record;}});
  if(!frame.statisticsToken||!statistics?.registration)throw Error('Statistics target registration retired');statisticsTargets.set(target,{renderer,registration:statistics.registration,frameToken:frame.statisticsToken,local});return target;
 }
 function paintStatistics(frame:Frame,model:Data,ctx:CanvasRenderingContext2D,proj:Data,theme:Data,layer:OwnedTrendlineStatisticsTarget['layer']){if(!frame.stats)return;try{const target=statisticsTarget(frame,model,layer);if(!target)return;contextOwned(frame,ctx);target.assertCurrent();Reflect.apply(method(frame.stats,'paint'),frame.stats,[target,ctx,proj,theme]);}catch(error){statsIssue(frame,error);}}
 function paintStatisticsOverlay(frame:Frame){if(!frame.stats)return;try{check(frame);const onScreen=method(controller,'onScreen'),shown=Reflect.apply(onScreen,controller,[]);check(frame);if(!Array.isArray(shown)||shown.length>10000)throw Error('Statistics visible row bound exceeded');const deps=own(controller,'deps'),proj=Reflect.apply(method(deps,'projector'),deps,[]);check(frame);const theme=Reflect.apply(method(deps,'theme'),deps,[]);check(frame);const ctx=own(controller,'ctx');for(const model of shown){check(frame);if(frame.ordinals.has(model)&&own(model,'type',true)==='trendline'&&own(model,'visible')===true){const interleaved=Reflect.apply(method(controller,'isInterleaved'),controller,[model]);check(frame);if(interleaved&&!Set.prototype.has.call(own(controller,'lifted'),own(model,'id')))paintStatistics(frame,model,ctx,proj,theme,'selected-overlay');}}}catch(error){statsIssue(frame,error);}}
 labelSlot.wrapper=function(ctx:CanvasRenderingContext2D,model:Data,...args:any[]){
  if(this!==painter)return Reflect.apply(labelSlot.original,this,[ctx,model,...args]);assertInstalled();const frame=frames.at(-1);if(!frame||!frame.claims.has(model))return Reflect.apply(labelSlot.original,painter,[ctx,model,...args]);
  check(frame);contextOwned(frame,ctx);const current=assertClaim(frame,model);
  const paintDerived=()=>paintStatistics(frame,model,ctx,args[0],args[1],frame.stats&&ctx===own(controller,'ctx')?'top':'slice');
  if(current.state==='supported'&&!current.enabled){paintDerived();return;}
  if(labelAccess?.muted(model)){paintDerived();return;}
  // Native layout calls projector/model callbacks before glyphs. Guard the actual glyph boundary
  // through a temporary context view and unwind native saves if one of those callbacks retires it.
  let depth=0;const cache=new Map<PropertyKey,unknown>(),save=method(ctx,'save'),restore=method(ctx,'restore');
  const view=new Proxy(ctx,{get(target,key){if(cache.has(key))return cache.get(key);let value:unknown;
   if(key==='save')value=()=>{assertClaim(frame,model);Reflect.apply(save,target,[]);depth++;};
   else if(key==='restore')value=()=>{if(depth<=0)throw Error('Annotation native label restored an unowned canvas frame');Reflect.apply(restore,target,[]);depth--;};
   else if(key==='fillText'||key==='strokeText'){const original=method(target,key);value=(...values:any[])=>{assertClaim(frame,model);if(method(target,key)!==original)throw Error('Annotation glyph method changed');const result=Reflect.apply(original,target,values);assertClaim(frame,model);return result;};}
   else{const raw=Reflect.get(target,key,target);value=typeof raw==='function'?raw.bind(target):raw;}
   if(typeof value==='function')cache.set(key,value);return value;
  },set(target,key,value){return Reflect.set(target,key,value,target);}});
  let result:unknown;Reflect.apply(save,ctx,[]);try{result=Reflect.apply(labelSlot.original,painter,[view,model,...args]);}finally{while(depth>0){Reflect.apply(restore,ctx,[]);depth--;}Reflect.apply(restore,ctx,[]);}paintDerived();return result;
 };
 const written:typeof slots=[],attempted:typeof slots=[];
 function assertInstallationProgress(){if(!active||own(chart,'orchestrator')!==core||own(core,'renderer')!==renderer||own(renderer,'userDrawings')!==controller||own(controller,'painter')!==painter||own(controller,'interaction')!==interaction||own(controller,'sliceCache')!==sliceCache)throw Error('Annotation owner changed during installation');for(const slot of slots){if(written.includes(slot)){if(own(slot.owner,slot.key,true)!==slot.wrapper)throw Error('Annotation method ownership changed during installation');}else if(Object.hasOwn(slot.owner,slot.key)||method(slot.owner,slot.key)!==slot.original)throw Error('Annotation method ownership changed during installation');}}
 try{for(const slot of slots){assertInstallationProgress();attempted.push(slot);Object.defineProperty(slot.owner,slot.key,{configurable:true,writable:true,value:slot.wrapper});written.push(slot);}assertInstallationProgress();}catch(error){active=false;const failures=[error];for(const slot of [...attempted].reverse())try{if(own(slot.owner,slot.key,true)===slot.wrapper){delete slot.owner[slot.key];if(Object.hasOwn(slot.owner,slot.key)||method(slot.owner,slot.key)!==slot.original)throw Error('Annotation install cleanup did not restore its method');}else if(written.includes(slot))throw Error('Annotation install cleanup lost a method');}catch(cleanup){failures.push(cleanup);}throw failures.length===1?error:new AggregateError(failures,'Annotation installation failed');}
 installations.add(renderer);
 deleteDispatchers.set(renderer,hooks=>{
  assertInstalled();if(deleteDispatch)throw Error('Owned drawing delete query already registered.');
  const field=Object.getOwnPropertyDescriptor(hooks,'dispatch'),capture=Object.getOwnPropertyDescriptor(host,'captureOwner');
  if(!field||!Object.hasOwn(field,'value')||typeof field.value!=='function'||!capture||!Object.hasOwn(capture,'value')||typeof capture.value!=='function')throw Error('Owned drawing delete callbacks require data functions.');
  const same=(actual:PropertyDescriptor|undefined,expected:PropertyDescriptor)=>!!actual&&Object.hasOwn(actual,'value')&&actual.value===expected.value&&actual.writable===expected.writable&&actual.configurable===expected.configurable&&actual.enumerable===expected.enumerable;
  let checking=false;
  const value={hooks,field,capture,live:true,assert:()=>{if(checking){value.live=false;throw Error('Owned drawing delete registration assertion reentered.');}checking=true;try{assertInstalled();if(deleteDispatch!==value||!value.live||!same(Object.getOwnPropertyDescriptor(hooks,'dispatch'),field)||!same(Object.getOwnPropertyDescriptor(host,'captureOwner'),capture)||!value.live||deleteDispatch!==value)throw Error('Owned drawing delete registration changed.');}catch(error){value.live=false;throw error;}finally{checking=false;}}};
  assertInstalled();if(deleteDispatch)throw Error('Owned drawing delete query acquired reentrantly.');
  deleteDispatch=value;let registration:OwnedDrawingDeleteRegistration;
  registration=Object.freeze({assertCurrent(this:OwnedDrawingDeleteRegistration){if(this!==registration)throw Error('Foreign drawing delete registration receiver.');value.assert();},dispose(this:OwnedDrawingDeleteRegistration){if(this!==registration)throw Error('Foreign drawing delete registration receiver.');value.live=false;if(deleteDispatch===value)deleteDispatch=undefined;}});return registration;
 });
 fibSources.set(renderer,hooks=>{assertInstalled();if(fib)throw Error('Fibonacci trend-line painter already registered.');const paint=own(hooks,'paint'),hit=own(hooks,'hit'),paintWithLevels=own(hooks,'paintWithLevels',true);if(typeof paint!=='function'||typeof hit!=='function'||paintWithLevels!==undefined&&typeof paintWithLevels!=='function')throw Error('Fibonacci hooks require data functions.');const deps=own(controller,'deps'),request=method(deps,'requestDataPaint'),value={hooks,paint,paintWithLevels,hit,live:true,registration:undefined as OwnedFibTrendLineRegistration|undefined};fib=value;
  const assert=()=>{assertInstalled();if(fib!==value||!value.live||own(hooks,'paint')!==paint||own(hooks,'paintWithLevels',true)!==paintWithLevels||own(hooks,'hit')!==hit||own(controller,'deps')!==deps||method(deps,'requestDataPaint')!==request)throw Error('Fibonacci trend-line registration retired.');};
  const registration:OwnedFibTrendLineRegistration=Object.freeze({assertCurrent:assert,invalidate(){assert();const source=host.captureOwner();assert();source();Reflect.apply(request,deps,[]);source();assert();},dispose(){if(!value.live)return;value.live=false;if(fib===value)fib=undefined;}});value.registration=registration;return registration;
 });
 statisticsSources.set(renderer,hooks=>{assertInstalled();if(statistics)throw Error('Statistics painter already registered');const begin=own(hooks,'begin');if(typeof begin!=='function')throw Error('Statistics begin requires a data callback');const deps=own(controller,'deps'),request=method(deps,'requestDataPaint'),value:{hooks:OwnedTrendlineStatisticsHooks;begin:Method;live:boolean;registration?:OwnedTrendlineStatisticsRegistration}={hooks,begin,live:true};assertInstalled();if(statistics)throw Error('Statistics acquired reentrantly');statistics=value;const assert=()=>{assertInstalled();if(statistics!==value||!value.live||own(hooks,'begin')!==begin||own(controller,'deps')!==deps||method(deps,'requestDataPaint')!==request)throw Error('Statistics registration retired');};const registration:OwnedTrendlineStatisticsRegistration=Object.freeze({assertCurrent:assert,invalidate(){assert();const source=host.captureOwner();assert();source();Reflect.apply(request,deps,[]);source();assert();},dispose(){if(!value.live)return;value.live=false;if(statistics===value)statistics=undefined;}});value.registration=registration;return registration;});
 labelSources.set(renderer,candidate=>{
  assertInstalled();if(labelAccess)throw Error('Owned Trendline labels already have an owner');
  const capture=own(candidate,'captureDrawingOwner'),captureLayout=own(candidate,'captureLayoutOwner'),resolve=own(candidate,'resolveInheritedDirection',true);
  if(typeof capture!=='function'||typeof captureLayout!=='function'||resolve!==undefined&&typeof resolve!=='function')throw Error('Owned Trendline label host requires data callbacks');
  const deps=own(controller,'deps'),onScreen=method(controller,'onScreen'),project=method(deps,'projector'),themeMethod=method(deps,'theme'),dprMethod=method(deps,'dpr');
  const tokens=new WeakMap<object,Entry>(),models=new WeakMap<object,Entry>();let live=true,busy=false,muted:Entry|undefined,work:{remaining:number}|undefined;
  function charge(count:number){if(work&&(work.remaining-=count)<0)throw Error('Trendline combined structural work bound exceeded');}
  interface GraphNode{object:object;prototype:object|null;descriptors:PropertyDescriptorMap;keys:PropertyKey[]}
  interface Entry{token:OwnedTrendlineLabelTarget;model:Data;array:Data[];order:Data[];ordinal:number;record:SerializedDrawing;graph:GraphNode[];source:()=>void;owner:()=>void;active:boolean;serialize:Method;writeProps:Method}
  function base(){assertInstalled();if(!live||labelAccess!==registration||own(controller,'deps')!==deps||method(controller,'onScreen')!==onScreen||method(deps,'projector')!==project||method(deps,'theme')!==themeMethod||method(deps,'dpr')!==dprMethod||own(candidate,'captureDrawingOwner')!==capture||own(candidate,'captureLayoutOwner')!==captureLayout||own(candidate,'resolveInheritedDirection',true)!==resolve)throw Error('Owned Trendline label access retired or changed');}
  function safe<T>(value:T):T{const metrics=measureWorkspaceJSON({value});if(metrics.bytes>1024*1024||metrics.nodes>50000||metrics.depth>32)throw Error('Trendline label data bound exceeded');return prepareWorkspaceJSON({value}).value as T;}
  function freeze<T>(value:T):T{if(value&&typeof value==='object'){for(const field of Object.values(value))freeze(field);Object.freeze(value);}return value;}
  function nativeData(model:Data):Data{
   if(!(model instanceof Drawing))throw Error('Trendline label requires a native model');
   const data:Data={};for(const[key,descriptor]of Object.entries(Object.getOwnPropertyDescriptors(model))){if(!Object.hasOwn(descriptor,'value')||typeof descriptor.value==='function')throw Error('Trendline label model requires plain data');data[key]=descriptor.value;}
   const admitted=safe(data);if(admitted.type!=='trendline'||typeof admitted.id!=='string'||!Array.isArray(admitted.anchors)||admitted.anchors.length<2||admitted.anchors.length>10000)throw Error('Trendline label model geometry unavailable');
   if(admitted.text!==undefined&&(typeof admitted.text?.value!=='string'||admitted.text.value.length>20000))throw Error('Trendline label text bound exceeded');
   return admitted;
  }
  function read(model:Data):SerializedDrawing{
   const admitted=nativeData(model);
   const serialize=method(model,'serialize'),writeProps=method(model,'writeProps'),record=safe(Reflect.apply(serialize,model,[])) as SerializedDrawing;
   if(method(model,'serialize')!==serialize||method(model,'writeProps')!==writeProps||record.type!=='trendline'||record.id!==admitted.id)throw Error('Trendline label serializer changed');return record;
  }
  function graphOfObject(object:object):GraphNode[]{const result:GraphNode[]=[],visited=new Set<object>();let nodes=0;function walk(object:object,depth:number){if(visited.has(object))return;visited.add(object);const descriptors=Object.getOwnPropertyDescriptors(object),keys=Reflect.ownKeys(descriptors);nodes+=keys.length;if(nodes>50000||depth>32)throw Error('Trendline label descriptor graph bound exceeded');for(const field of Object.values(descriptors))if(!Object.hasOwn(field,'value'))throw Error('Trendline label environment requires data fields');result.push({object,prototype:Object.getPrototypeOf(object),descriptors,keys});for(const field of Object.values(descriptors))if(field.value&&typeof field.value==='object')walk(field.value,depth+1);}walk(object,0);return result;}
  function graphOf(model:Data):GraphNode[]{nativeData(model);return graphOfObject(model);}
  function graphSize(graph:GraphNode[]){return graph.reduce((count,node)=>count+node.keys.length,0);}
  function assertGraph(graph:GraphNode[]){for(const node of graph){charge(node.keys.length+1);if(Object.getPrototypeOf(node.object)!==node.prototype)throw Error('Trendline native field prototype changed');const descriptors=Object.getOwnPropertyDescriptors(node.object),keys=Reflect.ownKeys(descriptors);if(keys.length!==node.keys.length||keys.some((key,index)=>key!==node.keys[index]))throw Error('Trendline native field ownership changed');for(const key of node.keys){const before=node.descriptors[key as string],after=descriptors[key as string];if(!after||!Object.hasOwn(after,'value')||after.value!==before.value||after.enumerable!==before.enumerable||after.configurable!==before.configurable||after.writable!==before.writable)throw Error('Trendline native field value or ownership changed');}}}
  function shown(){base();charge(own(controller,'drawings').length);const rows=Reflect.apply(onScreen,controller,[]);base();if(!Array.isArray(rows)||rows.length>10000)throw Error('Trendline label row bound exceeded');return rows as Data[];}
  const checking=new WeakSet<Entry>();
  function assertEntry(entry:Entry){
   if(checking.has(entry))throw Error('Trendline label owner assertion reentered');checking.add(entry);
   try{charge(32+entry.array.length*2);base();if(!entry.active)throw Error('Trendline label target retired');entry.source();base();entry.owner();base();
    if(own(controller,'drawings')!==entry.array||entry.array[entry.ordinal]!==entry.model||own(entry.model,'type')!=='trendline'||own(entry.model,'visible')!==true||own(entry.model,'locked')!==false||method(entry.model,'serialize')!==entry.serialize||method(entry.model,'writeProps')!==entry.writeProps)throw Error('Trendline label target identity changed');
    if(!shown().includes(entry.model))throw Error('Trendline label target settings changed');entry.source();entry.owner();base();assertGraph(entry.graph);
    if(!entry.active||own(controller,'drawings')!==entry.array||entry.array.length!==entry.order.length||entry.array.some((model,index)=>model!==entry.order[index])||method(entry.model,'serialize')!==entry.serialize||method(entry.model,'writeProps')!==entry.writeProps)throw Error('Trendline label target membership or settings changed');
   }catch(error){entry.active=false;if(muted===entry)muted=undefined;throw error;}finally{checking.delete(entry);}
  }
  function entryOf(target:OwnedTrendlineLabelTarget){base();const entry=target&&typeof target==='object'?tokens.get(target):undefined;if(!entry)throw Error('Trendline label target is not privately owned');assertEntry(entry);return entry;}
  function exclusive<T>(action:()=>T):T{base();if(busy)throw Error('Trendline label probe reentered');busy=true;try{return action();}finally{busy=false;}}
  const registration={retire(){live=false;if(muted)muted.active=false;muted=undefined;},muted(model:Data){if(muted?.model!==model)return false;try{assertEntry(muted);return true;}catch{return false;}}};
  let access:OwnedTrendlineLabelAccess;
  access=Object.freeze({
   withBudget<T>(action:()=>T):T{if(this!==access)throw Error('Trendline label access receiver changed');base();if(work)throw Error('Trendline label work scope reentered');work={remaining:OWNED_TRENDLINE_STRUCTURAL_WORK};try{return action();}finally{work=undefined;}},
   targets(){if(this!==access)throw Error('Trendline label access receiver changed');return exclusive(()=>{
    const array=own(controller,'drawings');if(!Array.isArray(array)||array.length>10000)throw Error('Trendline label row bound exceeded');const visible=shown(),result:OwnedTrendlineLabelTarget[]=[];
    const eligible=array.reduce((count,model)=>count+(own(model,'type',true)==='trendline'?1:0),0);if(eligible*array.length*16>(work?.remaining??OWNED_TRENDLINE_STRUCTURAL_WORK))throw Error('Trendline combined row-discovery work bound exceeded before probing');
    for(let ordinal=0;ordinal<array.length;ordinal++){const model=array[ordinal];base();if(own(model,'type',true)!=='trendline'||own(model,'visible',true)!==true||own(model,'locked',true)!==false||!visible.includes(model))continue;
     const state=flag(own(model,'text',true));if(state.state==='unavailable'||!state.enabled)continue;
     let entry=models.get(model);if(entry)try{assertEntry(entry);}catch{entry=undefined;}
     if(!entry){const source=host.captureOwner();source();base();const graph=graphOf(model),record=read(model);assertGraph(graph);source();base();const snapshot=freeze(safe(record)),owner=Reflect.apply(capture,candidate,[record.id,snapshot]);source();base();if(typeof owner!=='function')throw Error('Trendline label drawing owner unavailable');owner();base();assertGraph(graph);
      const token=Object.freeze({id:record.id}),created:Entry={token,model,array,order:[...array],ordinal,record:snapshot,graph,source,owner:owner as ()=>void,active:true,serialize:method(model,'serialize'),writeProps:method(model,'writeProps')};tokens.set(token,created);models.set(model,created);entry=created;assertEntry(created);
     }result.push(entry!.token);
    }base();return Object.freeze(result);
   });},
   describe(target:OwnedTrendlineLabelTarget){if(this!==access)throw Error('Trendline label access receiver changed');return exclusive(()=>{const entry=entryOf(target);return Object.freeze({record:entry.record,ordinal:entry.ordinal});});},
   assertCurrent(target:OwnedTrendlineLabelTarget){if(this!==access)throw Error('Trendline label access receiver changed');exclusive(()=>{entryOf(target);});},
   assertMeasurementContext(context:CanvasRenderingContext2D){if(this!==access)throw Error('Trendline label access receiver changed');base();if(!context||context===own(controller,'ctx')||context.canvas===own(controller,'canvas')||[...sliceCache.values()].some(canvas=>canvas===context.canvas))throw Error('Trendline measurement context must be private');base();},
   probe(target:OwnedTrendlineLabelTarget,value:string,context:CanvasRenderingContext2D){if(this!==access)throw Error('Trendline label access receiver changed');if(typeof value!=='string'||value.length>20000)throw Error('Trendline draft exceeds the 20000 UTF-16-unit bound');return exclusive(()=>{
    const entry=entryOf(target);const layout=Reflect.apply(captureLayout,candidate,[entry.record.paneId]);assertEntry(entry);if(typeof layout!=='function')throw Error('Trendline layout owner unavailable');const environmentGraphs:GraphNode[][]=[],paintState:Array<{context:Data;key:string;value:unknown}>=[];
    const check=()=>{assertEntry(entry);layout();assertEntry(entry);for(const graph of environmentGraphs)assertGraph(graph);charge(paintState.length);for(const field of paintState)if(Reflect.get(field.context,field.key,field.context)!==field.value)throw Error('Trendline live text shaping state changed');assertEntry(entry);layout();assertEntry(entry);for(const graph of environmentGraphs)assertGraph(graph);};check();const record=safe(entry.record);record.text={...safe(record.text??{value:''}),value} as NonNullable<SerializedDrawing['text']>;
    check();const clone=deserializeDrawing(record);check();if(!clone||Object.getPrototypeOf(clone)!==Object.getPrototypeOf(entry.model)||['serialize','writeProps','handlePoints','pixels'].some(key=>method(clone,key)!==method(entry.model,key)))throw Error('Trendline detached native provenance unavailable');
    const projection=Reflect.apply(project,deps,[]);check();environmentGraphs.push(graphOfObject(projection));const theme=Reflect.apply(themeMethod,deps,[]);check();environmentGraphs.push(graphOfObject(theme));const dpr=Reflect.apply(dprMethod,deps,[]);check();
    for(const key of ['fontFamily','background','textColor'])if(typeof own(theme,key)!=='string'||own(theme,key).length>4096)throw Error('Trendline native text theme requires bounded primitive strings');
    let lines=1,nonempty=0,content=false;for(let index=0;index<value.length;index++){if(value[index]==='\n'){if(content)nonempty++;content=false;lines++;}else if(!/\s/.test(value[index]))content=true;}if(content)nonempty++;
    const perCheck=6*(entry.array.length*4+graphSize(entry.graph)+64)+environmentGraphs.reduce((count,graph)=>count+graphSize(graph)*2,0),estimated=(256+lines*4+nonempty*24)*perCheck;
    if(estimated>(work?.remaining??OWNED_TRENDLINE_STRUCTURAL_WORK))throw Error('Trendline combined layout work bound exceeded before measurement');
    const width=own(projection,'width'),height=own(projection,'height');if(![width,height,dpr].every(value=>typeof value==='number'&&Number.isFinite(value)&&value>0))throw Error('Trendline viewport unavailable');
    const clip={left:0,top:0,right:width,bottom:height},pane=own(projection,'paneRect',true);if(pane!==undefined){if(typeof pane!=='function')throw Error('Trendline pane callback unavailable');const rect=Reflect.apply(pane,projection,[record.paneId]) as Data;check();if(!rect||![rect.top,rect.height].every(Number.isFinite)||rect.height<=0)throw Error('Trendline pane unavailable');clip.top=rect.top;clip.bottom=rect.top+rect.height;if(!Number.isFinite(clip.bottom))throw Error('Trendline pane clip is not finite');}
    const textState:Record<string,string|undefined>={},keys=['direction','fontKerning','fontStretch','fontVariantCaps','textRendering','letterSpacing','wordSpacing'];
    const contexts=[own(controller,'ctx')];if(sliceCache.size>10000)throw Error('Trendline slice capacity exceeded');for(const canvas of sliceCache.values()){const context=Reflect.apply(method(canvas,'getContext'),canvas,['2d']);check();if(context)contexts.push(context);}
    let globalAlpha=1;for(const ctx of contexts){const currentAlpha=Reflect.get(ctx,'globalAlpha',ctx);paintState.push({context:ctx,key:'globalAlpha',value:currentAlpha});check();if(typeof currentAlpha!=='number'||!Number.isFinite(currentAlpha)||currentAlpha<0||currentAlpha>1)throw Error('Trendline paint alpha unavailable');if(ctx===contexts[0])globalAlpha=currentAlpha;else if(globalAlpha!==currentAlpha)throw Error('Trendline paint contexts have incompatible alpha');
     for(const key of keys){let value=Reflect.get(ctx,key,ctx);paintState.push({context:ctx,key,value});check();if(key==='direction'&&value==='inherit'){if(!resolve)throw Error('Trendline inherited text direction unavailable');value=Reflect.apply(resolve,candidate,[ctx.canvas??own(controller,'canvas')]);check();if(!['ltr','rtl'].includes(value))throw Error('Trendline inherited direction must resolve to ltr or rtl');}if(value!==undefined&&typeof value!=='string')throw Error('Trendline text measurement state unavailable');if(ctx===contexts[0])textState[key]=value;else if(textState[key]!==value)throw Error('Trendline paint contexts have incompatible text state');}
    }
    const guarded=new Proxy(projection,{get(object,key){const field=Reflect.get(object,key,object);check();return typeof field==='function'?(...args:unknown[])=>{check();const result=Reflect.apply(field,object,args);check();if(['xOf','yOf'].includes(String(key))&&result!==null&&(typeof result!=='number'||!Number.isFinite(result)))throw Error('Trendline native projection requires a finite primitive coordinate');return result;}:field;}});
    const environment=freeze({width,height,dpr,globalAlpha,clip,textState});
    // Environment is set by a recorder-only method, never forwarded to a live canvas.
    const configure=(context as unknown as {configureOwnedLabel?:(environment:OwnedTrendlineLabelEnvironment,assertCurrent:()=>void)=>void}).configureOwnedLabel;if(typeof configure!=='function')throw Error('Trendline probe requires an owned recorder');configure.call(context,environment,check);check();
    Reflect.apply(labelSlot.original,painter,[context,clone,guarded,theme]);check();return environment;
   });},
   mute(target:OwnedTrendlineLabelTarget){if(this!==access)throw Error('Trendline label access receiver changed');const entry=exclusive(()=>entryOf(target));if(muted&&muted!==entry)throw Error('Another Trendline label is already muted');muted=entry;let ended=false;return()=>{if(ended)return;ended=true;if(muted===entry)muted=undefined;};},
   dispose(){if(this!==access)throw Error('Trendline label access receiver changed');if(!live)return;registration.retire();if(labelAccess===registration)labelAccess=undefined;}
  });
  assertInstalled();if(labelAccess)throw Error('Owned Trendline labels acquired reentrantly');labelAccess=registration;return access;
 });
 renderObservers.set(renderer,candidate=>{assertInstalled();if(observer)throw Error('Owned drawing render already has an observer');const before=own(candidate,'before'),after=own(candidate,'after');if(typeof before!=='function'||typeof after!=='function')throw Error('Owned drawing render observer requires data callbacks');assertInstalled();if(observer)throw Error('Owned drawing render already has an observer');const value={before,after,receiver:candidate,retired:false};observer=value;return{assertCurrent:()=>assertObserver(value),dispose(){if(value.retired)return;value.retired=true;if(observer===value)observer=undefined;}};});
 return{diagnostics:()=>diagnostics.filter(visibleDiagnostic).map(d=>({...d})),dispose(){if(!active)return;const failures:unknown[]=[];active=false;if(deleteDispatch)deleteDispatch.live=false;deleteDispatch=undefined;deleteInvocation=undefined;deleteDispatchers.delete(renderer);if(fib)fib.live=false;fib=undefined;fibSources.delete(renderer);for(const query of fibQueries){query.active=false;for(const release of query.releases)try{release();}catch(error){failures.push(error);}}fibQueries.length=0;if(statistics)statistics.live=false;statistics=undefined;statisticsSources.delete(renderer);labelAccess?.retire();labelAccess=undefined;labelSources.delete(renderer);if(observer)observer.retired=true;observer=undefined;renderObservers.delete(renderer);frames.forEach(frame=>frame.claims.clear());frames=[];installations.delete(renderer);for(const slot of [...slots].reverse())try{if(own(slot.owner,slot.key,true)!==slot.wrapper)throw Error('Annotation cleanup preserved a replacement method: '+slot.key);delete slot.owner[slot.key];}catch(error){failures.push(error);}if(failures.length)throw new AggregateError(failures,'Annotation cleanup failed');}};
}
