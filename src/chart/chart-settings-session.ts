// Chart Settings dialog session: pure state transitions behind the dialog component.
// Behaviour: dialog.reopenTab (reopens on
// the last viewed tab, first open shows Symbol), behavior.dismiss (Escape closes an open
// dropdown or menu first, otherwise the dialog; X and Cancel close; changes apply live
// while the dialog is open), footer.template (Apply defaults, Save as…), footer.ok.
import {themePresets,defaultTheme,type ThemePreset,serializeAppearance,normalizeAppearance} from '../ui/themes';
import {CHART_SETTINGS_DIALOG,isChartSettingsTab,settingsTabHeight,type ChartSettingsTabId} from './chart-settings-facts';
import {factorySources,findRow,hasTypeSettings,writeRow,type ChartSettingsSources,type ControlValue,type ScaleModeSettings} from './chart-settings-bindings';
import {sameDocument,withTemplate,withoutTemplate,type ChartSettingsDocument,type ChartSettingsTemplate} from './chart-settings-document';
import type {PriceScaleSettings} from './price-scale-state';
import type {ChartAppearance} from '../ui/themes';
import {migrateTypeSettings,validateTypeSettings} from './chart-settings';

export interface ChartSettingsSession {
 /** Values when the dialog opened; Cancel, X and Escape return the chart to these. */
 initial:ChartSettingsSources;
 current:ChartSettingsSources;
 tab:ChartSettingsTabId;
 /** Open dropdown/menu: "select:<row>", "sub:<row>", "items:<row>", "thickness:<row>", "template" or "save-template". */
 popup:string|null;
 themeId:string;
 error:string;
 templateName:string;
 /** committing: Ok is being applied; done: the host accepted Ok or the dialog closed. */
 phase:'editing'|'committing'|'done';
}
/** What Ok hands to the workspace. Only changed stores are present besides the appearance and theme id. */
export interface ChartSettingsCommit {
 themeId:string;
 appearance:ChartAppearance;
 document?:ChartSettingsDocument;
 priceScale?:PriceScaleSettings;
 typeSettings?:{style:string;settings:Record<string,unknown>};
 timezone?:string;
 /** Scale type, invert and auto scale; applied through the frame-safe configuration path, never a plain commit. */
 chartOptions?:ScaleModeSettings;
 changed:('appearance'|'document'|'priceScale'|'typeSettings'|'timezone'|'chartOptions')[];
}
export interface ChartSettingsTabMemory {read():ChartSettingsTabId|null;write(tab:ChartSettingsTabId):void}
/** Remembers the last tab for this app session. A host can pass a persistent memory instead. */
export function createMemoryTabMemory(initial:ChartSettingsTabId|null=null):ChartSettingsTabMemory{
 let last=initial;return{read:()=>last,write:tab=>{if(isChartSettingsTab(tab))last=tab;}};
}
export const appTabMemory=createMemoryTabMemory();

