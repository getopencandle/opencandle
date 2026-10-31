// LV Line break construction. Input and default: style.pbStyle
// (inputs.lb 3, "Number of line"). Close prices only. Construction (LV): the first close is the
// reference; the first differing close draws the first line. A close beyond the last line extends the
// trend with a new line from the last close. A reversal needs a close beyond the extreme of the last
// `lines` lines (all lines while fewer exist) and starts at the last line's open.
import type {Bar} from '../../domain/types';
import {canonicalTransformId,derivedBar,type DerivedBar,type DerivedResult} from './common';

export interface LineBreakSettings {lines:unknown}
export function lineBreak(bars:readonly Bar[],settings:LineBreakSettings):DerivedResult{
  const count=Number(settings.lines);
  if(!Number.isInteger(count)||count<1)return {ok:false,diagnostic:{code:'DERIVED_SETTING_INVALID',feature:'linebreak',message:'Number of lines must be a positive whole number.',severity:'unavailable'}};
  if(!bars.length)return {ok:false,diagnostic:{code:'DERIVED_INPUT_EMPTY',feature:'linebreak',message:'No source bars are available for this chart type.',severity:'unavailable'}};
  const lines:DerivedBar[]=[],reference=bars[0].close;let start=0;
  bars.forEach((bar,index)=>{
    const close=bar.close,previous=lines.at(-1);let open:number|null=null;
    if(!previous){if(close!==reference)open=reference;}
    else{
      const recent=lines.slice(-count),top=Math.max(...recent.map(line=>Math.max(line.open,line.close))),bottom=Math.min(...recent.map(line=>Math.min(line.open,line.close)));
      if(previous.direction==='up'){if(close>previous.close)open=previous.close;else if(close<bottom)open=previous.open;}
      else{if(close<previous.close)open=previous.close;else if(close>top)open=previous.open;}
    }
    if(open===null)return;
    lines.push(derivedBar(bar.time,open,close,Math.max(open,close),Math.min(open,close),[start,index],{confirmedAt:index}));start=index+1;
  });
  return {ok:true,value:{style:'linebreak',transformId:canonicalTransformId('linebreak',{lines:count}),confirmed:lines,projection:[],step:null,construction:'source-close'}};
}
