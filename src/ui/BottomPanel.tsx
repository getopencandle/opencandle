import React,{useRef,useState} from 'react';
import {BOTTOM_PANEL_CHART_RESERVE,BOTTOM_PANEL_MAX_HEIGHT,BOTTOM_PANEL_MIN_HEIGHT,BOTTOM_PANEL_TABS,SCRIPT_TABLES_TAB,bottomPanelDragHeight,bottomPanelKeyHeight,collapseBottomPanel,openBottomTab,resizeBottomPanel,selectBottomTab,type BottomPanelTab,type BottomPanelView} from './bottom-panel-model';

/**
 * The chrome of the tabbed bottom panel (tab strip, resize handle, maximize and collapse). The tab content
 * is not rendered here: each owner (the script editor, the Strategy tester, the paper trading dock) stays where App renders
 * it, with its own element-reuse slot, and portals into the host element this panel gives its tab. Every host is always in
 * the document (hidden when not shown), so a host never disappears under its owner.
 */
export interface BottomPanelProps {
 view:BottomPanelView;
 /** Tabs offered (the Trading panel needs a virtual account). */
 tabs:readonly BottomPanelTab[];
 maximized:boolean;
 onChange:(next:BottomPanelView)=>void;
 onMaximize:(maximized:boolean)=>void;
 /** Ref callbacks for the per-tab host elements (pass stable functions, for example state setters). */
 hostRefs:Readonly<Record<Exclude<BottomPanelTab,'tables'>,(element:HTMLDivElement|null)=>void>>;
 tables?:React.ReactNode;
}
const CSS='.lv-bottom-panel{position:relative;display:flex;flex-direction:column;flex:0 0 auto;min-height:0;background:var(--lv-bg-raised);color:var(--lv-text-primary);border-top:1px solid var(--lv-border);font-size:12px}'
 +'.lv-bottom-panel[data-maximized=true]{position:absolute;inset:0;z-index:12;height:auto!important}'
 +'.lv-bottom-panel-grip{position:absolute;left:0;right:0;top:-4px;height:8px;cursor:ns-resize;z-index:1;touch-action:none}'
 +'.lv-bottom-panel-grip:focus-visible{outline:2px solid var(--lv-accent);outline-offset:-3px}'
 +'.lv-bottom-panel-strip{display:flex;align-items:center;gap:2px;padding:0 6px;min-height:28px}'
 +'.lv-bottom-panel-strip [role=tab]{border:0;border-bottom:2px solid transparent;background:transparent;color:inherit;font:inherit;padding:5px 10px;cursor:pointer}'
 +'.lv-bottom-panel-strip [role=tab][aria-selected=true]{border-bottom-color:var(--lv-accent);font-weight:600}'
 +'.lv-bottom-panel-strip .spacer{flex:1}'
 +'.lv-bottom-panel-strip .lv-bottom-panel-action{border:0;background:transparent;color:inherit;font:inherit;padding:4px 8px;cursor:pointer;display:inline-flex;align-items:center;border-radius:var(--lv-radius-plate,6px)}'
 +'.lv-bottom-panel-strip .lv-bottom-panel-action:hover:not(:disabled){background:var(--lv-hover)}'
 +'.lv-bottom-panel-body{flex:1 1 auto;min-height:0;display:flex;flex-direction:column;border-top:1px solid var(--lv-border)}'
 +'.lv-bottom-panel-body[hidden]{display:none}'
 +'.lv-bottom-panel-host{flex:1 1 auto;min-height:0;overflow:auto}'
 +'.lv-bottom-panel-host[hidden]{display:none}';
