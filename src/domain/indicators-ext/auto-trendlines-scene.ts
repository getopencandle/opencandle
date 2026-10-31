/** Original LV visual model. No numerical plot, stored drawing or alert operand. */
export const AUTO_TREND_POLICY='lv-defined:auto-trendlines-v1' as const;
export const AUTO_TREND_REFERENCE='public-indicator-definition:auto-trendlines' as const;
export const AUTO_TREND_LIMITS=Object.freeze({operations:12_000_000,numericSlots:200_000,horizon:5000,bars:100000});
export type AutoTrendFamily='small'|'large';
export type AutoTrendSide='support'|'resistance';
export interface AutoTrendAnchor {readonly index:number;readonly time:number;readonly price:number;readonly actualSize:number;readonly confirmedAt:number}
export interface AutoTrendLine {
 readonly key:string;readonly family:AutoTrendFamily;readonly side:AutoTrendSide;
 readonly from:AutoTrendAnchor;readonly to:AutoTrendAnchor;
 readonly slope:number;readonly touchWidth:number;readonly touches:number;
 readonly endIndex:number;readonly endPrice:number;readonly breakoutIndex:number|null;readonly extended:boolean;
}
export interface AutoTrendPivot extends AutoTrendAnchor {readonly family:AutoTrendFamily;readonly side:AutoTrendSide;readonly key:string}
export interface AutoTrendScene {
 readonly schemaVersion:1;readonly policy:typeof AUTO_TREND_POLICY;readonly sourceKey:string;
 readonly fromIndex:number;readonly asOfIndex:number;readonly asOfTime:number|null;
 readonly lines:readonly AutoTrendLine[];readonly pivots:readonly AutoTrendPivot[];
}
export interface AutoTrendUsage {readonly operations:number;readonly numericSlots:number;readonly peakNumericSlots:number}
export interface AutoTrendLimits {operations?:number;numericSlots?:number}
export type AutoTrendResult={readonly status:'ready';readonly scene:AutoTrendScene;readonly usage:AutoTrendUsage}|{readonly status:'unavailable';readonly scene:null;readonly diagnostic:string;readonly usage:AutoTrendUsage};
export class AutoTrendUnavailable extends Error {}
/** Work units bound weighted primitive groups, not wall time. All reservations precede work/allocation. */
export class AutoTrendMeter {
 readonly operationLimit:number;readonly numericLimit:number;operations=0;numericSlots=0;peakNumericSlots=0;
 constructor(limits:AutoTrendLimits={},initial?:AutoTrendUsage){
  this.operationLimit=limits.operations??AUTO_TREND_LIMITS.operations;this.numericLimit=limits.numericSlots??AUTO_TREND_LIMITS.numericSlots;
  if(!Number.isSafeInteger(this.operationLimit)||this.operationLimit<0||this.operationLimit>AUTO_TREND_LIMITS.operations||!Number.isSafeInteger(this.numericLimit)||this.numericLimit<0||this.numericLimit>AUTO_TREND_LIMITS.numericSlots)throw new AutoTrendUnavailable('Invalid Auto trendlines resource reservation.');
  if(initial!==undefined)this.inherit(initial);
 }
 work(count:number){if(!Number.isSafeInteger(count)||count<0||count>this.operationLimit-this.operations)throw new AutoTrendUnavailable('Auto trendlines exceeded its local operation reservation. No partial scene was produced.');this.operations+=count;}
 reserve(count:number){this.work(4);if(!Number.isSafeInteger(count)||count<0||count>this.numericLimit-this.numericSlots)throw new AutoTrendUnavailable('Auto trendlines exceeded its local numeric reservation. No partial scene was produced.');this.numericSlots+=count;this.peakNumericSlots=Math.max(this.peakNumericSlots,this.numericSlots);}
 release(count:number){this.work(4);if(!Number.isSafeInteger(count)||count<0||count>this.numericSlots)throw new AutoTrendUnavailable('Invalid Auto trendlines allocation release.');this.numericSlots-=count;}
 /** Validate captured data before combining earlier work with this phase's already charged validation. */
 inherit(value:unknown):AutoTrendUsage{
  this.reserve(8);const row=autoTrendOwnData(value,['operations','numericSlots','peakNumericSlots'],this);
  const operations=row.operations,numericSlots=row.numericSlots,peakNumericSlots=row.peakNumericSlots;this.work(32);
  for(const field of [operations,numericSlots,peakNumericSlots])if(typeof field!=='number'||!Number.isSafeInteger(field)||field<0)throw new AutoTrendUnavailable('Invalid Auto trendlines resource receipt.');
  if((numericSlots as number)>(peakNumericSlots as number)||(peakNumericSlots as number)>this.numericLimit||(operations as number)>this.operationLimit-this.operations||(numericSlots as number)>this.numericLimit-this.numericSlots)throw new AutoTrendUnavailable('Auto trendlines resource receipt exceeds the reservation.');
  this.operations+=operations as number;this.numericSlots+=numericSlots as number;this.peakNumericSlots=Math.max(this.peakNumericSlots,peakNumericSlots as number,this.numericSlots);
  return Object.freeze({operations:operations as number,numericSlots:numericSlots as number,peakNumericSlots:peakNumericSlots as number});
 }
 usage():AutoTrendUsage{return Object.freeze({operations:this.operations,numericSlots:this.numericSlots,peakNumericSlots:this.peakNumericSlots});}
}
export const autoTrendKey=(family:AutoTrendFamily,side:AutoTrendSide,from:number,to:number)=>`${family}:${side}:${from}:${to}`;
/** Bounds plain data without invoking accessors; validation itself is charged. */
export function autoTrendRecord(value:unknown,keys:readonly string[],meter:AutoTrendMeter):Record<string,unknown>{
 meter.work(16+keys.length*keys.length*4+keys.length*12);if(!value||typeof value!=='object'||![Object.prototype,null].includes(Object.getPrototypeOf(value)))throw new AutoTrendUnavailable('Auto trendlines requires plain scene data.');
 const fields=Object.getOwnPropertyDescriptors(value),own=Reflect.ownKeys(fields);if(own.length!==keys.length||own.some(key=>typeof key!=='string'||!keys.includes(key)||!Object.hasOwn(fields[key],'value')||!fields[key].enumerable))throw new AutoTrendUnavailable('Auto trendlines scene contains unsupported fields.');return value as Record<string,unknown>;
}
/** Snapshot only validated own data descriptors; later property reads never reach an input accessor. */
export function autoTrendOwnData(value:unknown,keys:readonly string[],meter:AutoTrendMeter):Readonly<Record<string,unknown>>{
 autoTrendRecord(value,keys,meter);const snapshot=Object.create(null) as Record<string,unknown>;
 for(const key of keys){meter.work(16);const field=Object.getOwnPropertyDescriptor(value,key);if(!field||!Object.hasOwn(field,'value')||!field.enumerable)throw new AutoTrendUnavailable('Auto trendlines requires stable own data fields.');Object.defineProperty(snapshot,key,{value:field.value,enumerable:true});}
 return Object.freeze(snapshot);
}
/** Validate the complete outer discriminant and receipt before any result/usage property is read. */
export function readAutoTrendResultEnvelope(value:unknown,meter:AutoTrendMeter):AutoTrendResult{
 meter.reserve(16);meter.work(24);if(!value||typeof value!=='object')throw new AutoTrendUnavailable('Invalid Auto trendlines result envelope.');
 const status=Object.getOwnPropertyDescriptor(value,'status');if(!status||!Object.hasOwn(status,'value')||!status.enumerable||!['ready','unavailable'].includes(status.value))throw new AutoTrendUnavailable('Invalid Auto trendlines result status.');
 const row=autoTrendOwnData(value,status.value==='ready'?['status','scene','usage']:['status','scene','diagnostic','usage'],meter);
 if(row.status!==status.value)throw new AutoTrendUnavailable('Auto trendlines result status changed during validation.');const usage=meter.inherit(row.usage);
 if(row.status==='ready'){if(!row.scene||typeof row.scene!=='object')throw new AutoTrendUnavailable('Auto trendlines result has no scene.');return Object.freeze({status:'ready',scene:row.scene as AutoTrendScene,usage});}
 if(row.scene!==null||typeof row.diagnostic!=='string'||!row.diagnostic.length||row.diagnostic.length>2000)throw new AutoTrendUnavailable('Invalid unavailable Auto trendlines result.');
 return Object.freeze({status:'unavailable',scene:null,diagnostic:row.diagnostic,usage});
}
const integer=(value:unknown,low:number,high:number):value is number=>typeof value==='number'&&Number.isSafeInteger(value)&&value>=low&&value<=high;
const finite=(value:unknown):value is number=>typeof value==='number'&&Number.isFinite(value);
function anchor(value:unknown,scene:AutoTrendScene,meter:AutoTrendMeter){
 const row=autoTrendRecord(value,['index','time','price','actualSize','confirmedAt'],meter);
 if(!integer(row.index,scene.fromIndex,scene.asOfIndex)||!finite(row.time)||row.time>(scene.asOfTime??-Infinity)||!finite(row.price)||!integer(row.actualSize,0,Math.min((row.index as number)-scene.fromIndex,scene.asOfIndex-(row.index as number)))||!integer(row.confirmedAt,row.index,scene.asOfIndex))throw new AutoTrendUnavailable('Invalid Auto trendlines anchor.');
}
/** No geometry can be accepted merely because a caller supplied a TypeScript cast. */
export function validateAutoTrendScene(value:unknown,meter:AutoTrendMeter):asserts value is AutoTrendScene {
 const row=autoTrendRecord(value,['schemaVersion','policy','sourceKey','fromIndex','asOfIndex','asOfTime','lines','pivots'],meter),scene=row as unknown as AutoTrendScene;
 if(row.schemaVersion!==1||row.policy!==AUTO_TREND_POLICY||typeof row.sourceKey!=='string'||!row.sourceKey.length||row.sourceKey.length>4096||!integer(row.asOfIndex,-1,AUTO_TREND_LIMITS.bars-1)||!integer(row.fromIndex,0,Math.max(0,scene.asOfIndex+1))||scene.fromIndex!==Math.max(0,scene.asOfIndex+1-AUTO_TREND_LIMITS.horizon)||(scene.asOfIndex===-1?row.asOfTime!==null:!finite(row.asOfTime)))throw new AutoTrendUnavailable('Invalid Auto trendlines scene identity.');
 for(const collection of [row.lines,row.pivots]){meter.work(12);if(!Array.isArray(collection)||Object.getPrototypeOf(collection)!==Array.prototype||collection.length>meter.numericLimit)throw new AutoTrendUnavailable('Invalid Auto trendlines scene collection.');
  const fields=Object.getOwnPropertyDescriptors(collection);if(Reflect.ownKeys(fields).length!==collection.length+1)throw new AutoTrendUnavailable('Auto trendlines collections must be dense plain arrays.');
  for(let i=0;i<collection.length;i++){meter.work(8);if(!Object.hasOwn(fields,String(i))||!Object.hasOwn(fields[String(i)],'value')||!fields[String(i)].enumerable)throw new AutoTrendUnavailable('Auto trendlines collections must be dense data arrays.');}
 }
 meter.reserve(scene.lines.length*3+scene.pivots.length);const seen=new Set<string>(),anchors=new Map<string,AutoTrendAnchor>();
 for(const line of scene.lines){autoTrendRecord(line,['key','family','side','from','to','slope','touchWidth','touches','endIndex','endPrice','breakoutIndex','extended'],meter);anchor(line.from,scene,meter);anchor(line.to,scene,meter);meter.work(80);
  const required=line.family==='small'?5:25;
  if(!['small','large'].includes(line.family)||!['support','resistance'].includes(line.side)||line.key!==autoTrendKey(line.family,line.side,line.from.index,line.to.index)||seen.has(line.key)||line.from.index>=line.to.index||line.from.time>=line.to.time||!finite(line.slope)||!finite(line.touchWidth)||line.touchWidth<0||!integer(line.touches,0,AUTO_TREND_LIMITS.horizon*2)||!integer(line.endIndex,line.to.index,scene.asOfIndex)||!finite(line.endPrice)||!(line.breakoutIndex===null||line.breakoutIndex===line.endIndex)||typeof line.extended!=='boolean'||line.from.confirmedAt!==line.from.index+required||line.to.confirmedAt!==line.to.index+required||line.from.actualSize<required||line.to.actualSize<required||line.slope!==(line.to.price-line.from.price)/(line.to.index-line.from.index)||line.endPrice!==line.from.price+line.slope*(line.endIndex-line.from.index)||line.extended!==(line.endIndex-line.to.index<=2*(line.to.index-line.from.index)))throw new AutoTrendUnavailable('Invalid Auto trendlines line geometry.');seen.add(line.key);
  for(const point of [line.from,line.to]){meter.work(48);const key=`${line.family}:${line.side}:${point.index}`,prior=anchors.get(key);if(prior&&(prior.time!==point.time||prior.price!==point.price||prior.actualSize!==point.actualSize||prior.confirmedAt!==point.confirmedAt))throw new AutoTrendUnavailable('Auto trendlines reuses an inconsistent anchor.');anchors.set(key,point);}
 }
 seen.clear();
 for(const pivot of scene.pivots){autoTrendRecord(pivot,['key','family','side','index','time','price','actualSize','confirmedAt'],meter);meter.work(36);
  const expected=anchors.get(pivot.key);
  if(!expected||expected.index!==pivot.index||expected.time!==pivot.time||expected.price!==pivot.price||expected.actualSize!==pivot.actualSize||expected.confirmedAt!==pivot.confirmedAt||!['small','large'].includes(pivot.family)||!['support','resistance'].includes(pivot.side)||pivot.key!==`${pivot.family}:${pivot.side}:${pivot.index}`||seen.has(pivot.key)||!integer(pivot.index,scene.fromIndex,scene.asOfIndex)||!finite(pivot.time)||!finite(pivot.price)||!integer(pivot.actualSize,0,AUTO_TREND_LIMITS.horizon)||!integer(pivot.confirmedAt,pivot.index,scene.asOfIndex))throw new AutoTrendUnavailable('Invalid Auto trendlines pivot geometry.');seen.add(pivot.key);
 }
 meter.release(scene.lines.length*3+scene.pivots.length);
}
