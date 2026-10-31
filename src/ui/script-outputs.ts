import type {ScriptResult,ScriptInputValue} from './script-jobs';
import type {ScriptBindingInputs} from './script-library';

/**
 * The last accepted calculation of each chart script instance, per chart script port.
 *
 * It carries what other surfaces need to describe a script without running it: the declared inputs (Settings
 * dialog), and the alert conditions, ctx.alert names and plots (alert dialog sources). It never holds computed
 * values, so it is not a result authority. Alerts freeze the source text and input values they were created
 * with and recalculate them on the observed prefix, like a built-in indicator alert.
 */
export interface ScriptOutputEntry {
 bindingId:string;title:string;source:string;
 /** Values the calculation used (saved values, else declared defaults). */
 inputs:Record<string,ScriptInputValue>;
 savedInputs:ScriptBindingInputs|null;
 declarations:NonNullable<ScriptResult['declarations']>;
 conditions:Array<{id:string;title:string;message:string}>;
 alertNames:string[];
 plots:Array<{id:string;title:string}>;
}
const owners=new WeakMap<object,Map<string,ScriptOutputEntry>>(),listeners=new Set<()=>void>();
/** Configured scalars only. This is not a numerical study readout or latest-bar receipt. */
export interface ScriptInputDescription {readonly source:string;readonly savedInputs:Readonly<Record<string,ScriptInputValue>>|null;readonly parts:readonly {readonly id:string;readonly type:string;readonly value:ScriptInputValue}[]}
const inputDescriptions=new WeakMap<object,Map<string,ScriptInputDescription>>(),inputListeners=new WeakMap<object,Set<()=>void>>();
const inputName=/^(?!__)[A-Za-z_][A-Za-z0-9_]{0,63}$/;
function inputEntries(value:unknown):Array<[string,ScriptInputValue]>|null{
 if(value===null||value===undefined)return[];
 if(typeof value!=='object'||Object.getPrototypeOf(value)!==Object.prototype&&Object.getPrototypeOf(value)!==null)return null;
 const keys=Reflect.ownKeys(value);if(keys.length>32)return null;const result:Array<[string,ScriptInputValue]>=[];
 for(const key of keys){if(typeof key!=='string'||!inputName.test(key))return null;const field=Object.getOwnPropertyDescriptor(value,key);if(!field||!Object.hasOwn(field,'value'))return null;const item=field.value;if(!(typeof item==='boolean'||typeof item==='number'&&Number.isFinite(item)||typeof item==='string'&&item.length<=200))return null;result.push([key,item]);}return result;
}
/** Primitive configuration comparison, bounded by the unchanged input limit. Never stringify a source or graph. */
export function sameScriptInputOverrides(left:unknown,right:unknown):boolean{
 const a=inputEntries(left),b=inputEntries(right);if(!a||!b||a.length!==b.length)return false;const values=new Map(b);return a.every(([key,value])=>values.has(key)&&Object.is(values.get(key),value));
}
function describeInputs(entry:ScriptOutputEntry):ScriptInputDescription|null{
 try{const declarations=entry.declarations?.inputs;if(typeof entry.source!=='string'||!Array.isArray(declarations)||declarations.length>32)return null;
  const saved=inputEntries(entry.savedInputs);if(!saved)return null;const parts:Array<ScriptInputDescription['parts'][number]>=[],ids=new Set<string>();
  for(const row of declarations){if(!row||typeof row.id!=='string'||!inputName.test(row.id)||ids.has(row.id)||!['int','float','bool','string','color','source','timeframe','symbol','session','time','price'].includes(row.type))return null;ids.add(row.id);
   const field=entry.inputs&&Object.getOwnPropertyDescriptor(entry.inputs,row.id);if(!field||!Object.hasOwn(field,'value'))return null;const value=field.value,type=row.type;
   const fits=type==='bool'?typeof value==='boolean':['string','color','source','timeframe','symbol','session'].includes(type)?typeof value==='string'&&value.length<=200:typeof value==='number'&&Number.isFinite(value)&&(!['int','time'].includes(type)||Number.isInteger(value));if(!fits)return null;
   parts.push(Object.freeze({id:row.id,type,value}));
  }
  return Object.freeze({source:entry.source,savedInputs:saved.length?Object.freeze(Object.fromEntries(saved)):null,parts:Object.freeze(parts)});
 }catch{return null;}
}
function updateInputDescription(owner:object,entry:ScriptOutputEntry){let rows=inputDescriptions.get(owner);const description=describeInputs(entry);if(description){if(!rows){rows=new Map();inputDescriptions.set(owner,rows);}rows.set(entry.bindingId,description);}else rows?.delete(entry.bindingId);}
function notifyInputs(owner:object){for(const listener of [...inputListeners.get(owner)??[]])try{listener();}catch{/* Optional configuration labels cannot retract a calculation. */}}

