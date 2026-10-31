import React from 'react';
import './layout-menu.css';
import type {MultiChartState} from './MultiChartGrid';
import type {LayoutLibraryAction} from './LayoutLibraryDialog';
import {activeSavedLayout,layoutIsDirty,layoutName,type LayoutLibrary,type SavedLayout} from './layout-library';
import {ChevronDownIcon,LayoutCopyIcon,LayoutNewIcon,LayoutOpenIcon,LayoutRenameIcon,LayoutSaveIcon,type LvIconComponent} from './icons';

// The header layout name opens a dropdown (other saved layouts, favorites first; Save, Make a copy, Rename,
// Create new layout, Autosave, Open layout...) instead of the Local layouts modal. Every row maps to the existing layout
// library action, so storage, dirty checks and undo clearing are unchanged. A render helper (not a component), like
// shell.tsx's menus: the App owns its state and its elements stay in the App tree, where App tests find them. The modal
// stays reachable through "Open layout..." and the "." key; Delete, Export and Import live there.

export type LayoutNamingKind='rename'|'duplicate'|'create';
/** query: the search box text; removing: a saved layout the inline Delete asks about; naming.id: the layout a row's Rename targets (absent: the active one). */
/** right: the menu's distance from the window's right edge, measured from the trigger when it opens. */
export interface LayoutMenuState {open:boolean;right?:number;naming?:{kind:LayoutNamingKind;name:string;id?:string};query?:string;removing?:string;decision?:LayoutLibraryAction}
export const LAYOUT_MENU_ENTRY_LIMIT=8;
/** Saved layouts other than the active one: favorites first, then most recently saved. */
export function layoutMenuEntries(library:LayoutLibrary):SavedLayout[]{
 return library.entries.filter(row=>row.id!==library.activeId).sort((a,b)=>Number(b.favorite)-Number(a.favorite)||b.savedAt-a.savedAt||(a.name<b.name?-1:a.name>b.name?1:0)).slice(0,LAYOUT_MENU_ENTRY_LIMIT);
}
/** Rows of the saved-layouts list: favorites first, then most recently saved; the active layout is included (it shows checked). Eight rows, or twenty while searching. */
export function layoutMenuRows(library:LayoutLibrary,query:string):SavedLayout[]{
 const match=query.trim().toLocaleLowerCase('en-US');
 return library.entries.filter(row=>row.name.toLocaleLowerCase('en-US').includes(match)).sort((a,b)=>Number(b.favorite)-Number(a.favorite)||b.savedAt-a.savedAt||(a.name<b.name?-1:a.name>b.name?1:0)).slice(0,match?20:LAYOUT_MENU_ENTRY_LIMIT);
}
const NAMING_LABELS:Record<LayoutNamingKind,{title:string;submit:string}>={rename:{title:'Rename',submit:'Rename'},duplicate:{title:'Make a copy',submit:'Copy and open'},create:{title:'Create new layout',submit:'Create and open'}};
export interface LayoutMenuProps {
 library:LayoutLibrary;grid:MultiChartState;state:LayoutMenuState|null;disabled?:boolean;
 onState:(next:LayoutMenuState|null)=>void;
 /** The App's layout action (layoutAction); it rejects with the reason when it refuses. */
 onAction:(action:LayoutLibraryAction)=>Promise<void>;
 onOpenLibrary:()=>void;onError:(error:unknown)=>void;
}
function rightOf(element:HTMLElement|null):number{const box=element?.getBoundingClientRect?.(),width=typeof window!=='undefined'&&typeof window.innerWidth==='number'?window.innerWidth:0;return box&&width?Math.max(4,Math.round(width-box.right)):4;}
export function layoutMenuView(props:LayoutMenuProps){
 const {library,grid,state}=props,active=activeSavedLayout(library),dirty=layoutIsDirty(library,grid),open=!!state?.open;
 const run=(action:LayoutLibraryAction)=>{props.onState(null);return props.onAction(action).catch(error=>props.onError(error));};
 /** Opening another layout (or a new or copied one) with unsaved changes and autosave off asks first, as the modal does. */
 const switching=(action:LayoutLibraryAction)=>{if(dirty&&!library.autosave){props.onState({open:true,right:state?.right,decision:action});return Promise.resolve();}return run(action);};
 const name=(kind:LayoutNamingKind)=>props.onState({open:true,right:state?.right,naming:{kind,name:kind==='rename'?active.name:kind==='duplicate'?active.name+' copy':'New layout'}});
 const nameRow=(row:SavedLayout)=>props.onState({open:true,right:state?.right,naming:{kind:'rename',name:row.name,id:row.id}});
 const favorite=(row:SavedLayout)=>void props.onAction({kind:'favorite',id:row.id}).catch(error=>props.onError(error));
 const submit=(event:{preventDefault():void})=>{
  event.preventDefault();const naming=state?.naming;if(!naming)return Promise.resolve();
  let clean:string;try{clean=layoutName(naming.name);}catch(error){props.onError(error);return Promise.resolve();}
  if(naming.kind==='rename')return run({kind:'rename',id:naming.id??library.activeId,name:clean});
  return switching(naming.kind==='duplicate'?{kind:'duplicate',id:library.activeId,name:clean}:{kind:'create',name:clean});
 };
 const close=(focusTrigger:boolean)=>{props.onState(null);if(focusTrigger&&typeof document!=='undefined')document.getElementById?.('lv-layout-menu-trigger')?.focus?.();};
 const keys=(event:React.KeyboardEvent<HTMLDivElement>)=>{
  if(event.nativeEvent?.isComposing||(event.target as HTMLElement).closest?.('input'))return;
  const items=Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role^=menuitem]:not(:disabled)')),index=items.indexOf(event.target as HTMLButtonElement);
  const move=(to:number)=>{event.preventDefault();items[(to+items.length)%items.length]?.focus();};
  if(event.key==='ArrowDown')move(index+1);else if(event.key==='ArrowUp')move(index<0?items.length-1:index-1);else if(event.key==='Home')move(0);else if(event.key==='End')move(items.length-1);
  else if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close(true);}
 };
 const query=state?.query??'',rows=layoutMenuRows(library,query),removing=state?.removing?library.entries.find(row=>row.id===state.removing):undefined,item=(label:string,onClick:()=>void,extra:{hint?:string;title?:string;text?:string;icon?:LvIconComponent}={})=><button type="button" role="menuitem" tabIndex={-1} aria-label={label} title={extra.title} onClick={onClick}>{extra.icon&&<extra.icon/>}<span>{extra.text??label}</span>{extra.hint&&<span className="lv-popup-hint">{extra.hint}</span>}</button>;
 const naming=state?.naming,decision=state?.decision;
 return <div className="lv-layout-menu-host">
  <button type="button" className="layout-library-button" id="lv-layout-menu-trigger" aria-label="Manage layouts" aria-haspopup="menu" aria-expanded={open} aria-controls="lv-layout-menu" title={'Manage layouts · '+active.name} data-layout-clean={dirty?undefined:''} disabled={props.disabled} onClick={event=>props.onState(open?null:{open:true,right:rightOf(event.currentTarget)})} onKeyDown={event=>{if(event.key==='ArrowDown'&&!open){event.preventDefault();props.onState({open:true,right:rightOf(event.currentTarget)});}}}><span className="layout-library-name">{active.name}{dirty?' *':''}</span><ChevronDownIcon/></button>
  <div className="lv-popup-menu lv-layout-menu" id="lv-layout-menu" role="menu" aria-label="Layouts" hidden={!open} style={{right:state?.right??4}} onKeyDown={keys}>
   {decision?<section role="group" aria-label="Unsaved layout" className="lv-layout-menu-prompt"><p>Save changes to “{active.name}” first?</p><div className="dialog-actions"><button type="button" onClick={()=>props.onState({open:true,right:state?.right,query:state?.query})}>Cancel</button><button type="button" onClick={()=>void run({...decision,decision:'save'} as LayoutLibraryAction)}>Save and open</button><button type="button" onClick={()=>void run({...decision,decision:'discard'} as LayoutLibraryAction)}>Discard and open</button></div></section>
   :removing?<section role="group" aria-label="Delete saved layout" className="lv-layout-menu-prompt"><p>Delete “{removing.name}”? This cannot be undone.</p><div className="dialog-actions"><button type="button" onClick={()=>props.onState({open:true,right:state?.right,query:state?.query})}>Cancel</button><button type="button" onClick={()=>void run({kind:'delete',id:removing.id})}>Delete layout</button></div></section>
   :naming?<form className="lv-layout-menu-prompt" onSubmit={submit}><label>{NAMING_LABELS[naming.kind].title}<input aria-label="Layout name" value={naming.name} maxLength={200} autoFocus onFocus={event=>event.currentTarget.select()} onChange={event=>props.onState({open:true,right:state?.right,naming:{...naming,name:event.target.value}})} onKeyDown={event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();props.onState({open:true,right:state?.right,query:state?.query});}}}/></label><div className="dialog-actions"><button type="button" onClick={()=>props.onState({open:true,right:state?.right,query:state?.query})}>Cancel</button><button type="submit">{NAMING_LABELS[naming.kind].submit}</button></div></form>
   :<>
    {item('Save layout',()=>void run({kind:'save'}),{hint:'Ctrl+S',icon:LayoutSaveIcon})}
    {item('Make a copy',()=>name('duplicate'),{icon:LayoutCopyIcon})}
    {item('Rename',()=>name('rename'),{icon:LayoutRenameIcon})}
    {item('Create new layout',()=>name('create'),{icon:LayoutNewIcon})}
    <div role="separator" className="lv-popup-separator"/>
    <button type="button" role="menuitemcheckbox" tabIndex={-1} aria-checked={library.autosave} aria-label="Autosave" onClick={()=>void run({kind:'autosave',enabled:!library.autosave})}><span aria-hidden="true" className="lv-popup-check">{library.autosave?'✓':''}</span><span>Autosave</span></button>
    <div role="separator" className="lv-popup-separator"/>
    <div className="lv-layout-search"><input type="search" aria-label="Search layouts" placeholder="Search layouts" value={query} maxLength={200} onChange={event=>props.onState({open:true,right:state?.right,query:event.target.value})} onKeyDown={event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();if(query)props.onState({open:true,right:state?.right});else close(true);}}}/></div>
    <div className="lv-popup-heading" aria-hidden="true">{query.trim()?'Results':'Recently used'}</div>
    {rows.map(row=>{const current=row.id===library.activeId;return <div key={row.id} className="lv-layout-row" role="presentation" data-active={current?'':undefined} data-favorite={row.favorite?'':undefined}>
     <button type="button" role="menuitem" tabIndex={-1} aria-label={row.name} aria-current={current?'true':undefined} onClick={()=>current?close(true):void switching({kind:'open',id:row.id})}><span aria-hidden="true" className="lv-popup-check">{current?'✓':''}</span><span>{row.name}</span></button>
     <button type="button" role="menuitemcheckbox" tabIndex={-1} className="lv-layout-star" aria-checked={row.favorite} aria-label={(row.favorite?'Unfavorite ':'Favorite ')+row.name} title={row.favorite?'Remove from favorites':'Add to favorites'} onClick={()=>favorite(row)}>{row.favorite?'★':'☆'}</button>
     <button type="button" role="menuitem" tabIndex={-1} className="lv-layout-act" aria-label={'Rename '+row.name} title="Rename" onClick={()=>nameRow(row)}><LayoutRenameIcon/></button>
     {!current&&<button type="button" role="menuitem" tabIndex={-1} className="lv-layout-act" aria-label={'Delete '+row.name} title="Delete" onClick={()=>props.onState({open:true,right:state?.right,query:state?.query,removing:row.id})}>×</button>}
    </div>;})}
    {rows.length===0&&<div className="lv-popup-heading" role="status">No saved layouts match</div>}
   </>}
   <div role="separator" className="lv-popup-separator"/>
   <button type="button" role="menuitem" tabIndex={-1} aria-label="Open layouts" onClick={()=>props.onOpenLibrary()}><LayoutOpenIcon/><span>Open layout…</span></button>
  </div>
 </div>;
}
