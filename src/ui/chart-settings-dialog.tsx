// Settings dialog: vertical tabs (only those with working rows, plus Data sources),
// grouped rows bound to the chart's real settings, Template menu, Cancel and Ok. Changes
// preview live; Cancel, X and Escape return the chart to the opening values; Ok hands one
// commit to the workspace.
import React,{useEffect,useRef,useState} from 'react';
import './chart-settings-dialog.css';
import {ColorControl} from './ColorControl';
import {useDialogDrag} from './Modal';
import type {ChartAppearance} from './themes';
import {ALL_TABS,CHART_SETTINGS_DIALOG,type ChartSettingsOption,type ChartSettingsTabId} from '../chart/chart-settings-facts';
import {LINE_STYLE_OPTIONS,THICKNESS_OPTIONS,hasTypeSettings,visibleTabView,visibleTabs,typeDefaults,type ChartSettingsRowView,type ChartSettingsSources,type ControlPart,type ControlValue,type ScaleModeSettings} from '../chart/chart-settings-bindings';
import {defaultChartSettingsDocument,type ChartSettingsDocument,type ChartSettingsTemplate} from '../chart/chart-settings-document';
import type {PriceScaleSettings} from '../chart/price-scale-state';
import {
 TEMPLATE_PRESETS,appTabMemory,createMemoryTabMemory,applyDefaults,applyPreset,applyTemplate,beginCommit,closePopup,commitPayload,escape,finishCommit,openSession,removeTemplate,selectTab,setControl,
 setError,setTemplateName,stepTab,templateFromSession,togglePopup,withTemplates,type ChartSettingsCommit,type ChartSettingsSession,type ChartSettingsTabMemory,
} from '../chart/chart-settings-session';

export interface ChartSettingsDialogProps {
 /** Theme dialog compatible core: the workspace appearance and theme id, live preview, Ok and Cancel. */
 themeId:string;
 appearance:ChartAppearance;
 onPreview:(appearance:ChartAppearance,preview:ChartSettingsCommit)=>void;
 /** Ok. Return false to refuse; the dialog stays open with its values. */
 onApply:(themeId:string,appearance:ChartAppearance,commit:ChartSettingsCommit)=>boolean|void|Promise<boolean|void>;
 /** Cancel, X or Escape: the host drops the preview and closes. */
 onCancel:()=>void;
 ownerToken?:object;
 isCurrent?:()=>boolean;
 /** Saved Chart Settings document. Without it, document rows are shown as unavailable. */
 document?:ChartSettingsDocument;
 chartStyle?:string;
 /** Current settings of the chart type (chart.getChartSettings(style)); ignored for candles. */
 typeSettings?:Record<string,unknown>|null;
 timezone?:string|null;
 exchangeTimezone?:string|null;
 /** Price scale settings of the chart (chart.priceScale.settings()) and its current ratio. */
 priceScale?:PriceScaleSettings|null;
 ratio?:number|null;
 /** Scale type, invert and auto scale of the chart. Without it those rows are left out. */
 scaleMode?:ScaleModeSettings|null;
 /** Body of the Data sources tab. Without it the tab is not shown. It is outside the draft: its buttons act at once. */
 dataSources?:React.ReactNode;
 /** True while a Data sources action (export, reset) is running; Cancel, X and Escape wait for it. */
 /** Body of the General tab (app preferences). Without it the tab is not shown. Like Data sources it is outside the draft. */
 general?:React.ReactNode;
 dataSourcesBusy?:()=>boolean;
 /** Entry tab (Scales from the price scale menu, Symbol from the series menu). Otherwise the last viewed tab. */
 initialTab?:ChartSettingsTabId|null;
 tabMemory?:ChartSettingsTabMemory;
 /** Saves the template list at once (Save as… and remove are not undone by Cancel). */
 onTemplatesChange?:(templates:ChartSettingsTemplate[])=>boolean|void;
 makeId?:()=>string;
}

