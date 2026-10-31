import React,{useRef,useState} from 'react';
import {Modal} from './Modal';
import {buildDrawingToolGroups,dialogGroups,leafState,savedFavoriteList,toggleFavorite,searchDrawingTools,toolLabel,type DrawingCatalogRow,type DrawingToolGroupList,type DrawingToolLeaf} from './drawing-toolbar-model';
import {LV_ICONS,type LvIconId} from './icons';
import './drawing-toolbar.css';
/** The same LV icon the toolbar flyouts show for a tool, or nothing. */
const toolIcon=(id:string|undefined):React.ReactNode=>{if(!id||!Object.hasOwn(LV_ICONS,id))return null;const Icon=LV_ICONS[id as LvIconId].Icon;return <Icon/>;};
type Notice={label:string;reason:string;alternative?:string};
/** Searchable picker over every registered drawing type, grouped like the left toolbar. Choosing the already
 * armed tool closes without calling onSelect, so a toggling host handler cannot disarm it. "Armed" is the
 * renderer's own getTool() when chart.drawings is available, else the host activeTool prop. With favorites +
 * onFavoritesChange every available tool, including those not shown as left-toolbar groups, gets a star. */
export function DrawingTools({chart,onSelect,onClose,activeTool:hostTool=null,favorites,onFavoritesChange}:{chart:{drawingCatalog():readonly DrawingCatalogRow[];drawings?:{getTool():string|null}};onSelect:(type:string)=>void;onClose:()=>void;activeTool?:string|null;favorites?:readonly string[];onFavoritesChange?:(next:string[])=>void}){
 const activeTool=chart.drawings?chart.drawings.getTool():hostTool;
 const cache=useRef<{chart:unknown;groups:DrawingToolGroupList}|null>(null);
 if(cache.current?.chart!==chart)cache.current={chart,groups:buildDrawingToolGroups(chart.drawingCatalog())};
 const groups=cache.current.groups,[search,setSearch]=useState(''),[notice,setNotice]=useState<Notice|null>(null);
 const matches=searchDrawingTools(groups,search).filter(row=>row.leaf.target.kind==='tool'||row.leaf.target.kind==='unavailable');
 const pick=(leaf:DrawingToolLeaf)=>{const state=leafState(leaf,{modes:false});if(state.state==='unavailable'){setNotice({label:leaf.label,reason:state.reason,alternative:state.alternative});return;}if(leaf.target.kind!=='tool')return;if(leaf.target.type!==activeTool)onSelect(leaf.target.type);onClose();};
 const pickType=(type:string)=>{if(type!==activeTool)onSelect(type);onClose();};
 const submit=()=>{const first=matches.find(row=>row.leaf.target.kind==='tool')??matches[0];if(first)pick(first.leaf);};
 const saved=onFavoritesChange?savedFavoriteList(groups,favorites??[]):[];
 const star=(leaf:DrawingToolLeaf)=>{if(!onFavoritesChange||leaf.target.kind!=='tool')return null;const type=leaf.target.type,on=saved.includes(type);return <button type="button" className="lv-drawing-star" aria-pressed={on} aria-label={'Favorite: '+leaf.label} title={(on?'Remove from':'Add to')+' favorites'} onClick={()=>onFavoritesChange(toggleFavorite(groups,saved,type))}>{on?'★':'☆'}</button>;};
 return <Modal title="Drawing tools" onClose={onClose} wide><div className="modal-scroll lv-drawing-tools">
  <div className="lv-drawing-tools-search"><input aria-label="Search drawing tools" value={search} onChange={e=>{setSearch(e.target.value);setNotice(null);}} onKeyDown={e=>{if(e.key==='Enter'&&!e.nativeEvent.isComposing){e.preventDefault();submit();}}} placeholder="Search tools"/></div>
  {matches.length===0&&<p className="help" role="status">No drawing tools match “{search}”.</p>}
  {dialogGroups(groups).map(group=>{const rows=matches.filter(row=>row.group===group);if(!rows.length)return null;return <section key={group.id}><h3>{group.label}</h3>{group.sections.map(section=>{const leaves=rows.filter(row=>row.section===section).map(row=>row.leaf);if(!leaves.length)return null;return <div key={section.id} role="group" aria-label={section.label}>{group.sections.length>1&&section.label&&<h4>{section.label}</h4>}<div className="tool-grid">{leaves.map(leaf=>{const state=leafState(leaf,{modes:false}),active=leaf.target.kind==='tool'&&leaf.target.type===activeTool,favorite=state.state==='available'?star(leaf):null;const button=<button type="button" key={leaf.id} data-requirement={leaf.id} className={active?'active':''} aria-pressed={leaf.target.kind==='tool'?active:undefined} aria-disabled={state.state==='unavailable'||undefined} title={state.state==='unavailable'?state.reason:leaf.note} onClick={()=>pick(leaf)}><i className="lv-drawing-tools-icon" aria-hidden="true">{toolIcon(leaf.iconId)}</i><span className="lv-drawing-tools-label">{leaf.label}{state.state==='unavailable'&&<small>Unavailable</small>}</span></button>;return favorite?<span className="lv-drawing-tools-cell" key={leaf.id}>{button}{favorite}</span>:button;})}</div></div>;})}</section>;})}
 </div><footer>{notice?<span className="help" role="status">{notice.label} is unavailable. {notice.reason}{notice.alternative&&<> <button type="button" onClick={()=>pickType(notice.alternative!)}>Use {toolLabel(groups,notice.alternative)??notice.alternative}</button></>}</span>:<span/>}<button onClick={onClose}>Close</button></footer></Modal>;
}
