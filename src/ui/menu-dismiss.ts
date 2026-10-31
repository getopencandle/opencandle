// Shared dismiss behavior for the chart-surface menus: Escape and any pointer press outside the menu close it, and focus
// returns to the control that had it (the trigger) when the menu goes away. Presses on `ignore` (the trigger itself) are left
// to its own click handler. Used as a ref callback so the plain render functions that build these menus stay hook-free.
type Dismiss={close:(()=>void)|undefined;ignore:string|undefined;opener:HTMLElement|null};
const live=new WeakMap<object,{state:Dismiss;off:()=>void}>();
export function menuDismissRef(onClose:(()=>void)|undefined,ignore?:string){
 return(node:HTMLElement|null)=>{
  if(!node||typeof document==='undefined'||typeof HTMLElement==='undefined'||typeof document.addEventListener!=='function')return;
  let entry=live.get(node);
  if(!entry){
   const state:Dismiss={close:onClose,ignore,opener:document.activeElement instanceof HTMLElement?document.activeElement:null};
   const outside=(event:PointerEvent)=>{
    const target=event.target as Node|null;
    if(!target||node.contains(target))return;
    if(state.ignore&&target instanceof Element&&target.closest(state.ignore))return;
    state.close?.();
   };
   const escape=(event:KeyboardEvent)=>{if(event.key==='Escape'&&state.close){event.stopPropagation();state.close();}};
   document.addEventListener('pointerdown',outside,true);document.addEventListener('keydown',escape,true);
   entry={state,off:()=>{document.removeEventListener('pointerdown',outside,true);document.removeEventListener('keydown',escape,true);}};
   live.set(node,entry);
  }
  entry.state.close=onClose;entry.state.ignore=ignore;
  const held=entry;
  return()=>{
   // A re-render re-attaches the ref in the same commit; only a node that left the document is really gone.
   queueMicrotask(()=>{
    if(node.isConnected)return;
    held.off();live.delete(node);
    const opener=held.state.opener;
    if(opener&&opener.isConnected&&(document.activeElement===document.body||!document.activeElement))opener.focus();
   });
  };
 };
}
