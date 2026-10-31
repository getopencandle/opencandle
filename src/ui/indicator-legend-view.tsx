// Root view for the INDUI status line and indicator legend models (R4 wiring). Plain render functions, not components,
// so the App tree holds the rendered parts directly. The models own order, wording and availability:
// src/chart/status-line-model.ts (series parts, toggler) and src/chart/legend-model.ts (hover buttons, More menu).
// Unavailable parts and rows always show their reason (title attribute) and a visible glyph, never a blank.
import React from 'react';
import type {StatusLineParts,StatusLinePart} from '../chart/status-line-model';
import type {IndicatorDataState} from './indicator-dialog-model';
import {LEGEND_BUTTON_SIZE,type LegendButton,type MoreRow} from '../chart/legend-model';
import {DATA_WINDOW_EMPTY} from './data-window-model';
import {EyeIcon,SettingsIcon,RemoveObjectsIcon,MoreHorizontalIcon,FlagIcon,InfoIcon} from './icons/toolbar-icons';
import {fitAnchoredMenu} from './menu-placement';
import {menuDismissRef} from './menu-dismiss';

type Unavailable=Extract<StatusLinePart,{state:'unavailable'}>;
/** Labels for value parts that have no fact wording of their own. */
// An unavailable part carries the same visible label as its shown form. The bar change has none
// (it reads "-0.96 (-0.28%)"), so an unavailable change is the empty glyph alone,
// with the reason in its title; it must not print a "Change" label the shown form never has.
const VALUE_LABELS:Record<'barChange'|'volume'|'lastDayChange',string|null>={barChange:null,volume:'Vol',lastDayChange:'Last day change'};
// The bar change has no label, so its unavailable form (first bar, or the moment after a symbol switch)
// is an empty slot with the reason in its title, never a bare "∅" glyph after the close.
const unavailablePart=(part:Unavailable,label:string|null)=><span key={part.id} data-status-part={part.id} data-state="unavailable" title={part.reason} className="lv-status-unavailable">{part.id==='barChange'&&!label?'':(label?label+' ':'')+DATA_WINDOW_EMPTY}</span>;

/** Series lead parts (logo, title, interval, exchange) in fact order, then any host badges. */
export function statusLineLead(status:StatusLineParts,badges:React.ReactNode,handlers:{onTitle?:()=>void;onInterval?:()=>void}={}):React.ReactNode[]{
 const out:React.ReactNode[]=[];
 for(const part of status.parts){
  if(part.state==='unavailable'){if(part.id==='title'||part.id==='interval'||part.id==='exchange')out.push(unavailablePart(part,null));continue;}
  if(part.id==='logo')out.push(<span key="logo" data-status-part="logo" aria-hidden="true" className="lv-status-logo" style={{width:part.diameter,height:part.diameter,minWidth:part.diameter,borderRadius:'50%'}}>{part.image?<img src={part.image} alt="" width={part.diameter} height={part.diameter}/>:part.letter}</span>);
  else if(part.id==='title')out.push(<strong key="title" data-status-part="title" title={part.tooltip} onClick={handlers.onTitle}>{part.text}</strong>);
  else if(part.id==='interval')out.push(<span key="interval" data-status-part="interval" title={part.tooltip} onClick={handlers.onInterval}> · {part.text}</span>);
  else if(part.id==='exchange')out.push(<span key="exchange" data-status-part="exchange"> · {part.text}</span>);
 }
 if(badges)out.push(<React.Fragment key="badges">{badges}</React.Fragment>);
 return out;
}

/** Value parts (chart values, bar change, volume, last day change). The bar change text comes from the host's Data window
 * formatter (chartHeaderChange) so the header and the Data window agree; the model decides whether it is shown. */
export function statusLineValues(status:StatusLineParts,barChange:{text:string;positive:boolean|null}|null):React.ReactNode[]{
 const out:React.ReactNode[]=[];
 for(const part of status.parts){
  if(part.id==='logo'||part.id==='title'||part.id==='interval'||part.id==='exchange')continue;
  if(part.state==='unavailable'){out.push(unavailablePart(part,part.id==='chartValues'?null:VALUE_LABELS[part.id]));continue;}
  if(part.id==='chartValues'){
   const rising=Number(part.values[3]?.text)>=Number(part.values[0]?.text);
   // Each value is its own direct child of the heading's value row (O, H, L, C, then the change), as
   // before the R4 wiring, so every value keeps its own box and can be checked for clipping.
   for(const value of part.values)out.push(<span key={'chartValues-'+value.label} data-status-part="chartValues" data-value={value.label} className="lv-status-value">{value.label} <b className={rising?'positive':'negative'}>{value.text}</b></span>);
  }
  else if(part.id==='barChange'){
   const text=barChange?.text??part.absolute+' ('+part.percent+')',positive=barChange?barChange.positive:part.direction==='flat'?null:part.direction==='up';
   out.push(<span key="barChange" data-status-part="barChange" className={positive===null?undefined:positive?'positive':'negative'}>{text}</span>);
  }
  else if(part.id==='lastDayChange')out.push(<span key="lastDayChange" data-status-part="lastDayChange" className={part.direction==='up'?'positive':part.direction==='down'?'negative':undefined}>{VALUE_LABELS.lastDayChange} {part.absolute} ({part.percent})</span>);
  else if(part.id==='volume')out.push(<span key="volume" data-status-part="volume">{VALUE_LABELS.volume} <b>{part.text}</b></span>);
 }
 return out;
}

