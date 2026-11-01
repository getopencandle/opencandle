import React,{useEffect,useRef,useState} from 'react';
import type {ChartController} from '../chart/adapter';
import {Modal} from './Modal';
import {ColorControl} from './ColorControl';
import {drawingDraftChanges,drawingFieldApplicable,drawingFieldPathPossible,assertDrawingRecordUnchanged} from '../chart/drawing-port';
import {DrawingEditRecoveryError} from '../chart/drawing-edit-transaction';
import {visibilityTabModel,validateDrawingVisibilityV2,type DrawingIntervalVisibilityV2,type VisibilityTabRow} from '../chart/drawing-visibility';
import {sameChartSourceBasis} from '../chart/source-context';
import {drawingEndcapControl} from './drawing-endcaps';
import {fibLevelColor,fibLevelColorValues} from './fib-level-colors';
import {assertNewFibLevelLabel,validateFibLevelLabelChange} from '../chart/fib-level-text-policy';
import {dialogSpecFor,dialogTabsFor,numericOptionsFor,isChecklistRow,checklistPlaceholder,COMMON_TEXT_ORDER,type DialogRow} from './drawing-dialog-spec';
import {BARS_PATTERN_SOURCE_PATH,LV_BARS_PATTERN} from '../chart/lv-types/bars-pattern';
import {IMAGE_ASSET_KEY,LV_IMAGE,fitReplacementImage} from '../chart/lv-types/image';
import {COORDINATE_LABELS,coordinateDisplayValue,coordinatePriceStep,coordinatePriceDecimals,checklistSummary,drawingPreview,templateChoices,applyTemplateToDraft,levelGridRows,LEVEL_COLUMNS,DEFAULT_TEMPLATE_ID,defaultTemplateValues,drawingDialogTitle,coordinateDateTimeText,coordinateAnchorFromDateTime,coordinateDraftSeconds,coordinateTimeHasSeconds,coordinateDateComplete} from './drawing-dialog-model';
import {DrawingChecklist} from './DrawingChecklist';
import {captureToolDefault,type DrawingToolDefault} from '../chart/drawing-tool-defaults';
import type {DrawingPreviewPort} from '../chart/drawing-preview';
import {BarsPatternSourceSection,barsPatternSectionModel,type BarsPatternData,type BarsPatternSelection} from './BarsPatternSource';
import {ToolAbout} from './ToolAbout';
import {drawingTypeReference} from './drawing-reference';

interface Props {chart:ChartController;id:string;ownerToken?:object;isCurrent?:()=>boolean;onClose:()=>void;onChange:()=>boolean|void;assertOwner?:()=>void;
 /** Image picker (reference dialog.LineToolImage.style.1): imports the chosen local file through the workspace guards and holds it until the dialog closes; returns its id and natural size, or a message. */
 imagePicker?:(file:File)=>Promise<{ok:true;id:string;width:number;height:number}|{ok:false;message:string}>;
 /** Bars pattern source-resolution setting (LV extension): the host's loaded datasets and aggregation policy. */
 barsPatternData?:BarsPatternData;
 /** Chart timezone for coordinate times (IANA name); UTC when absent. */
 timeZone?:string;
 /** The tab to open on when the tool has it, else the first tab
  * (a row hidden on the current interval opens the properties dialog on the Visibility tab); the context menu "Visibility on intervals…" does the same. */
 initialTab?:string;
 /** Template menu Save as default (a value) and Reset settings (null) for the drawing's tool. The host saves it in the
  * workspace; false means it was refused. Without it the two entries are not offered. */
 onToolDefault?:(type:string,value:DrawingToolDefault|null)=>boolean|void;
 /** App queues Apply behind the routine background autosave (the chart refuses the edit while the save holds
  * it) and calls run when the write ends; run returns false when this dialog closed or changed meanwhile. true: queued. */
 deferApply?:(run:()=>boolean)=>boolean}
function open(chart:ChartController,id:string,assertOwner?:()=>void){
 try{assertOwner?.();return{editor:chart.getDrawingEditor(id),bars:chart.getSourceBars(),source:chart.getSourceContext(),error:''};}
 catch(error){return{editor:null,bars:[],source:null,error:String(error)};}
}
function initialDraft(opened:ReturnType<typeof open>){
 const editor=opened.editor;
 // The model maps a v1 rule only when v2 shows the same LV interval set; otherwise readOnly with the notice.
 const tab=visibilityTabModel(editor?.intervalVisibility);
 const visibility:{rule:DrawingIntervalVisibilityV2;readOnly:boolean;notice?:string;edited:boolean}={rule:tab.rule,readOnly:tab.readOnly,notice:tab.notice,edited:false};
 return{values:structuredClone(editor?.values??{}),anchors:(editor?.anchors??[]).map(({price,timeSeconds,barNumber})=>({price,timeSeconds,barNumber})),offset:editor?.priceOffset,visibility,barsPattern:null as BarsPatternSelection|null};
}
/** Reference tab list of the tool (visual-drawing-dialogs facts), else the generic tabs. Fib tools keep a separate Levels tab. */
function dialogTabList(editor:{type:string;levels?:unknown}|null):string[]{
 const tabs:string[]=[...(dialogTabsFor(editor?.type??'')??['Style','Coordinates','Visibility'])];
 if(editor?.levels)tabs.splice(tabs.indexOf('Visibility'),0,'Levels');
 // About last, only when the tool has a reference file.
 if(editor&&drawingTypeReference(editor.type))tabs.push('About');
 return tabs;
}
/** The dialog is open for the selected drawing, and App renders it only while that drawing is selected. The pinned
 * renderer's selection popup listens for pointerdown on the document (bubble phase; see drawing-edit-bar.tsx)
 * and clears the selection on any press outside its own chrome, which unmounted this dialog before a click on
 * Apply, Cancel or any other control could land. A press inside the dialog belongs to the selection, so it stops here,
 * the same way it stops at the selection bar. Capture-phase outside-dismiss listeners (menus, flyouts) still see it, and
 * the default action (focus, text selection) is untouched. display:contents keeps the wrapper out of layout. */