export function openSession(initial:ChartSettingsSources,options:{themeId:string;tab?:ChartSettingsTabId|null;memory?:ChartSettingsTabMemory;/** Tabs the dialog shows; an entry or remembered tab outside it falls back to the first one. */shown?:readonly ChartSettingsTabId[]}):ChartSettingsSession{
 const remembered=options.memory?.read()??null,usable=(tab:ChartSettingsTabId|null|undefined):tab is ChartSettingsTabId=>!!tab&&isChartSettingsTab(tab)&&(!options.shown||options.shown.includes(tab));
 const tab=usable(options.tab)?options.tab:usable(remembered)?remembered:usable(CHART_SETTINGS_DIALOG.firstOpenTab)?CHART_SETTINGS_DIALOG.firstOpenTab:options.shown?.[0]??CHART_SETTINGS_DIALOG.firstOpenTab;
 return{initial:structuredClone(initial),current:structuredClone(initial),tab,popup:null,themeId:options.themeId,error:'',templateName:'',phase:'editing'};
}
const editable=(session:ChartSettingsSession)=>session.phase==='editing';
export function selectTab(session:ChartSettingsSession,tab:ChartSettingsTabId):ChartSettingsSession{
 if(!isChartSettingsTab(tab))throw Error('Unknown chart settings tab.');
 return{...session,tab,popup:null,error:session.tab===tab?session.error:''};
}
/** Moves the tab selection by keyboard (Arrow Up/Down, Home, End), wrapping like other LV tab lists. */
export function stepTab(session:ChartSettingsSession,key:'ArrowUp'|'ArrowDown'|'Home'|'End',order:readonly ChartSettingsTabId[]):ChartSettingsSession{
 const index=order.indexOf(session.tab),next=key==='Home'?0:key==='End'?order.length-1:key==='ArrowDown'?(index+1)%order.length:(index-1+order.length)%order.length;
 return selectTab(session,order[next]);
}
export function togglePopup(session:ChartSettingsSession,key:string):ChartSettingsSession{
 if(!editable(session))return session;
 return{...session,popup:session.popup===key?null:key};
}
export function closePopup(session:ChartSettingsSession):ChartSettingsSession{return session.popup===null?session:{...session,popup:null};}
/** Escape: closes an open dropdown or menu only; with nothing open the dialog closes (behavior.dismiss). */
export function escape(session:ChartSettingsSession):{session:ChartSettingsSession;close:boolean}{
 if(session.popup!==null)return{session:{...session,popup:null},close:false};
 return{session,close:true};
}
/** Sets one control. Refusals keep the previous values and show the reason. */
export function setControl(session:ChartSettingsSession,key:string,value:ControlValue,options:{keepPopup?:boolean}={}):ChartSettingsSession{
 if(!editable(session))return session;
 try{
  const current=writeRow(session.current,key,value);
  return{...session,current,error:'',popup:options.keepPopup?session.popup:null};
 }catch(error){return{...session,error:error instanceof Error?error.message:String(error)};}
}
/** Reads a control's current value from the open tab. */
export function controlValue(session:ChartSettingsSession,key:string):ControlValue{
 const row=findRow(session.tab,session.current,key);if(!row)throw Error('That setting is not on this tab.');return row.value;
}
/** Template > Apply defaults: every control returns to its factory value; saved templates stay. */
export function applyDefaults(session:ChartSettingsSession):ChartSettingsSession{
 if(!editable(session))return session;
 return{...session,current:factorySources(session.current),themeId:defaultTheme.id,popup:null,error:''};
}
/** A recorded LV theme preset listed in the Template menu: replaces the appearance, keeping the indicator display choices. */
export function applyPreset(session:ChartSettingsSession,preset:ThemePreset):ChartSettingsSession{
 if(!editable(session))return session;
 const appearance=structuredClone(preset.appearance);
 for(const key of ['indicatorLabelsVisible','indicatorValuesVisible','haShowRealLastPrice'] as const)if(Object.hasOwn(session.current.appearance,key))appearance[key]=session.current.appearance[key];
 return{...session,current:{...session.current,appearance},themeId:preset.id,popup:null,error:''};
}
/** A saved template: its appearance, status line, scales, canvas and symbol groups, and its settings for the current chart type. */
export function applyTemplate(session:ChartSettingsSession,template:ChartSettingsTemplate):ChartSettingsSession{
 if(!editable(session))return session;
 try{
  const appearance=normalizeAppearance(template.appearance);
  const document={...structuredClone(session.current.document),statusLine:structuredClone(template.statusLine),scales:structuredClone(template.scales),canvas:structuredClone(template.canvas),symbol:structuredClone(template.symbol)};
  const style=session.current.style,saved=template.typeSettings[style]?migrateTypeSettings(style,template.typeSettings[style]):undefined;
  let typeSettings=session.current.typeSettings;
  if(typeSettings&&saved&&hasTypeSettings(style)){const supported=Object.fromEntries(Object.entries(saved).filter(([key])=>Object.hasOwn(typeSettings!,key)));validateTypeSettings(style,supported);typeSettings={...typeSettings,...supported};}
  return{...session,current:{...session.current,appearance,document,typeSettings},popup:null,error:''};
 }catch(error){return{...session,error:'This template cannot be applied: '+(error instanceof Error?error.message:String(error)),popup:null};}
}
/** Template > Save as…: the template captured from the current values. Returns the new template list (saved at once,
 * like the reference's template store; Cancel does not remove it). */
