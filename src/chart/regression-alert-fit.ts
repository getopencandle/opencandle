import type {Bar} from '../domain/types';

/** Original least-squares calculation. Ordinal observations, not elapsed time, are the renderer's regression variable. */
export const REGRESSION_ALERT_ROW_LIMIT=100000;
export const REGRESSION_ALERT_WORK_PER_ROW=64;
export interface RegressionAlertFit {
 firstIndex:number;lastIndex:number;firstTime:number;lastTime:number;count:number;
 startCenter:number;endCenter:number;halfWidth:number;slope:number;
}
function numeric(row:unknown,key:'time'|'close'):number{
 if(!row||typeof row!=='object'||![Object.prototype,null].includes(Object.getPrototypeOf(row)))throw new Error('Regression trend needs plain observed price rows.');
 const field=Object.getOwnPropertyDescriptor(row,key);
 if(!field||!Object.hasOwn(field,'value')||typeof field.value!=='number'||!Number.isFinite(field.value))throw new Error('Regression trend needs finite observed times and closing prices.');
 return field.value;
}
const bounded=(value:number)=>{if(!Number.isFinite(value))throw new Error('Regression trend arithmetic is not representable.');return value;};

/** Read only selected closes from the supplied observed prefix. Nothing fetches, expands or forecasts the history. */
export function fitRegressionAlert(bars:readonly Pick<Bar,'time'|'close'>[],firstAnchor:number,secondAnchor:number):RegressionAlertFit{
 if(!Array.isArray(bars)||Object.getPrototypeOf(bars)!==Array.prototype||bars.length<2||bars.length>REGRESSION_ALERT_ROW_LIMIT)throw new Error('Regression trend needs two to 100000 observed bars.');
 if(!Number.isFinite(firstAnchor)||!Number.isFinite(secondAnchor)||firstAnchor===secondAnchor)throw new Error('Regression trend needs two distinct finite time anchors.');
 const from=Math.min(firstAnchor,secondAnchor),to=Math.max(firstAnchor,secondAnchor),values:number[]=[],indices:number[]=[],times:number[]=[];
 let previous=-Infinity,total=0;
 for(let index=0;index<bars.length;index++){
  const item=Object.getOwnPropertyDescriptor(bars,String(index));
  if(!item||!Object.hasOwn(item,'value'))throw new Error('Regression trend observed rows cannot be sparse or accessor-based.');
  const row=item.value,time=numeric(row,'time');
  if(time< -62135596800||time>253402300799||time<=previous)throw new Error('Regression trend requires increasing observed times within years 0001 through 9999.');
  previous=time;
  if(time<from||time>to)continue;
  const close=numeric(row,'close');values.push(close);indices.push(index);times.push(time);total=bounded(total+close);
 }
 const count=values.length;if(count<2)throw new Error('Regression trend needs at least two observed bars inside its time window.');
 const center=(count-1)/2,mean=total/count;let covariance=0,variance=0;
 for(let index=0;index<count;index++){
  const x=index-center;
  covariance=bounded(covariance+bounded(x*(values[index]-mean)));variance=bounded(variance+x*x);
 }
 const slope=bounded(covariance/variance),startCenter=bounded(mean-slope*center),endCenter=bounded(mean+slope*center);
 let residualSquares=0;
 for(let index=0;index<count;index++){
  const difference=bounded(values[index]-(mean+slope*(index-center)));
  residualSquares=bounded(residualSquares+bounded(difference*difference));
 }
 const halfWidth=bounded(2*Math.sqrt(residualSquares/count));
 return {firstIndex:indices[0],lastIndex:indices.at(-1)!,firstTime:times[0],lastTime:times.at(-1)!,count,startCenter,endCenter,halfWidth,slope};
}