export function chartSettingsSources(props:ChartSettingsDialogProps):ChartSettingsSources{
 const style=props.chartStyle??'candles',typeSettings=hasTypeSettings(style)&&props.typeSettings?{...typeDefaults(style),...structuredClone(props.typeSettings)}:null;
 return{appearance:structuredClone(props.appearance),document:props.document?structuredClone(props.document):defaultChartSettingsDocument(),documentConnected:!!props.document,
  priceScale:props.priceScale?structuredClone(props.priceScale):null,ratio:props.ratio??null,style,typeSettings,timezone:props.timezone??null,exchangeTimezone:props.exchangeTimezone??null,scaleMode:props.scaleMode?{...props.scaleMode}:null};
}
const disabledPart=(row:ChartSettingsRowView,part:ControlPart)=>row.disabledParts.includes(part);
/** LV accessible names for dropdowns that share a row with a checkbox or have no visible label. */
/** Why a visible control is greyed out, shown as its tooltip. */
const DISABLED_HINTS:Record<string,string>={'events.earnings':'Earnings breaks are not drawn on the chart yet.','trading.tradingSoundMelody':'Turn on Execution sound to choose a sound.','trading.tradingSoundVolume':'Turn on Execution sound to set its volume.'};
const SELECT_NAMES:Record<string,string>={'legend.symbolTextSource':'Title source','trading.positionPL':'Positions display','trading.bracketsPLDisplay':'Brackets display','events.ideasFilter':'Ideas filter','trading.tradingSoundMelody':'Execution sound melody'};
/** LV display of the price-to-bar ratio: up to seven decimals. */
export function formatRatio(value:number|null|undefined):string{return typeof value==='number'&&Number.isFinite(value)?String(Number(value.toFixed(7))):'';}
const defaultId=()=>typeof crypto!=='undefined'&&'randomUUID' in crypto?crypto.randomUUID().replace(/-/g,'').slice(0,24):String(Date.now())+Math.round(Math.random()*1e6);

