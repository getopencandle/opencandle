// LV Renko construction. Inputs and defaults: style.renkoStyle
// (style ATR, atrLength 14, boxSize 3, percentageLTP 1, source close, wicks true).
// Construction (LV, reference anchor unresolved): the first source price is the base; an up brick
// forms when price reaches the last brick top plus one box, a down brick when price reaches the
// last brick bottom minus one box (a reversal therefore needs two boxes from the brick extreme).
// Wicks show the extreme source prices reached since the previous brick, before the completing price.
// Inputs:
//  * Base price: 0 (default) keeps the first source price as the base. A positive value anchors the brick grid: the base is the
//    grid level basePrice + k*box nearest the first source price, so every brick edge sits on basePrice + n*box.
//  * One step back building: off (default) keeps the two-box reversal. On, a reversal brick forms one box back from the last
//    brick's close and spans the previous brick's body (the reversal needs one box, not two).
import type {Bar} from '../../domain/types';
import {canonicalTransformId,derivedBar,ohlcPath,resolveStep,type DerivedBar,type DerivedResult} from './common';

export interface RenkoSettings {boxMethod:unknown;atrLength:unknown;boxSize:unknown;percentage:unknown;source:unknown;wicks:unknown;basePrice?:unknown;oneStepBackBuilding?:unknown}
/** Base of the brick grid: the first source price, or the grid level of a positive base price nearest to it. */
export function renkoBase(first:number,box:number,basePrice:number):number{return basePrice>0?basePrice+Math.round((first-basePrice)/box)*box:first;}
export function renko(bars:readonly Bar[],settings:RenkoSettings):DerivedResult{
  const step=resolveStep('renko',bars,settings.boxMethod,{atrLength:settings.atrLength,fixed:settings.boxSize,percentage:settings.percentage});
  if(!step.ok)return step;
  const box=step.value,useOhlc=settings.source==='ohlc',wicks=settings.wicks!==false;
  if(settings.source!=='close'&&!useOhlc)return {ok:false,diagnostic:{code:'DERIVED_SETTING_INVALID',feature:'renko',message:'Renko source must be close or ohlc.',severity:'unavailable'}};
  const basePrice=settings.basePrice===undefined?0:settings.basePrice,stepBack=settings.oneStepBackBuilding===undefined?false:settings.oneStepBackBuilding;
  if(typeof basePrice!=='number'||!Number.isFinite(basePrice)||basePrice<0)return {ok:false,diagnostic:{code:'DERIVED_SETTING_INVALID',feature:'renko',message:'Renko base price must be 0 (first price) or a positive price.',severity:'unavailable'}};
  if(typeof stepBack!=='boolean')return {ok:false,diagnostic:{code:'DERIVED_SETTING_INVALID',feature:'renko',message:'Renko one step back building must be on or off.',severity:'unavailable'}};
  const path=(bar:Bar)=>useOhlc?ohlcPath(bar):[bar.close];
  const base=renkoBase(path(bars[0])[0],box,basePrice);
  let top=base,bottom=base,accHigh=base,accLow=base,spanStart=0,last=base,dir=0;
  const confirmed:DerivedBar[]=[];
  bars.forEach((bar,index)=>{
    for(const price of path(bar)){
      // One step back: after a down brick the up reversal starts at the brick's close (bottom), after an up brick the down one at its close (top).
      const upFrom=()=>stepBack&&dir<0?bottom:top,downFrom=()=>stepBack&&dir>0?top:bottom;
      while(price>=upFrom()+box*(1-1e-12)){
        const open=upFrom(),close=open+box;
        confirmed.push(derivedBar(bar.time,open,close,close,wicks?Math.min(open,accLow):open,[spanStart,index],{confirmedAt:index}));
        bottom=open;top=close;accHigh=accLow=close;spanStart=index;dir=1;
      }
      while(price<=downFrom()-box*(1-1e-12)){
        const open=downFrom(),close=open-box;
        confirmed.push(derivedBar(bar.time,open,close,wicks?Math.max(open,accHigh):open,close,[spanStart,index],{confirmedAt:index}));
        top=open;bottom=close;accHigh=accLow=close;spanStart=index;dir=-1;
      }
      accHigh=Math.max(accHigh,price);accLow=Math.min(accLow,price);last=price;
    }
  });
  const end=bars.length-1,time=bars[end].time,projection:DerivedBar[]=[];
  if(last>top)projection.push(derivedBar(time,top,last,last,top,[spanStart,end],{projection:true}));
  else if(last<bottom)projection.push(derivedBar(time,bottom,last,bottom,last,[spanStart,end],{projection:true}));
  return {ok:true,value:{style:'renko',transformId:canonicalTransformId('renko',{box,source:settings.source,wicks,...(basePrice>0?{basePrice}:{}),...(stepBack?{oneStepBack:true}:{})}),confirmed,projection,step:box,construction:useOhlc?'ohlc-path-approximation':'source-close'}};
}
