import type {ChartController,ChartSourceContext} from './adapter';

/** Current, already displayed overlay data. Client coordinates are converted by the export frame, never by guessed DOM. */
export interface SnapshotText {text:string;left:number;top:number;width:number;height:number;font:string;color:string;opacity:number}
export interface SnapshotBox {left:number;top:number;width:number;height:number;color:string;opacity:number}
export interface SnapshotBadge {left:number;top:number;size:number;letter:string;color:string}
export interface SnapshotPublishedScene {texts:readonly SnapshotText[];boxes:readonly SnapshotBox[];badges:readonly SnapshotBadge[]}
export type SnapshotChannel='legend'|'events'|'alerts';
export interface SnapshotBinding {owner:object;chart:ChartController;sourceKey:string;seriesKey:string|null;isOwnerCurrent?:()=>boolean;/** Renderer-only reset epoch; stable across ordinary live updates. */gestureOwnerKey?:string}
interface Publication {token:object;sourceKey:string;seriesKey:string;viewportKey:string;scene:SnapshotPublishedScene;validate?:()=>boolean}
const owners=new WeakMap<object,WeakMap<ChartController,Map<SnapshotChannel,Publication>>>();
function channels(binding:SnapshotBinding){let charts=owners.get(binding.owner);if(!charts){charts=new WeakMap();owners.set(binding.owner,charts);}let values=charts.get(binding.chart);if(!values){values=new Map();charts.set(binding.chart,values);}return values;}

export function snapshotSourceKey(source:ChartSourceContext,style:string):string{
 return JSON.stringify([source.basisIdentity??null,source.datasetId,source.revision,source.fixture,source.label,source.resolution??null,source.inputIdentity??null,style]);
}
/** Includes the observed values so a same-length correction, Undo or restored frame cannot reuse an older legend. */
export function snapshotInspectionKey(view:ReturnType<ChartController['getDataWindow']>|null,style:string):string|null{
 try{if(!view||view.pending)return null;return JSON.stringify([snapshotSourceKey(view.source,style),view.source.inputIdentity??null,view.series,view.standard,view.displayed,view.readout,view.crosshair?.time??null],(_key,value)=>value instanceof Map?[...value]:value);}catch{return null;}
}
export function isSnapshotOwnerCurrent(binding:SnapshotBinding):boolean{try{return binding.isOwnerCurrent?.()!==false;}catch{return false;}}
export function sameSnapshotObservation(a:SnapshotBinding|undefined,b:SnapshotBinding|undefined):boolean{
 if(!a||!b)return a===b;return a.owner===b.owner&&a.chart===b.chart&&a.sourceKey===b.sourceKey&&a.seriesKey===b.seriesKey&&isSnapshotOwnerCurrent(a)&&isSnapshotOwnerCurrent(b);
}
export function snapshotSeriesKey(chart:ChartController|null):string|null{
 try{return chart?snapshotInspectionKey(chart.getDataWindow(),chart.getStyle()):null;}catch{return null;}
}
function viewportKey(chart:ChartController):string|null{
 try{const projection=chart.pricePaneProjection?.(),view=chart.getDataWindow(),close=view.standard.bar?.close,prices=[1,10,100,...(typeof close==='number'&&Number.isFinite(close)?[close]:[])];return JSON.stringify([chart.getViewport(),chart.paneGeometry?.()??null,projection?[projection.left,projection.top,projection.width,projection.height,projection.scaleSide,prices.map(price=>projection.priceToY(price))]:null]);}catch{return null;}
}
function current(binding:SnapshotBinding):boolean{
 if(!binding.seriesKey||!isSnapshotOwnerCurrent(binding))return false;
 try{const view=binding.chart.getDataWindow();return !view.pending&&snapshotSourceKey(view.source,binding.chart.getStyle())===binding.sourceKey&&binding.seriesKey!==null&&snapshotSeriesKey(binding.chart)===binding.seriesKey;}catch{return false;}
}
export function publishSnapshotScene(binding:SnapshotBinding,channel:SnapshotChannel,token:object,scene:SnapshotPublishedScene,validate?:()=>boolean):boolean{
 if(!current(binding))return false;const viewport=viewportKey(binding.chart);if(viewport===null)return false;
 channels(binding).set(channel,{token,sourceKey:binding.sourceKey,seriesKey:binding.seriesKey!,viewportKey:viewport,scene:structuredClone(scene),validate});return true;
}
export function clearSnapshotScene(binding:SnapshotBinding,channel:SnapshotChannel,token:object):void{
 const values=channels(binding);if(values.get(channel)?.token===token)values.delete(channel);
}

