import {NativeRenderer,getNativeIndicator} from '@luxalgo/vela';

/** GEOMETRY ONLY. The actual C constructor must already own its consumed source,
 * admitted reservation and exact accepted PrimarySourceFrame.calendar.frame.
 * Nothing here authenticates prices, grants source permission or registers an
 * array. No caller-supplied currentness callback or budget is accepted. */
export interface SeasonalityNativeOrigin {
 readonly indexOffset:0;readonly count:number;readonly firstLoadedTime:number;
 assertCurrent():void;dispose():void;
}
export const SEASONALITY_NATIVE_ORIGIN_COST=Object.freeze({operations:8192,numericSlots:256});
const capture=Object.getOwnPropertyDescriptor(NativeRenderer.prototype,'lvCaptureTimeFrame')?.value as ((count:number,tail:number)=>object)|undefined;
const get=Map.prototype.get,has=Map.prototype.has,apply=Reflect.apply;
const own=(value:unknown,key:PropertyKey):unknown=>{
 if(!value||typeof value!=='object')throw Error('Native origin unavailable.');const field=Object.getOwnPropertyDescriptor(value,key);
 if(!field||!Object.hasOwn(field,'value'))throw Error('Native origin unavailable.');return field.value;
};
function map(value:unknown):Map<unknown,unknown>{apply(has,value,[null]);if(Object.getPrototypeOf(value)!==Map.prototype)throw Error('Native origin map changed.');return value as Map<unknown,unknown>;}
function array(value:unknown,count:number):object{
 if(!Array.isArray(value)||Object.getPrototypeOf(value)!==Array.prototype||own(value,'length')!==count)throw Error('Native origin length changed.');return value;
}
interface Pin {
 live:boolean;id:string;count:number;tail:number;first:number;frame:object;generation:number;paneId:string;
 renderer:WeakRef<object>;core:WeakRef<object>;model:WeakRef<object>;registry:WeakRef<object>;records:WeakRef<object>;handles:WeakRef<object>;record:WeakRef<object>;handle:WeakRef<object>;native:WeakRef<object>;descriptor:WeakRef<object>;mounted:WeakRef<object>;scene:WeakRef<object>;models:WeakRef<object>;offsets:WeakRef<object>;coords:WeakRef<object>;times:WeakRef<object>;raw:WeakRef<object>;bars:WeakRef<object>;shown:WeakRef<object>;
 ctx:WeakRef<object>;settings:WeakRef<object>;result:WeakRef<object>;panes:WeakRef<object>;pane:WeakRef<object>;
}
function object(value:unknown):object{if(!value||typeof value!=='object')throw Error('Native origin member missing.');return value;}
/** The actual SDK omits hidden until its first visibility edit. Only the
 * plain default record may use absence; inherited/accessor values never do. */
function visible(record:object):boolean{
 const field=Object.getOwnPropertyDescriptor(record,'hidden');
 if(field)return Object.hasOwn(field,'value')&&field.value===false;
 const prototype=Object.getPrototypeOf(record);
 return prototype===Object.prototype&&Object.getOwnPropertyDescriptor(prototype,'hidden')===undefined;
}
function zero(offsets:Map<unknown,unknown>,id:string):boolean{return !apply(has,offsets,[id])||Object.is(apply(get,offsets,[id]),0);}
function edges(rows:object,count:number,first:number,tail:number):boolean{return own(own(rows,'0'),'time')===first&&own(own(rows,String(count-1)),'time')===tail;}
function check(pin:Pin):void{
 if(!pin.live)throw Error('The whole-chart native origin retired.');
 try{
  const renderer=pin.renderer.deref(),core=pin.core.deref(),model=pin.model.deref();
  // Private SDK WeakMap brand before ANY renderer descriptor/property. A Proxy,
  // foreign renderer or changed native generation cannot replay the frame key.
  if(!renderer||!core||!model||!capture||apply(capture,renderer,[pin.count,pin.tail])!==pin.frame)throw Error('Native frame retired.');
  const registry=own(core,'registry'),records=map(own(registry,'records')),handles=map(own(core,'handles')),record=apply(get,records,[pin.id]),native=own(record,'native'),descriptor=own(native,'descriptor'),handle=apply(get,handles,[pin.id]),mounted=own(record,'model');
  const scene=own(renderer,'scene'),models=map(own(scene,'indicators')),offsets=map(own(scene,'anchorOffsets')),coords=own(renderer,'coords'),times=array(own(coords,'times'),pin.count),raw=array(own(core,'rawBars'),pin.count),bars=array(own(core,'bars'),pin.count),shown=array(own(renderer,'bars'),pin.count),type=own(native,'type'),settings=own(model,'settings'),ctx=own(model,'ctx'),result=own(model,'result'),panes=map(own(scene,'panes')),pane=apply(get,panes,[pin.paneId]);
  const exact:readonly [unknown,WeakRef<object>][]=[[registry,pin.registry],[records,pin.records],[handles,pin.handles],[record,pin.record],[native,pin.native],[descriptor,pin.descriptor],[handle,pin.handle],[mounted,pin.mounted],[scene,pin.scene],[models,pin.models],[offsets,pin.offsets],[coords,pin.coords],[times,pin.times],[raw,pin.raw],[bars,pin.bars],[shown,pin.shown],[settings,pin.settings],[ctx,pin.ctx],[result,pin.result],[panes,pin.panes],[pane,pin.pane]];
  if(own(core,'renderer')!==renderer||exact.some(([value,weak])=>value!==weak.deref())||typeof type!=='string'||getNativeIndicator(type)!==descriptor||own(native,'instance')!==model||own(model,'handle')!==handle||own(handle,'id')!==pin.id||own(record,'id')!==pin.id||!visible(record)||own(model,'removed')!==false||own(model,'editGeneration')!==pin.generation||own(settings,'kind')!=='seasonality'||own(settings,'visible')!==true||own(mounted,'paneId')!==pin.paneId||apply(get,models,[pin.id])!==mounted||!zero(offsets,pin.id)||own(times,'0')!==pin.first||own(times,String(pin.count-1))!==pin.tail||!edges(raw,pin.count,pin.first,pin.tail)||!edges(bars,pin.count,pin.first,pin.tail)||!edges(shown,pin.count,pin.first,pin.tail))throw Error('Native origin graph changed.');
  if(apply(capture,renderer,[pin.count,pin.tail])!==pin.frame)throw Error('Native frame changed during origin verification.');
 }catch(error){pin.live=false;throw error;}
}
// Separate factory never closes over strong native/row/model locals.
function handle(pin:Pin):SeasonalityNativeOrigin{return Object.freeze({indexOffset:0 as const,count:pin.count,firstLoadedTime:pin.first/1000,assertCurrent(){check(pin);},dispose(){pin.live=false;}});}

