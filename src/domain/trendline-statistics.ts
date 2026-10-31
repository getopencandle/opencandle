import type {Bar} from './types';

export const TRENDLINE_STATISTICS_MAX_ROWS=100000;
export const TRENDLINE_TIME_MIN_MS=-62135596800000;
export const TRENDLINE_TIME_MAX_MS=253402300799999;
export interface TrendlineStatisticsAnchor {time:number;price:number}
export interface PreparedTrendlineStatisticsGrid {readonly count:number}
export type TrendlineStatistic<T>=Readonly<{state:'available';value:T}|{state:'unavailable';reason:string}>;
export interface TrendlineStatistics {
 readonly priceRange:TrendlineStatistic<number>;
 readonly percentChange:TrendlineStatistic<number>;
 readonly barsRange:TrendlineStatistic<number>;
 readonly dateTimeRange:TrendlineStatistic<Readonly<{startMs:number;endMs:number;elapsedMs:number}>>;
 readonly dateTimeLabels:TrendlineStatistic<Readonly<{start:string;end:string;timezone:string}>>;
}
export type TrendlineStatisticName='priceRange'|'percentChange'|'barsRange'|'dateTimeRange';
export interface TrendlineStatisticsContext {grid?:PreparedTrendlineStatisticsGrid;timezone?:string;requested?:readonly TrendlineStatisticName[]}
const metricNames=['priceRange','percentChange','barsRange','dateTimeRange'] as const;
const grids=new WeakMap<object,Float64Array>();
const available=<T>(value:T):TrendlineStatistic<T>=>Object.freeze({state:'available',value});
const unavailable=<T>(reason:string):TrendlineStatistic<T>=>Object.freeze({state:'unavailable',reason:reason.slice(0,240)});
function plain(value:unknown):value is Record<string,unknown>{return value!==null&&typeof value==='object'&&!Array.isArray(value)&&[Object.prototype,null].includes(Object.getPrototypeOf(value));}
function data(value:object,key:string):unknown{const field=Object.getOwnPropertyDescriptor(value,key);if(!field?.enumerable||!Object.hasOwn(field,'value'))throw Error('Trendline statistics require own enumerable data: '+key);return field.value;}
function array(value:unknown,maximum:number):unknown[]{
 if(!Array.isArray(value)||Object.getPrototypeOf(value)!==Array.prototype)throw Error('Trendline statistics require an ordinary array.');
 const length=Object.getOwnPropertyDescriptor(value,'length');if(!length||!Object.hasOwn(length,'value')||!Number.isInteger(length.value)||length.value<0||length.value>maximum)throw Error('Trendline statistics array bound exceeded.');
 const keys=Reflect.ownKeys(value);if(keys.length!==length.value+1||keys.some(key=>typeof key!=='string'||key!=='length'&&(!/^(0|[1-9]\d*)$/.test(key)||Number(key)>=length.value)))throw Error('Trendline statistics array is sparse or contains extra fields.');
 return value;
}
function time(value:unknown):value is number{return typeof value==='number'&&Number.isFinite(value)&&value>=TRENDLINE_TIME_MIN_MS&&value<=TRENDLINE_TIME_MAX_MS;}

/** Detached scalar prefix only. The host separately owns live source/revision/cache lifetime. */
export function prepareTrendlineStatisticsGrid(bars:readonly Bar[]):PreparedTrendlineStatisticsGrid{
 const rows=array(bars,TRENDLINE_STATISTICS_MAX_ROWS),times=new Float64Array(rows.length);let previous=-Infinity;
 for(let i=0;i<rows.length;i++){
  const row=data(rows,String(i));if(!plain(row))throw Error('Trendline grid requires plain bar records.');
  const seconds=data(row,'time');if(typeof seconds!=='number'||!Number.isSafeInteger(seconds))throw Error('Trendline grid requires canonical integer-second bar times.');
  const millis=seconds*1000;if(!time(millis)||millis<=previous)throw Error('Trendline grid requires increasing supported timestamps.');
  times[i]=millis;previous=millis;
 }
 const handle=Object.freeze({count:times.length});grids.set(handle,times);return handle;
}

