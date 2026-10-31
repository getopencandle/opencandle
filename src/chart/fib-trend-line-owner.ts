import type {SerializedDrawing} from '@luxalgo/vela';
import type {OwnedDrawingEditAcceptance} from './contracts';
import {assertNativeDrawingMatchesCanonical} from './drawing-canonical';
import {assertNativeFibTrendLineModel,nativeFibTrendLineDefaults} from './fib-level-format-native';
import {FIB_TREND_LINE_FIELD,readFibTrendLine} from './fib-trend-line-data';
import {FIB_BACKGROUND_FIELD,FIB_TEXT_FIELD,readFibBackground,readFibText} from './fib-level-presentation-data';

interface Slot {
 readonly key:string;
 readonly descriptor:PropertyDescriptor;
 readonly path:readonly {owner:object;prototype:object|null}[];
}

const mapPrototype=Map.prototype;
const mapGet=Map.prototype.get;
const localOwners=new WeakMap<Function,{canonicalOwner:OwnedDrawingEditAcceptance;source:()=>void;local:()=>void;presentation:boolean}>();

/** Internal component of a genuinely minted binding; never accepts public-shaped status. */
export function resolveFibTrendLineNativeOwner(full:()=>void,canonicalOwner:OwnedDrawingEditAcceptance,source:()=>void):()=>void{
 const proof=localOwners.get(full);if(!proof||proof.presentation||proof.canonicalOwner!==canonicalOwner||proof.source!==source)throw Error('Fibonacci trend line native local proof has another owner.');
 proof.local();return proof.local;
}

/** Resolve a native data field without invoking an accessor or a delegated get(). */
function slot(root:unknown,key:string,inherited=false):Slot {
 if(!root||typeof root!=='object')throw Error('Fibonacci trend line drawing owner unavailable: '+key);
 const path:{owner:object;prototype:object|null}[]=[];
 for(let owner:object|null=root;owner;owner=inherited?Object.getPrototypeOf(owner):null){
  if(path.length===32)throw Error('Fibonacci trend line native prototype chain is unsupported.');
  const prototype=Object.getPrototypeOf(owner),descriptor=Object.getOwnPropertyDescriptor(owner,key);
  path.push({owner,prototype});
  if(descriptor){
   if(!Object.hasOwn(descriptor,'value'))throw Error('Fibonacci trend line drawing requires a data field: '+key);
   return{key,descriptor,path};
  }
 }
 throw Error('Fibonacci trend line drawing field unavailable: '+key);
}

function unchanged(field:Slot):void {
 for(let index=0;index<field.path.length;index++){
  const {owner,prototype}=field.path[index];
  if(Object.getPrototypeOf(owner)!==prototype)throw Error('Fibonacci trend line drawing prototype changed: '+field.key);
  const next=Object.getOwnPropertyDescriptor(owner,field.key);
  if(index<field.path.length-1){
   if(next)throw Error('Fibonacci trend line drawing method ownership changed: '+field.key);
  }else{
   const before=field.descriptor;
   if(!next||!Object.is(next.value,before.value)||next.get!==before.get||next.set!==before.set||next.writable!==before.writable||next.enumerable!==before.enumerable||next.configurable!==before.configurable)throw Error('Fibonacci trend line drawing owner changed: '+field.key);
  }
 }
}

/**
 * Trusted internal adapter boundary, not authentication of public-shaped arguments.
 * The private canonical index supplies its exact detached row and genuine document
 * receipt. This helper never reads/clones the document or exposes the native store.
 * The annotation installation separately owns the exact renderer/anchor tuple.
 * The complete canonical/native comparison happens at acquisition. Each later
 * full/local assertion also pins the two-anchor and closed baseline dependency
 * slots, so ordinary native applySettings changes cannot pass a final callback
 * boundary merely because model identity/canonical epoch stayed unchanged.
 * This is a semantic tuple proof, not a whole opaque native graph guarantee.
 */
export function captureFibTrendLineNativeOwner(
 facade:object,
 canonical:Readonly<SerializedDrawing>,
 projected:Readonly<SerializedDrawing>,
 canonicalOwner:OwnedDrawingEditAcceptance,
 assertSource:()=>void,
):()=>void {return captureNativeOwner(facade,canonical,projected,canonicalOwner,assertSource,false);}

