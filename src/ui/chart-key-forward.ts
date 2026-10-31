// Chart keys work right after a
// dialog closes, while focus sits on the toolbar button that opened it. The renderer's keyboard controller listens on its
// data canvas only, so a chart key that lands on a plain button (or the page body) and that nothing else used is handed to
// the active chart: the canvas takes focus and receives a copy of the key, so the App capture chain and the renderer run as
// if the chart had been clicked first. Text fields, menus, lists, grids, toolbars with their own arrow keys, sliders, tabs
// and open dialogs keep every key. Original LV source.

/** Keys the chart answers: arrows (plain, Shift, Alt, Ctrl), zoom + / -, Home / End. Never Space, Enter, Escape or Delete. */
export function isChartForwardKey(event:{key:string;ctrlKey:boolean;metaKey:boolean;altKey:boolean;shiftKey:boolean;isComposing?:boolean}):boolean{
 if(event.isComposing||event.metaKey)return false;
 const key=event.key;
 if(key==='ArrowLeft'||key==='ArrowRight')return true;
 if(key==='ArrowUp'||key==='ArrowDown')return event.ctrlKey&&!event.altKey&&!event.shiftKey;
 if(event.ctrlKey||event.altKey)return false;
 return key==='+'||key==='='||key==='-'||key==='_'||key==='Home'||key==='End';
}
/** Focus that owns its own keys: text entry, composite widgets, the chart itself and anything inside a dialog. */
export const KEY_OWNING_FOCUS='input,textarea,select,[contenteditable="true"],[role=menu],[role=menubar],[role=listbox],[role=list],[role=grid],[role=tree],[role=treegrid],[role=tablist],[role=tab],[role=toolbar],[role=slider],[role=radiogroup],[role=radio],[role=spinbutton],[role=dialog],[role=alertdialog],[aria-modal="true"],[role=application],[aria-expanded="true"],[aria-multiselectable],table,.wl-table,[data-lv-own-keys]';
/** Plain controls a chart key may pass through: buttons and links (the page body counts too). */
const PLAIN_CONTROL='button,a[href],[role=button],summary';
type ElementLike={tagName?:string;closest?:(selector:string)=>unknown};
/** True when focus is a plain control (a button, a link) or the page body, so a chart key landing there is unused. */
export function forwardableFocus(target:ElementLike&{matches?:(selector:string)=>boolean}|null|undefined):boolean{
 if(!target||target.tagName==='BODY'||target.tagName==='HTML')return true;
 try{return !!target.matches?.(PLAIN_CONTROL)&&!target.closest?.(KEY_OWNING_FOCUS);}catch{return false;}
}
const visible=(node:Element)=>{try{return (node as HTMLElement).isConnected&&node.getClientRects().length>0&&!node.closest('[hidden],[inert],[aria-hidden="true"]');}catch{return false;}};
/** The active chart's keyboard surface: the data canvas in the selected grid cell, else the only (or first) visible one. */
export function activeChartKeySurface(doc:Document):HTMLElement|null{
 const canvases=Array.from(doc.querySelectorAll<HTMLElement>('.chart-workspace canvas[role=application]')).filter(visible);
 if(canvases.length<=1)return canvases[0]??null;
 const selected=canvases.find(canvas=>canvas.closest('[data-lv-cell-id]')?.querySelector('.lv-grid-strip button[aria-pressed="true"]'));
 return selected??canvases[0]??null;
}
/** Installs the bubble-phase forwarder once per document; the returned release removes it when the last chart unmounts. */
const installs=new WeakMap<Document,{count:number;release:()=>void}>();
export function installChartKeyForwarding(doc:Document|undefined=typeof document==='undefined'?undefined:document):()=>void{
 if(!doc)return()=>{};
 const existing=installs.get(doc);
 if(existing){existing.count++;let done=false;return()=>{if(done)return;done=true;if(--existing.count===0){existing.release();installs.delete(doc);}};}
 const onKey=(event:KeyboardEvent)=>{
  if(event.defaultPrevented||!event.isTrusted||!isChartForwardKey(event))return;
  if(!forwardableFocus(event.target as ElementLike|null))return;
  if(doc.querySelector('[role=dialog],[role=alertdialog],[aria-modal="true"]'))return;
  const surface=activeChartKeySurface(doc);if(!surface)return;
  event.preventDefault();
  surface.focus({preventScroll:true});
  if(doc.activeElement!==surface)return;
  surface.dispatchEvent(new KeyboardEvent('keydown',{key:event.key,code:event.code,ctrlKey:event.ctrlKey,altKey:event.altKey,shiftKey:event.shiftKey,metaKey:event.metaKey,repeat:event.repeat,bubbles:true,cancelable:true,composed:true}));
 };
 doc.addEventListener('keydown',onKey);
 const entry={count:1,release:()=>doc.removeEventListener('keydown',onKey)};installs.set(doc,entry);
 let done=false;return()=>{if(done)return;done=true;if(--entry.count===0){entry.release();installs.delete(doc);}};
}
