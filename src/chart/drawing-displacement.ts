// DWUTIL COORDINATES (VDD#dialog.common.coordinates.multi): multi-selection displacement parser and planner. Pure.
// Bar accepts "+n", "-n" and a bare integer; price accepts "+n", "-n", "*n", "/n" and a bare float; empty means no change.
export const BAR_CLAMP={min:-50000,max:15000} as const;
export const DISPLACEMENT_REFUSAL='Some drawings would move outside the allowed range.';
export type DisplacementOp={ok:true;op:'+'|'*'|'/';value:number}|{ok:true;noop:true}|{ok:false;reason:string};
const NUMBER=/^\d+(?:\.\d+)?$/;
export function parseDisplacement(axis:'bar'|'price',text:string):DisplacementOp{
 const raw=text.trim();if(raw==='')return{ok:true,noop:true};
 const lead=raw[0],hasOp=lead==='+'||lead==='-'||lead==='*'||lead==='/',body=hasOp?raw.slice(1):raw;
 if(!NUMBER.test(body))return{ok:false,reason:axis==='bar'?'Enter a whole number of bars, for example +5 or -3.':'Enter a number with an optional leading + - * or /.'};
 const n=Number(body);if(!Number.isFinite(n))return{ok:false,reason:'Enter a finite number.'};
 if(axis==='bar'){
  if(lead==='*'||lead==='/')return{ok:false,reason:'Bars can be shifted with + or - only.'};
  if(!Number.isInteger(n))return{ok:false,reason:'Bars must be a whole number.'};
  return{ok:true,op:'+',value:lead==='-'?-n:n};
 }
 if(lead==='/'&&n===0)return{ok:false,reason:'Cannot divide by zero.'};
 if(lead==='*')return{ok:true,op:'*',value:n};if(lead==='/')return{ok:true,op:'/',value:n};
 return{ok:true,op:'+',value:lead==='-'?-n:n};
}
export interface DisplacementAnchor{bar:number;price:number}
export interface DisplacementRow{id:string;anchors:DisplacementAnchor[]}
export type DisplacementPlan={ok:true;rows:DisplacementRow[];noop?:true}|{ok:false;message:string;field?:'bar'|'price'};
/** The caller converts times to bar numbers and back; the plan is all or nothing (the whole batch is refused when any anchor leaves the allowed range). */
export function planDisplacement(selection:readonly DisplacementRow[],barText:string,priceText:string):DisplacementPlan{
 const bar=parseDisplacement('bar',barText),price=parseDisplacement('price',priceText);
 if(!bar.ok)return{ok:false,message:bar.reason,field:'bar'};if(!price.ok)return{ok:false,message:price.reason,field:'price'};
 if('noop' in bar&&'noop' in price)return{ok:true,rows:[],noop:true};
 const rows:DisplacementRow[]=[];
 for(const row of selection){
  const anchors:DisplacementAnchor[]=[];
  for(const anchor of row.anchors){
   let b=anchor.bar,p=anchor.price;
   if(!('noop' in bar))b=b+bar.value;
   if(!('noop' in price))p=price.op==='*'?p*price.value:price.op==='/'?p/price.value:p+price.value;
   if(!Number.isFinite(b)||!Number.isFinite(p)||b<BAR_CLAMP.min||b>BAR_CLAMP.max||!(p>0))return{ok:false,message:DISPLACEMENT_REFUSAL};
   anchors.push({bar:b,price:p});
  }
  rows.push({id:row.id,anchors});
 }
 return{ok:true,rows};
}