const APP_TABS:readonly ChartSettingsTabId[]=['general','datasources'];
const appEntryMemory=createMemoryTabMemory();
/** Chart settings reopens on the last chart tab; app Settings keeps its own last tab (General or Data sources). */
function splitTabMemory(chart:ChartSettingsTabMemory):ChartSettingsTabMemory{
 return{read:()=>{const tab=chart.read();return tab&&!APP_TABS.includes(tab)?tab:null;},write:tab=>{if(APP_TABS.includes(tab))appEntryMemory.write(tab);else chart.write(tab);}};
}
export function ChartSettingsDialog(props:ChartSettingsDialogProps){
 const memory=splitTabMemory(props.tabMemory??appTabMemory);
 const [session,setSession]=useState<ChartSettingsSession>(()=>openSession(chartSettingsSources(props),{themeId:props.themeId,tab:props.initialTab==='general'?appEntryMemory.read()??'general':props.initialTab??null,memory,shown:visibleTabs(chartSettingsSources(props),!!props.dataSources,!!props.general)}));
 const [drafts,setDrafts]=useState<Record<string,string>>({});
 const live=useRef(session),mounted=useRef(true),dialog=useRef<HTMLDivElement>(null),fallback=useRef({});
 // The title bar moves the dialog like the Modal-based dialogs (clamped, remembered).
 const {style:dragStyle,...dragHandlers}=useDialogDrag(dialog,'chart-settings');
 // Numeric refusals belong to individual displayed drafts, not the last successful preview or a retryable apply error.
 const invalidDrafts=useRef<Record<string,{raw:string;message:string}>>({});
 live.current=session;
 const token=props.ownerToken??fallback.current;
 const allowed=()=>{if(!mounted.current)return false;try{return props.isCurrent?.()??true;}catch{return false;}};

 useEffect(()=>{mounted.current=true;const previous=typeof document==='undefined'?null:document.activeElement as HTMLElement|null;
  dialog.current?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')?.focus();
  return()=>{mounted.current=false;if(previous?.isConnected)previous.focus();};},[]);
 useEffect(()=>{if(!session.popup)return;const root=dialog.current?.querySelector(`[data-lv-popup="${CSS.escape(session.popup)}"]`);
  (root?.querySelector<HTMLElement>('[aria-selected="true"],[aria-checked="true"],input,[role="menuitem"],[role="menuitemcheckbox"],[role="menuitemradio"],[role="option"]'))?.focus();},[session.popup]);

 /** Every state change goes through here: live preview when values change, never after Ok or close. */
 function update(change:(value:ChartSettingsSession)=>ChartSettingsSession){
  if(!allowed())return;
  const before=live.current,next=change(before);if(next===before)return;
  live.current=next;setSession(next);
  if(next.tab!==before.tab)memory.write(next.tab);
  if(next.phase==='editing'&&next.current!==before.current)props.onPreview(structuredClone(next.current.appearance),commitPayload(next));
 }
 function focusOpener(key:string){if(typeof document==='undefined')return;dialog.current?.querySelector<HTMLElement>(`[data-lv-opener="${CSS.escape(key)}"]`)?.focus();}
 function close(){
  if(!allowed())return;const current=live.current;if(current.phase!=='editing')return;
  if(props.dataSourcesBusy?.()){update(value=>setError(value,'Wait for the saved work operation to finish.'));return;}
  memory.write(current.tab);const done={...current,phase:'done' as const,popup:null};live.current=done;setSession(done);
  try{props.onCancel();}catch(error){const reopened=setError({...current},error instanceof Error?error.message:String(error));live.current=reopened;setSession(reopened);}
 }
 function ok(){
  if(!allowed())return;const current=live.current;if(current.phase!=='editing')return;
  const refusal=Object.values(invalidDrafts.current)[0];if(refusal){update(value=>setError(value,refusal.message));return;}
  if(props.dataSourcesBusy?.()){update(value=>setError(value,'Wait for the saved work operation to finish.'));return;}
  const pending=beginCommit(current);live.current=pending;setSession(pending);
  const settle=(accepted:boolean,message='')=>{const next=finishCommit(pending,accepted,message);if(accepted)memory.write(current.tab);if(!allowed())return;live.current=next;setSession(next);};
  const fail=(error:unknown)=>settle(false,error instanceof Error?error.message:String(error));
  try{
   const payload=commitPayload(pending),result=props.onApply(payload.themeId,payload.appearance,payload);
   // The frame-safe apply path is asynchronous: the dialog stays in Applying until the host settles.
   if(result&&typeof (result as Promise<unknown>).then==='function')void (result as Promise<boolean|void>).then(accepted=>settle(accepted!==false),fail);
   else settle(result!==false);
  }catch(error){fail(error);}
 }
 function set(row:ChartSettingsRowView,patch:ControlValue,keepPopup=false){update(value=>setControl(value,row.key,{...structuredClone(row.value),...patch},{keepPopup}));}
 function saveTemplates(templates:ChartSettingsTemplate[]){
  const save=props.onTemplatesChange;
  if(!save){update(value=>setError(value,'Templates cannot be saved for this chart.'));return;}
  try{if(save(templates)===false)throw Error('The workspace did not save the template list.');update(value=>withTemplates(value,templates));}
  catch(error){update(value=>setError(value,error instanceof Error?error.message:String(error)));}
 }
 function saveAs(){const current=live.current;try{saveTemplates(templateFromSession(current,current.templateName,props.makeId??defaultId).templates);}catch(error){update(value=>setError(value,error instanceof Error?error.message:String(error)));}}
 function onKeyDown(event:React.KeyboardEvent<HTMLDivElement>){
  if(event.nativeEvent.isComposing)return;
  if(event.key==='Escape'){event.preventDefault();event.stopPropagation();const popup=live.current.popup,result=escape(live.current);if(result.close)close();else{update(()=>result.session);if(popup)focusOpener(popup);}return;}
  if(event.key==='Tab'&&dialog.current){const list=Array.from(dialog.current.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),[tabindex="0"]')).filter(node=>node.offsetParent!==null);
   if(event.shiftKey&&document.activeElement===list[0]){event.preventDefault();list.at(-1)?.focus();}else if(!event.shiftKey&&document.activeElement===list.at(-1)){event.preventDefault();list[0]?.focus();}}
 }
 function onMouseDown(event:React.MouseEvent<HTMLDivElement>){
  const popup=live.current.popup;if(!popup)return;const target=event.target as Element|null,root=target?.closest?.('[data-lv-popup-root]');
  if(!root||root.getAttribute('data-lv-popup-root')!==popup.replace(/^save-template$/,'template'))update(closePopup);
 }
 function popupKeys(event:React.KeyboardEvent<HTMLElement>){
  const items=Array.from(event.currentTarget.querySelectorAll<HTMLElement>('[role="option"]:not([aria-disabled="true"]),[role^="menuitem"]:not([aria-disabled="true"])'));
  if(!items.length)return;const index=items.indexOf(document.activeElement as HTMLElement);
  const move=(next:number)=>{event.preventDefault();items[(next+items.length)%items.length].focus();};
  if(event.key==='ArrowDown')move(index+1);else if(event.key==='ArrowUp')move(index<0?items.length-1:index-1);else if(event.key==='Home')move(0);else if(event.key==='End')move(items.length-1);
  else if((event.key==='Enter'||event.key===' ')&&index>=0){event.preventDefault();items[index].click();}
 }
 function onTabKeys(event:React.KeyboardEvent<HTMLDivElement>){
  if(!['ArrowUp','ArrowDown','Home','End'].includes(event.key))return;event.preventDefault();
  update(value=>stepTab(value,event.key as 'ArrowUp'|'ArrowDown'|'Home'|'End',shown));
  queueMicrotask(()=>dialog.current?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')?.focus());
 }

 const editing=session.phase==='editing';
 const shown=visibleTabs(session.current,!!props.dataSources,!!props.general),activeTab:ChartSettingsTabId=shown.includes(session.tab)?session.tab:shown[0]??'symbol';
 const colorCurrent=()=>allowed()&&live.current.phase==='editing';
 function swatch(row:ChartSettingsRowView,index:number,label:string){
  const value=row.value.colors?.[index]??null,disabled=!editing||disabledPart(row,'colors');
  return <ColorControl key={'c'+index} label={label} fieldKey={row.key+':'+index} value={value??''} automatic={value===null} ownerToken={token} isCurrent={colorCurrent} disabled={disabled}
   onChange={next=>{if(!colorCurrent())return false;const colors=[...(row.value.colors??[])];colors[index]=next===''?null:next;set(row,{colors});return true;}}/>;
 }
 function swatches(row:ChartSettingsRowView){
  const names=row.key==='scales.prePostLabelsLines'?['Pre-market color','Post-market color','Overnight color']:row.key==='scales.bidAskLabelsLines'?['Bid color','Ask color']:row.swatches===2?(row.key==='canvas.chartBackground'?['Gradient start color','Gradient end color']:[row.label+' up color',row.label+' down color']):[/colou?r$/i.test(row.label)?row.label:row.label+' color'];
  return Array.from({length:row.swatches},(_,index)=>swatch(row,index,names[index]??row.label+' color'));
 }
 function dropdown(row:ChartSettingsRowView,part:'select'|'sub',options:readonly ChartSettingsOption[],selected:string|undefined,label:string,choose:(value:string)=>void){
  const key=part+':'+row.key,open=session.popup===key,disabled=!editing||disabledPart(row,part),current=options.find(option=>option.value===selected);
  return <div className="lv-cset-dropdown" data-lv-popup-root={key} key={key}>
   <button type="button" className="lv-cset-dropdown-button" aria-haspopup="listbox" aria-expanded={open} aria-label={label} data-lv-opener={key} disabled={disabled}
    onClick={()=>update(value=>togglePopup(value,key))} onKeyDown={event=>{if(event.key==='ArrowDown'&&!open){event.preventDefault();update(value=>togglePopup(value,key));}}}>
    <span className="lv-cset-dropdown-text">{current?.label??selected??''}</span><span className="lv-cset-chevron" aria-hidden="true"/>
   </button>
   {open&&<div className="lv-cset-listbox" role="listbox" aria-label={label} data-lv-popup={key} onKeyDown={popupKeys}>
    {options.map(option=>{const reason=row.optionDisabled?.[option.value];return <div role="option" key={option.value} tabIndex={-1} aria-selected={option.value===selected} aria-disabled={reason?true:undefined} title={reason}
     className={'lv-cset-option'+(option.value===selected?' selected':'')} onClick={()=>{if(!reason)choose(option.value);}}>{option.label}</div>;})}
   </div>}
  </div>;
 }
 function multiCheck(row:ChartSettingsRowView){
  const key='items:'+row.key,open=session.popup===key,disabled=!editing||disabledPart(row,'items');
  return <div className="lv-cset-dropdown" data-lv-popup-root={key} key={key}>
   <button type="button" className="lv-cset-dropdown-button" aria-haspopup="menu" aria-expanded={open} aria-label={row.label+' labels and lines'} data-lv-opener={key} disabled={disabled}
    onClick={()=>update(value=>togglePopup(value,key))} onKeyDown={event=>{if(event.key==='ArrowDown'&&!open){event.preventDefault();update(value=>togglePopup(value,key));}}}>
    <span className="lv-cset-dropdown-text">{row.summary}</span><span className="lv-cset-chevron" aria-hidden="true"/>
   </button>
   {open&&<div className="lv-cset-menu" role="menu" aria-label={row.label} data-lv-popup={key} onKeyDown={popupKeys}>
    {(row.items??[]).map(item=>{const availability=row.itemAvailability?.[item.value],off=availability?.state==='unavailable',checked=!!row.value.items?.[item.value];
     return <div role="menuitemcheckbox" key={item.value} tabIndex={-1} aria-checked={checked} aria-disabled={off?true:undefined} title={availability&&availability.state!=='live'?availability.reason:undefined}
      data-lv-binding={availability?.state} className="lv-cset-menuitem" onClick={()=>{if(!off)set(row,{items:{...row.value.items,[item.value]:!checked}},true);}}>
      <span className="lv-cset-check-mark" aria-hidden="true">{checked?'✓':''}</span>{item.label}</div>;})}
   </div>}
  </div>;
 }
 function thickness(row:ChartSettingsRowView){
  const key='thickness:'+row.key,open=session.popup===key,disabled=!editing||disabledPart(row,'thickness'),width=row.value.thickness??1;
  return <div className="lv-cset-dropdown lv-cset-thickness" data-lv-popup-root={key} key={key}>
   <button type="button" className="lv-cset-dropdown-button" aria-haspopup="menu" aria-expanded={open} aria-label={row.label+' line thickness'} data-lv-opener={key} disabled={disabled} onClick={()=>update(value=>togglePopup(value,key))}>
    <span className="lv-cset-line-sample" style={{borderTopWidth:Math.max(1,Math.min(4,width))}} aria-hidden="true"/><span className="lv-cset-dropdown-text">{width}px</span>
   </button>
   {open&&<div className="lv-cset-menu" role="menu" aria-label={row.label+' line'} data-lv-popup={key} onKeyDown={popupKeys}>
    {THICKNESS_OPTIONS.map(option=><div role="menuitemradio" key={option} tabIndex={-1} aria-checked={width===option} className="lv-cset-menuitem" onClick={()=>set(row,{thickness:option},row.lineStyle)}>
     <span className="lv-cset-line-sample" style={{borderTopWidth:option}} aria-hidden="true"/>{option}px</div>)}
    {row.lineStyle&&<><div role="separator" className="lv-cset-menu-separator"/>{LINE_STYLE_OPTIONS.map(option=><div role="menuitemradio" key={option.value} tabIndex={-1} aria-checked={String(row.value.lineStyle)===option.value} className="lv-cset-menuitem"
     onClick={()=>set(row,{lineStyle:Number(option.value)},true)}>{option.label}</div>)}</>}
   </div>}
  </div>;
 }
 function numberField(row:ChartSettingsRowView,disabled:boolean,shown:string,label:string){
  const draft=drafts[row.key],text=draft??shown;
  return <span className="lv-cset-number" key="number"><input type="text" inputMode="decimal" aria-label={label} aria-invalid={Object.hasOwn(invalidDrafts.current,row.key)||undefined} value={text} disabled={disabled} spellCheck={false}
   onChange={event=>{
    if(!allowed()||live.current.phase!=='editing')return;
    const raw=event.target.value,value=Number(raw);setDrafts(previous=>({...previous,[row.key]:raw}));
    if(raw.trim()!==''&&Number.isFinite(value)){
     const next=setControl(live.current,row.key,{...structuredClone(row.value),number:value});
     if(next.error)invalidDrafts.current[row.key]={raw,message:next.error};else delete invalidDrafts.current[row.key];
     update(()=>next);
    }else{const message=`Enter a number for ${label}.`;invalidDrafts.current[row.key]={raw,message};update(current=>setError(current,message));}
   }}
   onBlur={()=>{const refused=invalidDrafts.current[row.key];if(refused&&refused.raw.trim()!==''&&Number.isFinite(Number(refused.raw)))return;setDrafts(previous=>{if(!(row.key in previous))return previous;const next={...previous};delete next[row.key];return next;});}}/>{row.unitSuffix&&<span className="lv-cset-unit">{row.unitSuffix}</span>}</span>;
 }
 function slider(row:ChartSettingsRowView){
  const transparency=row.key==='legend.legendBgTransparency',value=transparency?100-(row.value.level??0):row.value.level??0,disabled=!editing||disabledPart(row,'slider');
  return <input key="slider" className="lv-cset-slider" type="range" aria-label={transparency?'Background opacity':row.label+' level'} min={transparency?0:row.min??0} max={transparency?100:row.max??1} step={transparency?1:0.01} value={value} disabled={disabled}
   onChange={event=>{const next=Number(event.target.value);set(row,{level:transparency?100-next:next});}}/>;
 }
 function checkbox(row:ChartSettingsRowView,label:string,showLabel=true){
  const disabled=!editing||disabledPart(row,'check');
  return <label className="lv-cset-check" key="check"><input type="checkbox" aria-label={label||row.key} checked={!!row.value.checked} disabled={disabled} onChange={event=>set(row,{checked:event.target.checked})}/>{showLabel&&<span>{label}</span>}</label>;
 }
 function renderRow(row:ChartSettingsRowView){
  const type=row.type,hasCheck=type==='checkbox'||type.startsWith('checkbox+'),label=row.label,ariaLabel=SELECT_NAMES[row.key]??(hasCheck?row.label+' option':row.label);
  const left=hasCheck?checkbox(row,row.label):<span className="lv-cset-label" id={'lv-cset-label-'+row.key.replace(/[^A-Za-z0-9_-]/g,'_')}>{label}</span>;
  const parts:React.ReactNode[]=[];
  if(type.startsWith('multi-check-menu'))parts.push(multiCheck(row));
  if(type==='select'||type==='checkbox+select'||type==='select+color')parts.push(dropdown(row,'select',row.options??[],row.value.selected,ariaLabel,value=>set(row,{selected:value})));
  if(type==='checkbox+number'){const disabled=!editing||disabledPart(row,'number');parts.push(numberField(row,disabled,formatRatio(row.value.number),row.label+' value'));}
  if(type==='number')parts.push(numberField(row,!editing||row.availability.state==='unavailable'||disabledPart(row,'number'),row.value.number===null||row.value.number===undefined?'':String(row.value.number),row.label+(row.unitSuffix?` (${row.unitSuffix})`:'')));
  if(type==='checkbox+slider'||type==='checkbox+opacity-slider')parts.push(slider(row));
  if(type.includes('color')&&row.swatches>0&&type!=='color+select')parts.push(...swatches(row));
  if(type==='color+select'){parts.push(...swatches(row));parts.push(dropdown(row,'select',row.options??[],row.value.selected,row.label+' size',value=>set(row,{selected:value})));}
  if(row.thickness)parts.push(thickness(row));
  if(type==='checkbox+checkbox'&&row.nested){const disabled=!editing||disabledPart(row,'nested');
   parts.push(<label className="lv-cset-check lv-cset-nested" key="nested"><input type="checkbox" aria-label={row.nested} checked={!!row.value.nested} disabled={disabled} onChange={event=>set(row,{nested:event.target.checked})}/><span>{row.nested}</span></label>);}
  return <div key={row.key} className={'lv-cset-row'+(row.indent?' lv-cset-indent':'')} data-lv-fact={row.factId??undefined} data-lv-row={row.key} data-lv-binding={row.availability.state}>
   <div className="lv-cset-row-main">{left}<div className="lv-cset-controls" title={row.disabledParts.length?DISABLED_HINTS[row.key]:undefined}>{parts}</div></div>
   {row.sub&&<div className="lv-cset-row-sub">{dropdown(row,'sub',row.sub.options,row.value.sub,row.label+' value display',value=>set(row,{sub:value}))}</div>}
  </div>;
 }

 const headingOf=activeTab==='general'||activeTab==='datasources'?CHART_SETTINGS_DIALOG.title:CHART_SETTINGS_DIALOG.heading;
 const groups=activeTab==='datasources'||activeTab==='general'?[]:visibleTabView(activeTab,session.current),measured=600,margin=CHART_SETTINGS_DIALOG.viewportMargin;
 const templateOpen=session.popup==='template',saving=session.popup==='save-template',templates=session.current.document.templates;
 return <div className="modal-shade lv-cset-shade" onMouseDown={event=>event.stopPropagation()}>
  <div className="lv-cset" role="dialog" aria-modal="true" aria-labelledby="lv-cset-title" data-dialog-name={headingOf} data-lv-fact={CHART_SETTINGS_DIALOG.factId} ref={dialog}
   style={{width:CHART_SETTINGS_DIALOG.width,height:`min(${measured}px, calc(100vh - ${2*margin}px))`,...dragStyle}} onKeyDown={onKeyDown} onMouseDown={onMouseDown}>
   <header className="lv-cset-header" style={{userSelect:'none',touchAction:'none',cursor:'move'}} {...dragHandlers}><h2 id="lv-cset-title">{headingOf}</h2>
    <button type="button" className="lv-cset-close" style={{cursor:'default'}} aria-label={CHART_SETTINGS_DIALOG.closeLabel} onClick={close}><svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"><path d="M4.5 4.5l9 9M13.5 4.5l-9 9" stroke="currentColor" strokeWidth="1.2" fill="none"/></svg></button>
   </header>
   <form className="lv-cset-form" onSubmit={event=>{event.preventDefault();if(!(event.nativeEvent as Event&{isComposing?:boolean}|undefined)?.isComposing)ok();}}>
    <div className="lv-cset-body">
     <div className="lv-cset-tabs" role="tablist" aria-orientation="vertical" aria-label="Settings sections" onKeyDown={onTabKeys}>
      {ALL_TABS.filter(tab=>shown.includes(tab.id)).map(tab=>{const selected=tab.id===activeTab;return <button type="button" role="tab" key={tab.id} id={'lv-cset-tab-'+tab.id} aria-selected={selected} aria-controls="lv-cset-panel" tabIndex={selected?0:-1}
       data-lv-fact={tab.factId} className={'lv-cset-tab'+(selected?' active':'')} onClick={()=>update(value=>selectTab(value,tab.id))}>{tab.label}</button>;})}
     </div>
     <div className="lv-cset-panel" role="tabpanel" id="lv-cset-panel" aria-labelledby={'lv-cset-tab-'+activeTab} tabIndex={0} inert={!editing||undefined}>
      {activeTab==='datasources'&&props.dataSources}
      {activeTab==='general'&&props.general}
      {groups.map(group=><section className="lv-cset-group" key={group.key} aria-label={group.label} data-lv-fact={group.factId??undefined}>
       <h3 className="lv-cset-group-title">{group.label}</h3>
       {group.note&&<p className="lv-cset-group-note">{group.note}</p>}
       {group.rows.map(renderRow)}
       <div className="lv-cset-separator" role="presentation"/>
      </section>)}
     </div>
    </div>
    <footer className="lv-cset-footer">
     <div className="lv-cset-template" data-lv-popup-root="template">
      <button type="button" className="lv-cset-template-button" data-name="theme-select" aria-haspopup="menu" aria-expanded={templateOpen} data-lv-opener="template" disabled={!editing} onClick={()=>update(value=>togglePopup(value,'template'))}>
       {CHART_SETTINGS_DIALOG.footer.template}<span className="lv-cset-chevron" aria-hidden="true"/>
      </button>
      {templateOpen&&<div className="lv-cset-menu lv-cset-menu-up" role="menu" aria-label={CHART_SETTINGS_DIALOG.footer.template} data-lv-popup="template" onKeyDown={popupKeys}>
       {templates.map(template=><div className="lv-cset-template-row" key={template.id}>
        <div role="menuitem" tabIndex={-1} className="lv-cset-menuitem" onClick={()=>update(value=>applyTemplate(value,template))}>{template.name}</div>
        <button type="button" className="lv-cset-template-remove" aria-label={'Remove template '+template.name} disabled={!props.onTemplatesChange} onClick={event=>{event.stopPropagation();try{saveTemplates(removeTemplate(live.current,template.id));}catch(error){update(value=>setError(value,error instanceof Error?error.message:String(error)));}}}>×</button>
       </div>)}
       {TEMPLATE_PRESETS.map(preset=><div role="menuitem" key={'preset:'+preset.id} tabIndex={-1} className="lv-cset-menuitem" data-lv-preset={preset.id} onClick={()=>update(value=>applyPreset(value,preset))}>{preset.name}</div>)}
       <div role="separator" className="lv-cset-menu-separator"/>
       <div role="menuitem" tabIndex={-1} className="lv-cset-menuitem" onClick={()=>update(applyDefaults)}>{CHART_SETTINGS_DIALOG.templateActions.applyDefaults}</div>
       <div role="menuitem" tabIndex={-1} aria-disabled={props.onTemplatesChange?undefined:true} title={props.onTemplatesChange?undefined:'Templates cannot be saved for this chart.'} className="lv-cset-menuitem"
        onClick={()=>{if(props.onTemplatesChange)update(value=>togglePopup(value,'save-template'));}}>{CHART_SETTINGS_DIALOG.templateActions.saveAs}</div>
      </div>}
      {saving&&<div className="lv-cset-save lv-cset-menu-up" role="group" aria-label="Save template" data-lv-popup="save-template">
       <input aria-label="Template name" value={session.templateName} maxLength={64} spellCheck={false} onChange={event=>update(value=>setTemplateName(value,event.target.value))}
        onKeyDown={event=>{if(event.key==='Enter'&&!event.nativeEvent.isComposing){event.preventDefault();saveAs();}}}/>
       <button type="button" className="lv-cset-primary" onClick={saveAs}>Save</button>
      </div>}
     </div>
     <span className="lv-cset-error" role="alert">{Object.values(invalidDrafts.current)[0]?.message??session.error}</span>
     <button type="button" className="lv-cset-secondary" name="cancel" onClick={close}>{CHART_SETTINGS_DIALOG.footer.cancel}</button>
     <button type="submit" className="lv-cset-primary" name="submit" disabled={!editing||Object.keys(invalidDrafts.current).length>0}>{session.phase==='committing'?'Applying…':CHART_SETTINGS_DIALOG.footer.ok}</button>
    </footer>
   </form>
  </div>
 </div>;
}
