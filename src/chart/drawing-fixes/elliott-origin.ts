// Elliott wave origin point (OpenCandle 0.8.1). An Elliott wave count is drawn from the point where the wave sequence starts
// (Frost and Prechter: wave 1 runs from the origin to the end of wave 1), so a 1-2-3-4-5 impulse needs 6 points: an unlabelled
// origin, then the ends of waves 1 to 5. Before 0.8.1 the tools had one point per label, so wave 1 (and A, W) was never drawn.
// Counts now: Impulse 6 (origin, 1..5), Correction 4 (origin, A, B, C), Triangle 6 (origin, A..E), Double combo 4 (origin, W, X, Y),
// Triple combo 6 (origin, W, X, Y, X, Z).
//
// Migration of saved drawings. A record saved by 0.8.1 carries props.lvWaveOrigin = 1. A retained record without it and with
// exactly one point per label is a pre-0.8.1 drawing: its first point stays the end of the first wave, and an origin is
// synthesized one leg back, so that the old second wave is a 61.8% retracement of the new first wave (the typical wave 2 depth),
// one leg-duration earlier in time. Nothing else changes and no point is lost; the user can drag the origin afterwards.
// A placement draft (no type on the init) and a 0.8.1 record are never migrated.
import type {DrawingTypeMeta} from '@luxalgo/vela';
import {cloneStyle,fail,lvKey,method,nativeBase,roles,type Init,type NativeBase,type NativeModel} from '../lv-drawing-pin';
import {defineLvDrawingToolModule,type LvDrawingToolModule} from '../lv-types/contract';

export const ELLIOTT_ORIGIN_FIELD='lvWaveOrigin';
/** The synthesized first wave is this much longer (in price) than the old second wave: wave 2 = 0.618 of wave 1. */
export const ELLIOTT_LEGACY_RETRACEMENT=0.618;
type Anchor={time:number;price:number};

export const withOrigin=(labels:readonly string[]):string[]=>['',...labels];
/** The origin a pre-0.8.1 wave gets: one leg-duration before its first point, wave 2 a 61.8% retracement of wave 1. */
export function legacyOrigin(first:Anchor,second:Anchor):Anchor{
 return{time:first.time-(second.time-first.time),price:first.price+(second.price-first.price)/ELLIOTT_LEGACY_RETRACEMENT};
}
/** True when `init` is a pre-0.8.1 saved wave of `labelCount` labels (one point per label, no origin marker). */
export function isLegacyWaveRecord(init:Init,labelCount:number):boolean{
 if((init as {type?:unknown}).type===undefined)return false;
 const props=init.props as Record<string,unknown>|undefined;
 if(props&&typeof props==='object'&&Object.hasOwn(props,ELLIOTT_ORIGIN_FIELD))return false;
 return Array.isArray(init.anchors)&&init.anchors.length===labelCount&&labelCount>=2;
}
/** Anchors of a migrated legacy record: the synthesized origin, then every saved point unchanged. */
export function migrateLegacyWave(anchors:readonly Anchor[]):Anchor[]{
 return[legacyOrigin(anchors[0],anchors[1]),...anchors.map(a=>({time:a.time,price:a.price}))];
}

interface PatternModel extends NativeModel{vertexLabels():string[]}
/** A wave model class on `Base` with an origin point before `labels`, migrating legacy records. */
export function originWaveClass(Base:new(init:Init)=>PatternModel,type:string,labels:readonly string[]){
 const all=Object.freeze(withOrigin(labels));
 const Wave=class LvOriginWave extends Base{
  constructor(init:Init){
   super(init);(this as {type:string}).type=type;
   if(isLegacyWaveRecord(init,labels.length))this.anchors=migrateLegacyWave(this.anchors);
  }
  vertexLabels():string[]{return [...all];}
  protected writeProps():Record<string,unknown>{return{...((super.writeProps() as Record<string,unknown>|undefined)??{}),[ELLIOTT_ORIGIN_FIELD]:1};}
 };
 Object.defineProperty(Wave.prototype,ORIGIN_MARK,{value:true,enumerable:false});
 return Wave;
}
const ORIGIN_MARK='lvWaveOrigin081';
/** The pinned native pattern class of `type` WITHOUT the 0.8.1 origin: when the registry already holds the origin replacement
 *  (registered by this or an earlier module graph), its parent class is the native one. The wave and pattern modules pin this. */
export function nativePatternBase(type:string):NativeBase{
 const base=nativeBase(type);
 if(!Object.hasOwn(base.prototype,ORIGIN_MARK))return base;
 const parent=Object.getPrototypeOf(base.prototype) as object,ctor=(parent as {constructor:unknown}).constructor as NativeBase['ctor'];
 if(typeof ctor!=='function'||ctor.prototype!==parent)fail(type+' native class is not reachable under its origin replacement');
 return{...base,ctor,prototype:parent,sample:new ctor({id:'lv-drawing-type-probe',paneId:'price',createdAt:0})};
}

function defineNativeWave(type:'elliottimpulse'|'elliottcorrection',labels:readonly string[]):DrawingTypeMeta{
 const base=nativeBase(type);
 for(const key of ['vertexLabels','anchorSchema','handlePoints','hitTest','serialize','writeProps'])method(base.prototype,key);
 const sample=base.sample as PatternModel;
 if(sample.vertexLabels().join()!==labels.join())fail(type+' labels changed (already given an origin?): '+JSON.stringify(sample.vertexLabels()));
 const Wave=originWaveClass(base.ctor as unknown as new(init:Init)=>PatternModel,type,labels);
 const probe=new Wave({id:'lv-drawing-type-probe',paneId:'price',createdAt:0});
 if(roles(probe).max!==labels.length+1)fail(type+' anchor schema no longer follows the vertex labels');
 const meta=base.meta;
 return{...meta,type:lvKey(type),defaultStyle:cloneStyle(meta),create:init=>new Wave(init)} as DrawingTypeMeta;
}

/** Registered AFTER the OpenCandle tool modules: the wave and pattern modules pin the native labels of these classes. */
export const ELLIOTT_ORIGIN_081_MODULE:LvDrawingToolModule=defineLvDrawingToolModule({
 id:'elliott-origin-081',
 types:[
  {type:'elliottimpulse',base:'elliottimpulse',replacesNative:true,define:()=>defineNativeWave('elliottimpulse',['1','2','3','4','5'])},
  {type:'elliottcorrection',base:'elliottcorrection',replacesNative:true,define:()=>defineNativeWave('elliottcorrection',['A','B','C'])},
 ],
});