/** Called only by the actual owned C consumer, after admission and native source
 * acceptance. This proves the supplied model is mounted on this genuine native
 * frame at indexOffset0; pure prefix counts still need their separate provider
 * witness. An observed mismatch terminally retires this proof, even if restored. */
export function captureSeasonalityNativeOrigin(renderer:object,core:object,model:object,rendererId:string,confirmedCount:number,tailTimeMs:number,expectedFrame:object):SeasonalityNativeOrigin|null{
 try{
  if(!capture||typeof rendererId!=='string'||!rendererId||rendererId.length>256||!Number.isSafeInteger(confirmedCount)||confirmedCount<1||confirmedCount>100000||!Number.isSafeInteger(tailTimeMs)||tailTimeMs%1000!==0||apply(capture,renderer,[confirmedCount,tailTimeMs])!==expectedFrame)return null;
  const registry=object(own(core,'registry')),records=map(own(registry,'records')),handles=map(own(core,'handles')),record=object(apply(get,records,[rendererId])),native=object(own(record,'native')),descriptor=object(own(native,'descriptor')),actualHandle=object(apply(get,handles,[rendererId]));
  if(own(native,'instance')!==model)return null;
  const mounted=object(own(record,'model')),scene=object(own(renderer,'scene')),models=map(own(scene,'indicators')),offsets=map(own(scene,'anchorOffsets')),coords=object(own(renderer,'coords')),times=array(own(coords,'times'),confirmedCount),raw=array(own(core,'rawBars'),confirmedCount),bars=array(own(core,'bars'),confirmedCount),shown=array(own(renderer,'bars'),confirmedCount),first=own(times,'0');
  const settings=object(own(model,'settings')),ctx=object(own(model,'ctx')),result=object(own(model,'result')),generation=own(model,'editGeneration'),paneId=own(mounted,'paneId'),panes=map(own(scene,'panes'));
  if(typeof first!=='number'||!Number.isSafeInteger(first)||first%1000!==0||typeof generation!=='number'||!Number.isSafeInteger(generation)||typeof paneId!=='string'||!paneId)return null;
  const pane=object(apply(get,panes,[paneId])),weak=(value:object)=>new WeakRef(value),pin:Pin={live:true,id:rendererId,count:confirmedCount,tail:tailTimeMs,first,frame:expectedFrame,generation,paneId,renderer:weak(renderer),core:weak(core),model:weak(model),registry:weak(registry),records:weak(records),handles:weak(handles),record:weak(record),handle:weak(actualHandle),native:weak(native),descriptor:weak(descriptor),mounted:weak(mounted),scene:weak(scene),models:weak(models),offsets:weak(offsets),coords:weak(coords),times:weak(times),raw:weak(raw),bars:weak(bars),shown:weak(shown),settings:weak(settings),ctx:weak(ctx),result:weak(result),panes:weak(panes),pane:weak(pane)};
  check(pin);return handle(pin);
 }catch{return null;}
}
