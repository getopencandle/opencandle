import React,{useEffect,useState} from 'react';
import type {ChartController} from '../chart/adapter';
import {priceScaleToolbarButtons,type PriceScaleToolbarButton} from '../chart/price-scale-menu';
import {DEFAULT_PANE_SCALE} from '../chart/price-scale-state';

/** Bottom-toolbar %, log and auto toggles for the active chart's main price scale.
 * Not mounted: the default bottom bar does not show these buttons. */
export function PriceScaleToolbar({chart,onMessage}:{chart:ChartController|null;onMessage?:(message:string)=>void}){
 const [,setRevision]=useState(0);
 useEffect(()=>{if(!chart)return;try{return chart.priceScale.subscribe(()=>setRevision(value=>value+1));}catch{return undefined;}},[chart]);
 let buttons:PriceScaleToolbarButton[];
 try{buttons=chart?chart.priceScale.toolbar():priceScaleToolbarButtons({paneId:'price',kind:'price',...DEFAULT_PANE_SCALE});}
 catch{buttons=priceScaleToolbarButtons({paneId:'price',kind:'price',...DEFAULT_PANE_SCALE});}
 const press=(row:PriceScaleToolbarButton)=>{if(!chart)return;const result=chart.priceScale.execute(row.id,{origin:'toolbar'});if(!result.ok&&result.message)onMessage?.(result.message);setRevision(value=>value+1);};
 return <div className="lv-price-scale-toolbar" role="group" aria-label="Price scale toggles" style={{display:'inline-flex',gap:2,marginLeft:'auto'}}>
  {buttons.map(row=><button key={row.id} type="button" data-name={row.dataName} data-lv-fact={row.factId} aria-label={row.tooltip} title={row.tooltip} aria-pressed={row.pressed} className={row.pressed?'active':undefined} disabled={!chart} onClick={()=>press(row)}>{row.text}</button>)}
 </div>;
}
