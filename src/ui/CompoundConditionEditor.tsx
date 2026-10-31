import React,{useLayoutEffect,useRef,useState} from 'react';
import type {CompoundOperator} from '../domain/compound-alerts';
import {Modal} from './Modal';

/** Draft declarations only. These choices never establish source ownership. */
export interface CompoundConditionChoice {readonly id:string;readonly label:string;readonly unavailableReason?:string}
export interface CompoundConditionDraft {
 readonly id:string;readonly sourceId:string;readonly kind:CompoundOperator['kind']|'';
 readonly value:string;readonly lower:string;readonly upper:string;
}
export interface CompoundConditionEditorProps {
 readonly conditions:readonly CompoundConditionDraft[];
 readonly choices:readonly CompoundConditionChoice[];
 /** The alert editor lifetime, independent of market observation lifetimes. */
 readonly owner:Readonly<{assertCurrent():void}>;
 readonly onChange:(next:readonly CompoundConditionDraft[],expected:readonly CompoundConditionDraft[])=>boolean|void;
 readonly onError:(message:string)=>void;
}
export function emptyCompoundCondition():CompoundConditionDraft{return Object.freeze({id:crypto.randomUUID(),sourceId:'',kind:'',value:'',lower:'',upper:''});}
const operators:readonly [CompoundOperator['kind'],string][]=[
 ['crossing','Crossing'],['crossing-up','Crossing up'],['crossing-down','Crossing down'],
 ['greater','Greater than'],['less','Less than'],['inside','Inside channel'],
 ['outside','Outside channel'],['entering','Entering channel'],['exiting','Exiting channel']
];
const channel=(kind:CompoundConditionDraft['kind'])=>kind==='inside'||kind==='outside'||kind==='entering'||kind==='exiting';
/** Incomplete draft text, not the financial notification/revision formatter. */
function preview(row:CompoundConditionDraft,choices:readonly CompoundConditionChoice[]):string {
 const matches=choices.filter(choice=>choice.id===row.sourceId),choice=matches.length===1?matches[0]:null;
 const source=choice?.label||(row.sourceId?'Selected source unavailable':'Choose a source');
 const operator=operators.find(([kind])=>kind===row.kind)?.[1]??'Choose a condition';
 const value=channel(row.kind)?`${row.lower.trim()||'Lower bound'} to ${row.upper.trim()||'Upper bound'}`:row.value.trim()||'Enter a value';
 return `${source} · ${operator} · ${value}`;
}
function finiteNumber(text:string,label:string):number {
 if(text.length>64||!/^[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?$/.test(text.trim())||!Number.isFinite(Number(text)))throw Error(`Enter a finite number for ${label}.`);
 return Number(text);
}
function validate(row:CompoundConditionDraft,choices:readonly CompoundConditionChoice[]):void {
 const matches=choices.filter(choice=>choice.id===row.sourceId);
 if(matches.length!==1||matches[0].unavailableReason)throw Error('Choose an available condition source.');
 if(!operators.some(([kind])=>kind===row.kind))throw Error('Choose a supported condition.');
 if(channel(row.kind)){
  if(finiteNumber(row.lower,'the lower bound')>finiteNumber(row.upper,'the upper bound'))throw Error('The lower bound must not exceed the upper bound.');
 }else finiteNumber(row.value,'the condition value');
}
interface ConditionDialog {
 readonly base:readonly CompoundConditionDraft[];
 readonly owner:CompoundConditionEditorProps['owner'];
 readonly original:CompoundConditionDraft|null;
 readonly draft:CompoundConditionDraft;
}

/** Saved conditions are preview buttons. Add/Edit owns a local draft until the
 * parent accepts one complete replacement collection against the exact base.
 * The parent remains responsible for form compilation, saving and observation. */
export function CompoundConditionEditor(props:CompoundConditionEditorProps){
 const [dialog,setDialog]=useState<ConditionDialog|null>(null);
 const alive=useRef(false),viewRef=useRef<object|null>(null),dialogRef=useRef<ConditionDialog|null>(null);
 const root=useRef<HTMLElement|null>(null),buttons=useRef(new Map<string,HTMLButtonElement>());
 const pendingFocus=useRef<{rows:readonly CompoundConditionDraft[];base:readonly CompoundConditionDraft[];owner:CompoundConditionEditorProps['owner'];id:string}|null>(null);
 const view={};viewRef.current=view;
 const opened=dialog&&dialog.base===props.conditions&&dialog.owner===props.owner&&(!dialog.original||props.conditions.includes(dialog.original))?dialog:null;
 dialogRef.current=opened;
 const current=()=>alive.current&&viewRef.current===view;
 const report=(error:unknown)=>{if(current())props.onError(error instanceof Error?error.message:'This alert draft could not be changed. Reopen the editor.');};
 useLayoutEffect(()=>{alive.current=true;return()=>{alive.current=false;viewRef.current=null;dialogRef.current=null;pendingFocus.current=null;buttons.current.clear();};},[]);
 useLayoutEffect(()=>{
  if(dialog&&!opened)setDialog(previous=>previous===dialog?null:previous);
  const pending=pendingFocus.current;
  if(!pending)return;
  if(pending.owner!==props.owner||pending.rows!==props.conditions&&pending.base!==props.conditions){pendingFocus.current=null;return;}
  if(pending.rows!==props.conditions||!current())return;
  pendingFocus.current=null;
  try{props.owner.assertCurrent();if(!current())return;const node=buttons.current.get(pending.id);if(node&&root.current?.contains(node))node.focus();}catch(error){report(error);}
 },[dialog,opened,props.conditions,props.owner]);
 const check=(expected?:ConditionDialog)=>{
  if(!current()||expected&&dialogRef.current!==expected)return false;
  props.owner.assertCurrent();
  return current()&&(!expected||dialogRef.current===expected&&expected.base===props.conditions&&expected.owner===props.owner);
 };
 const open=(original:CompoundConditionDraft|null)=>{
  try{
   if(!check()||original&&!props.conditions.includes(original)||!original&&props.conditions.length>=5)return;
   const draft=original?Object.freeze({...original}):emptyCompoundCondition();
   if(!check())return;
   const next={base:props.conditions,owner:props.owner,original,draft};dialogRef.current=next;setDialog(next);
  }catch(error){report(error);}
 };
 const cancel=()=>{if(current()&&opened&&dialogRef.current===opened){dialogRef.current=null;setDialog(null);}};
 const edit=(patch:Partial<Omit<CompoundConditionDraft,'id'>>)=>{
  if(!opened)return;
  try{if(!check(opened))return;const next={...opened,draft:Object.freeze({...opened.draft,...patch})};dialogRef.current=next;setDialog(previous=>previous===opened?next:previous);}catch(error){report(error);}
 };
 const publish=(next:readonly CompoundConditionDraft[],focus:string,expected?:ConditionDialog)=>{
  if(!check(expected))return;
  if(next.length<2||next.length>5||new Set(next.map(row=>row.id)).size!==next.length)throw Error('An all-conditions alert needs two to five separate conditions.');
  const rows=Object.freeze(next.map(row=>Object.freeze({...row})));
  if(!check(expected))return;
  const openingDialog=dialogRef.current,pending={rows,base:props.conditions,owner:props.owner,id:focus};pendingFocus.current=pending;
  let accepted:boolean|void;
  try{accepted=props.onChange(rows,props.conditions);}catch(error){if(pendingFocus.current===pending)pendingFocus.current=null;throw error;}
  if(accepted===false){if(pendingFocus.current===pending)pendingFocus.current=null;report(Error('The alert draft changed. Review it before editing again.'));return;}
  // A synchronous parent callback may have replaced the editor or opened a new
  // dialog. Never close that newer draft when this older publication returns.
  if(current()&&dialogRef.current===openingDialog){dialogRef.current=null;setDialog(null);}
 };
 const save=()=>{
  if(!opened)return;
  try{
   if(!check(opened))return;
   validate(opened.draft,props.choices);if(!check(opened))return;
   const next=opened.original?props.conditions.map(row=>row===opened.original?opened.draft:row):[...props.conditions,opened.draft];
   publish(next,opened.draft.id,opened);
  }catch(error){report(error);}
 };
 const remove=(row:CompoundConditionDraft,index:number)=>{
  try{
   if(!check()||props.conditions.length<=2)return;
   if(!props.conditions.includes(row))throw Error('This condition was already removed.');
   const focus=props.conditions[index+1]?.id??props.conditions[index-1].id;
   publish(props.conditions.filter(item=>item!==row),focus);
  }catch(error){report(error);}
 };
 if(props.conditions.length<2||props.conditions.length>5)return <p role="status">This alert draft has an invalid condition count. Reopen the editor.</p>;
 const selected=opened?props.choices.find(choice=>choice.id===opened.draft.sourceId):null;
 return <section ref={root} className="lv-compound-conditions" aria-label="All alert conditions">
  <style>{`.lv-compound-conditions{margin:14px 0}.lv-compound-conditions .condition-preview-row{display:flex;gap:8px;align-items:center}.lv-compound-conditions .condition-preview{flex:1;text-align:left;white-space:normal;overflow-wrap:anywhere;padding:10px}.lv-compound-conditions .condition-conjunction{padding:6px 12px;font-weight:600}.lv-compound-conditions .condition-note{font-size:12px;line-height:1.5}.lv-compound-conditions .condition-add{margin-top:10px}.lv-compound-condition-fields{display:grid;gap:12px}.lv-compound-condition-fields label{display:grid;gap:5px}.lv-compound-condition-fields input,.lv-compound-condition-fields select{width:100%;min-width:0}.lv-compound-condition-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:16px}`}</style>
  <p className="condition-note">Every condition must match in the same observation. You can add up to five conditions.</p>
  {props.conditions.map((row,index)=><React.Fragment key={row.id}>
   {index>0&&<div className="condition-conjunction">AND</div>}
   <div className="condition-preview-row">
    <button ref={node=>{if(node)buttons.current.set(row.id,node);else buttons.current.delete(row.id);}} className="condition-preview" type="button" aria-label={`Edit condition ${index+1}: ${preview(row,props.choices)}`} aria-haspopup="dialog" onClick={()=>open(row)}>{preview(row,props.choices)}</button>
    <button type="button" aria-label={`Remove condition ${index+1}`} disabled={props.conditions.length<=2} onClick={()=>remove(row,index)}>Remove</button>
   </div>
  </React.Fragment>)}
  <button className="condition-add" type="button" disabled={props.conditions.length>=5} onClick={()=>open(null)}>Add condition</button>
  {opened&&<Modal title={opened.original?`Edit condition ${props.conditions.indexOf(opened.original)+1}`:'Add condition'} onClose={cancel} portal>
   <div className="lv-compound-condition-fields" onKeyDown={event=>{if(event.key==='Enter'&&!event.nativeEvent.isComposing&&event.target instanceof HTMLInputElement){event.preventDefault();event.stopPropagation();save();}}}>
    <label>Source<select autoFocus aria-label="Condition source" value={opened.draft.sourceId} onChange={event=>edit({sourceId:event.target.value})}>
     <option value="">Choose a source</option>
     {opened.draft.sourceId&&!selected&&<option value={opened.draft.sourceId} disabled>Selected source unavailable</option>}
     {props.choices.map(choice=><option key={choice.id} value={choice.id} disabled={!!choice.unavailableReason}>{choice.label}</option>)}
    </select></label>
    <label>Condition<select aria-label="Condition operator" value={opened.draft.kind} onChange={event=>edit({kind:event.target.value as CompoundConditionDraft['kind']})}><option value="">Choose a condition</option>{operators.map(([kind,label])=><option key={kind} value={kind}>{label}</option>)}</select></label>
    {channel(opened.draft.kind)?<>
     <label>Lower bound<input aria-label="Condition lower bound" inputMode="decimal" maxLength={64} value={opened.draft.lower} onChange={event=>edit({lower:event.target.value})}/></label>
     <label>Upper bound<input aria-label="Condition upper bound" inputMode="decimal" maxLength={64} value={opened.draft.upper} onChange={event=>edit({upper:event.target.value})}/></label>
    </>:<label>Value<input aria-label="Condition value" inputMode="decimal" maxLength={64} value={opened.draft.value} onChange={event=>edit({value:event.target.value})}/></label>}
   </div>
   {selected?.unavailableReason&&<p role="status">{selected.unavailableReason}</p>}
   <div className="lv-compound-condition-actions"><button type="button" onClick={cancel}>Cancel</button><button type="button" onClick={save}>{opened.original?'Save':'Add'}</button></div>
  </Modal>}
 </section>;
}