/** Common identity/geometry proof deliberately does not interpret baseline data. */
export function captureFibLevelPresentationNativeOwner(facade:object,canonical:Readonly<SerializedDrawing>,projected:Readonly<SerializedDrawing>,canonicalOwner:OwnedDrawingEditAcceptance,assertSource:()=>void):()=>void{return captureNativeOwner(facade,canonical,projected,canonicalOwner,assertSource,true);}
export function resolveFibLevelPresentationNativeOwner(full:()=>void,canonicalOwner:OwnedDrawingEditAcceptance,source:()=>void):()=>void{
 const proof=localOwners.get(full);if(!proof||!proof.presentation||proof.canonicalOwner!==canonicalOwner||proof.source!==source)throw Error('Fibonacci presentation native local proof has another owner.');proof.local();return proof.local;
}
function captureNativeOwner(facade:object,canonical:Readonly<SerializedDrawing>,projected:Readonly<SerializedDrawing>,canonicalOwner:OwnedDrawingEditAcceptance,assertSource:()=>void,presentation:boolean):()=>void {
 if(typeof assertSource!=='function')throw Error('Fibonacci trend line source assertion unavailable.');
 const canonicalId=slot(canonical,'id'),canonicalType=slot(canonical,'type'),projectedId=slot(projected,'id'),projectedType=slot(projected,'type');
 const id=canonicalId.descriptor.value;
 if(typeof id!=='string'||!id||canonicalType.descriptor.value!=='fibretracement'||projectedId.descriptor.value!==id||projectedType.descriptor.value!=='fibretracement')throw Error('Fibonacci trend line drawing identity requires the exact Fibonacci retracement.');
 const receiptSlot=slot(canonicalOwner,'assertCurrent'),receiptMethod=receiptSlot.descriptor.value;
 if(typeof receiptMethod!=='function')throw Error('Fibonacci trend line canonical receipt unavailable.');
 const ctrlSlot=slot(facade,'ctrl'),controller=ctrlSlot.descriptor.value,storeSlot=slot(controller,'store'),store=storeSlot.descriptor.value;
 const mapSlot=slot(store,'byId'),map=mapSlot.descriptor.value,getSlot=slot(store,'get',true),mapGetSlot=slot(mapPrototype,'get');
 if(!map||typeof map!=='object'||Object.getPrototypeOf(map)!==mapPrototype||Object.hasOwn(map,'get')||mapGetSlot.descriptor.value!==mapGet||typeof getSlot.descriptor.value!=='function')throw Error('Fibonacci trend line drawing requires the exact native identity map.');
 const model=Reflect.apply(mapGet,map,[id]);
 if(!model||typeof model!=='object')throw Error('Fibonacci trend line native drawing was removed.');
 const modelId=slot(model,'id'),modelType=slot(model,'type'),paneSlot=slot(model,'paneId'),serializeSlot=slot(model,'serialize',true),serialize=serializeSlot.descriptor.value;
 if(modelId.descriptor.value!==id||modelType.descriptor.value!=='fibretracement'||typeof serialize!=='function')throw Error('Fibonacci trend line native drawing identity or serializer changed.');
 assertNativeFibTrendLineModel(model);
 const visible=slot(model,'visible'),locked=slot(model,'locked'),anchorSlot=slot(model,'anchors'),anchors=anchorSlot.descriptor.value,baselineSlot=slot(model,FIB_TREND_LINE_FIELD),baseline=baselineSlot.descriptor.value;
 if(typeof visible.descriptor.value!=='boolean'||typeof locked.descriptor.value!=='boolean'||!Array.isArray(anchors)||Object.getPrototypeOf(anchors)!==Array.prototype||anchors.length!==2)throw Error('Fibonacci native geometry tuple unavailable.');
 const interpreted=readFibTrendLine({[FIB_TREND_LINE_FIELD]:baseline},nativeFibTrendLineDefaults());if(!presentation&&interpreted.state==='unavailable')throw Error(interpreted.message);
 const semantic:Slot[]=[visible,locked,anchorSlot,slot(anchors,'length'),baselineSlot];
 for(let index=0;index<2;index++){const entry=slot(anchors,String(index)),point=entry.descriptor.value;if(!point||typeof point!=='object'||![Object.prototype,null].includes(Object.getPrototypeOf(point)))throw Error('Fibonacci native anchor requires plain data.');semantic.push(entry);for(const key of ['time','price']){const value=slot(point,key);if(typeof value.descriptor.value!=='number'||!Number.isFinite(value.descriptor.value))throw Error('Fibonacci native anchor must be finite.');semantic.push(value);}}
 if(interpreted.state!=='unavailable')for(const key of ['schemaVersion','enabled','color','width','style'])semantic.push(slot(baseline,key));
 const absences:{object:object;key:string}[]=[],closed:{object:object;count:number}[]=[];
 if(interpreted.state!=='unavailable')closed.push({object:baseline,count:5});
 if(presentation){
  for(const key of ['reverse','background','showRatios','showPrices','labelSide','numbersSize','labelsSize'])semantic.push(slot(model,key));
  for(const key of ['entryLines','fillBands','levelLines','levelText'])semantic.push(slot(model,key,true));
  const style=slot(model,'style');semantic.push(style);for(const key of ['lineWidth','lineStyle'])semantic.push(slot(style.descriptor.value,key));for(const key of ['extendLeft','extendRight'])if(Object.hasOwn(style.descriptor.value,key))semantic.push(slot(style.descriptor.value,key));else absences.push({object:style.descriptor.value,key});
  const levelsSlot=slot(model,'levels'),levels=levelsSlot.descriptor.value;semantic.push(levelsSlot,slot(levels,'length'));
  if(!Array.isArray(levels)||Object.getPrototypeOf(levels)!==Array.prototype||levels.length>10000||Reflect.ownKeys(levels).length!==levels.length+1)throw Error('Fibonacci presentation requires dense native levels.');
  for(let i=0;i<levels.length;i++){const row=slot(levels,String(i));semantic.push(row);for(const key of ['ratio','color','enabled'])semantic.push(slot(row.descriptor.value,key));if(Object.hasOwn(row.descriptor.value,'label'))semantic.push(slot(row.descriptor.value,'label'));else absences.push({object:row.descriptor.value,key:'label'});}
  semantic.push(slot(model,'lvFibLevelFormat'));
  for(const [key,reader,keys] of [[FIB_BACKGROUND_FIELD,readFibBackground,['schemaVersion','opacity']],[FIB_TEXT_FIELD,readFibText,['schemaVersion','enabled','position']]] as const){const field=slot(model,key),value=field.descriptor.value;semantic.push(field);if(reader({[key]:value}).state!=='unavailable'){for(const name of keys)semantic.push(slot(value,name));closed.push({object:value,count:keys.length});}}
 }
 const fields=[canonicalId,canonicalType,projectedId,projectedType,receiptSlot,ctrlSlot,storeSlot,mapSlot,getSlot,mapGetSlot,modelId,modelType,paneSlot,serializeSlot,...semantic];
 let retired=false,checking=false;
 const structural=()=>{
  if(retired)throw Error('Fibonacci trend line drawing owner retired.');
  for(const field of fields)unchanged(field);
  assertNativeFibTrendLineModel(model);for(const row of closed)if(Reflect.ownKeys(row.object).length!==row.count)throw Error('Fibonacci native interpreted shape changed.');for(const row of absences)if(Object.hasOwn(row.object,row.key))throw Error('Fibonacci optional label changed.');
  if(Object.getPrototypeOf(map)!==mapPrototype||Object.hasOwn(map,'get')||Reflect.apply(mapGet,map,[id])!==model)throw Error('Fibonacci trend line native drawing identity changed.');
 };
 const receipt=()=>{structural();Reflect.apply(receiptMethod,canonicalOwner,[]);structural();};
 const assertCurrent=()=>{
  if(retired)throw Error('Fibonacci trend line drawing owner retired.');
  if(checking){retired=true;throw Error('Fibonacci trend line drawing ownership assertion reentered.');}
  checking=true;
  try{receipt();assertSource();receipt();}
  catch(error){retired=true;throw error;}
  finally{checking=false;}
 };
 assertCurrent();
 // Reject malformed/mismatched detached projections before calling native code.
 assertNativeDrawingMatchesCanonical(canonical as SerializedDrawing,projected as SerializedDrawing);assertCurrent();
 const native=Reflect.apply(serialize,model,[]) as SerializedDrawing;assertCurrent();
 assertNativeDrawingMatchesCanonical(canonical as SerializedDrawing,native);assertCurrent();
 const local=()=>{if(checking){retired=true;throw Error('Fibonacci trend line drawing ownership assertion reentered.');}checking=true;try{structural();}catch(error){retired=true;throw error;}finally{checking=false;}};
 localOwners.set(assertCurrent,{canonicalOwner,source:assertSource,local,presentation});
 return Object.freeze(assertCurrent);
}
