import React,{useEffect,useRef,useState} from 'react';
import {orderChartTypes,type ChartTypeChoice} from './top-toolbar-model';
import {CHART_TYPE_FAVORITES_KEY,readLegacyChartTypeFavorites,toggleChartTypeFavorite} from './chart-type-favorites';
import {ChartAreaIcon,ChartBarsIcon,ChartBaselineIcon,ChartCandlesIcon,ChartColumnsIcon,ChartFootprintIcon,ChartHeikinAshiIcon,ChartHighLowIcon,ChartHlcAreaIcon,ChartHollowCandlesIcon,ChartKagiIcon,ChartLineBreakIcon,ChartLineIcon,ChartLineMarkersIcon,ChartPointFigureIcon,ChartRangeIcon,ChartRenkoIcon,ChartStepLineIcon,ChartTpoIcon,ChartVolumeCandlesIcon,type LvIconComponent} from './icons';

// The header chart type control is an icon button showing the current type; it opens a grouped menu of
// radio items in the observed menu order (orderChartTypes). Replaces the native select.

/** The icon family for a chart type value. */
export function chartTypeIcon(value:string):LvIconComponent{
 return CHART_TYPE_ICON[value]??(['line','linemarkers','step','linebreak','kagi'].includes(value)?ChartLineIcon:ChartCandlesIcon);
}
const CHART_TYPE_ICON:Readonly<Record<string,LvIconComponent>>={
 candles:ChartCandlesIcon,hollow:ChartHollowCandlesIcon,volumecandles:ChartVolumeCandlesIcon,heikinashi:ChartHeikinAshiIcon,
 bars:ChartBarsIcon,hlcbars:ChartBarsIcon,highlow:ChartHighLowIcon,columns:ChartColumnsIcon,
 line:ChartLineIcon,linemarkers:ChartLineMarkersIcon,step:ChartStepLineIcon,
 area:ChartAreaIcon,hlcarea:ChartHlcAreaIcon,baseline:ChartBaselineIcon,
 tpo:ChartTpoIcon,footprint:ChartFootprintIcon,renko:ChartRenkoIcon,linebreak:ChartLineBreakIcon,kagi:ChartKagiIcon,range:ChartRangeIcon,pointfigure:ChartPointFigureIcon,
};
/** The types in menu order, split at the menu's separators. Empty groups are dropped. */
export function chartTypeGroups<T extends ChartTypeChoice>(types:readonly T[]):T[][]{
 const groups=new Map<number,T[]>();
 for(const row of orderChartTypes(types)){const {group,...rest}=row;const list=groups.get(group)??[];list.push(rest as unknown as T);groups.set(group,list);}
 return [...groups.entries()].sort((a,b)=>a[0]-b[0]).map(entry=>entry[1]);
}
/** The chart type rows carry an Add to favorites star, and favorited types show as header buttons next to the
 * chart type button. Saved in the workspace (chart-type-favorites.ts); the old localStorage key is read only
 * while the workspace has no list, and the first toggle moves the shown list into the workspace. */
