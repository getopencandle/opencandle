import React,{useState} from 'react';
import {Modal} from './Modal';
import {chartDateTimeInputValue,chartZoneName,parseChartDateTimeInput} from './chart-time-text';
export function utcDateInput(value:string):number{
 if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value))throw new Error('Choose a valid UTC date and time.');
 const milliseconds=Date.parse(value+':00Z');
 if(!Number.isFinite(milliseconds)||new Date(milliseconds).toISOString().slice(0,16)!==value)throw new Error('That date or time does not exist.');
 return milliseconds/1000;
}
/** A datetime-local value read in the chart timezone (chart-time-text.ts; UTC is utcDateInput). */
export function zonedDateInput(value:string,timezone:string):number{
 return timezone==='UTC'?utcDateInput(value):parseChartDateTimeInput(value,timezone);
}
/** Go to date. The date and time are typed and shown in the chart timezone (`timezone`, a resolved IANA zone;
 * UTC when absent). Separate date and time fields, padded body. */
export function DateNavigationDialog({time,timezone='UTC',onGo,onClose}:{time:number;timezone?:string;onGo:(seconds:number)=>void;onClose:()=>void}){
 const zoneName=chartZoneName(timezone),zoneLabel=zoneName==='UTC'?'UTC':`${zoneName} time`;
 const [value,setValue]=useState(()=>chartDateTimeInputValue(time,timezone)),[error,setError]=useState('');
 const [date='',clock='']=value.split('T');
 const field:React.CSSProperties={display:'flex',flexDirection:'column',gap:6,fontSize:13,color:'var(--lv-text-secondary)'};
 const input:React.CSSProperties={width:'100%',boxSizing:'border-box',minHeight:34,fontSize:14};
 return <Modal title="Go to date" onClose={onClose}><form onSubmit={e=>{e.preventDefault();try{onGo(zonedDateInput(value,timezone));onClose();}catch(e){setError(e instanceof Error?e.message:String(e));}}}>
 <div style={{padding:'16px 20px',display:'flex',flexDirection:'column',gap:12}}>
  <div style={{display:'grid',gridTemplateColumns:'minmax(0,3fr) minmax(0,2fr)',gap:12}}>
   <label style={field}>Date<input style={input} aria-label={`Go to date in ${zoneLabel}`} type="date" required value={date} onChange={e=>{setValue(`${e.target.value}T${clock||'00:00'}`);setError('');}}/></label>
   <label style={field}>Time ({zoneName})<input style={input} aria-label={`Go to time in ${zoneLabel}`} type="time" required value={clock} onChange={e=>{setValue(`${date}T${e.target.value||'00:00'}`);setError('');}}/></label>
  </div>
  <p className="help" style={{margin:0}}>Centers this time on the chart at the current zoom.</p>
 </div>
 <footer><span role="alert">{error}</span><button type="button" onClick={onClose}>Cancel</button><button type="submit" className="primary">Go</button></footer></form></Modal>;
}
