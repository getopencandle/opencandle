import React from 'react';
import {UtilityMenu} from './DrawingUtilityBlock';
import {MagnetIcon} from './icons/toolbar-icons';
import type {DrawingPreferences} from './drawing-preferences';
import './drawing-utility.css';
// The left toolbar magnet as a split button with a "Magnets" flyout, replacing the native strength select.
// The flyout is titled "Magnets" with the rows "Weak magnet" and "Strong magnet" in that order; the defaults are magnet off
// and "Weak magnet".
// The "Snap to indicators" row (a check row after a separator) binds drawingPreferences.snapToIndicators; with the
// magnet on, indicator plot values in the pane under the cursor become snap targets (src/chart/drawing-snap.ts). The checked row is the saved strength (lastEnabledMagnet) whether or not the magnet is
// on, and choosing a row turns the magnet on at that strength, as the native select did.
export const MAGNET_TOOLTIP='Magnet mode snaps drawings placed near price bars to the closest OHLC value';
export const MAGNET_ARROW_TOOLTIP='Magnets';
export type MagnetStrength='weak'|'strong';
export interface MagnetMenuRow{id:MagnetStrength;label:string;checked:boolean}
export function magnetMenuRows(preferences:Pick<DrawingPreferences,'lastEnabledMagnet'>):MagnetMenuRow[]{
 return [{id:'weak',label:'Weak magnet',checked:preferences.lastEnabledMagnet==='weak'},{id:'strong',label:'Strong magnet',checked:preferences.lastEnabledMagnet==='strong'}];
}
export interface MagnetControlProps{
 preferences:DrawingPreferences;open:boolean;disabled?:boolean;
 /** The host owns which toolbar menu is open (App's utility menu state), so opening this one closes the others. */
 onOpen:(open:boolean)=>void;onToggle:()=>void;onSelect:(strength:MagnetStrength)=>void;
 /** Absent: the Snap to indicators row is not shown. */
 onSnapIndicators?:()=>void;
}
export const SNAP_INDICATORS_LABEL='Snap to indicators';
/** Pure presentational split button. The main button keeps its `Magnet: <mode>` name, which the packaged flows read. */
export function MagnetControl({preferences,open,disabled=false,onOpen,onToggle,onSelect,onSnapIndicators}:MagnetControlProps){
 const on=preferences.magnet!=='off';
 return <div className="lv-utility-group" data-utility="magnet" data-name="magnet-button">
  <button type="button" aria-label={'Magnet: '+preferences.magnet} title={MAGNET_TOOLTIP} aria-pressed={on} className={on?'active':undefined} disabled={disabled} onClick={onToggle}><MagnetIcon/></button>
  <button type="button" className="lv-utility-arrow" aria-label={MAGNET_ARROW_TOOLTIP} title={MAGNET_ARROW_TOOLTIP} aria-haspopup="menu" aria-expanded={open} disabled={disabled} onClick={()=>onOpen(!open)}>{'›'}</button>
  {open&&<UtilityMenu label={MAGNET_ARROW_TOOLTIP} onClose={()=>onOpen(false)}>{magnetMenuRows(preferences).map(row=><button type="button" key={row.id} role="menuitemradio" aria-checked={row.checked} className={row.checked?'checked':undefined} data-magnet-row={row.id} onClick={()=>{onSelect(row.id);onOpen(false);}}>{row.label}</button>)}{onSnapIndicators&&<><hr role="separator"/><button type="button" role="menuitemcheckbox" aria-checked={preferences.snapToIndicators===true} className={preferences.snapToIndicators?'checked':undefined} data-magnet-row="indicators" title="With the magnet on, drawings also snap to indicator values" onClick={()=>{onSnapIndicators();onOpen(false);}}>{SNAP_INDICATORS_LABEL}</button></>}</UtilityMenu>}
 </div>;
}
