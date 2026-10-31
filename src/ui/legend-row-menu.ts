// A right-click on an indicator legend row, or the
// ContextMenu key / Shift+F10 on it, opens that row's study menu: the legend More menu, whose rows (Add alert, Visual order,
// Move to, Pin to scale, Copy, Hide, Remove, Object tree, Settings) are the ones the pane right-click menu shows for the same
// indicator (ChartContextMenu indicatorMenuEntries is built from the same legendMoreMenu model). Clicks inside an open menu
// popup keep their own handling. Original LV source.
import type React from 'react';
const insideMenu=(target:EventTarget|null)=>{try{return !!(target as Element|null)?.closest?.('[role=menu],[data-lv-context-menu]');}catch{return false;}};
export function isLegendMenuKey(event:{key:string;shiftKey:boolean;ctrlKey:boolean;altKey:boolean;metaKey:boolean}):boolean{
 return event.key==='ContextMenu'||event.key==='F10'&&event.shiftKey&&!event.ctrlKey&&!event.altKey&&!event.metaKey;
}
export function legendRowMenuProps(open:()=>void):{onContextMenu:(event:React.MouseEvent<HTMLElement>)=>void;onKeyDown:(event:React.KeyboardEvent<HTMLElement>)=>void}{
 return{
  onContextMenu(event){if(event.defaultPrevented||insideMenu(event.target))return;event.preventDefault();event.stopPropagation();open();},
  onKeyDown(event){if(event.nativeEvent.isComposing||!isLegendMenuKey(event)||insideMenu(event.target))return;event.preventDefault();event.stopPropagation();open();},
 };
}
