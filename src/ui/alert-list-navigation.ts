/** Navigation metadata only; never grants authority to mutate a saved alert. */
export interface AlertListItem {id:string;identity:readonly (string|number)[];sourceIndex:number;historyIndex?:number;}
export interface AlertListView {
 key:object;items:readonly AlertListItem[];byId:Map<string,number>;
 nodes:Map<string,{node:HTMLElement;registration:object}>;ambiguous:boolean;
}
export function reconcileAlertListView(previous:AlertListView|null,key:object,items:readonly AlertListItem[],ambiguous=false):AlertListView{
 const byId=new Map<string,number>();
 items.forEach((row,index)=>{if(byId.has(row.id))ambiguous=true;byId.set(row.id,index);});
 const same=previous!==null&&previous.key===key&&previous.ambiguous===ambiguous&&previous.items.length===items.length&&items.every((row,index)=>{
  const old=previous.items[index];return old.id===row.id&&old.identity.length===row.identity.length&&row.identity.every((value,part)=>value===old.identity[part]);
 });
 if(same&&previous){previous.items=items;previous.byId=byId;return previous;}
 return{key,items,byId,nodes:new Map(),ambiguous};
}
export function alertListStep(event:{key:string;repeat?:boolean;defaultPrevented?:boolean;ctrlKey?:boolean;metaKey?:boolean;altKey?:boolean;shiftKey?:boolean;nativeEvent?:{isComposing?:boolean}}):-1|0|1|null{
 if(event.defaultPrevented||event.nativeEvent?.isComposing||event.ctrlKey||event.metaKey||event.altKey)return null;
 if(event.key===' '){if(event.repeat)return 0;return event.shiftKey?-1:1;}
 if(event.shiftKey)return null;
 return event.key==='ArrowDown'||event.key==='ArrowRight'?1:event.key==='ArrowUp'||event.key==='ArrowLeft'?-1:null;
}
const interactive='button,a,input,select,textarea,label,summary,[contenteditable]:not([contenteditable="false"]),[role="button"],[role="checkbox"],[role="radio"],[role="switch"],[role="tab"],[role="slider"],[role="spinbutton"],[role="combobox"],[role="textbox"],[role="listbox"],[role="option"],[role="treeitem"],[role="menu"],[role="menuitem"],[role="alertdialog"]';
export function alertListBackground(target:EventTarget|null):boolean{return !(target as Element|null)?.closest?.(interactive);}
