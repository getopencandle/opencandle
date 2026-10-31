import {planDisplacement,DISPLACEMENT_REFUSAL} from '../chart/drawing-displacement';
import {barNumberToTime} from '../chart/drawing-coordinates';
import type {Bar} from '../domain/types';

/** DWUTIL multi-selection Displacement (VDD#dialog.common.coordinates.multi). Pure: the caller supplies each drawing's editor anchors. */
export interface DisplacementEditorAnchor{timeSeconds:number;price:number;barNumber:number|null;editableTime:boolean;editablePrice:boolean}
export interface DisplacementSource{id:string;anchors:readonly DisplacementEditorAnchor[]}
export type DisplacementOutcome={ok:true;moves:{id:string;anchors:{time:number;price:number}[]}[];excluded:string[];noop:boolean}|{ok:false;message:string;excluded:string[]};
export const NO_MOVABLE_MESSAGE='None of the selected drawings can be moved by coordinates.';
/** A drawing with any anchor whose time cannot be expressed as a bar number is left out and reported (fixed-time tools: Text, Anchored text, Bars pattern, Image). */
export function planSelectionDisplacement(sources:readonly DisplacementSource[],barText:string,priceText:string,bars:readonly Bar[]):DisplacementOutcome{
 const movable=sources.filter(source=>source.anchors.length>0&&source.anchors.every(anchor=>anchor.editableTime&&anchor.barNumber!==null)),excluded=sources.filter(source=>!movable.includes(source)).map(source=>source.id);
 if(!movable.length)return{ok:false,message:NO_MOVABLE_MESSAGE,excluded};
 const plan=planDisplacement(movable.map(source=>({id:source.id,anchors:source.anchors.map(anchor=>({bar:anchor.barNumber as number,price:anchor.price}))})),barText,priceText);
 if(!plan.ok)return{ok:false,message:plan.message,excluded};
 if(plan.noop)return{ok:true,moves:[],excluded,noop:true};
 try{
  const moves=plan.rows.map(row=>{const source=movable.find(item=>item.id===row.id)!;
   return{id:row.id,anchors:row.anchors.map((anchor,index)=>{const before=source.anchors[index];
    const time=anchor.bar===before.barNumber?before.timeSeconds*1000:barNumberToTime(bars,anchor.bar)*1000;
    return{time,price:before.editablePrice?anchor.price:before.price};})};});
  return{ok:true,moves,excluded,noop:false};
 }catch{return{ok:false,message:DISPLACEMENT_REFUSAL,excluded};}
}
