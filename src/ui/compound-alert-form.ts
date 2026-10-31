import {COMPOUND_POLICY,parseCompoundDefinition,type CompoundContext,type CompoundDefinition,type CompoundFrequency,type CompoundOperator,type CompoundSource} from '../domain/compound-alerts';
import type {CompoundConditionChoice,CompoundConditionDraft} from './CompoundConditionEditor';

/** Presentation declarations only. Neither a choice nor a parsed definition
 * establishes market-data ownership; the real coordinator admits that cut. */
export interface CompoundFormChoice extends CompoundConditionChoice {readonly declaration:CompoundSource}
export interface CompoundFormDraft {
 readonly name:string;readonly message:string;readonly conditions:readonly CompoundConditionDraft[];
 readonly frequency:CompoundFrequency;readonly expiresAt:number|null;
}
const fields=['open','high','low','close','hl2','hlc3','ohlc4'];
function number(text:string,label:string):number {
 if(text.length>64||!/^[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?$/.test(text.trim()))throw Error('Enter a number for '+label+'.');
 const value=Number(text);if(!Number.isFinite(value))throw Error('Enter a finite number for '+label+'.');return value;
}
function operator(row:CompoundConditionDraft,index:number):CompoundOperator {
 const label='condition '+(index+1);
 if(['greater','less','crossing','crossing-up','crossing-down'].includes(row.kind))return{kind:row.kind as 'greater',value:number(row.value,label)};
 if(['inside','outside','entering','exiting'].includes(row.kind)){
  const lower=number(row.lower,label+' lower bound'),upper=number(row.upper,label+' upper bound');
  if(lower>upper)throw Error('The lower bound must not exceed the upper bound for '+label+'.');
  return{kind:row.kind as 'inside',lower,upper};
 }
 throw Error('Choose a condition for '+label+'.');
}
function supported(source:CompoundSource):boolean {
 if(source.kind==='price')return fields.includes(source.field);
 return source.indicator==='sma'&&source.plot==='sma'&&Object.keys(source.inputs).length===2&&Object.hasOwn(source.inputs,'length')&&Object.hasOwn(source.inputs,'source')&&Number.isSafeInteger(source.inputs.length)&&(source.inputs.length as number)>=1&&(source.inputs.length as number)<=10000&&typeof source.inputs.source==='string'&&fields.includes(source.inputs.source);
}
/** Reparse through the strict domain parser to detach/freeze every declaration
 * and input. No source is silently substituted when a draft choice disappears. */
export function buildCompoundFormDefinition(draft:CompoundFormDraft,choices:readonly CompoundFormChoice[],context:Readonly<CompoundContext>,identity:Readonly<{id:string;now:number}>):CompoundDefinition {
 if(draft.conditions.length<2||draft.conditions.length>5)throw Error('Choose two to five conditions.');
 if(context.session!=='regular'||!['1m','5m','15m','60m'].includes(context.interval))throw Error('All-conditions alerts currently require a regular-session intraday source.');
 const predicates=draft.conditions.map((row,index)=>{
  const matches=choices.filter(choice=>choice.id===row.sourceId),choice=matches[0];
  if(matches.length!==1||!choice||choice.unavailableReason||!supported(choice.declaration))throw Error('Choose an available price or SMA source for condition '+(index+1)+'.');
  return{id:row.id,source:choice.declaration,operator:operator(row,index)};
 });
 return parseCompoundDefinition({kind:'compound',schemaVersion:1,policy:COMPOUND_POLICY,mode:'ordinary',id:identity.id,name:draft.name.trim(),message:draft.message,context,predicates,frequency:draft.frequency,createdAt:identity.now,expiresAt:draft.expiresAt});
}