/**
 * A lazily read channel. The producer only marks it stale (cheap, no DOM reads); the next requireSnapshotScene
 * performs exactly the publication the producer used to perform eagerly (owner check, read, signature validation), using the
 * producer's latest binding. A stale mark therefore behaves like the old scheduled republish, just deferred to the snapshot.
 */
interface LazySceneSource {token:object;owner:object;chart:ChartController;dirty:boolean;binding:()=>SnapshotBinding;read:()=>SnapshotPublishedScene;connected:()=>boolean}
const lazyOwners=new WeakMap<object,WeakMap<ChartController,Map<SnapshotChannel,LazySceneSource>>>();
function lazySources(binding:Pick<SnapshotBinding,'owner'|'chart'>){let charts=lazyOwners.get(binding.owner);if(!charts){charts=new WeakMap();lazyOwners.set(binding.owner,charts);}let values=charts.get(binding.chart);if(!values){values=new Map();charts.set(binding.chart,values);}return values;}
function materialize(source:LazySceneSource,channel:SnapshotChannel):void{
 source.dirty=false;const binding=source.binding();
 if(binding.owner!==source.owner||binding.chart!==source.chart)return;
 if(!isSnapshotOwnerCurrent(binding))return;
 try{const scene=source.read(),signature=JSON.stringify(scene);if(!publishSnapshotScene(binding,channel,source.token,scene,()=>source.connected()&&JSON.stringify(source.read())===signature))clearSnapshotScene(binding,channel,source.token);}catch{clearSnapshotScene(binding,channel,source.token);}
}
/** Registers a lazy producer for one channel. `invalidate` marks it stale; `dispose` retires it and its publication. */
export function registerSnapshotSceneSource(binding:SnapshotBinding,channel:SnapshotChannel,token:object,options:{binding:()=>SnapshotBinding;read:()=>SnapshotPublishedScene;connected:()=>boolean}):{invalidate():void;dispose():void}{
 const source:LazySceneSource={token,owner:binding.owner,chart:binding.chart,dirty:true,...options},values=lazySources(binding);values.set(channel,source);
 return{
  invalidate(){if(values.get(channel)===source)source.dirty=true;},
  dispose(){if(values.get(channel)===source)values.delete(channel);clearSnapshotScene(binding,channel,token);},
 };
}
/**
 * The binding a settled (hover-deferred) publisher hands to its lazy source. Its owner, chart, source and owner
 * check stay the render's; only the series key is re-read at request time, because the deferred render's key still holds the
 * crosshair time of up to one settle window ago. Such a channel's read() must prove its own geometry against the live chart.
 */
export function snapshotBindingAtRequest(binding:SnapshotBinding):SnapshotBinding{return{...binding,seriesKey:snapshotSeriesKey(binding.chart)};}
/** An expected visible layer must be current. A stale layer is never silently painted over the new chart. */
export function requireSnapshotScene(binding:SnapshotBinding,channel:SnapshotChannel):SnapshotPublishedScene{
 // A publication keyed to an older series (a crosshair move with no render since) is re-made once for this request.
 const source=lazyOwners.get(binding.owner)?.get(binding.chart)?.get(channel);if(source&&(source.dirty||channels(binding).get(channel)?.seriesKey!==binding.seriesKey))materialize(source,channel);
 const value=channels(binding).get(channel);
 if(!current(binding)||!value||value.sourceKey!==binding.sourceKey||value.seriesKey!==binding.seriesKey||value.viewportKey!==viewportKey(binding.chart)||value.validate?.()===false)throw Error('The chart '+channel+' is updating. Try the snapshot again after it finishes.');
 return value.scene;
}
export function assertSnapshotCurrent(binding:SnapshotBinding):void{if(!current(binding))throw Error('The chart source is updating. Try the snapshot again after it finishes.');}

/** A native screenshot may itself recompute scales. Check the captured frame and every expected scene again after it. */
export function captureSnapshotGuard(binding:SnapshotBinding,expected:readonly SnapshotChannel[]=[]):()=>void{
 assertSnapshotCurrent(binding);const viewport=viewportKey(binding.chart);if(viewport===null)throw Error('The chart geometry is updating. Try the snapshot again after it finishes.');
 const scenes=expected.map(channel=>({channel,scene:requireSnapshotScene(binding,channel)}));
 return()=>{assertSnapshotCurrent(binding);if(viewportKey(binding.chart)!==viewport)throw Error('The chart geometry is updating. Try the snapshot again after it finishes.');for(const {channel,scene}of scenes)if(requireSnapshotScene(binding,channel)!==scene)throw Error('The chart overlays are updating. Try the snapshot again after it finishes.');};
}
