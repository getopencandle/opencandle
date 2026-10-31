import {expect,it} from 'vitest';
import {NativeRenderer} from '@luxalgo/vela';
import {commandCanvas} from './chart-paint-harness';
import {installTimeAxisTicks,twelveHourTick} from '../../src/chart/time-axis-ticks';
import {formatTimeOfDay} from '../../src/chart/time-axis-format';

// Scales.timeHoursFormat on the time-axis tick labels of the actual pinned renderer. SYNTHETIC times.
const T0=Date.UTC(2026,9,21,0,0);
function fixture(zone='UTC',fromHour=8,toHour=20){
 const renderer=new NativeRenderer(),native=renderer as any,recording=commandCanvas();
 native.scene.showAxisLabels=true;native.scene.timezone=zone;
 const from=T0+fromHour*3600_000,to=T0+toHour*3600_000,width=800;
 const coords={visibleTimeRange:()=>({from,to}),timeToX:(time:number)=>(time-from)/(to-from)*width};
 const draw=()=>{recording.commands.length=0;native.chrome.drawTimeAxis(recording.ctx,native.scene,coords,{},width,400,428);return recording.commands.filter(row=>row.op==='fillText').map(row=>String(row.values[0]));};
 return{renderer,native,recording,draw};
}

it('12-hour tick text follows the crosshair label pattern; dates, months and years pass through',()=>{
 for(let minute=0;minute<24*60;minute+=7){const ms=T0+minute*60_000;expect(twelveHourTick(formatTimeOfDay(ms,'UTC','24')!)).toBe(formatTimeOfDay(ms,'UTC','12'));}
 expect(twelveHourTick('00:00')).toBe('12:00 AM');expect(twelveHourTick('12:30')).toBe('12:30 PM');expect(twelveHourTick('09:05')).toBe('9:05 AM');
 for(const label of ['Oct 21','Oct','2026','24:00','9:30','12:60','x12:00','12:00 '])expect(twelveHourTick(label),label).toBeNull();
});

it('the actual pinned time axis draws 24-hour ticks natively and 12-hour ticks while installed and set to 12',()=>{
 const f=fixture(),native=f.draw();expect(native.length).toBeGreaterThan(2);expect(native.every(label=>/^\d{2}:\d{2}$/.test(label))).toBe(true);
 const ticks=installTimeAxisTicks(f.renderer);try{
  expect(ticks.hours()).toBe('24');expect(f.draw()).toEqual(native);
  ticks.set('12');const twelve=f.draw();expect(twelve.length).toBeGreaterThan(0);
  for(const label of twelve)expect(label).toMatch(/^(1[0-2]|[1-9]):[0-5]\d (AM|PM)$/);
  expect(twelve.every(label=>native.map(twelveHourTick).includes(label))).toBe(true);
  // The renderer spaces ticks with the measured width of the text it draws, so the wider 12-hour text never overlaps.
  const xs=f.recording.commands.filter(row=>row.op==='fillText').map(row=>({x:Number(row.values[1]),half:String(row.values[0]).length*3})).sort((a,b)=>a.x-b.x);
  for(let i=1;i<xs.length;i++)expect(xs[i].x-xs[i].half).toBeGreaterThanOrEqual(xs[i-1].x+xs[i-1].half+12);
  // State set on the canvas through the wrapper reaches the real canvas.
  expect(f.recording.ctx.textAlign).toBe('start');
  ticks.set('24');expect(f.draw()).toEqual(native);
 }finally{ticks.dispose();}
 expect(Object.hasOwn(f.native.chrome,'drawTimeAxis')).toBe(false);expect(()=>ticks.set('12')).toThrow(/retired/);expect(f.draw()).toEqual(native);
});

it('a day boundary keeps its date tick and an exchange zone keeps its wall clock',()=>{
 const f=fixture('America/New_York',0,12),ticks=installTimeAxisTicks(f.renderer);try{
  const native=(ticks.set('24'),f.draw());ticks.set('12');const twelve=f.draw();
  expect(native).toContain('Oct 21');expect(twelve).toContain('Oct 21'); // New York midnight (04:00 UTC) is the date tick
  expect(twelve.filter(label=>/(AM|PM)$/.test(label))).toEqual(native.filter(label=>/^\d{2}:\d{2}$/.test(label)).map(label=>twelveHourTick(label)!).filter(label=>twelve.includes(label)));
  expect(twelve.some(label=>/PM$/.test(label))).toBe(true); // 20:00-23:59 New York
  expect(twelve.filter(label=>!/(AM|PM)$/.test(label))).toEqual(native.filter(label=>!/^\d{2}:\d{2}$/.test(label)));
 }finally{ticks.dispose();}
});

it('refuses a second owner, bad input and a foreign replacement, and never breaks the native axis',()=>{
 const f=fixture(),ticks=installTimeAxisTicks(f.renderer);
 expect(()=>installTimeAxisTicks(f.renderer)).toThrow(/already/);
 expect(()=>ticks.set('13' as any)).toThrow(/12 or 24/);expect(ticks.hours()).toBe('24');
 const ours=f.native.chrome.drawTimeAxis;f.native.chrome.drawTimeAxis=function(){return ours.apply(this,arguments as any);};
 expect(()=>ticks.dispose()).toThrow(/foreign/);delete f.native.chrome.drawTimeAxis;
 expect(()=>installTimeAxisTicks({} as any)).toThrow(/time axis/);
});
