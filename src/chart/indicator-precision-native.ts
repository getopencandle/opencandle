import {formatIndicatorNumber} from './indicator-number-format';

type NativeRecord=Record<string,any>;
function dataMethod(target:object,key:PropertyKey):Function{for(let current:object|null=target;current;current=Object.getPrototypeOf(current)){const field=Object.getOwnPropertyDescriptor(current,key);if(field){if(!Object.hasOwn(field,'value')||typeof field.value!=='function')throw Error('Indicator tick methods must remain data functions.');return field.value;}}throw Error('Indicator tick method is unavailable.');}
export interface IndicatorPrecisionAxis {
 scale:object;bounds:object;x:number;maxWidth:number;precision:number;
 transform(value:number):number;suffix:string;signed:boolean;assertCurrent():void;
}

/** Call-local facades preserve the actual native tick generator and painter body. */
export function withIndicatorTickPrecision<T>(ctx:CanvasRenderingContext2D,coords:NativeRecord,axes:readonly IndicatorPrecisionAxis[],assertCurrent:()=>void,run:(context:CanvasRenderingContext2D,coordinates:NativeRecord)=>T):T{
 let active=true,ordinal=0,pending:{axis:IndicatorPrecisionAxis;price:number;y:number;ordinal:number}|null=null;
 const assert=()=>{if(!active)throw Error('Indicator tick formatting call is retired.');assertCurrent();};
 const contextMethods=new Map<PropertyKey,Function>(),coordinateMethods=new Map<PropertyKey,Function>();
 let context:CanvasRenderingContext2D,coordinates:NativeRecord;
 const delegate=(target:object,key:PropertyKey,receiver:unknown,args:unknown[],facade:object,cache:Map<PropertyKey,Function>)=>{
  assert();if(receiver!==facade)throw Error('Indicator tick facade receiver changed.');const method=dataMethod(target,key);assert();
  const value=Reflect.apply(method,target,args);assert();return value;
 };
 coordinates=new Proxy(coords,{
  get(target,key){assert();if(key==='priceToY')return project;const value=Reflect.get(target,key,target);if(typeof value!=='function')return value;if(!coordinateMethods.has(key))coordinateMethods.set(key,function(this:unknown,...args:unknown[]){return delegate(target,key,this,args,coordinates,coordinateMethods);});return coordinateMethods.get(key);},
  set(){throw Error('Indicator tick coordinates are read-only during formatting.');},
 });
 function project(this:unknown,price:number,scale:object,bounds:object){
  assert();if(this!==coordinates)throw Error('Indicator tick coordinate receiver changed.');const call=++ordinal;pending=null;
  const matches=axes.filter(axis=>axis.scale===scale&&axis.bounds===bounds);if(matches.length>1)throw Error('Indicator tick scale ownership is ambiguous.');
  const axis=matches[0];axis?.assertCurrent();const original=dataMethod(coords,'priceToY');assert();axis?.assertCurrent();
  const y=Reflect.apply(original,coords,[price,scale,bounds]);assert();axis?.assertCurrent();
  if(call!==ordinal)throw Error('Indicator tick coordinate preparation was reentered.');
  if(axis){if(typeof price!=='number'||!Number.isFinite(price)||typeof y!=='number'||!Number.isFinite(y))throw Error('Indicator tick price or coordinate is unavailable.');pending={axis,price,y,ordinal:call};}
  return y;
 }
 context=new Proxy(ctx,{
  get(target,key){assert();if(key==='fillText')return text;const value=Reflect.get(target,key,target);if(typeof value!=='function')return value;if(!contextMethods.has(key))contextMethods.set(key,function(this:unknown,...args:unknown[]){return delegate(target,key,this,args,context,contextMethods);});return contextMethods.get(key);},
  set(target,key,value){assert();const accepted=Reflect.set(target,key,value,target);assert();return accepted;},
 });
 function text(this:unknown,label:string,x:number,y:number,...remaining:unknown[]){
  assert();if(this!==context)throw Error('Indicator tick text receiver changed.');const match=pending;pending=null;
  if(match&&match.ordinal===ordinal&&x===match.axis.x&&y===match.y){
   match.axis.assertCurrent();const transformed=match.axis.transform(match.price);assert();match.axis.assertCurrent();
   label=formatIndicatorNumber(transformed,match.axis.precision);label=(match.axis.signed&&!label.startsWith('-')?'+':'')+label+match.axis.suffix;assert();match.axis.assertCurrent();
   if(!Number.isFinite(match.axis.maxWidth)||match.axis.maxWidth<=0)throw Error('Indicator tick column width is unavailable.');remaining=[match.axis.maxWidth];
  }
  const original=dataMethod(ctx,'fillText');assert();match?.axis.assertCurrent();
  const result=Reflect.apply(original,ctx,[label,x,y,...remaining]);assert();return result;
 }
 try{assert();return run(context,coordinates);}finally{active=false;pending=null;contextMethods.clear();coordinateMethods.clear();}
}
