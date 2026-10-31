/** The window frame, toolbars and symbol button follow the ACTIVE chart's background, tint included (owner
 *  request 2026-10-29). Today the shell follows the active chart's theme through main[data-theme] (the :root tokens in
 *  styles.css); a tinted grid cell (src/ui/grid-tint.ts) renders a tinted copy of that theme's background, so the shell showed
 *  the plain theme next to it. Here the theme's background-related tokens are tinted with the same function and index as the
 *  active cell, set inline on main.workspace (so they cover the shell and nothing outside it), and removed when the active cell
 *  is untinted. Text and accent tokens are untouched: tints are low-chroma lightness nudges, so text contrast stays as in the
 *  theme. A display layer only: nothing is saved. */
import {useLayoutEffect} from 'react';
import {gridCellTints,tintColor} from './grid-tint';
import type {MultiChartState} from './MultiChartGrid';

/** The shell surface tokens a tint applies to (their theme values are tinted, in this order). */
export const SHELL_TINT_TOKENS=['--lv-bg-gutter','--lv-bg-surface','--lv-bg-raised','--lv-bg-input','--lv-bg-pill','--lv-bg-pill-hover','--lv-hover','--lv-hover-strong','--lv-border-panel','--lv-legend-bg'] as const;
/** The active cell's tint index, or 0 when it renders untinted (one chart, cell 1, a hand-set background, another theme). */
export function activeShellTintIndex(grid:MultiChartState|null|undefined):number{
 if(!grid||grid.layout.cells.length<2)return 0;
 const index=grid.layout.cells.findIndex(row=>row.id===grid.layout.activeCellId);if(index<0)return 0;
 return gridCellTints(grid.layout.cells.map(row=>grid.cells[row.id]?.appearance))[index]?.index??0;
}
/** Tinted values for the given theme token values (empty for index 0 or an unreadable value). */
export function shellTintValues(base:Readonly<Record<string,string>>,index:number):Record<string,string>{
 const out:Record<string,string>={};if(index<=0)return out;
 for(const token of SHELL_TINT_TOKENS){const value=base[token]?.trim();if(!value)continue;const tinted=tintColor(value,index);if(tinted!==value)out[token]=tinted;}
 return out;
}
export function ShellTint({grid,themeId}:{grid:MultiChartState|null|undefined;themeId:string}){
 const index=activeShellTintIndex(grid);
 useLayoutEffect(()=>{
  if(typeof document==='undefined'||typeof getComputedStyle!=='function')return;
  const main=document.querySelector?.<HTMLElement>('main.workspace');if(!main)return;
  for(const token of SHELL_TINT_TOKENS)main.style.removeProperty(token);
  if(index<=0)return;
  const root=getComputedStyle(document.documentElement),base:Record<string,string>={};for(const token of SHELL_TINT_TOKENS)base[token]=root.getPropertyValue(token);
  const values=shellTintValues(base,index);for(const [token,value] of Object.entries(values))main.style.setProperty(token,value);
  return()=>{for(const token of SHELL_TINT_TOKENS)main.style.removeProperty(token);};
 },[index,themeId]);
 return null;
}