function position(times:Float64Array,value:number):number|null{
 if(!times.length||value<times[0]||value>times[times.length-1])return null;
 let low=0,high=times.length-1;
 while(low<=high){const middle=(low+high)>>>1;if(times[middle]===value)return middle;if(times[middle]<value)low=middle+1;else high=middle-1;}
 if(high<0||low>=times.length)return null;
 const fraction=(value-times[high])/(times[low]-times[high]),result=high+fraction;
 // Do not present a nonrepresentable fractional position as an exact bar center.
 if(!(fraction>0&&fraction<1)||result===high||result===low)return null;
 return result;
}

/** At most two finite binary64 inputs: aligned numerator <=2106 bits, denominator <=2098. */
function percentage(first:number,second:number):number{
 const view=new DataView(new ArrayBuffer(8));
 const parts=(value:number)=>{view.setFloat64(0,value,false);const high=view.getUint32(0,false),low=view.getUint32(4,false),encoded=(high>>>20)&2047;
  const fraction=(BigInt(high&0xfffff)<<32n)|BigInt(low),integer=encoded?(1n<<52n)|fraction:fraction;
  return{integer:(high>>>31)?-integer:integer,exponent:encoded?encoded-1075:-1074};};
 const a=parts(first),b=parts(second),exponent=Math.min(a.exponent,b.exponent);
 const denominator=a.integer<<BigInt(a.exponent-exponent),signed=((b.integer<<BigInt(b.exponent-exponent))-denominator)*100n;
 if(signed===0n)return 0;
 const negative=signed<0n,numerator=negative?-signed:signed;
 const bits=(value:bigint)=>value.toString(2).length;
 if(bits(numerator)>2106||bits(denominator)>2098||denominator<=0n)throw Error('Percentage scalar bound exceeded.');
 let power=bits(numerator)-bits(denominator);
 if(power>=0?numerator<(denominator<<BigInt(power)):(numerator<<BigInt(-power))<denominator)power--;
 if(power>1023)throw Error('Percentage overflow is unavailable.');
 const rounded=(shift:number)=>{const n=shift>=0?numerator<<BigInt(shift):numerator,d=shift>=0?denominator:denominator<<BigInt(-shift),q=n/d,r=n%d;return r*2n>d||r*2n===d&&(q&1n)!==0n?q+1n:q;};
 let value:number;
 if(power<-1022){const q=rounded(1074);if(q===0n)throw Error('Nonzero percentage below binary64 precision is unavailable.');value=Number(q)*Number.MIN_VALUE;}
 else{let q=rounded(52-power);if(q===(1n<<53n)){q>>=1n;power++;}if(power>1023)throw Error('Percentage rounding overflow is unavailable.');value=Number(q)*2**(power-52);}
 if(!Number.isFinite(value)||value===0)throw Error('Percentage is not representable.');return negative?-value:value;
}

