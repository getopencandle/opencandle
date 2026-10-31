import React,{useEffect,useRef} from 'react';
import './right-panel-splitter.css';

// The right widget panel resizes by dragging its left edge.
// The width is the --lv-panel-w custom property (styles.css :root default 302px), written inline on the root
// element so the workspace grid and every consumer of the variable follow. Saved per viewer in localStorage (; the
// workspace document has no panel width field). Double-click restores the default. Arrow keys move it 16 px when focused.

export const RIGHT_PANEL_DEFAULT_W=302,RIGHT_PANEL_MIN_W=220,RIGHT_PANEL_MAX_W=720;
/** The chart keeps at least this much width when the panel grows. */
export const RIGHT_PANEL_CHART_MIN_W=420;
export const RIGHT_PANEL_STORAGE_KEY='lv.rightPanelWidth';
const VAR='--lv-panel-w',KEY_STEP=16;

/** The allowed width for a viewport width: [min, max], never below the minimum. */
export function clampRightPanelWidth(width:number,viewport:number):number{
 const max=Math.max(RIGHT_PANEL_MIN_W,Math.min(RIGHT_PANEL_MAX_W,viewport-RIGHT_PANEL_CHART_MIN_W));
 return Math.round(Math.min(max,Math.max(RIGHT_PANEL_MIN_W,Number.isFinite(width)?width:RIGHT_PANEL_DEFAULT_W)));
}
/** A stored width, or null when absent or malformed. */
export function parseStoredWidth(value:string|null|undefined):number|null{
 if(typeof value!=='string'||!/^\d{2,4}$/.test(value))return null;
 const width=Number(value);return width>=RIGHT_PANEL_MIN_W&&width<=RIGHT_PANEL_MAX_W?width:null;
}
const storage=():Storage|null=>{try{return typeof window==='undefined'?null:window.localStorage??null;}catch{return null;}};
const readStored=()=>{try{return parseStoredWidth(storage()?.getItem(RIGHT_PANEL_STORAGE_KEY));}catch{return null;}};
const writeStored=(width:number|null)=>{try{const store=storage();if(!store)return;if(width===null||width===RIGHT_PANEL_DEFAULT_W)store.removeItem(RIGHT_PANEL_STORAGE_KEY);else store.setItem(RIGHT_PANEL_STORAGE_KEY,String(width));}catch{/* per-viewer convenience only */}};
const viewportWidth=()=>typeof window==='undefined'?1920:window.innerWidth||1920;
function applyWidth(width:number|null){
 const root=typeof document==='undefined'?null:document.documentElement;if(!root)return;
 if(width===null||width===RIGHT_PANEL_DEFAULT_W)root.style.removeProperty(VAR);else root.style.setProperty(VAR,width+'px');
}
function currentWidth(panel:Element|null):number{
 const value=typeof document==='undefined'?'':document.documentElement.style.getPropertyValue(VAR);
 const parsed=parseFloat(value);if(Number.isFinite(parsed))return parsed;
 const rect=panel?.getBoundingClientRect();return rect&&rect.width>0?rect.width+1:RIGHT_PANEL_DEFAULT_W;
}

export function RightPanelSplitter({hidden}:{hidden:boolean}){
 const drag=useRef<{pointer:number;startX:number;startW:number;width:number}|null>(null);
 const ref=useRef<HTMLDivElement>(null);
 useEffect(()=>{const stored=readStored();if(stored!==null)applyWidth(clampRightPanelWidth(stored,viewportWidth()));},[]);
 const panel=()=>ref.current?.parentElement?.querySelector(':scope>.right-panel')??null;
 const set=(width:number,save:boolean)=>{const next=clampRightPanelWidth(width,viewportWidth());applyWidth(next);if(save)writeStored(next);ref.current?.setAttribute('aria-valuenow',String(next));return next;};
 if(hidden)return null;
 return <div ref={ref} className="lv-right-panel-splitter" role="separator" aria-orientation="vertical" aria-label="Resize the right panel" aria-valuemin={RIGHT_PANEL_MIN_W} aria-valuemax={RIGHT_PANEL_MAX_W} tabIndex={0} title="Drag to resize the panel, double-click to reset"
  onPointerDown={event=>{if(event.button!==0)return;event.preventDefault();const startW=currentWidth(panel());drag.current={pointer:event.pointerId,startX:event.clientX,startW,width:startW};try{event.currentTarget.setPointerCapture(event.pointerId);}catch{/* capture is a convenience */}event.currentTarget.setAttribute('data-dragging','true');}}
  onPointerMove={event=>{const state=drag.current;if(!state||state.pointer!==event.pointerId)return;state.width=set(state.startW+(state.startX-event.clientX),false);}}
  onPointerUp={event=>{const state=drag.current;if(!state||state.pointer!==event.pointerId)return;drag.current=null;event.currentTarget.removeAttribute('data-dragging');try{event.currentTarget.releasePointerCapture(event.pointerId);}catch{/* already released */}if(state.width!==state.startW)set(state.width,true);}}
  onPointerCancel={event=>{const state=drag.current;if(!state)return;drag.current=null;event.currentTarget.removeAttribute('data-dragging');set(state.startW,false);}}
  onDoubleClick={()=>{drag.current=null;applyWidth(null);writeStored(null);}}
  onKeyDown={event=>{if(event.key!=='ArrowLeft'&&event.key!=='ArrowRight')return;event.preventDefault();event.stopPropagation();set(currentWidth(panel())+(event.key==='ArrowLeft'?KEY_STEP:-KEY_STEP),true);}}/>;
}