function drawingDialogScope(children:React.ReactNode):React.ReactElement{
 return <div className="drawing-dialog-scope" style={{display:'contents'}} onPointerDown={event=>event.stopPropagation()}>{children}</div>;
}
interface Session {chart:ChartController;id:string;token:object;opened:ReturnType<typeof open>;revision:number;closed:boolean;applying:boolean;terminal:boolean}
export function DrawingDialog({chart,id,ownerToken,isCurrent,onClose,onChange,assertOwner,barsPatternData,imagePicker,timeZone,initialTab,onToolDefault,deferApply}:Props){
 const fallback=useRef({}),token=ownerToken??fallback.current,sessionRef=useRef<Session|null>(null),mounted=useRef(true);
 if(!sessionRef.current||sessionRef.current.token!==token||sessionRef.current.chart!==chart||sessionRef.current.id!==id)sessionRef.current={chart,id,token,opened:open(chart,id,assertOwner),revision:0,closed:false,applying:false,terminal:false};
 const owner=sessionRef.current,opened=owner.opened,original=opened.editor,revision=owner.revision;
 const openingTabs=dialogTabList(original),firstTab=initialTab!==undefined&&openingTabs.includes(initialTab)?initialTab:openingTabs[0]??'Style';
 const [saved,setSaved]=useState(()=>({owner,draft:initialDraft(opened),tab:firstTab,error:''}));
 const state=saved.owner===owner?saved:{owner,draft:initialDraft(opened),tab:firstTab,error:''},draft=state.draft;
 const [saveName,setSaveName]=useState<string|null>(null);
 // A date field's partial year ("0002" while "2025" is typed) is held here and never applied; the field keeps showing it
 // until the year is complete (then it applies), the field loses focus or Enter is pressed (then a still partial year is dropped).
 const [pendingDate,setPendingDate]=useState<{owner:Session;dates:Readonly<Record<number,string>>}>(()=>({owner,dates:{}}));
 const pendingDates=pendingDate.owner===owner?pendingDate.dates:{};
 // A price field shows the price at the instrument's tick precision (19.03, not 19.0312970139); while it is being typed
 // the typed text is held here for the rest of the dialog, so the rounding never rewrites what the user typed.
 const [pendingPrice,setPendingPrice]=useState<{owner:Session;prices:Readonly<Record<number,string>>}>(()=>({owner,prices:{}}));
 const pendingPrices=pendingPrice.owner===owner?pendingPrice.prices:{};
 const holdPrice=(index:number,value:string|undefined)=>setPendingPrice(previous=>{const prices={...(previous.owner===owner?previous.prices:{})};if(value===undefined)delete prices[index];else prices[index]=value;return{owner,prices};});
 const holdDate=(index:number,value:string|undefined)=>setPendingDate(previous=>{const dates={...(previous.owner===owner?previous.dates:{})};if(value===undefined)delete dates[index];else dates[index]=value;return{owner,dates};});
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
 // Gap 21: the chart shows the draft while the dialog is open. Leaving the dialog any way but Apply puts the drawing back.
 const previewPort=chart as Partial<DrawingPreviewPort>;
 const clearPreview=()=>{try{previewPort.clearDrawingPreview?.(id);}catch{/* a retired chart has no preview to clear */}};
 useEffect(()=>()=>{try{(chart as Partial<DrawingPreviewPort>).clearDrawingPreview?.(id);}catch{/* retired */}},[chart,id]);
 const ownsSession=()=>mounted.current&&sessionRef.current===owner&&!owner.closed;
 const live=()=>ownsSession()&&(isCurrent?.()??true)&&ownsSession();
 const current=()=>live()&&!owner.applying&&!owner.terminal&&owner.revision===revision;
 const report=(error:unknown)=>{if(live())setSaved(previous=>({...(previous.owner===owner?previous:state),error:String(error)}));};
 const showPreview=(next:typeof draft)=>{if(!original||typeof previewPort.previewDrawingEdit!=='function')return;try{const changes=drawingDraftChanges(original,next.values,next.anchors,next.offset);previewPort.previewDrawingEdit(id,changes.properties,changes.coordinates,changes.priceOffset);}catch{/* An incomplete draft (an empty number field) keeps the last preview; Apply reports the problem. */}};
 const stage=(next:typeof draft)=>{if(!current())return;owner.revision++;setSaved({...state,draft:next,error:''});showPreview(next);};
 const tab=(name:string)=>{if(!current())return;owner.revision++;setSaved({...state,tab:name});};
 function close(){if(!live()||owner.applying)return;clearPreview();owner.closed=true;owner.revision++;try{onClose();}catch(error){if(sessionRef.current===owner&&mounted.current&&(isCurrent?.()??true)){owner.closed=false;report(error);}}}
 function apply(){
  if(!original||!current())return;
  // During the routine background autosave Apply waits for the write. The dialog stays open and read-only
  // meanwhile (Cancel waits too), and the draft as it was at Apply is applied once the write ends.
  if(deferApply){
   owner.applying=true;let queued=false;
   try{queued=deferApply(()=>{owner.applying=false;if(!live()||owner.terminal||owner.revision!==revision)return false;applyNow();return true;});}catch(error){owner.applying=false;report(error);return;}
   if(queued){setSaved(previous=>({...(previous.owner===owner?previous:state),error:''}));return;}
   owner.applying=false;
  }
  applyNow();
 }
 function applyNow(){
  if(!original||!current())return;owner.applying=true;
  try{
   assertOwner?.();const source=chart.getSourceContext();
   if(!opened.source||!sameChartSourceBasis(source,opened.source)||source.inputIdentity!==opened.source.inputIdentity)throw Error('Chart source or information prefix changed. Close and reopen the drawing settings.');
   assertDrawingRecordUnchanged(original.recordFingerprint,chart.getDrawingEditor(id).recordFingerprint);
   if(original.type===LV_BARS_PATTERN){const pattern=barsPatternSectionModel(original.values[BARS_PATTERN_SOURCE_PATH],draft.barsPattern,barsPatternData,opened.source);if(pattern.blocked)throw Error(pattern.status);}
   if(original.type==='fibretracement')for(let index=0;index<(original.levels?.length??0);index++){
    const path='levels.'+index+'.label';validateFibLevelLabelChange(original.values[path],draft.values[path]);
   }
   // The dialog writes v2 only when the user edits (or presses Reset); a read-only v1 rule is never rewritten.
   const rule=draft.visibility.edited?validateDrawingVisibilityV2(draft.visibility.rule):undefined;
   const visibilityChanged=rule&&JSON.stringify(rule)!==JSON.stringify(original.intervalVisibility);
   // An emptied or invalid date or time leaves no bar to move to; nothing is written.
   if(draft.anchors.some((anchor,index)=>original.anchors[index]?.editableTime&&typeof anchor.barNumber==='number'&&!Number.isFinite(anchor.barNumber)))throw Error('Enter a valid date and time for every point.');
   const changes=drawingDraftChanges(original,draft.values,draft.anchors,draft.offset);
   assertOwner?.();
   if(!live()||owner.terminal||owner.revision!==revision)return;
   clearPreview();
   const receipt=chart.updateDrawingEdit(id,changes.properties,changes.coordinates,changes.priceOffset,visibilityChanged?rule:undefined);
   owner.terminal=true;
   if(!live())return;
   if(!(receipt&&'changed' in receipt&&receipt.changed===false)&&onChange()===false)throw Error('The drawing changed, but workspace capture was rejected. Reopen this chart before editing again.');
   if(live()){owner.applying=false;close();}
  }catch(error){if(error instanceof DrawingEditRecoveryError)owner.terminal=true;report(error);}
  finally{owner.applying=false;}
 }
 if(!original)return drawingDialogScope(<Modal title="Drawing settings unavailable" onClose={close}><p role="alert">{opened.error}</p><p>The saved drawing is retained. Its properties cannot be edited with this renderer.</p><footer><button onClick={close}>Close</button></footer></Modal>);
 const field=(path:string,value:unknown)=>stage({...draft,values:{...draft.values,[path]:value}});
 const tabRows=(rule:DrawingIntervalVisibilityV2):VisibilityTabRow[]=>visibilityTabModel(rule).rows;
 const setUnit=(unit:VisibilityTabRow['unit'],patch:{enabled?:boolean;from?:number;to?:number})=>{
  const next=structuredClone(draft.visibility.rule) as DrawingIntervalVisibilityV2&Record<string,unknown>;
  if(unit==='ticks'||unit==='ranges')next[unit]=patch.enabled??next[unit];else next[unit]={...next[unit] as object,...patch} as never;
  stage({...draft,visibility:{...draft.visibility,rule:next,edited:true}});
 };
 const levelTextMessage=(path:string):{invalid:boolean;message:string}=>{
  if(original.type!=='fibretracement')return{invalid:false,message:''};
  try{validateFibLevelLabelChange(original.values[path],draft.values[path]);}
  catch(error){return{invalid:true,message:String(error)};}
  try{assertNewFibLevelLabel(draft.values[path]);return{invalid:false,message:''};}
  catch{return{invalid:false,message:'Previously saved text is preserved until you edit it. New text must fit on one line and use 50 characters or fewer.'};}
 };
 const pasteLevelText=(path:string,event:React.ClipboardEvent<HTMLInputElement>)=>{
  if(!current())return;event.preventDefault();if(!current())return;
  try{
   const inserted=event.clipboardData.getData('text/plain');if(!current())return;
   const before=String(draft.values[path]??''),start=event.currentTarget.selectionStart,end=event.currentTarget.selectionEnd;
   if(!Number.isInteger(start)||!Number.isInteger(end)||start===null||end===null||start<0||end<start||end>before.length)throw Error('Text selection is unavailable. Select the label text and paste again.');
   const value=before.slice(0,start)+inserted+before.slice(end);validateFibLevelLabelChange(original.values[path],value);
   field(path,value);
  }catch(error){if(current())report(error);}
 };
 const commonLevelColor=fibLevelColor(original,draft.values);
 const setCommonLevelColor=(color:string)=>{if(!current())return false;try{stage({...draft,values:fibLevelColorValues(original,draft.values,color)});return true;}catch(error){report(error);return false;}};
 const number=(value:string)=>value===''?NaN:Number(value);
 type Item=typeof original.fields[number];
 const spec=dialogSpecFor(original.type),tabs=dialogTabList(original),textTab=tabs.includes('Text'),inputsTab=tabs.includes('Inputs');
 const isTextField=(item:Item)=>item.group==='text'||item.path.startsWith('text.');
 /** The tab a setting lives on: text settings on a Text tab, position inputs on Inputs, the rest on Style (or the first tab when the tool has no Style tab). */
 const homeTab=(item:Item)=>textTab&&isTextField(item)?'Text':inputsTab&&item.group==='behavior'?'Inputs':tabs.includes('Style')?'Style':tabs[0];
 const tabFields=(name:string)=>original.fields.filter(item=>drawingFieldApplicable(item,draft.values)&&homeTab(item)===name&&!(original.type===LV_BARS_PATTERN&&item.path===BARS_PATTERN_SOURCE_PATH));
 const barsPatternBlocked=original.type===LV_BARS_PATTERN&&barsPatternSectionModel(original.values[BARS_PATTERN_SOURCE_PATH],draft.barsPattern,barsPatternData,opened.source).blocked;
 const renderField=(item:Item)=>{
  if(original.type==='fibretracement'&&item.path==='style.lineWidth')item={...item,label:'Level line width'};
  if(original.type==='fibretracement'&&item.path==='style.lineStyle')item={...item,label:'Level line style'};
  if(original.type===LV_IMAGE&&item.path===IMAGE_ASSET_KEY)return <div className="form-row" key={item.path}><span>{item.label}</span><input aria-label="Replace image" type="file" accept="image/png,image/jpeg,image/gif,image/webp" disabled={!imagePicker} onChange={event=>{const file=event.target.files?.[0];event.target.value='';if(!file||!imagePicker)return;void imagePicker(file).then(result=>{if(!current())return;if(!result.ok){report(result.message);return;}const fit=fitReplacementImage(result,{cssWidth:Number(draft.values.cssWidth)||0,cssHeight:Number(draft.values.cssHeight)||0});stage({...draft,values:{...draft.values,[item.path]:result.id,cssWidth:fit.width,cssHeight:fit.height}});},error=>report(error));}}/><output aria-label="Image">{draft.values[item.path]?'Image set':'No image'}</output></div>;
  const numeric=numericOptionsFor(original.type,item.path);
  if(numeric){const current=draft.values[item.path],listed=typeof current==='number'&&!numeric.includes(current)?[...numeric,current].sort((a,b)=>a-b):numeric;return <div className="form-row" key={item.path}><span>{item.label}</span><select aria-label={item.label} data-property={item.path} value={String(current??'')} onChange={event=>field(item.path,Number(event.target.value))}>{listed.map(value=><option key={value} value={String(value)}>{value}</option>)}</select></div>;}
  const endpoint=drawingEndcapControl(original.type,item.path,draft.values[item.path]);
  if(endpoint)return <div className="form-row" key={item.path}><span>{endpoint.label}</span><select aria-label={endpoint.label} data-property={item.path} disabled={!endpoint.available} value={endpoint.value} onChange={event=>{const value=event.target.value;if(endpoint.available&&(value==='normal'||value==='arrow'))field(item.path,value==='arrow');}}>{endpoint.available?[<option key="normal" value="normal">Normal</option>,<option key="arrow" value="arrow">Arrow</option>]:<option value="unavailable">Unavailable</option>}</select></div>;
  // The fib log-scale control is disabled with a visible reason unless the price scale is logarithmic (inert while the fib.logScale consumer flag is off).
  const logScaleHold=item.path==='lvFibLayout.logScale'&&original.fibLogScale?.enabled!==true;
  return <div className="form-row" key={item.path}><span>{item.label}</span>{item.kind==='boolean'?<input aria-label={item.label} data-property={item.path} type="checkbox" disabled={logScaleHold} title={logScaleHold?original.fibLogScale?.reason:undefined} checked={Boolean(draft.values[item.path])} onChange={event=>field(item.path,event.target.checked)}/>:item.options?<select aria-label={item.label} data-property={item.path} value={String(draft.values[item.path]??'')} onChange={event=>field(item.path,event.target.value)}>{item.options.map(option=><option key={option.value} value={option.value}>{option.label}</option>)}</select>:item.kind==='lineStyle'?<select aria-label={item.label} data-property={item.path} value={String(draft.values[item.path]??'solid')} onChange={event=>field(item.path,event.target.value)}>{['solid','dashed','dotted'].map(value=><option key={value}>{value}</option>)}</select>:item.kind==='color'?<ColorControl label={item.label} fieldKey={id+':'+item.path} value={String(draft.values[item.path]??'')} ownerToken={owner} isCurrent={current} disabled={owner.terminal||owner.applying} onChange={value=>field(item.path,value)}><input aria-label={item.label} data-property={item.path} value={String(draft.values[item.path]??'')} onChange={event=>field(item.path,event.target.value)}/></ColorControl>:<input aria-label={item.label} data-property={item.path} type={item.kind==='number'||item.kind==='opacity'?'number':'text'} min={item.min} max={item.max} step={item.step??'any'} value={typeof draft.values[item.path]==='number'&&!Number.isFinite(draft.values[item.path])?'':String(draft.values[item.path]??'')} onChange={event=>field(item.path,item.kind==='number'||item.kind==='opacity'?number(event.target.value):event.target.value)}/>}{logScaleHold&&original.fibLogScale?.reason&&<small>{original.fibLogScale.reason}</small>}</div>;
 };
 /** A "checklist dropdown" row (the trend line Stats row, the rectangle Extend row)
  * is one button that opens the row's switches. Each switch keeps its data-property checkbox input (role menuitemcheckbox), so the draft,
  * Apply, Reset and template paths are unchanged. A row whose settings the renderer has but this chart does not offer right now (the
  * consumer is not installed, or the saved member is unreadable) shows the button disabled with the reason; a row with no renderer
  * setting at all is not drawn (DIALOG_UNAVAILABLE). */
 const renderChecklist=(row:DialogRow,entries:readonly [string,string][],items:Map<string,Item>,mapped:boolean):React.ReactElement[]=>{
  const placeholder=checklistPlaceholder(row);
  if(!entries.length){if(!mapped)return [];const reason=row.title+' is unavailable for this drawing on this chart.';return [<fieldset key={row.factId} className="checklist-row"><legend>{row.title}</legend><DrawingChecklist label={row.title} summary={placeholder} disabled reason={reason}/></fieldset>];}
  const list=entries.map(([property,path])=>({path,label:row.labels?.[property]??items.get(path)!.label,checked:Boolean(draft.values[path])}));
  return [<fieldset key={row.factId} className="checklist-row"><legend>{row.title}</legend><DrawingChecklist label={row.title} summary={checklistSummary(list,placeholder)} disabled={owner.terminal||owner.applying}>{list.map(entry=><label key={entry.path} className="lv-checklist-item"><input type="checkbox" role="menuitemcheckbox" aria-checked={entry.checked} aria-label={entry.label} data-property={entry.path} checked={entry.checked} onChange={event=>field(entry.path,event.target.checked)}/>{entry.label}</label>)}</DrawingChecklist></fieldset>];
 };
 /** Style tab rows in the reference order. A row draws only the settings the renderer has; a row whose every reference property is
  * backed and that holds one control uses the row title as that control's label, any other row is a titled group. Settings the
  * reference does not list follow after the rows. */
 const renderRows=(rows:readonly DialogRow[],items:Map<string,Item>,used:Set<string>):React.ReactNode[]=>rows.flatMap(row=>{
  if(row.children){const kids=renderRows(row.children,items,used);return kids.length?[<fieldset key={row.factId}><legend>{row.title}</legend>{kids}</fieldset>]:[];}
  const all=Object.entries(row.lv),entries=all.filter((entry):entry is [string,string]=>entry[1]!==null&&items.has(entry[1])&&!used.has(entry[1]));
  for(const [,path] of entries)used.add(path);
  if(isChecklistRow(row))return renderChecklist(row,entries,items,all.some(([,path])=>path!==null&&drawingFieldPathPossible(original.type,path)));
  if(!entries.length)return [];
  if(entries.length===1&&all.length===1)return [renderField({...items.get(entries[0][1])!,label:row.title})];
  return [<fieldset key={row.factId}><legend>{row.title}</legend>{entries.map(([property,path])=>renderField(row.labels?.[property]?{...items.get(path)!,label:row.labels[property]}:items.get(path)!))}</fieldset>];
 });
 const renderTab=(name:string)=>{
  const items=new Map(tabFields(name).map(item=>[item.path,item] as [string,Item])),used=new Set<string>();
  if(name==='Style'&&spec){const rows=renderRows(spec.style,items,used);return [...rows,...[...items.values()].filter(item=>!used.has(item.path)).map(renderField)];}
  if(name==='Text'&&spec?.text){const ordered=Object.values(spec.text).filter((path):path is string=>path!==null&&items.has(path));return [...ordered.map(path=>renderField(items.get(path)!)),...[...items.values()].filter(item=>!ordered.includes(item.path)).map(renderField)];}
  // A text tool with no recorded dialog lists its text settings in the reference common order.
  if(name==='Text'){const rank=(path:string)=>{const index=COMMON_TEXT_ORDER.indexOf(path);return index<0?COMMON_TEXT_ORDER.length:index;};return [...items.values()].sort((a,b)=>rank(a.path)-rank(b.path)).map(renderField);}
  return [...items.values()].map(renderField);
 };
 const dirty=JSON.stringify(draft.values)!==JSON.stringify(original.values)||draft.visibility.edited||draft.offset!==original.priceOffset||JSON.stringify(draft.anchors)!==JSON.stringify(original.anchors.map(({price,timeSeconds,barNumber})=>({price,timeSeconds,barNumber})));
 let templates:{id:string;name:string;type:string;properties:Record<string,unknown>}[]=[];
 try{templates=templateChoices(chart.drawingManager.state().templates,original.type);}catch{templates=[];}
 const chooseTemplate=(templateId:string)=>{const template=templateId===DEFAULT_TEMPLATE_ID?(()=>{const properties=defaultTemplateValues(original.type);return properties?{properties}:undefined;})():templates.find(row=>row.id===templateId);if(!template||!current())return;stage({...draft,values:applyTemplateToDraft(original.values,draft.values,template.properties).values});};
 const saveTemplate=()=>{if(!current()||saveName===null)return;try{chart.drawingManager.saveTemplate(id,saveName);setSaveName(null);if(onChange()===false)throw Error('The template was saved, but workspace capture was rejected.');owner.revision++;setSaved({...state,error:''});}catch(error){report(error);}};
 /** Remove template.
  * One drawing manager step, captured like Save as, so workspace undo restores the template. The draft is not changed. */
 const removeTemplate=(templateId:string)=>{if(!current())return;try{chart.drawingManager.removeTemplate(templateId);if(onChange()===false)throw Error('The template was removed, but workspace capture was rejected.');owner.revision++;setSaved({...state,error:''});}catch(error){report(error);}};
 /** Save as default stores the APPLIED drawing's look for its tool (unapplied edits must be applied first, as for Save
  * as). Reset settings forgets it and puts the factory settings into the draft; Apply keeps them on this drawing. */
 const saveToolDefault=()=>{if(!current()||!onToolDefault)return;try{const row=chart.drawingManager.list().find(item=>item.id===id);if(!row)throw Error('This drawing no longer exists.');const {type,value}=captureToolDefault(row);if(onToolDefault(type,value)===false)throw Error('The default was not saved.');setSaved({...state,error:''});}catch(error){report(error);}};
 const resetToolDefault=()=>{if(!current()||!onToolDefault)return;try{if(onToolDefault(original.type,null)===false)throw Error('The saved default was not reset.');const properties=defaultTemplateValues(original.type);if(properties)stage({...draft,values:applyTemplateToDraft(original.values,draft.values,properties).values});}catch(error){report(error);}};
 const preview=drawingPreview(draft.values),priceStep=coordinatePriceStep(opened.source),priceDecimals=coordinatePriceDecimals(opened.source);
 return drawingDialogScope(<Modal title={drawingDialogTitle(original.type)} onClose={close}><form noValidate onSubmit={event=>{event.preventDefault();if(!(event.nativeEvent as Event&{isComposing?:boolean}).isComposing)apply();}} onKeyDown={event=>{if(event.key==='Enter'&&event.nativeEvent.isComposing)event.preventDefault();}}>
  <fieldset disabled={owner.terminal||owner.applying}>
  <svg className="drawing-preview" role="img" aria-label="Style preview" width="100%" height="34" viewBox="0 0 240 34" preserveAspectRatio="none">{preview.fill&&<rect x="8" y="6" width="224" height="22" fill={preview.fill}/>}<line x1="8" y1="17" x2="232" y2="17" stroke={preview.stroke} strokeWidth={preview.strokeWidth} strokeDasharray={preview.dash||undefined}/></svg>
  <nav className="tab-row">{tabs.map(name=><button key={name} type="button" className={state.tab===name?'active':''} onClick={()=>tab(name)}>{name}</button>)}</nav>
  <div className="modal-scroll">
   {state.tab==='Levels'&&commonLevelColor!==undefined&&<div className="form-row"><span>Use one color</span><ColorControl label="All Fibonacci lines" fieldKey={id+':all-level-colors'} value={commonLevelColor} ownerToken={owner} isCurrent={current} disabled={owner.terminal||owner.applying} onChange={setCommonLevelColor}><output aria-label="All Fibonacci line colors">{commonLevelColor||'Mixed'}</output></ColorControl></div>}
   {original.annotationDiagnostic&&<p role="alert">{original.annotationDiagnostic}</p>}
   {original.fibFormatDiagnostic&&<p role="alert">{original.fibFormatDiagnostic}</p>}
   {original.fibTrendLineDiagnostic&&<p role="alert">{original.fibTrendLineDiagnostic}</p>}
   {original.fibBackgroundDiagnostic&&<p role="alert">{original.fibBackgroundDiagnostic}</p>}
   {original.fibTextDiagnostic&&<p role="alert">{original.fibTextDiagnostic}</p>}
   {(state.tab==='Inputs'||state.tab==='Style'||state.tab==='Text')&&renderTab(state.tab)}
   {state.tab==='About'&&<ToolAbout file={drawingTypeReference(original.type)}/>}
   {original.type===LV_BARS_PATTERN&&state.tab==='Style'&&<BarsPatternSourceSection editorValue={original.values[BARS_PATTERN_SOURCE_PATH]} selection={draft.barsPattern} data={barsPatternData} chart={opened.source} disabled={owner.terminal||owner.applying} onSelect={(selection,value)=>stage({...draft,barsPattern:selection,values:{...draft.values,[BARS_PATTERN_SOURCE_PATH]:value}})}/>}
   {original.type==='trendline'&&state.tab==='Style'&&original.statsDiagnostic&&<p role="alert">{original.statsDiagnostic}</p>}
   {original.type==='box'&&state.tab==='Style'&&original.boxExtendDiagnostic&&<p role="alert">{original.boxExtendDiagnostic}</p>}
   {original.type==='trendline'&&state.tab==='Text'&&<p className="help">Click visible, unlocked annotation text on the chart to edit it. Enter adds a new line; Ctrl+Enter saves; Escape cancels. Use these settings to add text when the label is empty.</p>}
   {state.tab==='Coordinates'&&<>{draft.anchors.slice(0,original.type==='parallelchannel'?2:draft.anchors.length).map((anchor,index)=>{
    // The time axis is a date and a time in the chart timezone (our own over visual-drawing-dialogs#dialog.common.coordinates,
    // which records a bar number). A typed date or time lands on the nearest bar, so the draft keeps a whole bar number and Apply is unchanged.
    const setAnchor=(patch:Partial<typeof anchor>)=>stage({...draft,anchors:draft.anchors.map((value,i)=>i===index?{...value,...patch}:value)});
    // Past the loaded bars the typed instant is kept exactly (coordinateAnchorFromDateTime), so the fields show what was typed.
    const at=coordinateDraftSeconds(opened.bars,anchor,original.anchors[index]),seconds=coordinateTimeHasSeconds(opened.bars),shown=coordinateDateTimeText(at,timeZone,seconds);
    const projected=Number.isFinite(at)&&opened.bars.length>0&&(at<opened.bars[0].time||at>opened.bars[opened.bars.length-1].time);
    const setTime=(date:string,time:string)=>setAnchor(coordinateAnchorFromDateTime(opened.bars,date,time,timeZone,original.anchors[index]));
    return <fieldset key={index}><legend>{'#'+(index+1)+' (price, time)'}</legend>
    {original.anchors[index].editablePrice&&<label className="form-row">{COORDINATE_LABELS.price}<input aria-label={'Anchor '+(index+1)+' price'} type="number" step={priceStep} value={pendingPrices[index]??String(coordinateDisplayValue(anchor.price,priceDecimals))} onChange={event=>{holdPrice(index,event.target.value);setAnchor({price:number(event.target.value)});}}/></label>}
    {original.anchors[index].editableTime&&<label className="form-row">{COORDINATE_LABELS.date}<input aria-label={'Anchor '+(index+1)+' date'} type="date" value={pendingDates[index]??shown.date} onChange={event=>{const value=event.target.value;if(coordinateDateComplete(value)){holdDate(index,undefined);setTime(value,shown.time||'00:00');}else holdDate(index,value);}} onBlur={()=>{if(pendingDates[index]!==undefined)holdDate(index,undefined);}} onKeyDown={event=>{if(event.key==='Enter'&&pendingDates[index]!==undefined){event.preventDefault();holdDate(index,undefined);}}}/></label>}
    {original.anchors[index].editableTime&&<label className="form-row">{COORDINATE_LABELS.time}<input aria-label={'Anchor '+(index+1)+' time'} type="time" step={seconds?1:60} value={shown.time} onChange={event=>setTime(shown.date,event.target.value)}/></label>}
    {original.anchors[index].coordinateDiagnostic&&<p role="status">{original.anchors[index].coordinateDiagnostic.message}</p>}
    {original.anchors[index].editableTime&&<small>{typeof anchor.barNumber==='number'&&Number.isFinite(anchor.barNumber)&&Number.isFinite(at)?(projected?'Chart timezone, exact time (past the loaded bars)':'Chart timezone, nearest bar'):'Enter a valid date and time.'}</small>}
   </fieldset>;})}{draft.offset!==undefined&&<label className="form-row">Channel price offset<input aria-label="Channel price offset" type="number" step="any" value={Number.isFinite(draft.offset)?draft.offset:''} onChange={event=>stage({...draft,offset:number(event.target.value)})}/></label>}</>}
   {state.tab==='Visibility'&&<>
    <p>Current source: {original.sourceResolution??'unknown'}.</p>
    {original.visibilityDiagnostic&&<p role="alert">{original.visibilityDiagnostic.message}</p>}
    {draft.visibility.readOnly&&<p role="status">{draft.visibility.notice}</p>}
    {tabRows(draft.visibility.rule).map(row=><div className="form-row" key={row.unit}>
     <label><input type="checkbox" aria-label={row.label} checked={row.enabled} disabled={draft.visibility.readOnly||owner.terminal||owner.applying} onChange={event=>setUnit(row.unit,{enabled:event.target.checked})}/> {row.label}</label>
     {row.bounds&&<><input type="number" aria-label={row.label+' from'} min={row.bounds[0]} max={row.bounds[1]} value={row.from} disabled={draft.visibility.readOnly||!row.enabled||owner.terminal||owner.applying} onChange={event=>setUnit(row.unit,{from:Number(event.target.value)})}/>
      <input type="number" aria-label={row.label+' to'} min={row.bounds[0]} max={row.bounds[1]} value={row.to} disabled={draft.visibility.readOnly||!row.enabled||owner.terminal||owner.applying} onChange={event=>setUnit(row.unit,{to:Number(event.target.value)})}/></>}
    </div>)}
    {draft.visibility.readOnly&&<button type="button" onClick={()=>stage({...draft,visibility:{rule:visibilityTabModel(undefined).reset,readOnly:false,edited:true}})}>Reset</button>}
   </>}
   {state.tab==='Levels'&&original.levels&&<table className="levels-grid"><thead><tr><th scope="col">#</th>{LEVEL_COLUMNS.map(name=><th scope="col" key={name}>{name}</th>)}</tr></thead><tbody>{levelGridRows(original.levels as unknown as Record<string,unknown>[],draft.values).map(row=>{const index=row.index;return <tr key={index}><th scope="row">{index+1}</th>{(['enabled','ratio','color','label'] as const).map(key=>{const path='levels.'+index+'.'+key,actual=row[key],labelState=key==='label'?levelTextMessage(path):{invalid:false,message:''};return <td key={key}>{key==='color'?<ColorControl label={'Level '+(index+1)+' color'} fieldKey={id+':'+path} value={String(actual)} ownerToken={owner} isCurrent={current} disabled={owner.terminal||owner.applying} onChange={value=>field(path,value)}><input aria-label={'Level '+(index+1)+' color'} data-property={path} value={String(actual)} onChange={event=>field(path,event.target.value)}/></ColorControl>:<input aria-label={'Level '+(index+1)+' '+key} data-property={path} type={key==='enabled'?'checkbox':key==='ratio'?'number':'text'} aria-invalid={key==='label'?labelState.invalid:undefined} onPaste={key==='label'&&original.type==='fibretracement'?event=>pasteLevelText(path,event):undefined} step="any" checked={key==='enabled'?Boolean(actual):undefined} value={key==='enabled'?undefined:typeof actual==='number'&&!Number.isFinite(actual)?'':String(actual)} onChange={event=>field(path,key==='enabled'?event.target.checked:key==='ratio'?number(event.target.value):event.target.value)}/>} {labelState.message&&<small role={labelState.invalid?'alert':'status'}>{labelState.message}</small>}{key==='label'&&original.type==='fibretracement'&&<small>{String(actual).length}/50</small>}</td>;})}</tr>;})}</tbody></table>}
  </div></fieldset>
  <footer><span role="alert">{state.error}</span>{saveName===null?<select aria-label="Template" value="" disabled={owner.terminal||owner.applying} onChange={event=>{const value=event.target.value;if(value==='__save')setSaveName('');else if(value==='__save-default')saveToolDefault();else if(value==='__reset-default')resetToolDefault();else if(value.startsWith('__remove:'))removeTemplate(value.slice('__remove:'.length));else chooseTemplate(value);}}><option value="">Template</option><option value={DEFAULT_TEMPLATE_ID}>Default</option>{templates.map(template=><option key={template.id} value={template.id}>{template.name}</option>)}<option value="__save" disabled={dirty} title={dirty?'Apply your changes first, then save them as a template.':undefined}>Save as…</option>{onToolDefault&&<option value="__save-default" disabled={dirty} title={dirty?'Apply your changes first, then save them as the default.':'New drawings of this tool start with these settings.'}>Save as default</option>}{onToolDefault&&<option value="__reset-default" title="New drawings of this tool start with the factory settings again.">Reset settings</option>}{templates.length>0&&<optgroup label="Remove template">{templates.map(template=><option key={'remove-'+template.id} value={'__remove:'+template.id}>{'Remove '+template.name}</option>)}</optgroup>}</select>:<span className="drawing-template-save"><input aria-label="Template name" value={saveName} onChange={event=>setSaveName(event.target.value)} placeholder="Template name"/><button type="button" disabled={!saveName.trim()} onClick={saveTemplate}>Save template</button><button type="button" onClick={()=>setSaveName(null)}>Cancel</button></span>}<button disabled={owner.terminal||owner.applying} type="button" onClick={()=>stage(initialDraft(opened))}>Reset</button><button type="button" onClick={close}>Cancel</button><button disabled={owner.terminal||owner.applying||barsPatternBlocked} type="submit" className="primary">Apply</button></footer>
 </form></Modal>);
}