function labels(start:number,end:number,timezone:unknown):TrendlineStatistic<Readonly<{start:string;end:string;timezone:string}>>{
 if(typeof timezone!=='string'||!timezone||timezone.length>100)return unavailable('Timestamp labels require an explicit supported chart timezone.');
 if(!Number.isInteger(start)||!Number.isInteger(end))return unavailable('Timestamp labels cannot preserve fractional milliseconds; raw endpoints and elapsed duration remain available.');
 try{
  const formatter=new Intl.DateTimeFormat('en-US-u-ca-gregory-nu-latn',{timeZone:timezone,calendar:'gregory',numberingSystem:'latn',era:'short',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',fractionalSecondDigits:3,hourCycle:'h23',timeZoneName:'longOffset'});
  const format=(value:number)=>{const parts=formatter.formatToParts(new Date(value)),values=new Map(parts.map(part=>[part.type,part.value])),year=Number(values.get('year')),offset=values.get('timeZoneName');
   if(values.get('era')!=='AD'||!Number.isInteger(year)||year<1||year>9999||!offset||!/^GMT(?:[+-]\d{2}:\d{2}(?::\d{2})?)?$/.test(offset))throw Error('Timestamp label year or UTC offset is unavailable.');
   const required=['month','day','hour','minute','second','fractionalSecond'] as const;for(const field of required)if(!/^\d+$/.test(values.get(field)??''))throw Error('Timestamp label fields are unavailable.');
   return`${String(year).padStart(4,'0')}-${values.get('month')}-${values.get('day')}T${values.get('hour')}:${values.get('minute')}:${values.get('second')}.${values.get('fractionalSecond')}${offset==='GMT'?'+00:00':offset.slice(3)}`;
  };
  return available(Object.freeze({start:format(start),end:format(end),timezone}));
 }catch{return unavailable('Timestamp labels require a valid timezone and representable local year/offset; raw elapsed duration remains available.');}
}

/** Original LV definitions. Every metric has separate availability; no pane/source/paint authority is inferred. */
export function calculateTrendlineStatistics(anchors:readonly TrendlineStatisticsAnchor[],context:TrendlineStatisticsContext={}):Readonly<TrendlineStatistics>{
 const rows=array(anchors,2);if(rows.length!==2)throw Error('Trendline statistics require exactly two ordered anchors.');
 const points:Array<{price:unknown;time:unknown}>=[];
 for(let index=0;index<2;index++){const row=data(rows,String(index));if(!plain(row))throw Error('Trendline statistics require plain anchor records.');points.push({price:data(row,'price'),time:data(row,'time')});}
 if(!plain(context))throw Error('Trendline statistics context must be plain data.');
 for(const key of Reflect.ownKeys(context))if(typeof key!=='string'||!['grid','timezone','requested'].includes(key)||!Object.getOwnPropertyDescriptor(context,key)?.enumerable||!Object.hasOwn(Object.getOwnPropertyDescriptor(context,key)!,'value'))throw Error('Unsupported Trendline statistics context.');
 const requestField=Object.getOwnPropertyDescriptor(context,'requested'),requested=new Set<TrendlineStatisticName>();
 if(!requestField)for(const name of metricNames)requested.add(name);
 else{const names=array(requestField.value,4);for(let i=0;i<names.length;i++){const name=data(names,String(i));if(typeof name!=='string'||!(metricNames as readonly string[]).includes(name)||requested.has(name as TrendlineStatisticName))throw Error('Requested statistics require unique supported metric names.');requested.add(name as TrendlineStatisticName);}}
 const grid=Object.getOwnPropertyDescriptor(context,'grid')?.value,timezone=Object.getOwnPropertyDescriptor(context,'timezone')?.value;
 const times=grid===undefined?undefined:typeof grid==='object'&&grid!==null?grids.get(grid):undefined;
 if(grid!==undefined&&!times)throw Error('Trendline statistics grid is not privately prepared.');
 const first=points[0],second=points[1],prices=typeof first.price==='number'&&Number.isFinite(first.price)&&typeof second.price==='number'&&Number.isFinite(second.price);
 let priceRange:TrendlineStatistic<number>=unavailable(requested.has('priceRange')?'Price range requires two finite anchor prices.':'Metric not requested.'),percentChange:TrendlineStatistic<number>=unavailable(requested.has('percentChange')?'Percent change requires two finite prices and a strictly positive first price.':'Metric not requested.');
 if(prices){const a=first.price as number,b=second.price as number;
  if(requested.has('priceRange')){const difference=b-a;priceRange=Number.isFinite(difference)?available(difference===0?0:difference):unavailable('Price difference overflow is unavailable.');}
  if(requested.has('percentChange')&&a>0)try{percentChange=available(percentage(a,b));}catch(error){percentChange=unavailable(error instanceof Error?error.message:'Percentage is unavailable.');}}
 let barsRange:TrendlineStatistic<number>=unavailable(requested.has('barsRange')?'Bar intervals require an exact prepared temporal prefix and supported anchor instants.':'Metric not requested.'),dateTimeRange:TrendlineStatistics['dateTimeRange']=unavailable(requested.has('dateTimeRange')?'Date/time range requires two finite supported millisecond instants.':'Metric not requested.'),dateTimeLabels:TrendlineStatistics['dateTimeLabels']=unavailable(requested.has('dateTimeRange')?'Timestamp labels require supported raw anchor instants.':'Metric not requested.');
 if(time(first.time)&&time(second.time)){
  const start=first.time,end=second.time;
  if(requested.has('dateTimeRange')){dateTimeRange=available(Object.freeze({startMs:start,endMs:end,elapsedMs:Math.abs(end-start)}));dateTimeLabels=labels(start,end,timezone);}
  if(requested.has('barsRange')&&times){const a=position(times,start),b=position(times,end);if(a!==null&&b!==null){const span=Math.abs(b-a);barsRange=span===0&&start!==end?unavailable('Fractional bar interval is below the supported precision.'):available(span);}else barsRange=unavailable('An anchor is outside the supplied grid or its fractional logical position is not representable.');}
 }
 return Object.freeze({priceRange,percentChange,barsRange,dateTimeRange,dateTimeLabels});
}

/** Original LV extensions of the statistics. Kept apart from calculateTrendlineStatistics so its result shape is unchanged for saved consumers. */
export interface TrendlineDistance {readonly bars:number;readonly price:number}
/** The reference gives no distance formula in our facts, so distance is the bar count and the absolute price difference, shown as a pair. */
export function calculateTrendlineDistance(anchors:readonly TrendlineStatisticsAnchor[],context:TrendlineStatisticsContext={}):TrendlineStatistic<TrendlineDistance>{
 const result=calculateTrendlineStatistics(anchors,{...context,requested:['priceRange','barsRange']});
 if(result.barsRange.state!=='available')return unavailable('Distance needs the bar count: '+result.barsRange.reason);
 if(result.priceRange.state!=='available')return unavailable('Distance needs the price difference: '+result.priceRange.reason);
 return available(Object.freeze({bars:result.barsRange.value,price:Math.abs(result.priceRange.value)}));
}
/** Degrees of the segment in screen space, the projection the user sees. Screen y grows downward, so a line rising to the right is positive.
 * The segment is read left to right, which keeps the result within -90 to 90. Callers recompute it on every viewport change. */
export function calculateTrendlineAngle(first:{x:number;y:number},second:{x:number;y:number}):TrendlineStatistic<number>{
 const values=[first?.x,first?.y,second?.x,second?.y];
 if(!values.every(value=>typeof value==='number'&&Number.isFinite(value)))return unavailable('Angle needs finite screen coordinates.');
 const [left,right]=first.x<=second.x?[first,second]:[second,first];
 const dx=right.x-left.x,dy=left.y-right.y;
 if(dx===0&&dy===0)return unavailable('Angle needs two distinct points.');
 const degrees=Math.atan2(dy,dx)*180/Math.PI;
 return available(Object.is(degrees,-0)?0:degrees);
}
export const TRENDLINE_PIPS_UNAVAILABLE_REASON='Change in pips needs the instrument pip size, which is not available for this data.';
/** Not claimed (Q3): no dataset declares a pip size, so without one this is always unavailable. A supplied positive finite pip size divides the signed price change; nothing here defines one. */
export function calculateChangeInPips(anchors:readonly TrendlineStatisticsAnchor[],pipSize:unknown):TrendlineStatistic<number>{
 if(typeof pipSize!=='number'||!Number.isFinite(pipSize)||pipSize<=0)return unavailable(TRENDLINE_PIPS_UNAVAILABLE_REASON);
 const range=calculateTrendlineStatistics(anchors,{requested:['priceRange']}).priceRange;
 if(range.state!=='available')return unavailable(range.reason);
 const value=range.value/pipSize;
 return Number.isFinite(value)?available(value):unavailable('Pip change overflow is unavailable.');
}
