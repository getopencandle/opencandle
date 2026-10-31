import type {DrawingBox} from '@luxalgo/vela';

/** Pure supplied coordinates. The closed caller independently proves the WHOLE
 * immutable selected grid/future pairs, current source/native origin0 and budget
 * before/after this call. This module authenticates none of those facts. */
export interface SeasonalityIntradayBoxCoordinates {
 readonly loadedTimes:readonly number[]; // Unix seconds, actual aligned M grid.
 readonly firstObservedTime:number;
 readonly firstLoadedTime:number;
 readonly prefixBars:number; // Actual opens strictly BEFORE firstLoadedTime.
 readonly future:Readonly<{readonly times:Float64Array;readonly offsets:Float64Array}>|null; // ms; tail-relative ordinals.
}
const ownDescriptor=Object.getOwnPropertyDescriptor,prototype=Object.getPrototypeOf,has=Object.prototype.hasOwnProperty;
const typed=prototype(Float64Array.prototype),typedLength=ownDescriptor(typed,'length')!.get!,typedBuffer=ownDescriptor(typed,'buffer')!.get!,typedTag=ownDescriptor(typed,Symbol.toStringTag)!.get!;
const bufferLength=ownDescriptor(ArrayBuffer.prototype,'byteLength')!.get!,resizable=ownDescriptor(ArrayBuffer.prototype,'resizable')?.get;
const KEYS=['id','paneId','overlay','xloc','left','right','top','bottom','extend','bgColor','borderColor','borderWidth','borderStyle','text','textColor','textSize','hAlign','vAlign','wrap','fontFamily','bold','italic'] as const;
const OPTIONAL=new Set<string>(['overlay','bgColor','borderColor','text','textColor']);
const NUMERIC=new Set<string>(['left','right','top','bottom','borderWidth']);
const BOOLEAN=new Set<string>(['overlay','wrap','bold','italic']);
const fail=():never=>{throw Error('Seasonality intraday box coordinates are unavailable.');};
function own(value:unknown,key:PropertyKey):unknown{
 if(!value||typeof value!=='object')return fail();const field=ownDescriptor(value,key);
 if(!field||!Reflect.apply(has,field,['value']))return fail();return field.value;
}
function integer(value:unknown):number{if(typeof value!=='number'||!Number.isSafeInteger(value))return fail();return value;}
function seconds(value:unknown):number{const time=integer(value);if(!Number.isSafeInteger(time*1000))return fail();return time;}
function arrayLength(value:unknown,maximum:number):number{
 if(!Array.isArray(value)||prototype(value)!==Array.prototype)return fail();const count=integer(own(value,'length'));if(count<0||count>maximum)return fail();return count;
}
function floatLength(value:unknown):number{
 try{
  if(Reflect.apply(typedTag,value,[])!=='Float64Array')return fail();const count=Reflect.apply(typedLength,value,[]) as number,buffer=Reflect.apply(typedBuffer,value,[]);
  const bytes=Reflect.apply(bufferLength,buffer,[]) as number;if(bytes<count*8||bytes>373*8||resizable&&Reflect.apply(resizable,buffer,[])||count<1||count>373)return fail();return count;
 }catch{return fail();}
}
/** Additional candidate output only. Existing input/old native boxes, M grid,
 * future373 backings and old/new native overlap stay separately funded. No fee
 * is debited, waived or refunded here; returned numbers grant no permission. */
