// LV Kagi construction. Inputs and defaults: style.kagiStyle
// (style ATR, atrLength 14, reversalAmount 1, percentageLTP 1). Close prices only by default. Construction (LV): the first close starts the line; the first move of at least the
// reversal amount sets the direction; a segment extends while price makes new extremes and reverses
// when price retraces at least the reversal amount from the extreme. The line is thick (yang, up
// color) after rising above the previous shoulder and thin (yin, down color) after falling below the
// previous waist; the first segment takes the state of its direction.
import type {Bar} from '../../domain/types';
import {canonicalTransformId,derivedBar,ohlcPath,resolveStep,type DerivedBar,type DerivedResult} from './common';

export interface KagiSettings {reversalMethod:unknown;atrLength:unknown;reversalAmount:unknown;percentage:unknown;source?:unknown}
export function kagi(bars:readonly Bar[],settings:KagiSettings):DerivedResult{
  // LV price source (the facts list none): close (default) or highlow, which walks each bar's O-L-H-C / O-H-L-C path (approximation).
  const highLow=settings.source==='highlow';
  if(settings.source!==undefined&&settings.source!=='close'&&!highLow)return {ok:false,diagnostic:{code:'DERIVED_SETTING_INVALID',feature:'kagi',message:'Kagi source must be close or highlow.',severity:'unavailable'}};
  const step=resolveStep('kagi',bars,settings.reversalMethod,{atrLength:settings.atrLength,fixed:settings.reversalAmount,percentage:settings.percentage});
  if(!step.ok)return step;
  const amount=step.value*(1-1e-12),confirmed:DerivedBar[]=[];
  let open=bars[0].close,extreme=open,direction:'up'|'down'|null=null,start=0,extremeIndex=0,yang=false,shoulder:number|null=null,waist:number|null=null;
  // Time: the confirming (reversal) bar for confirmed segments, the last source bar for the forming one.
  const segment=(confirmIndex:number|null):DerivedBar=>{
    let yangEnd=yang,switchPrice:number|null=null;
    if(direction==='up'&&!yang&&shoulder!==null&&extreme>shoulder){yangEnd=true;switchPrice=shoulder;}
    if(direction==='down'&&yang&&waist!==null&&extreme<waist){yangEnd=false;switchPrice=waist;}
    return derivedBar(bars[confirmIndex??bars.length-1].time,open,extreme,extreme,extreme,[start,extremeIndex],{projection:confirmIndex===null,...(confirmIndex===null?{}:{confirmedAt:confirmIndex}),yangStart:yang,yangEnd,switchPrice});
  };
  const step_=(price:number,index:number)=>{
    if(direction===null){
      if(price>=open+amount){direction='up';yang=true;waist=open;}
      else if(price<=open-amount){direction='down';yang=false;shoulder=open;}
      else return;
      extreme=price;extremeIndex=index;return;
    }
    const extends_=direction==='up'?price>extreme:price<extreme;
    if(extends_){extreme=price;extremeIndex=index;return;}
    if(direction==='up'?price<=extreme-amount:price>=extreme+amount){
      const done=segment(index);confirmed.push(done);yang=done.yangEnd!;
      if(direction==='up')shoulder=extreme;else waist=extreme;
      open=extreme;start=extremeIndex;direction=direction==='up'?'down':'up';extreme=price;extremeIndex=index;
    }
  };
  bars.forEach((bar,index)=>{for(const price of highLow?ohlcPath(bar):[bar.close])step_(price,index);});
  const projection=direction===null?[]:[segment(null)];
  return {ok:true,value:{style:'kagi',transformId:canonicalTransformId('kagi',{reversal:step.value,...(highLow?{source:'highlow'}:{})}),confirmed,projection,step:step.value,construction:highLow?'high-low-approximation':'source-close'}};
}
