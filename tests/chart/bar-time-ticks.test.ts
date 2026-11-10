import {expect,it} from 'vitest';
import {NativeRenderer} from '@luxalgo/vela';
import {commandCanvas} from './chart-paint-harness';
import {barTimeTicks,boundaryRank} from '../../src/chart/bar-time-ticks';
import {installTimeAxisTicks} from '../../src/chart/time-axis-ticks';

// Time ticks placed on the bars, not on clock time. SYNTHETIC bar times.
const MIN=60_000,HOUR=60*MIN,DAY=24*HOUR;
/** Regular-session 1-minute bars (09:30-15:59 wall clock, stored as UTC) for the given weekdays. */
function sessions(days:readonly number[]):number[]{const out:number[]=[];for(const day of days)for(let m=570;m<960;m++)out.push(day+m*MIN);return out;}
const NOV9=Date.UTC(2026,10,9),NOV10=Date.UTC(2026,10,10),FRI=Date.UTC(2026,10,6);
const run=(times:readonly number[],interval:number,minBars:number,from=0,to=times.length-1)=>barTimeTicks({from,to,intervalMs:interval,minBars,offsetAt:()=>0,
 timeAt:i=>i<0?times[0]+i*interval:i>=times.length?times[times.length-1]+(i-times.length+1)*interval:times[i]})!;

it('a 1-minute stock chart across an overnight gap gets evenly spread times and one date tick, never a pile',()=>{
 const times=sessions([NOV9,NOV10]),ticks=run(times,MIN,30);
 expect(ticks.filter(t=>t.label==='Nov 10')).toHaveLength(1);
 expect(ticks.find(t=>t.label==='Nov 10')!.logical).toBe(390); // the first bar of the day, 09:30
 const labels=ticks.map(t=>t.label);
 for(const hour of ['10:00','11:00','12:00','13:00','14:00','15:00'])expect(labels.filter(l=>l===hour),hour).toHaveLength(2);
 for(let i=1;i<ticks.length;i++)expect(ticks[i].logical-ticks[i-1].logical).toBeGreaterThanOrEqual(30);
 // No tick sits in the gap: every tick is a real bar time.
 for(const tick of ticks)expect(times[tick.logical]).toBe(tick.time);
});

it('a weekend gap is one date tick too, and a tighter zoom shows finer times',()=>{
 const times=sessions([FRI,NOV9]),wide=run(times,MIN,60),fine=run(times,MIN,15,380,470);
 expect(wide.filter(t=>/^Nov/.test(t.label)).map(t=>t.label)).toEqual(['Nov 9']);
 expect(fine.map(t=>t.label)).toEqual(['Nov 9','09:45','10:00','10:15','10:30','10:45']);
});

it('the day tick pushes a crowded neighbour away instead of stacking beside it',()=>{
 const ticks=run(sessions([NOV9,NOV10]),MIN,45),at=ticks.map(t=>t.logical);
 expect(at).toContain(390);expect(at).not.toContain(420); // 10:00 is 30 bars after the open: dropped
 expect(ticks.find(t=>t.logical===390)!.weight).toBeGreaterThan(ticks.find(t=>t.label==='11:00')!.weight);
});

it('seconds charts label seconds; thin data never yields more ticks than fit',()=>{
 const five=Array.from({length:600},(_,i)=>NOV10+14*HOUR+i*5000),ticks=run(five,5000,24);
 expect(ticks.length).toBeGreaterThan(5);for(const tick of ticks)expect(tick.label).toMatch(/^\d{2}:\d{2}:\d{2}$/);
 expect(ticks.map(t=>t.label)).toContain('14:10:00');
 const thin=Array.from({length:300},(_,i)=>NOV9+i*47*MIN),sparse=run(thin,MIN,20);
 for(let i=1;i<sparse.length;i++)expect(sparse[i].logical-sparse[i-1].logical).toBeGreaterThanOrEqual(20);
});

