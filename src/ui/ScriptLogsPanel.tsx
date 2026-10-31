import React,{useEffect,useState} from 'react';
import type {ChartController} from '../chart/adapter';
import {chartTimeZone,chartZoneName,formatChartDateTime,type ChartClockHours} from './chart-time-text';

/**
 * The script log panel (the LV counterpart of a "Pine logs" panel). It lists the ctx.log rows of
 * every script instance on the active chart from their last accepted run, newest last, with the bar time, bar index,
 * level and instance, and filters by level, instance and text. Rows come from the script port, which drops them when
 * the instance is removed or its results are invalidated. Bar times are shown in the chart timezone (the
 * `timezone` prop, else the chart's own timezone option, else UTC); the column
 * header names the zone. 24-hours unless `timeHours` says 12.
 */
export type ScriptLogLevel='info'|'warn'|'error';
export interface ScriptLogSource {id:string;title:string;entries:Array<{time:number;index:number;level:ScriptLogLevel;message:string}>;dropped:number}
export interface ScriptLogFilter {levels:Record<ScriptLogLevel,boolean>;instance:string;text:string}
export interface ScriptLogRow {key:string;instanceId:string;instance:string;time:number;index:number;level:ScriptLogLevel;message:string}
/** Most rows the panel draws at once; the newest are kept (each run already caps its own rows). */
export const SCRIPT_LOG_DISPLAY_LIMIT=2000;
export const defaultScriptLogFilter=():ScriptLogFilter=>({levels:{info:true,warn:true,error:true},instance:'',text:''});
export function scriptLogTime(seconds:number,timezone='UTC',hours:ChartClockHours='24'):string{return formatChartDateTime(seconds,timezone,{hours,seconds:true,zone:false});}
/** Filtered rows in bar-time order (stable per instance), the newest SCRIPT_LOG_DISPLAY_LIMIT, plus counts for the footer. */
export function scriptLogRows(sources:readonly ScriptLogSource[],filter:ScriptLogFilter):{rows:ScriptLogRow[];total:number;shown:number;hidden:number;dropped:number}{
 const text=filter.text.trim().toLowerCase();let total=0,dropped=0;const rows:ScriptLogRow[]=[];
 for(const source of sources){
  total+=source.entries.length;dropped+=source.dropped;
  if(filter.instance&&filter.instance!==source.id)continue;
  source.entries.forEach((entry,index)=>{if(!filter.levels[entry.level])return;if(text&&!entry.message.toLowerCase().includes(text)&&!source.title.toLowerCase().includes(text))return;rows.push({key:source.id+':'+index,instanceId:source.id,instance:source.title,time:entry.time,index:entry.index,level:entry.level,message:entry.message});});
 }
 rows.sort((a,b)=>a.time-b.time);
 const kept=rows.length>SCRIPT_LOG_DISPLAY_LIMIT?rows.slice(rows.length-SCRIPT_LOG_DISPLAY_LIMIT):rows;
 return {rows:kept,total,shown:kept.length,hidden:rows.length-kept.length,dropped};
}
function chartZone(chart:ChartController|null):unknown{try{return typeof chart?.getChartOptions==='function'?chart.getChartOptions().timezone:undefined;}catch{return undefined;}}
function readLogs(chart:ChartController|null):ScriptLogSource[]{try{const port=chart?.scripts as {logs?:()=>ScriptLogSource[]}|undefined;return typeof port?.logs==='function'?port.logs():[];}catch{return [];}}
export function ScriptLogsPanel({chart,timezone,timeHours='24'}:{chart:ChartController|null;timezone?:string;timeHours?:ChartClockHours}){
 const zone=chartTimeZone(timezone??chartZone(chart));
 const [sources,setSources]=useState<ScriptLogSource[]>(()=>readLogs(chart)),[filter,setFilter]=useState<ScriptLogFilter>(defaultScriptLogFilter);
 useEffect(()=>{setSources(readLogs(chart));if(!chart||typeof chart.scripts?.subscribe!=='function')return;const off=chart.scripts.subscribe(()=>setSources(readLogs(chart)));return()=>{off();};},[chart]);
 const view=scriptLogRows(sources,filter),levels:ScriptLogLevel[]=['info','warn','error'];
 return <section className="lv-script-logs" aria-label="Script logs">
  <div className="script-toolbar" role="toolbar" aria-label="Script log filters">
   {levels.map(level=><label key={level}><input type="checkbox" aria-label={'Show '+level+' messages'} checked={filter.levels[level]} onChange={event=>setFilter(current=>({...current,levels:{...current.levels,[level]:event.target.checked}}))}/>{level==='info'?'Info':level==='warn'?'Warning':'Error'}</label>)}
   <select aria-label="Script log instance" value={filter.instance} onChange={event=>setFilter(current=>({...current,instance:event.target.value}))}><option value="">All scripts</option>{sources.map(source=><option key={source.id} value={source.id}>{source.title}</option>)}</select>
   <input aria-label="Filter script logs" placeholder="Filter messages" value={filter.text} onChange={event=>setFilter(current=>({...current,text:event.target.value}))}/>
  </div>
  {view.rows.length?<table className="lv-script-log-table" aria-label="Script log messages"><thead><tr><th scope="col">Bar time ({chartZoneName(zone)})</th><th scope="col">Bar</th><th scope="col">Level</th><th scope="col">Script</th><th scope="col">Message</th></tr></thead>
   <tbody>{view.rows.map(row=><tr key={row.key} data-level={row.level}><td>{scriptLogTime(row.time,zone,timeHours)}</td><td>{row.index}</td><td>{row.level==='info'?'Info':row.level==='warn'?'Warning':'Error'}</td><td>{row.instance}</td><td>{row.message}</td></tr>)}</tbody></table>
   :<p className="help">{view.total?'No messages match these filters.':'No log messages yet. Call ctx.log.info, ctx.log.warn or ctx.log.error in onBar; messages from the last run of each script on this chart appear here.'}</p>}
  <p className="help" role="status">{view.shown} of {view.total} messages shown{view.hidden?', '+view.hidden+' older matching messages not drawn':''}{view.dropped?'. '+view.dropped+' further messages were not kept (1,000 per run).':'.'}</p>
 </section>;
}