/** Status line background (Chart settings, Background and transparency). Undefined when the background is off. */
export function statusLineBackground(status:StatusLineParts):string|undefined{
 if(!status.background.visible)return undefined;
 const opacity=Math.max(0,Math.min(100,100-status.background.transparency));
 return 'color-mix(in srgb, var(--lv-chart-background, #0f0f0f) '+opacity+'%, transparent)';
}

const BUTTON_ICONS:Partial<Record<LegendButton['id'],React.ReactNode>>={
 hide:<EyeIcon width={18} height={18}/>,settings:<SettingsIcon width={18} height={18}/>,remove:<RemoveObjectsIcon width={18} height={18}/>,more:<MoreHorizontalIcon width={18} height={18}/>,
 intervalSettings:<span aria-hidden="true">⏱</span>,flag:<FlagIcon width={18} height={18}/>,
};
/** One legend hover button, 28x22, with the model's qa id and tooltip. The aria label names the indicator. */
export function legendButtonView(button:LegendButton,label:string,onClick:()=>void,extra:{pressed?:boolean;expanded?:boolean}={}):React.ReactNode{
 return <button key={button.id} type="button" className={'lv-legend-button lv-legend-'+button.id} data-qa={button.qaId} title={button.tooltip} aria-label={button.tooltip+' '+label}
  {...(extra.expanded===undefined?{}:{'aria-haspopup':'menu' as const,'aria-expanded':extra.expanded})}{...(extra.pressed===undefined?{}:{'aria-pressed':extra.pressed})}
  style={{width:LEGEND_BUTTON_SIZE.width,height:LEGEND_BUTTON_SIZE.height}} onClick={onClick}>{BUTTON_ICONS[button.id]??null}</button>;
}

export interface LegendSubmenuItem {id:string;label:string;checked?:boolean;disabled?:boolean;title?:string}
/** The More menu rows from legendMoreMenu (or seriesMoreMenu): separators, items with hotkeys, unavailable items disabled with
 * their reason. Rows with a submenu (Move to, Pin to scale, and on the main series Metrics and Add to watchlist) open one built
 * by the host; `submenuFooter` adds host content (the new list name form) after a submenu's items. */
export function legendMoreMenuView<Id extends string>(rows:readonly MoreRow<Id>[],options:{label:string;open:string|null;submenus:Partial<Record<Id,readonly LegendSubmenuItem[]>>;onItem:(id:Id)=>void;onSubmenu:(parent:Id,id:string)=>void;onClose?:()=>void;submenuFooter?:Partial<Record<Id,React.ReactNode>>}):React.ReactNode{
 // Once laid out, the menu (and an open submenu) is kept on screen: it flips above its row (a submenu to the
 // left) when there is no room, else it is clamped to the window, and scrolls only when taller than the window.
 const dismiss=menuDismissRef(options.onClose,'.lv-legend-button');
 return <div ref={node=>{if(fitAnchoredMenu(node,'below'))node!.querySelectorAll<HTMLElement>(':scope>.lv-legend-menu-entry>.lv-legend-submenu').forEach(sub=>fitAnchoredMenu(sub,'right'));return dismiss(node);}} className="lv-legend-menu" role="menu" aria-label={'More for '+options.label} onKeyDown={event=>{if(event.key==='Escape'&&options.onClose){event.stopPropagation();options.onClose();}}}>{rows.map(row=>{
  if(row.kind==='separator')return <div key={row.id} role="separator" className="lv-legend-menu-separator"/>;
  const unavailable=row.availability.state==='unavailable'?row.availability.reason:null,children=options.submenus[row.id];
  return <div key={row.id} className="lv-legend-menu-entry">
   <button type="button" role="menuitem" data-menu-id={row.id} disabled={!!unavailable} title={unavailable??undefined} aria-label={row.label}
    {...(children?{'aria-haspopup':'menu' as const,'aria-expanded':options.open===row.id}:{})} onClick={()=>options.onItem(row.id)}>
    <span>{row.label}</span>{row.hotkey&&<kbd>{row.hotkey}</kbd>}
   </button>
   {children&&options.open===row.id&&<div ref={node=>{fitAnchoredMenu(node,'right');}} className="lv-legend-submenu" role="menu" aria-label={row.label}>{children.map(item=><button key={item.id} type="button" role="menuitemradio" data-menu-id={item.id} aria-checked={!!item.checked} disabled={!!item.disabled} title={item.title} onClick={()=>options.onSubmenu(row.id,item.id)}>{item.label}</button>)}{options.submenuFooter?.[row.id]??null}</div>}
  </div>;
 })}</div>;
}

/** Gap 2: the colored live values of one indicator row (crosshair bar, or the last bar). Null when there is nothing to show. */
export function legendValuesView(parts:readonly {plot:string;text:string;color:string}[]):React.ReactNode{
 if(!parts.length)return null;
 return <span className="lv-legend-values" data-legend-values="true">{parts.map(part=><span key={part.plot} data-plot={part.plot} style={{color:part.color}}>{part.text}</span>)}</span>;
}
/** Published metadata only. A reason never supplies a calculated value or source permission. */
export function indicatorReasonView(label:string,status:Readonly<{state:IndicatorDataState;text:string}>|null):React.ReactNode{
 if(!status||(status.state!=='waiting'&&status.state!=='unavailable'))return null;
 return <span className="lv-status-unavailable lv-status-reason" role="status" title={status.text} aria-label={label+'. '+status.text}><InfoIcon width={14} height={14}/><span>{status.state==='waiting'?'Waiting':'Unavailable'}</span></span>;
}

/** Gap 2: one legend stack per pane. The host places each stack at its pane's top-left corner. */
export function legendPaneView(paneId:string,rows:React.ReactNode):React.ReactNode{
 return <div key={paneId} className="lv-legend-pane" data-legend-pane={paneId}>{rows}</div>;
}