it('daily, weekly and monthly bars tick on months and round years',()=>{
 const daily:number[]=[];for(let t=Date.UTC(2025,10,10);t<=NOV10;t+=DAY){const wd=new Date(t).getUTCDay();if(wd!==0&&wd!==6)daily.push(t);}
 const year=run(daily,DAY,12).map(t=>t.label);
 expect(year).toContain('2026');for(const month of ['Dec','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov'])expect(year,month).toContain(month);
 const zoomed=run(daily,DAY,4,daily.length-40,daily.length-1);
 expect(zoomed.map(t=>t.label)).toContain('Nov');expect(zoomed.some(t=>/^(Oct|Nov) \d+$/.test(t.label))).toBe(true);
 for(const tick of zoomed.filter(t=>t.weight===14))expect(new Date(tick.time).getUTCDay()).toBe(1); // week ticks are Mondays
 const monthly=Array.from({length:480},(_,i)=>Date.UTC(1987+Math.floor(i/12),i%12,1)),decades=run(monthly,30*DAY,50).map(t=>t.label);
 expect(decades).toEqual(['1990','1995','2000','2005','2010','2015','2020','2025']);
});

it('ranks boundaries and refuses input that is not a bar axis',()=>{
 expect(boundaryRank(NOV10+9*HOUR+59*MIN,NOV10+10*HOUR)).toBe(9);expect(boundaryRank(NOV10+10*HOUR,NOV10+10*HOUR+MIN)).toBe(5);
 expect(boundaryRank(NOV10+10*HOUR,NOV10+10*HOUR+500)).toBe(0);expect(boundaryRank(NOV9+20*HOUR,NOV10+4*HOUR)).toBe(13);
 expect(boundaryRank(Date.UTC(2026,10,6),NOV9)).toBe(14);expect(boundaryRank(Date.UTC(2026,9,30),Date.UTC(2026,10,2))).toBe(15);
 expect(boundaryRank(Date.UTC(2026,11,31),Date.UTC(2027,0,4))).toBe(18);expect(boundaryRank(Date.UTC(2029,11,31),Date.UTC(2030,0,2))).toBe(21);
 const base={from:0,to:10,timeAt:(i:number)=>i*MIN,offsetAt:()=>0,intervalMs:MIN,minBars:5};
 expect(barTimeTicks({...base,intervalMs:0})).toBeNull();expect(barTimeTicks({...base,to:0})).toBeNull();expect(barTimeTicks({...base,from:NaN})).toBeNull();
 expect(barTimeTicks({...base,to:1e9})).toBeNull();expect(barTimeTicks({...base,from:0.2,to:0.8})).toEqual([]);
 expect(barTimeTicks({...base,timeAt:()=>NaN})).toEqual([]);
});

// The installed seam on the actual pinned renderer: labels and vertical grid lines share the bar ticks.
function chart(times:readonly number[],zone='UTC'){
 const renderer=new NativeRenderer(),native=renderer as any,axis=commandCanvas(),grid=commandCanvas(),width=1200,pitch=width/times.length;
 native.scene.showAxisLabels=true;native.scene.timezone=zone;native.coords.setBars(times);
 const coords=new Proxy(native.coords,{get(target,key){
  if(key==='logicalToX')return(i:number)=>(i+0.5)*pitch;if(key==='xToLogical')return(x:number)=>x/pitch-0.5;
  if(key==='visibleLogicalRange')return()=>({from:-0.5,to:times.length-0.5});if(key==='timeToX')return(ms:number)=>(target.timeToLogical(ms)+0.5)*pitch;
  if(key==='visibleTimeRange')return()=>({from:target.logicalToTime(-0.5),to:target.logicalToTime(times.length-0.5)});
  if(key==='width')return width;if(key==='height')return 400;
  const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;}});
 const labels=()=>{axis.commands.length=0;native.chrome.drawTimeAxis(axis.ctx,native.scene,coords,{},width,400,428);return axis.commands.filter(row=>row.op==='fillText').map(row=>({text:String(row.values[0]),x:Number(row.values[1])}));};
 const lines=()=>{grid.commands.length=0;native.backdropRenderer.drawGrid(grid.ctx,native.scene,coords,{gridColor:'#333333'},width,1);return grid.commands.filter(row=>row.op==='moveTo'&&Number(row.values[1])===0).map(row=>Number(row.values[0]));};
 return{renderer,native,labels,lines,axis,grid};
}

