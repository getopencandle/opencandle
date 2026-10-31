import type {IndicatorPlotStyle} from '../chart/indicator-port';
import type {ScriptInputDeclaration,ScriptInputValue} from './script-jobs';
import {restoreScriptBindings,type ScriptBinding,type ScriptBindingInputs} from './script-library';

/**
 * The Inputs tab of a script instance's Settings dialog. Declarations come from the script's last accepted
 * calculation; saved values live on the binding and only hold values that differ from the declared defaults.
 */
export type ScriptInputKind=ScriptInputDeclaration['type']|'color'|'source'|'timeframe'|'symbol'|'session'|'time'|'price';
/** The host checks these additional kinds without changing the existing bridge shape. */
export type ScriptSettingsInputDeclaration=Omit<ScriptInputDeclaration,'type'>&{readonly type:ScriptInputKind};
const PRICE_SOURCES=['open','high','low','close','hl2','hlc3','ohlc4','hlcc4'];
function sessionText(value:string):boolean{
 if(value==='24x7')return true;const parts=value.split(':');if(parts.length>2)return false;
 if(parts.length===2&&(!/^[1-7]{1,7}$/.test(parts[1])||new Set(parts[1]).size!==parts[1].length))return false;
 const ranges=parts[0].split(',');return ranges.length<=8&&ranges.every(range=>{if(!/^[0-9]{4}-[0-9]{4}$/.test(range))return false;const start=Number(range.slice(0,4)),end=Number(range.slice(5));return start<2400&&start%100<60&&(end===2400||end<2400&&end%100<60);});
}
/** Times are Unix seconds. An explicit UTC field avoids silently applying the machine time zone. */
export function scriptInputTimeText(value:unknown):string{return typeof value==='number'&&Number.isInteger(value)&&value>=0&&value<=253402300799?new Date(value*1000).toISOString().slice(0,19):'';}
export type ScriptInputDraft=Record<string,ScriptInputValue>;
export function scriptInputProblem(declaration:ScriptSettingsInputDeclaration,value:unknown):string|null{
 if(declaration.type==='bool')return typeof value==='boolean'?null:declaration.title+' must be on or off.';
 if(declaration.type==='string'){
  if(typeof value!=='string'||value.length>200)return declaration.title+' must be text of at most 200 characters.';
  return declaration.options&&!declaration.options.includes(value)?declaration.title+' must be one of: '+declaration.options.join(', ')+'.':null;
 }
 if(['color','source','timeframe','symbol','session'].includes(declaration.type)){
  if(typeof value!=='string'||value.length>200)return declaration.title+' must be text of at most 200 characters.';
  const valid=declaration.type==='color'?/^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/.test(value):declaration.type==='source'?PRICE_SOURCES.includes(value)&&(!declaration.options||declaration.options.includes(value)):declaration.type==='timeframe'?value===''||/^[0-9a-zA-Z]{1,16}$/.test(value):declaration.type==='symbol'?/^[A-Za-z0-9_.:^=\/!-]{1,40}$/.test(value):sessionText(value);
  return valid?null:declaration.title+' has an invalid '+declaration.type+' value.';
 }
 if(typeof value!=='number'||!Number.isFinite(value))return declaration.title+' must be a number.';
 if((declaration.type==='int'||declaration.type==='time')&&!Number.isInteger(value))return declaration.title+' must be a whole number.';
 if(declaration.type==='time'&&(value<0||value>253402300799))return declaration.title+' must be a UTC time from 1970 through 9999.';
 if(declaration.min!==null&&value<declaration.min)return declaration.title+' must be at least '+declaration.min+'.';
 if(declaration.max!==null&&value>declaration.max)return declaration.title+' must be at most '+declaration.max+'.';
 return null;
}
/** Saved values that still fit their declaration, else the declared default. Stale names are dropped. */
export function scriptInputDraft(declarations:readonly ScriptSettingsInputDeclaration[],saved:ScriptBindingInputs|null|undefined):ScriptInputDraft{
 const draft:ScriptInputDraft={};
 for(const row of declarations){const value=saved&&Object.hasOwn(saved,row.id)?saved[row.id]:undefined;draft[row.id]=value!==undefined&&scriptInputProblem(row,value)===null?value:row.default;}
 return draft;
}
export function scriptInputProblems(declarations:readonly ScriptSettingsInputDeclaration[],draft:ScriptInputDraft):string[]{return declarations.map(row=>scriptInputProblem(row,draft[row.id])).filter((text):text is string=>text!==null);}
/** Only non-default values are saved, so a later default change in the script reaches untouched inputs. */
export function scriptInputsToSave(declarations:readonly ScriptSettingsInputDeclaration[],draft:ScriptInputDraft):ScriptBindingInputs|undefined{
 const problems=scriptInputProblems(declarations,draft);if(problems.length)throw new Error(problems.join(' '));
 const saved:ScriptBindingInputs={};for(const row of declarations)if(!Object.is(draft[row.id],row.default))saved[row.id]=draft[row.id];
 return Object.keys(saved).length?saved:undefined;
}
/** Parse an edited text field for a numeric declaration; an empty or partial number stays a problem, never a guess. */
export function parseScriptInputText(declaration:ScriptSettingsInputDeclaration,text:string):ScriptInputValue{
 if(declaration.type==='time'){
  if(!/^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}(:[0-9]{2})?$/.test(text))return NaN;
  const value=Date.parse(text+'Z')/1000;return scriptInputTimeText(value).slice(0,text.length)===text?value:NaN;
 }
 if(declaration.type==='int'||declaration.type==='float'||declaration.type==='price'){const value=text.trim()===''?NaN:Number(text);return value;}
 return text;
}
export function applyScriptSettings(bindings:readonly ScriptBinding[],id:string,change:{inputs?:ScriptBindingInputs|undefined;plots?:Record<string,IndicatorPlotStyle>}):ScriptBinding[]{
 if(!bindings.some(row=>row.id===id))throw new Error('This script instance was removed. Close Settings and open it again.');
 return restoreScriptBindings(bindings.map(row=>{
  if(row.id!==id)return row;
  const {inputs:_previous,...rest}=row,next:ScriptBinding={...rest,...(change.plots?{plots:change.plots}:{})};
  const inputs=Object.hasOwn(change,'inputs')?change.inputs:row.inputs;
  return inputs?{...next,inputs}:next;
 }));
}
