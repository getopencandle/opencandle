import {expect,it} from 'vitest';
import {NativeRenderer} from '@luxalgo/vela';
import {commandCanvas} from './chart-paint-harness';
import {installTimeAxisTicks,dateTick} from '../../src/chart/time-axis-ticks';

// Date format and Day of week reach the day ticks of the actual pinned time axis.
// SYNTHETIC times.
function fixture(zone:string,from:number,to:number){
 const renderer=new NativeRenderer(),native=renderer as any,recording=commandCanvas();
 native.scene.showAxisLabels=true;native.scene.timezone=zone;
 const width=800,coords={visibleTimeRange:()=>({from,to}),timeToX:(time:number)=>(time-from)/(to-from)*width};
 const draw=()=>{recording.commands.length=0;native.chrome.drawTimeAxis(recording.ctx,native.scene,coords,{},width,400,428);return recording.commands.filter(row=>row.op==='fillText').map(row=>String(row.values[0]));};
 return{renderer,native,draw};
}
const DAY=86400_000;

it('dateTick resolves the year from the visible range, also across a new year',()=>{
 const range={from:Date.UTC(2026,11,30),to:Date.UTC(2027,0,3)};
 expect(dateTick('Dec 31',range,'UTC',{dayOfWeek:false,dateFormat:'format-10'})).toBe('2026-12-31');
 expect(dateTick('Jan 2',range,'UTC',{dayOfWeek:true,dateFormat:'format-3'})).toBe("Sat 2 Jan '27");
 expect(dateTick('Jan 2',range,'UTC',{dayOfWeek:false,dateFormat:'format-19'})).toBe('01/02/2027');
 for(const label of ['Jan','2027','09:30','Feb 30','Foo 2'])expect(dateTick(label,range,'UTC',{dayOfWeek:false,dateFormat:'format-10'}),label).toBeNull();
});

it('the factory date settings keep the native axis; another date format redraws only the day ticks',()=>{
 const f=fixture('UTC',Date.UTC(2026,9,19),Date.UTC(2026,9,19)+6*DAY),native=f.draw();
 expect(native).toContain('Oct 21');
 const ticks=installTimeAxisTicks(f.renderer);try{
  ticks.setFormat({dayOfWeek:true,dateFormat:'format-3',timeHours:'24'});expect(f.draw()).toEqual(native);
  ticks.setFormat({dayOfWeek:false,dateFormat:'format-10',timeHours:'24'});const iso=f.draw();
  expect(iso).toContain('2026-10-21');expect(iso.some(label=>/^[A-Z][a-z]{2} \d{1,2}$/.test(label))).toBe(false);
  expect(iso.every(label=>/^\d{4}-\d{2}-\d{2}$/.test(label)||native.includes(label))).toBe(true);
  ticks.setFormat({dayOfWeek:true,dateFormat:'format-10',timeHours:'24'});expect(f.draw()).toContain('Wed 2026-10-21');
  expect(ticks.format()).toEqual({dayOfWeek:true,dateFormat:'format-10',timeHours:'24'});expect(ticks.hours()).toBe('24');
  ticks.setFormat({dayOfWeek:true,dateFormat:'format-3',timeHours:'24'});expect(f.draw()).toEqual(native);
 }finally{ticks.dispose();}
});

it('an intraday axis in New York: the midnight date tick takes the format and the hours take 12-hours',()=>{
 const T0=Date.UTC(2026,9,21);
 const f=fixture('America/New_York',T0,T0+12*3600_000),native=f.draw(),ticks=installTimeAxisTicks(f.renderer);try{
  expect(native).toContain('Oct 21');
  ticks.setFormat({dayOfWeek:false,dateFormat:'format-17',timeHours:'12'});const shown=f.draw();
  expect(shown).toContain('21/10/2026');expect(shown).not.toContain('Oct 21');
  expect(shown.filter(label=>label!=='21/10/2026').every(label=>/^(1[0-2]|[1-9]):[0-5]\d (AM|PM)$/.test(label))).toBe(true);
  expect(()=>ticks.setFormat({dayOfWeek:false,dateFormat:'format-99',timeHours:'24'})).toThrow(/Date format/);
  expect(()=>ticks.setFormat({dayOfWeek:'yes' as any,dateFormat:'format-3',timeHours:'24'})).toThrow(/Day of week/);
 }finally{ticks.dispose();}
 expect(f.draw()).toEqual(native);
});
