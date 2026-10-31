import type {DrawingBox,DrawingLabel,DrawingLine} from '@luxalgo/vela';
import type {TradingSessionRecord} from '../domain/indicators-ext/trading-sessions';
import {indicatorColorOpacity} from './indicator-opacity';
export interface TradingSessionDisplay {showNames:boolean;showOpenClose:boolean;showRange:boolean;showAverage:boolean;visible:(window:number)=>boolean;labelInverted?:boolean|null}
const scalar=(value:number)=>Number.isFinite(value)?Number(value.toPrecision(8)).toString():'Unavailable';
/** Original native geometry. Labels anchor at the numeric bound that projects to the visual box bottom.
 * Every identity belongs to its study instance. */
export function tradingSessionShapes(records:readonly Readonly<TradingSessionRecord>[],display:TradingSessionDisplay,id:(role:string)=>string):{boxes:DrawingBox[];labels:DrawingLabel[];lines:DrawingLine[]}{
 const boxes:DrawingBox[]=[],labels:DrawingLabel[]=[],lines:DrawingLine[]=[];
 for(const record of records){
  if(!record.available||!display.visible(record.window))continue;
  const key=`session:${record.window}:${record.day}`,left=record.from*1000,right=record.to*1000,color=record.color;
  boxes.push({id:id(key+':box'),paneId:'',xloc:'bar_time',left,right,top:record.high,bottom:record.low,extend:'none',bgColor:indicatorColorOpacity(color,15),borderColor:indicatorColorOpacity(color,70),borderWidth:1,borderStyle:'solid',textSize:'small',hAlign:'center',vAlign:'center',wrap:false,fontFamily:'default',bold:false,italic:false});
  const guide=(role:string,price:number,style:'dashed'|'dotted')=>lines.push({id:id(key+':'+role),paneId:'',xloc:'bar_time',x1:left,y1:price,x2:right,y2:price,extend:'none',color,invisible:false,width:1,style,arrowLeft:false,arrowRight:false});
  if(display.showOpenClose){guide('open',record.open,'dashed');guide('close',record.close,'dashed');}
  if(display.showAverage)guide('average',record.average,'dotted');
  const text=[display.showNames?record.name:null,display.showRange?(record.rangeTicks===null?'Range unavailable':`${scalar(record.rangeTicks)} ticks`):null,display.showAverage?`Average ${scalar(record.average)}`:null].filter(value=>value!==null).join('\n');
  if(text&&display.labelInverted!==null)labels.push({id:id(key+':label'),paneId:'',xloc:'bar_time',x:(left+right)/2,y:display.labelInverted===true?record.high:record.low,yloc:'price',text,style:'label_up',textColor:color,size:'small',textAlign:'center',fontFamily:'default',noFill:true,tooltip:`${record.count} supplied observations. Missing observations are not filled.`});
 }
 return{boxes,labels,lines};
}