const notify=()=>{for(const listener of [...listeners])try{listener();}catch{/* one failing reader never blocks the others */}};
export function scriptOutputEntry(input:{bindingId:string;title:string;source:string;savedInputs?:ScriptBindingInputs|null;result:Pick<ScriptResult,'declarations'|'conditions'|'alerts'|'plots'|'inputs'>}):ScriptOutputEntry{
 const result=input.result,alertNames=[...new Set((result.alerts??[]).map(row=>row?.name).filter((name):name is string=>typeof name==='string'))].slice(0,64);
 return{bindingId:input.bindingId,title:input.title,source:input.source,inputs:{...(result.inputs??{})},savedInputs:input.savedInputs?{...input.savedInputs}:null,
  declarations:structuredClone(result.declarations??{inputs:[],requests:[]}),conditions:(result.conditions??[]).map(row=>({id:row.id,title:row.title,message:row.message})),alertNames,plots:(result.plots??[]).map(row=>({id:row.id,title:row.title}))};
}
export const scriptOutputs={
 /** Matching accepted configuration metadata; never copy a full source/plot catalog to a legend. */
 inputDescription(owner:object,binding:{id:string;source:string;inputs?:ScriptBindingInputs}):ScriptInputDescription|null{const row=inputDescriptions.get(owner)?.get(binding.id);return row&&row.source===binding.source&&sameScriptInputOverrides(row.savedInputs,binding.inputs)?row:null;},
 subscribeInputs(owner:object,listener:()=>void):()=>void{if(typeof listener!=='function')throw Error('An input description listener is required.');let set=inputListeners.get(owner);if(!set){set=new Set();inputListeners.set(owner,set);}set.add(listener);let active=true;return()=>{if(!active)return;active=false;set!.delete(listener);if(!set!.size&&inputListeners.get(owner)===set)inputListeners.delete(owner);};},
 publish(owner:object,entry:ScriptOutputEntry){let rows=owners.get(owner);if(!rows){rows=new Map();owners.set(owner,rows);}const copied=structuredClone(entry);rows.set(entry.bindingId,copied);updateInputDescription(owner,copied);notify();notifyInputs(owner);},
 retire(owner:object,bindingId:string){const rows=owners.get(owner);if(rows?.delete(bindingId)){inputDescriptions.get(owner)?.delete(bindingId);notify();notifyInputs(owner);}},
 clear(owner:object){const rows=owners.get(owner);if(rows?.size){rows.clear();inputDescriptions.delete(owner);notify();notifyInputs(owner);}},
 list(owner:object|null|undefined):ScriptOutputEntry[]{return owner?[...(owners.get(owner)?.values()??[])].map(row=>structuredClone(row)):[];},
 get(owner:object|null|undefined,bindingId:string):ScriptOutputEntry|null{const row=owner?owners.get(owner)?.get(bindingId):undefined;return row?structuredClone(row):null;},
 subscribe(listener:()=>void):()=>void{listeners.add(listener);return()=>{listeners.delete(listener);};},
};
