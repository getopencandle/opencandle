import React from 'react';
import type {ChartController} from '../chart/adapter';
import type {Bar} from '../domain/types';
import {chartTimeZone,chartZoneName,formatChartDateTime,type ChartClockHours} from './chart-time-text';
export type Inspection=ReturnType<ChartController['getDataWindow']>;
// The compact readout names its rows as the Data window does (Open, High, Low, Close,
// Vol) and shows the bar time in the chart timezone through the shared chart-time-text formatter, not as a UTC ISO string.
const LEGACY_ROWS=[['open','Open'],['high','High'],['low','Low'],['close','Close'],['volume','Vol']] as const;
export function DataWindow({symbol,snapshot,fallback,transformed,timezone='UTC',timeHours='24'}:{symbol:string;snapshot:Inspection|null;fallback:Bar|undefined;transformed:boolean;timezone?:string;timeHours?:ChartClockHours}){
 const zone=chartTimeZone(timezone);
 const bar=snapshot?.displayed.bar??fallback,hovered=snapshot?.displayed.hovered??false;
 return <section className="data-window" aria-label="Data window"><strong>{symbol} · {hovered?'Crosshair bar':'Last available bar'}</strong>
 {bar?<><span>Time ({chartZoneName(zone)})<b>{formatChartDateTime(bar.time,zone,{hours:timeHours})}</b></span>{LEGACY_ROWS.map(([key,label])=><span key={key}>{label}<b>{Number.isFinite(bar[key])?bar[key].toLocaleString(undefined,{maximumFractionDigits:8}):'Unavailable'}</b></span>)}</>:<p>No bar at this position.</p>}
 {transformed&&<small>Displayed Heikin Ashi values. These are transformed prices.</small>}
 {snapshot?.readout?.groups.map((group,index)=><div className="data-window-group" key={index}><strong>{group.name}</strong>{group.rows.map((row,index)=><span key={index}>{row.label}<b style={{color:row.color}}>{row.value}</b></span>)}</div>)}
 </section>;
}