export {CHART_TYPE_FAVORITES_KEY};
/** The legacy localStorage list (read-only now). */
export const readChartTypeFavorites=readLegacyChartTypeFavorites;
/** Favorites in menu order, limited to types that exist and are enabled. */
export function favoriteChartTypes<T extends ChartTypeChoice>(types:readonly T[],favorites:readonly string[]):T[]{const set=new Set(favorites);return chartTypeGroups(types).flat().filter(row=>set.has(row.value)&&!row.disabled);}
export interface ChartTypeMenuProps {
 value:string;types:readonly ChartTypeChoice[];onSelect:(value:string)=>void;disabled?:boolean;
 /** Render with the menu open (tests and the right-click "Chart type..." entry). */
 initialOpen?:boolean;
 /** The workspace list; undefined until the first toggle (the legacy localStorage list shows meanwhile). */
 favorites?:readonly string[];
 /** Publish a new workspace list. Without it the star toggles last for this menu instance only. */
 onFavoritesChange?:(next:string[])=>void;
}
export function ChartTypeMenu({value,types,onSelect,disabled,initialOpen,favorites:saved,onFavoritesChange}:ChartTypeMenuProps){
 const [open,setOpen]=useState(!!initialOpen),[left,setLeft]=useState(4),[legacy]=useState<readonly string[]>(()=>saved===undefined?readLegacyChartTypeFavorites():[]),[local,setLocal]=useState<readonly string[]|null>(null);
 const favorites=onFavoritesChange?(saved??legacy):(local??saved??legacy);
 function toggleFavorite(type:string){const next=toggleChartTypeFavorite(favorites,type);if(onFavoritesChange)onFavoritesChange(next);else setLocal(next);}
 const root=useRef<HTMLDivElement|null>(null),trigger=useRef<HTMLButtonElement|null>(null),menu=useRef<HTMLDivElement|null>(null);
 const current=types.find(row=>row.value===value),Icon=chartTypeIcon(value),groups=chartTypeGroups(types);
 useEffect(()=>{
  if(!open)return;
  menu.current?.querySelector<HTMLButtonElement>('[aria-checked="true"]')?.focus?.();
  const doc=root.current?.ownerDocument;if(!doc)return;
  const outside=(event:Event)=>{if(!root.current?.contains(event.target as Node))setOpen(false);};
  doc.addEventListener('pointerdown',outside,true);return()=>doc.removeEventListener('pointerdown',outside,true);
 },[open]);
 /** The menu is fixed below the header, left-aligned with the button (the header row scrolls, so it cannot be a child box). */
 function place(){const box=trigger.current?.getBoundingClientRect?.();setLeft(Math.max(4,Math.round(box?.left??4)));}
 function close(focusTrigger:boolean){setOpen(false);if(focusTrigger)trigger.current?.focus?.();}
 function choose(next:ChartTypeChoice){if(next.disabled)return;close(true);if(next.value!==value)onSelect(next.value);}
 function menuKey(event:React.KeyboardEvent<HTMLDivElement>){
  if(event.nativeEvent?.isComposing)return;
  const items=Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role=menuitemradio]:not(:disabled)')),index=items.indexOf(event.target as HTMLButtonElement);
  const move=(to:number)=>{event.preventDefault();items[(to+items.length)%items.length]?.focus();};
  if(event.key==='ArrowDown')move(index+1);else if(event.key==='ArrowUp')move(index<0?items.length-1:index-1);
  else if(event.key==='Home')move(0);else if(event.key==='End')move(items.length-1);
  else if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close(true);}else if(event.key==='Tab')close(false);
 }
 return <div className="lv-chart-type-picker" ref={root}>
  <button type="button" ref={trigger} className="lv-icon-button lv-chart-type" aria-label="Chart type" title={current?.label??value} aria-haspopup="menu" aria-expanded={open} aria-controls="lv-chart-type-menu" disabled={disabled} onClick={()=>{if(!open)place();setOpen(!open);}} onKeyDown={event=>{if(event.key==='ArrowDown'&&!open){event.preventDefault();place();setOpen(true);}}}><Icon/></button>
  <div className="lv-popup-menu lv-chart-type-menu" id="lv-chart-type-menu" role="menu" aria-label="Chart types" hidden={!open} ref={menu} style={{left}} onKeyDown={menuKey}>
   {groups.map((group,index)=><React.Fragment key={index}>
    {index>0&&<div role="separator" className="lv-popup-separator"/>}
    {group.map(row=>{const RowIcon=chartTypeIcon(row.value),favorite=favorites.includes(row.value);return <div key={row.value} className="lv-interval-row lv-chart-type-row" data-favorite={favorite?'':undefined}><button type="button" role="menuitemradio" aria-checked={row.value===value} tabIndex={-1} disabled={row.disabled} title={row.reason} onClick={()=>choose(row)}><RowIcon/><span>{row.label}</span></button>{!row.disabled&&<button type="button" role="menuitemcheckbox" aria-checked={favorite} aria-label={(favorite?'Remove from favorites ':'Add to favorites ')+row.label} title={favorite?'Remove from favorites':'Add to favorites'} tabIndex={-1} onClick={()=>toggleFavorite(row.value)}>{favorite?'★':'☆'}</button>}</div>;})}
   </React.Fragment>)}
  </div>
  {favoriteChartTypes(types,favorites).map(row=>{const FavIcon=chartTypeIcon(row.value);return <button key={'favorite:'+row.value} type="button" className="lv-icon-button lv-chart-type lv-chart-type-favorite" aria-label={row.label} title={row.label} aria-pressed={row.value===value} disabled={disabled} onClick={()=>{if(row.value!==value)onSelect(row.value);}}><FavIcon/></button>;})}
 </div>;
}
