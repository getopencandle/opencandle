import {beforeEach,expect,it,vi} from 'vitest';
import {setup,saved,notice,all,text} from '../helpers/alert-dialog-harness';
import * as times from '../../src/ui/alert-time';
import type {AlertClock} from '../../src/ui/alert-time';
const epoch=(value:string)=>Date.parse(value)/1000,ny='America/New_York',first=epoch('2026-11-01T05:30:17Z'),second=epoch('2026-11-01T06:30:17Z');
const actualSystemClock=times.systemAlertClock;
let clock:AlertClock;
beforeEach(()=>{clock={zone:ny,hours:'12'};vi.spyOn(times,'systemAlertClock').mockImplementation(()=>clock);});
/** Independent natural-locale oracle: explicit date/time components include seconds, rather than the ISO display helper. */
const natural=(at:number,value:AlertClock)=>new Intl.DateTimeFormat(undefined,{timeZone:value.zone,year:'numeric',month:'numeric',day:'numeric',hour:'numeric',minute:'numeric',second:'numeric',hourCycle:value.hours==='12'?'h12':'h23'}).format(new Date(at*1000));
function history(){const alert=saved('natural');alert.history=[{...notice('natural',1,first),id:'SYNTHETIC fold first'},{...notice('natural',2,second),id:'SYNTHETIC fold second'}];const latest=alert.history[1];Object.assign(alert,{lastSequence:latest.sequence,lastTime:latest.at,lastValue:latest.value,currentBarId:latest.barId,lastTriggeredAt:latest.at,lastTriggeredBar:latest.barId});const ui=setup([alert]);ui.callButton('History (2)');return{ui,row:(id:string)=>ui.find(node=>node.type==='tr'&&node.props['data-alert-history-id']===id)};}

it('retains the natural current OS-locale timestamp once, with an explicit named zone suffix',()=>{
 const current=actualSystemClock(),label=times.formatAlertAccessibleTime(second,current),original=new Date(second*1000).toLocaleString();
 expect(label).toContain(original);expect(label.split(original)).toHaveLength(2);expect(label).toContain('('+current.zone+', ');
});
it.each(['12','24'] as const)('preserves explicit%s-hour natural seconds without changing visible ISO formatting',hours=>{
 const value:AlertClock={zone:ny,hours},spoken=times.formatAlertAccessibleTime(second,value);
 expect(spoken).toBe(natural(second,value)+' (America/New_York, UTC-5)');
 expect(times.formatAlertTime(second,value)).toBe(hours==='12'?'2026-11-01 1:30:17 AM UTC-5':'2026-11-01 01:30:17 UTC-5');
});
it('distinguishes both autumn-fold occurrences by offset while saying one natural date/time',()=>{
 const a=times.formatAlertAccessibleTime(first,clock),b=times.formatAlertAccessibleTime(second,clock),wall=natural(first,clock);
 expect(natural(second,clock)).toBe(wall);expect(a).toBe(wall+' (America/New_York, UTC-4)');expect(b).toBe(wall+' (America/New_York, UTC-5)');expect(a).not.toBe(b);expect(a.split(wall)).toHaveLength(2);expect(b.split(wall)).toHaveLength(2);
});
it('uses explicit nonhost dates, nonhour offsets and day rollover instead of a hidden default zone',()=>{
 const at=epoch('2026-12-31T15:04:09Z'),value:AlertClock={zone:'Pacific/Kiritimati',hours:'24'},calls=vi.spyOn(Date.prototype,'toLocaleString'),spoken=times.formatAlertAccessibleTime(at,value);
 expect(spoken).toBe(natural(at,value)+' (Pacific/Kiritimati, UTC+14)');expect(times.formatAlertTime(at,value)).toBe('2027-01-01 05:04:09 UTC+14');expect(calls).toHaveBeenCalledWith(undefined,{timeZone:'Pacific/Kiritimati',hourCycle:'h23'});
 const india:AlertClock={zone:'Asia/Kolkata',hours:'12'};expect(times.formatAlertAccessibleTime(second,india)).toBe(natural(second,india)+' (Asia/Kolkata, UTC+5:30)');expect(times.formatAlertTime(second,india)).toBe('2026-11-01 12:00:17 PM UTC+5:30');
});
it('unavailable or missing zones use explicit UTC fallback and never implicit host time',()=>{
 const calls=vi.spyOn(Date.prototype,'toLocaleString');for(const zone of ['Not/AZone','',undefined]){const value={zone,hours:'24'} as AlertClock;expect(times.formatAlertAccessibleTime(second,value)).toBe(natural(second,{zone:'UTC',hours:'24'})+' (UTC, UTC)');}
 expect(calls.mock.calls.every(call=>typeof call[1]?.timeZone==='string'&&call[1].timeZone.length>0)).toBe(true);
});
it('actual History row names use natural spoken time while the visible cells retain the same exact ISO instants',()=>{
 const {ui,row}=history();
 for(const [id,at,visible,offset] of [['SYNTHETIC fold first',first,'2026-11-01 1:30:17 AM UTC-4','UTC-4'],['SYNTHETIC fold second',second,'2026-11-01 1:30:17 AM UTC-5','UTC-5']] as const){const current=row(id),label=String(current.props['aria-label']),spoken=natural(at,clock);
  expect(label).toBe('Recorded alert SYNTHETIC recorded, '+spoken+' (America/New_York, '+offset+'), ordinary');expect(label.split(spoken)).toHaveLength(2);expect(label).not.toContain(visible);expect(text(all(current,node=>node.type==='td')[0])).toBe(visible);
 }
 expect(ui.publish).not.toHaveBeenCalled();expect(ui.request).not.toHaveBeenCalled();
});
it('actual History accessibility and visible date follow a changed OS zone/hour cycle without changing retained events',()=>{
 const {ui,row}=history(),before=structuredClone(ui.props.alerts);clock={zone:'Asia/Kolkata',hours:'24'};ui.settle();const current=row('SYNTHETIC fold second');
 expect(current.props['aria-label']).toBe('Recorded alert SYNTHETIC recorded, '+natural(second,clock)+' (Asia/Kolkata, UTC+5:30), ordinary');expect(text(all(current,node=>node.type==='td')[0])).toBe('2026-11-01 12:00:17 UTC+5:30');expect(ui.props.alerts).toEqual(before);expect(ui.publish).not.toHaveBeenCalled();
});
