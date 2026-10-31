import React,{useRef,useState} from 'react';
import {ObjectTreePanel,type ObjectTreePanelProps} from './ObjectTreePanel';
import {DataWindowPanel,type DataWindowPanelProps} from './DataWindowPanel';
import {SERIES_SECTION,studySection} from './data-window-model';
import './object-tree-panel.css';

// "Object tree and data window" right-sidebar page: one panel with a segmented switcher.
// The Object tree tab comes first and opens by default; the switcher header is 48px tall.
export type ObjectTreeWidgetTab='object_tree'|'data-window';
export const OBJECT_TREE_WIDGET_TITLE='Object tree and data window';
export const OBJECT_TREE_WIDGET_TABS:readonly {id:ObjectTreeWidgetTab;label:string}[]=Object.freeze([{id:'object_tree',label:'Object tree'},{id:'data-window',label:'Data window'}]);
export const OBJECT_TREE_WIDGET_DEFAULT_TAB:ObjectTreeWidgetTab='object_tree';

export interface ObjectTreeDataWindowWidgetProps {
 /** Persisted selected tab (the reference keeps it across reloads); local state when omitted. */
 tab?:ObjectTreeWidgetTab;
 onTabChange?:(tab:ObjectTreeWidgetTab)=>void;
 objectTree:ObjectTreePanelProps;
 dataWindow:Omit<DataWindowPanelProps,'active'|'activeSourceKey'>;
}
/** Maps an object tree selection to the data window section that shows the active state. */
export function activeSectionFor(keys:readonly string[]):string|null{
 const last=keys.at(-1);if(!last)return null;
 if(last==='series')return SERIES_SECTION;
 if(last.startsWith('study:'))return studySection(last.slice(6));
 return null;
}
export function ObjectTreeDataWindowWidget(props:ObjectTreeDataWindowWidgetProps){
 const [localTab,setLocalTab]=useState<ObjectTreeWidgetTab>(OBJECT_TREE_WIDGET_DEFAULT_TAB),[active,setActive]=useState<string|null>(null);
 const tab=props.tab??localTab;
 const choose=(next:ObjectTreeWidgetTab)=>{if(props.onTabChange)props.onTabChange(next);else setLocalTab(next);};
 const onSelectionChange=(keys:string[])=>{setActive(activeSectionFor(keys));props.objectTree.onSelectionChange?.(keys);};
 // The object tree keeps its element while its props object is the same (App keeps it across live ticks;
 // the data window beside it follows the bars). The selection handler is read through a ref, so it is always the newest.
 const selectionHandler=useRef(onSelectionChange);selectionHandler.current=onSelectionChange;
 const kept=useRef<{tree:ObjectTreeDataWindowWidgetProps['objectTree'];element:React.ReactElement}|null>(null);
 if(kept.current?.tree!==props.objectTree)kept.current={tree:props.objectTree,element:<ObjectTreePanel {...props.objectTree} onSelectionChange={keys=>selectionHandler.current(keys)}/>};
 const objectTree=kept.current.element;
 return <section className="lv-otw" aria-label={OBJECT_TREE_WIDGET_TITLE} data-widget="object_tree">
  <div className="lv-otw-header">
   <div className="lv-otw-switcher" role="tablist" aria-label={OBJECT_TREE_WIDGET_TITLE} data-qa-id="union-object-tree-widget-switcher"
    onKeyDown={event=>{if(event.key==='ArrowRight'||event.key==='ArrowLeft'){event.preventDefault();choose(tab==='object_tree'?'data-window':'object_tree');}}}>
    {OBJECT_TREE_WIDGET_TABS.map(item=><button type="button" key={item.id} id={item.id} role="tab" className={'lv-otw-tab'+(tab===item.id?' is-active':'')} aria-selected={tab===item.id} aria-controls={item.id+'-panel'} tabIndex={tab===item.id?0:-1} onClick={()=>choose(item.id)}>{item.label}</button>)}
   </div>
  </div>
  <div id="object_tree-panel" role="tabpanel" aria-labelledby="object_tree" className="lv-otw-body" hidden={tab!=='object_tree'}>{objectTree}</div>
  <div id="data-window-panel" role="tabpanel" aria-labelledby="data-window" className="lv-otw-body" hidden={tab!=='data-window'}><DataWindowPanel {...props.dataWindow} active={tab==='data-window'} activeSourceKey={active}/></div>
 </section>;
}