export function seasonalityIntradayBoxCost(boxes:number):Readonly<{operations:number;numericSlots:number}>{
 if(!Number.isSafeInteger(boxes)||boxes<0||boxes>168)return fail();return Object.freeze({operations:4096*boxes+32768,numericSlots:32*boxes+1024});
}
export function seasonalityIntradayBoxes(boxes:readonly DrawingBox[],coordinates:Readonly<SeasonalityIntradayBoxCoordinates>):DrawingBox[]{
 const count=arrayLength(boxes,168),times=own(coordinates,'loadedTimes') as readonly number[],M=arrayLength(times,100000);if(M<1)return fail();
 const at=(index:number)=>seconds(own(times,String(index)))*1000,first=at(0),last=at(M-1),observed=seconds(own(coordinates,'firstObservedTime'))*1000,loaded=seconds(own(coordinates,'firstLoadedTime'))*1000,prefix=integer(own(coordinates,'prefixBars'));
 if(first!==loaded||last<first||M>1&&last<=first||observed>first||prefix<0||prefix>100000||observed<first&&prefix<1||observed===first&&prefix!==0)return fail();
 const future=own(coordinates,'future');let futureTimes:Float64Array|null=null,offsets:Float64Array|null=null,H=0;
 if(future!==null){futureTimes=own(future,'times') as Float64Array;offsets=own(future,'offsets') as Float64Array;H=floatLength(futureTimes);if(floatLength(offsets)!==H)return fail();}
 const futureAt=(index:number)=>{
  const time=integer(futureTimes![index]),offset=integer(offsets![index]);if(time<=last||offset<1||offset>89280)return fail();return{time,offset};
 };
 if(H){const a=futureAt(0),b=futureAt(H-1);if(b.time<a.time||b.offset<a.offset||H>1&&(b.time<=a.time||b.offset<=a.offset))return fail();}
 const logical=(ms:number,left:boolean):number=>{
  if(ms<first){if(!left||observed>=first||ms!==observed)return fail();return-prefix;}
  if(ms===first)return M===1?0:ms-first; // Preserve native signed-zero boundary arithmetic.
  if(ms===last)return M-1;
  if(ms<last){
   let lo=0,hi=M-1,steps=0;
   while(hi-lo>1){if(++steps>17)return fail();const mid=(lo+hi)>>1;if(at(mid)<=ms)lo=mid;else hi=mid;}
   const a=at(lo),b=at(hi),span=b-a,delta=ms-a;if(!Number.isSafeInteger(span)||span<=0||!Number.isSafeInteger(delta)||delta<0||delta>span)return fail();
   return lo+(ms-a)/span; // Original SDK barTimeToLogical operator order, native ms.
  }
  if(!H)return fail();const end=futureAt(H-1);if(ms>end.time)return fail();if(ms===end.time)return M-1+end.offset;
  let lo=-1,hi=H-1,steps=0;
  while(hi-lo>1){if(++steps>9)return fail();const mid=lo+((hi-lo)>>1);if(futureAt(mid).time<=ms)lo=mid;else hi=mid;}
  const before=lo<0?null:futureAt(lo),after=futureAt(hi),a=before?.time??last,b=after.time,start=before?.offset??0,span=b-a,delta=ms-a;
  if(!Number.isSafeInteger(span)||span<=0||!Number.isSafeInteger(delta)||delta<0||delta>span||after.offset<=start)return fail();
  return M-1+start+(ms-a)/(b-a)*(after.offset-start); // Authored lvFutureSegmentTime order.
 };
 const output:DrawingBox[]=[];
 for(let index=0;index<count;index++){
  const box=own(boxes,String(index));if(!box||typeof box!=='object'||![Object.prototype,null].includes(prototype(box)))return fail();const copy:Record<string,unknown>={};
  // Versioned C producer's22 known scalar fields only. No spread, ownKeys,
  // whole graph clone or arbitrary property enumeration. Extra fields are not
  // a supported input shape; the actual constructor supplies this exact schema.
  for(const key of KEYS){
   const field=ownDescriptor(box,key);if(!field){if(OPTIONAL.has(key))continue;return fail();}if(!Reflect.apply(has,field,['value'])||field.enumerable!==true)return fail();const value=field.value;
   if(value===undefined&&OPTIONAL.has(key)){copy[key]=value;continue;}
   if(NUMERIC.has(key)){if(typeof value!=='number'||!Number.isFinite(value))return fail();}
   else if(BOOLEAN.has(key)){if(typeof value!=='boolean')return fail();}
   else if(key==='textSize'&&typeof value==='number'){if(!Number.isFinite(value)||value<0)return fail();}
   else if(typeof value!=='string'||value.length>4096)return fail();copy[key]=value;
  }
  if(copy.xloc!=='bar_time'||copy.extend!=='none'||copy.id===''||!Number.isSafeInteger(copy.left)||!Number.isSafeInteger(copy.right)||(copy.left as number)>=(copy.right as number)||(copy.top as number)<(copy.bottom as number)||(copy.borderWidth as number)<0)return fail();
  const left=logical(copy.left as number,true),right=logical(copy.right as number,false);if(!Number.isFinite(left)||!Number.isFinite(right)||Math.abs(left)>Number.MAX_SAFE_INTEGER||Math.abs(right)>Number.MAX_SAFE_INTEGER||left>=right)return fail();
  copy.xloc='bar_index';copy.left=left;copy.right=right;output.push(copy as unknown as DrawingBox);
 }
 return output;
}