/** The height the chart area allows the panel (its parent's height less the chart reserve); the stored limit without layout. */
function heightLimit(section:HTMLElement|null):number{
 const parent=section?.parentElement,box=typeof parent?.getBoundingClientRect==='function'?parent.getBoundingClientRect():null;
 return box&&box.height>0?Math.max(BOTTOM_PANEL_MIN_HEIGHT,box.height-BOTTOM_PANEL_CHART_RESERVE):BOTTOM_PANEL_MAX_HEIGHT;
}
export function BottomPanel(props:BottomPanelProps){
 const {view,maximized}=props,section=useRef<HTMLElement|null>(null),drag=useRef<{startY:number;startHeight:number;limit:number;pointer:number}|null>(null);
 const [dragHeight,setDragHeight]=useState<number|null>(null);
 const height=dragHeight??view.height,open=view.open,shown=props.tabs.includes(view.tab)?view.tab:null;
 const select=(tab:BottomPanelTab)=>props.onChange(selectBottomTab(view,tab));
 const endDrag=(commit:boolean)=>{const active=drag.current;drag.current=null;const last=dragHeight;setDragHeight(null);if(commit&&active&&last!==null&&last!==view.height)props.onChange(resizeBottomPanel(view,last));};
 const grip=open&&!maximized?<div className="lv-bottom-panel-grip" role="separator" aria-orientation="horizontal" aria-label="Resize bottom panel" aria-valuemin={BOTTOM_PANEL_MIN_HEIGHT} aria-valuemax={BOTTOM_PANEL_MAX_HEIGHT} aria-valuenow={height} tabIndex={0} title="Drag to resize the bottom panel"
  onPointerDown={event=>{if(event.button!==0)return;event.preventDefault();const box=section.current?.getBoundingClientRect?.();drag.current={startY:event.clientY,startHeight:box&&box.height>0?box.height:view.height,limit:heightLimit(section.current),pointer:event.pointerId};try{(event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);}catch{/* capture is optional */}}}
  onPointerMove={event=>{const active=drag.current;if(!active||active.pointer!==event.pointerId)return;setDragHeight(bottomPanelDragHeight(active.startHeight,active.startY,event.clientY,active.limit));}}
  onPointerUp={event=>{if(drag.current?.pointer===event.pointerId)endDrag(true);}}
  onPointerCancel={()=>endDrag(false)}
  onLostPointerCapture={()=>{if(drag.current)endDrag(true);}}
  onKeyDown={event=>{const next=bottomPanelKeyHeight(event.key,view.height,heightLimit(section.current));if(next===null)return;event.preventDefault();if(next!==view.height)props.onChange(resizeBottomPanel(view,next));}}/>:null;
 return <section ref={section} className="lv-bottom-panel" role="region" aria-label="Bottom panel" data-open={open?'true':'false'} data-maximized={open&&maximized?'true':'false'} style={open&&!maximized?{height:'min('+height+'px, calc(100% - '+BOTTOM_PANEL_CHART_RESERVE+'px))'}:undefined}>
  <style>{CSS}</style>
  {grip}
  <div className="lv-bottom-panel-strip">
   <div role="tablist" aria-label="Bottom panel tabs">{(props.tabs.includes('tables')?[...BOTTOM_PANEL_TABS,SCRIPT_TABLES_TAB]:BOTTOM_PANEL_TABS).filter(row=>props.tabs.includes(row.id)).map(row=><button key={row.id} type="button" role="tab" id={'lv-bottom-tab-'+row.id} aria-selected={open&&shown===row.id} aria-controls={'lv-bottom-host-'+row.id} title={row.title} onClick={()=>select(row.id)}>{row.label}</button>)}</div>
   <span className="spacer"/>
   <button type="button" className="lv-bottom-panel-action" aria-label={open&&maximized?'Restore bottom panel size':'Maximize bottom panel'} title={open&&maximized?'Restore panel size':'Maximize panel'} disabled={!shown} onClick={()=>{if(open&&maximized){props.onMaximize(false);return;}if(!open&&shown)props.onChange(openBottomTab(view,shown));props.onMaximize(true);}}><svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.2">{open&&maximized?<path d="M4.5 2.5h7v7M2.5 4.5h7v7h-7z"/>:<rect x="2.5" y="2.5" width="9" height="9"/>}</svg></button>
   <button type="button" className="lv-bottom-panel-action" aria-label={open?'Collapse bottom panel':'Expand bottom panel'} aria-expanded={open} title={open?'Collapse panel':'Expand panel'} disabled={!open&&!shown} onClick={()=>{if(open){props.onMaximize(false);props.onChange(collapseBottomPanel(view));}else if(shown)props.onChange(openBottomTab(view,shown));}}><svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.2"><path d={open?'M3 5.5l4 4 4-4':'M3 8.5l4-4 4 4'}/></svg></button>
  </div>
  <div className="lv-bottom-panel-body" hidden={!open||!shown}>
   {BOTTOM_PANEL_TABS.map(row=><div key={row.id} id={'lv-bottom-host-'+row.id} className="lv-bottom-panel-host" role="tabpanel" aria-labelledby={'lv-bottom-tab-'+row.id} hidden={shown!==row.id} ref={props.hostRefs[row.id as Exclude<BottomPanelTab,'tables'>]}/>)}
    {props.tabs.includes('tables')&&<div id="lv-bottom-host-tables" className="lv-bottom-panel-host" role="tabpanel" aria-labelledby="lv-bottom-tab-tables" hidden={shown!=='tables'}>{props.tables}</div>}
  </div>
 </section>;
}