it('the installed axis and grid draw the same bar ticks; the native pile at the day boundary is gone',()=>{
 const f=chart(sessions([NOV9,NOV10])),nativeLines=f.lines(),nativeLabels=f.labels();
 // The defect: the renderer's own ticks put several grid lines inside the one-bar overnight gap.
 const gapX=1200*390/780,piled=nativeLines.filter(x=>Math.abs(x-gapX)<=3);expect(piled.length).toBeGreaterThan(1);
 expect(nativeLabels.filter(l=>/^\d{2}:\d{2}$/.test(l.text)).length).toBeLessThan(4);
 const ticks=installTimeAxisTicks(f.renderer);try{
  const lines=f.lines(),labels=f.labels();
  expect(lines.length).toBeGreaterThanOrEqual(10);for(let i=1;i<lines.length;i++)expect(lines[i]-lines[i-1]).toBeGreaterThanOrEqual(79);
  expect(labels.filter(l=>l.text==='Nov 10')).toHaveLength(1);expect(labels.filter(l=>/^\d{2}:\d{2}$/.test(l.text)).length).toBeGreaterThanOrEqual(8);
  for(const label of labels)expect(lines.some(x=>Math.abs(x-label.x)<=1),label.text).toBe(true); // every label sits on a grid line
  ticks.set('12');expect(f.labels().some(l=>/^(1[0-2]|[1-9]):[0-5]\d (AM|PM)$/.test(l.text))).toBe(true);ticks.set('24');
  expect(f.grid.ctx.globalAlpha).toBe(1);expect(f.axis.ctx.textAlign).toBe('start');
  // Vertical grid lines off, or the whole grid off, draws none; labels off draws none.
  f.native.scene.style.gridVert={...f.native.scene.style.gridVert,visible:false};expect(f.lines()).toEqual([]);
  f.native.scene.style.gridVert={...f.native.scene.style.gridVert,visible:true};f.native.scene.showAxisLabels=false;expect(f.labels()).toEqual([]);f.native.scene.showAxisLabels=true;
 }finally{ticks.dispose();}
 expect(Object.hasOwn(f.native.chrome,'drawTimeAxis')).toBe(false);expect(Object.hasOwn(f.native.backdropRenderer,'drawGrid')).toBe(false);
 expect(f.lines()).toEqual(nativeLines);expect(f.labels()).toEqual(nativeLabels);
});

it('an exchange zone reads the wall clock, across a daylight-saving change too',()=>{
 // New York: Fri Oct 30 2026 is EDT (UTC-4), Mon Nov 2 is EST (UTC-5). 09:30 local each day.
 const day=(utcOpen:number)=>Array.from({length:390},(_,i)=>utcOpen+i*MIN),times=[...day(Date.UTC(2026,9,30,13,30)),...day(Date.UTC(2026,10,2,14,30))];
 const f=chart(times,'America/New_York'),ticks=installTimeAxisTicks(f.renderer);try{
  const labels=f.labels().map(l=>l.text);
  expect(labels).toContain('Nov 2');expect(labels.filter(l=>l==='12:00')).toHaveLength(2);expect(labels).not.toContain('13:30');
 }finally{ticks.dispose();}
});

it('daily and monthly bars stamped at UTC midnight keep their own date in a zone west of UTC',()=>{
 const daily:number[]=[];for(let t=Date.UTC(2026,8,1);t<=NOV10;t+=DAY){const wd=new Date(t).getUTCDay();if(wd!==0&&wd!==6)daily.push(t);}
 const f=chart(daily,'America/New_York'),ticks=installTimeAxisTicks(f.renderer);try{
  const labels=f.labels(),pitch=1200/daily.length,at=(text:string)=>daily[Math.round(labels.find(l=>l.text===text)!.x/pitch-0.5)];
  expect(at('Oct')).toBe(Date.UTC(2026,9,1));expect(at('Nov')).toBe(Date.UTC(2026,10,2)); // the first bar of each month, not the last of the month before
  for(const label of labels.filter(l=>/^[A-Z][a-z]{2} \d+$/.test(l.text))){const bar=new Date(at(label.text));expect(label.text).toBe(`${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][bar.getUTCMonth()]} ${bar.getUTCDate()}`);}
 }finally{ticks.dispose();}
});

it('an empty chart, a single bar and a second install leave the renderer usable',()=>{
 for(const times of [[],[NOV10]]){const f=chart(times.length?times:[NOV10]),ticks=installTimeAxisTicks(f.renderer);try{if(!times.length)f.native.coords.setBars([]);expect(()=>{f.labels();f.lines();}).not.toThrow();}finally{ticks.dispose();}}
 const f=chart(sessions([NOV10])),ticks=installTimeAxisTicks(f.renderer);
 expect(()=>installTimeAxisTicks(f.renderer)).toThrow(/already/);expect(f.lines().length).toBeGreaterThan(3);
 ticks.dispose();expect(Object.hasOwn(f.native.backdropRenderer,'drawGrid')).toBe(false);
 const again=installTimeAxisTicks(f.renderer);expect(f.lines().length).toBeGreaterThan(3);again.dispose();
});
