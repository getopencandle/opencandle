// The top-toolbar interval strip. The owner reported that "the very first interval changes constantly":
// the old strip put the current-interval badge first, so picking any favorite rewrote that first button. Charting apps keep the
// favorite buttons as a fixed set (ascending duration, the order the menu stores) and highlight the active one. The current
// interval shows on the dropdown button only when it is not a favorite. The dropdown sits after the favorites and keeps a
// minimum width, so a click never moves a favorite.
import React from 'react';
import {parseInterval} from '../domain/intervals';
import {rangeIntervalId,rangeSizeOf} from '../chart/range-interval';
import type {ChartSettingsBook} from '../chart/chart-settings';
import {shortIntervalText} from './interval-display';
import {ChevronDownIcon} from './icons';

export interface IntervalStripItem {id:string;label:string;active:boolean}
export interface IntervalStrip {favorites:IntervalStripItem[];/** Text on the dropdown button: the current interval when it is not a favorite, else null. */current:string|null;currentId:string}

function canonical(id:string){try{return parseInterval(id).id;}catch{return id;}}
/** The id the chart shows: `<size>R` on a Range chart, the data interval otherwise. */
export function currentIntervalId(style:string,book:ChartSettingsBook|null|undefined,resolution:string):string{return style==='range'?rangeIntervalId(rangeSizeOf(book)):canonical(resolution);}
/** Pure strip model. `favorites` arrive in display order and are never reordered or replaced here. */
export function intervalStrip(favorites:readonly string[],currentId:string):IntervalStrip{
 const rows=favorites.map(id=>({id,label:shortIntervalText(id),active:canonical(id)===currentId}));
 return{favorites:rows,current:rows.some(row=>row.active)?null:shortIntervalText(currentId),currentId};
}

/** Rendered inline by App (a plain function, no hooks), so App-render tests still see the buttons. */
export function intervalToolbar(props:{favorites:readonly string[];currentId:string;menuOpen:boolean;onToggleMenu:()=>void;onPick:(id:string)=>void}){
 const strip=intervalStrip(props.favorites,props.currentId);
 return <span className="lv-interval-strip" role="group" aria-label="Intervals" data-interval-strip="">
  {strip.favorites.map(row=><button key={row.id} type="button" data-interval-favorite={row.id} className={row.active?'active':undefined} aria-pressed={row.active} title={'Choose '+row.label+' interval'} onClick={()=>{if(!row.active)props.onPick(row.id);}}>{row.label}</button>)}
  <button type="button" className="interval-badge" id="lv-interval-badge" aria-label="Chart intervals" aria-haspopup="menu" aria-expanded={props.menuOpen} aria-controls="lv-interval-menu" title={strip.current===null?'Chart intervals':'Current interval '+strip.current+'. Choose another'} data-current-interval={strip.currentId} data-current-favorite={strip.current===null?'':undefined} onClick={()=>props.onToggleMenu()} onKeyDown={event=>{if(event.key==='ArrowDown'&&!props.menuOpen){event.preventDefault();props.onToggleMenu();}}}>{strip.current!==null&&<span className="lv-interval-current">{strip.current}</span>}<ChevronDownIcon/></button>
 </span>;
}
