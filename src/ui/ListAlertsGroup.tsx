// ListAlertsGroup, mounted in the docked Alerts panel.
// Renders the list alerts in their own group inside the alert manager (name, list, per-symbol state counts). Presentational.
import React from 'react';
import type {WatchBook} from '../watchlists/model';
import {listAlertSummary,type ListAlert} from '../domain/watchlist-alerts';

export interface ListAlertsGroupProps {alerts:readonly ListAlert[];book:WatchBook;onPause?:(id:string,paused:boolean)=>void;onRemove?:(id:string)=>void;/** Restart a completed, expired or stopped list alert. */onRestart?:(id:string)=>void;/** Open the alert in its dialog to change it in place. */onEdit?:(id:string)=>void}
export function ListAlertsGroup(props:ListAlertsGroupProps){
 if(!props.alerts.length)return null;
 return <section aria-label="List alerts" className="list-alerts-group"><h3>List alerts</h3>
  {props.alerts.map(alert=>{const row=listAlertSummary(alert,props.book);return <article key={alert.id} className="alert-row list-alert-row" aria-label={'List alert '+row.name+', list '+row.listName+', '+row.status+', '+row.waiting+' waiting, '+row.active+' running, '+row.triggered+' triggered'}>
   <strong>{row.name}</strong>
   <p>{row.listName}: {row.total} symbols, {row.waiting} waiting for data, {row.active} running, {row.triggered} triggered. {row.statusReason??''}</p>
   <details><summary>Symbols ({alert.members.length})</summary><ul>{alert.members.map(member=><li key={member.key}>{member.key}: {member.status==='waiting-for-data'?'waiting for data. '+member.reason:member.status==='triggered'?'triggered':'running'}{member.triggers>0&&member.status!=='triggered'?' ('+member.triggers+' triggers)':''}</li>)}</ul></details>
   <div className="button-row">{props.onEdit&&<button type="button" aria-label={'Edit list alert '+row.name} onClick={()=>props.onEdit!(alert.id)}>Edit</button>}{props.onPause&&['active','paused'].includes(row.status)&&<button type="button" onClick={()=>props.onPause!(alert.id,row.status==='active')}>{row.status==='active'?'Pause':'Resume'}</button>}{props.onRestart&&['completed','expired','stopped'].includes(row.status)&&<button type="button" aria-label={'Restart list alert '+row.name} onClick={()=>props.onRestart!(alert.id)}>{row.status==='expired'?'Restart open-ended':'Restart'}</button>}{props.onRemove&&<button type="button" onClick={()=>props.onRemove!(alert.id)}>Remove</button>}</div>
  </article>;})}
 </section>;
}
