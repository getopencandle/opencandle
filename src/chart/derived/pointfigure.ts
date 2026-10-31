// LV Point and figure construction. Inputs and defaults: style.pnfStyle
// (sources Close, boxSize 1, reversalAmount 3, style ATR, atrLength 14, percentageLTP 1, oneStepBackBuilding false).
// Construction (LV, reference anchor unresolved): boxes sit on a grid of whole multiples of the box size anchored at
// zero. Box label L is the row [(L-1)*box, L*box] for X and O alike (one grid, so a reversal column is offset
// from the previous column by one row). An X box L fills when price reaches L*box; an O box L fills when price falls to
// L*box. The first X box is the first label above the first price, the first O box the first label below it. An X
// column extends to every label the price reaches; it reverses when price falls `reversalAmount` boxes below the column
// top, and the O column starts one box below that top (symmetric for O columns). With One step back building on
//  the reversal column starts in the row of the previous column's extreme instead. Each column is
// one display bar: X runs open (lowest label - 1) * box to close top label * box; O runs open top label * box to close
// (lowest label - 1) * box, so |close-open| = boxes * box. The `highlow` source checks the trend-side extreme first and
// the opposite extreme only when the column did not extend.
import type {Bar} from '../../domain/types';
import {canonicalTransformId,derivedBar,resolveStep,type DerivedBar,type DerivedResult} from './common';

export interface PointFigureSettings {boxMethod:unknown;atrLength:unknown;boxSize:unknown;percentage:unknown;reversalAmount:unknown;source:unknown;oneStepBackBuilding?:unknown}
const EPS=1e-9;
export function pointFigure(bars:readonly Bar[],settings:PointFigureSettings):DerivedResult{
  const step=resolveStep('pointfigure',bars,settings.boxMethod,{atrLength:settings.atrLength,fixed:settings.boxSize,percentage:settings.percentage});
  if(!step.ok)return step;
  const reversal=Number(settings.reversalAmount);
  if(!Number.isInteger(reversal)||reversal<1)return {ok:false,diagnostic:{code:'DERIVED_SETTING_INVALID',feature:'pointfigure',message:'Reversal amount must be a whole number of boxes.',severity:'unavailable'}};
  if(settings.source!=='close'&&settings.source!=='highlow')return {ok:false,diagnostic:{code:'DERIVED_SETTING_INVALID',feature:'pointfigure',message:'Point and figure source must be close or highlow.',severity:'unavailable'}};
  // A saved book from before this setting has no value: the default (false) applies.
  const stepBack=settings.oneStepBackBuilding===undefined?false:settings.oneStepBackBuilding;
  if(typeof stepBack!=='boolean')return {ok:false,diagnostic:{code:'DERIVED_SETTING_INVALID',feature:'pointfigure',message:'One step back building must be on or off.',severity:'unavailable'}};
  const box=step.value,highLow=settings.source==='highlow',back=stepBack?0:1;
  const up=(price:number)=>Math.floor(price/box+EPS),down=(price:number)=>Math.ceil(price/box-EPS);
  // Levels are integer box labels; label L is the price row [(L-1)*box, L*box].
  let direction:'up'|'down'|null=null,high=0,low=0,start=0,last=0;
  const firstUp=up(bars[0].close)+1,firstDown=down(bars[0].close)-1;
  const confirmed:DerivedBar[]=[];
  // Time: the reversal bar that confirms a column; the last source bar for the forming column.
  const column=(confirmIndex:number|null):DerivedBar=>{
    const open=direction==='up'?(low-1)*box:high*box,close=direction==='up'?high*box:(low-1)*box;
    return derivedBar(bars[confirmIndex??bars.length-1].time,open,close,Math.max(open,close),Math.min(open,close),[start,last],{projection:confirmIndex===null,...(confirmIndex===null?{}:{confirmedAt:confirmIndex}),boxes:high-low+1});
  };
  bars.forEach((bar,index)=>{
    const top=highLow?bar.high:bar.close,bottom=highLow?bar.low:bar.close;
    if(direction===null){
      if(up(top)>=firstUp){direction='up';low=firstUp;high=up(top);last=index;}
      else if(down(bottom)<=firstDown){direction='down';high=firstDown;low=down(bottom);last=index;}
      return;
    }
    if(direction==='up'){
      if(up(top)>high){high=up(top);last=index;return;}
      if(down(bottom)<=high-reversal){confirmed.push(column(index));start=last;direction='down';high=high-back;low=down(bottom);last=index;}
    }else{
      if(down(bottom)<low){low=down(bottom);last=index;return;}
      if(up(top)>=low+reversal){confirmed.push(column(index));start=last;direction='up';low=low+back;high=up(top);last=index;}
    }
  });
  const projection=direction===null?[]:[column(null)];
  return {ok:true,value:{style:'pointfigure',transformId:canonicalTransformId('pointfigure',{box,reversal,source:settings.source,...(stepBack?{oneStepBack:true}:{})}),confirmed,projection,step:box,construction:highLow?'high-low-approximation':'source-close'}};
}