export function templateFromSession(session:ChartSettingsSession,name:string,makeId:()=>string):ChartSettingsDocument{
 const s=session.current,typeSettings:Record<string,Record<string,unknown>>=s.typeSettings?{[s.style]:structuredClone(s.typeSettings)}:{};
 return withTemplate(s.document,{name,appearance:serializeAppearance(s.appearance),statusLine:s.document.statusLine,scales:s.document.scales,canvas:s.document.canvas,symbol:s.document.symbol,typeSettings},makeId);
}
/** Stores a new template list in both the opening and current values, so Cancel keeps it and Ok does not repeat it. */
export function withTemplates(session:ChartSettingsSession,templates:ChartSettingsTemplate[]):ChartSettingsSession{
 const keep=(s:ChartSettingsSources):ChartSettingsSources=>({...s,document:{...s.document,templates:structuredClone(templates)}});
 return{...session,initial:keep(session.initial),current:keep(session.current),popup:null,templateName:'',error:''};
}
export function removeTemplate(session:ChartSettingsSession,id:string):ChartSettingsTemplate[]{return withoutTemplate(session.current.document,id).templates;}
export const TEMPLATE_PRESETS:readonly ThemePreset[]=themePresets;

/** The Ok payload: the full appearance, the theme id and each other store that differs from the opening values. */
export function commitPayload(session:ChartSettingsSession):ChartSettingsCommit{
 const {initial,current}=session,changed:ChartSettingsCommit['changed']=[];
 const out:ChartSettingsCommit={themeId:session.themeId,appearance:structuredClone(current.appearance),changed};
 if(!sameDocument(initial.appearance,current.appearance))changed.push('appearance');
 if(!sameDocument(initial.document,current.document)){out.document=structuredClone(current.document);changed.push('document');}
 if(current.priceScale&&!sameDocument(initial.priceScale,current.priceScale)){out.priceScale=structuredClone(current.priceScale);changed.push('priceScale');}
 if(current.typeSettings&&!sameDocument(initial.typeSettings,current.typeSettings)){out.typeSettings={style:current.style,settings:structuredClone(current.typeSettings)};changed.push('typeSettings');}
 if(current.timezone!==null&&current.timezone!==initial.timezone){out.timezone=current.timezone;changed.push('timezone');}
 if(current.scaleMode&&!sameDocument(initial.scaleMode??null,current.scaleMode)){out.chartOptions={...current.scaleMode};changed.push('chartOptions');}
 return out;
}
export function beginCommit(session:ChartSettingsSession):ChartSettingsSession{return editable(session)?{...session,phase:'committing',popup:null,error:''}:session;}
export function finishCommit(session:ChartSettingsSession,accepted:boolean,message=''):ChartSettingsSession{
 return accepted?{...session,phase:'done',error:''}:{...session,phase:'editing',error:message||'The workspace did not accept these settings. Your changes are still open; review the workspace message.'};
}
export function setTemplateName(session:ChartSettingsSession,name:string):ChartSettingsSession{return editable(session)?{...session,templateName:name.slice(0,200)}:session;}
export function setError(session:ChartSettingsSession,message:string):ChartSettingsSession{return{...session,error:message};}
/** Dialog height for the selected tab: the measured height clamped to the viewport minus the margins (dialog.shell). */
export function dialogHeight(tab:ChartSettingsTabId,viewportHeight:number):number{
 const measured=settingsTabHeight(tab),limit=Math.max(200,viewportHeight-2*CHART_SETTINGS_DIALOG.viewportMargin);
 return Math.min(measured,limit);
}
