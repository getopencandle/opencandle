// Hand-checked oracles for Anchored VWAP, Session VWAPs, Opening range breakout and Relative volume. All bars are SYNTHETIC
// fixtures made up for these tests (no market data); expected values are worked out in the comments from the definitions.
import {describe,expect,it} from 'vitest';
import {calculateIndicator,type IndicatorCalculationOptions} from '../../src/domain/indicators';
import {catalogDefinition,ALL_CATALOG_INDICATOR_IDS} from '../../src/domain/indicator-catalog';
import {VWAP_SESSION_INDICATOR_IDS,AVWAP_UNANCHORED_MESSAGE,anchorInstant,anchorTextAt,anchoredVwapIndex} from '../../src/domain/indicators-ext/vwap-session-catalog';
import {createIncrementalIndicatorSession} from '../../src/domain/indicator-incremental';
import {legendMoreMenu} from '../../src/chart/legend-model';
import {TRADING_SESSION_DEFAULT_WINDOWS} from '../../src/domain/indicators-ext/trading-sessions-catalog';
import {indicatorAlertBlock} from '../../src/domain/indicator-alertability';
import {INDICATOR_KINDS,defaultIndicatorPresentation,indicatorDefaults,type IndicatorInstanceSettings} from '../../src/chart/indicator-settings';
import {renderIndicatorPresentation} from '../../src/chart/indicator-presentation';
import {filterIndicatorCatalog} from '../../src/ui/indicator-dialog-model';
import {BARS} from '../reference/harness';
import type {Bar} from '../../src/domain/types';

const DAY=86400,N=null;
const at=(iso:string)=>Date.parse(iso)/1000;
const flat=(time:number,price:number,volume=1):Bar=>({time,open:price,high:price,low:price,close:price,volume});
type Options=IndicatorCalculationOptions;
const run=(kind:string,bars:readonly Bar[],inputs:Record<string,unknown>={},options:Options={})=>calculateIndicator(kind,bars,inputs as never,options);
const values=(result:ReturnType<typeof run>,id:string)=>result.series.find(row=>row.id===id)!.values;
const settings=(kind:string,inputs:Record<string,unknown>={}):IndicatorInstanceSettings=>({id:'a1',kind:kind as never,inputs:{...(indicatorDefaults as Record<string,Record<string,unknown>>)[kind],...inputs} as never,plots:{},offset:0,visible:true,presentation:defaultIndicatorPresentation(kind as never)});
const byTime=(bars:readonly Bar[],result:ReturnType<typeof run>,id:string)=>(iso:string)=>values(result,id)[bars.findIndex(bar=>bar.time===at(iso))];
/** Every prefix bars[0..t] gives the same values as the full series on bars 0..t (no look-ahead, no repaint). */
function expectCausal(kind:string,bars:readonly Bar[],inputs:Record<string,unknown>,options:Options){
 const full=run(kind,bars,inputs,options);expect(full.series.length,kind).toBeGreaterThan(0);
 for(let t=0;t<bars.length;t++){const prefix=run(kind,bars.slice(0,t+1),inputs,options);
  for(const row of prefix.series){const reference=values(full,row.id);for(let s=0;s<=t;s++)expect(row.values[s],`${kind}.${row.id} prefix ${t} bar ${s}`).toBe(reference[s]);}}
}
/** 30-minute bars from 2024-11-01 00:00 UTC (Friday) for four days, across the 2024-11-03 New York DST change; price = bar index. */
const halfHours=Array.from({length:4*48},(_,i)=>flat(at('2024-11-01T00:00:00Z')+i*1800,i));
/** Weekday daily bars from Monday 2024-01-01 (00:00 UTC). */
const weekdays=Array.from({length:14},(_,k)=>at('2024-01-01T00:00:00Z')+k*DAY).filter(time=>![0,6].includes(new Date(time*1000).getUTCDay()));

describe('catalog shape (SYNTHETIC)',()=>{
 it('the four kinds are registered with provenance, OpenCandle-defined unknowns and alert operands',()=>{
  expect([...VWAP_SESSION_INDICATOR_IDS]).toEqual(['avwap','sessionvwap','orb','relvolume']);
  for(const kind of VWAP_SESSION_INDICATOR_IDS){
   const definition=catalogDefinition(kind)!;expect(definition,kind).toBeDefined();expect(ALL_CATALOG_INDICATOR_IDS).toContain(kind);expect(INDICATOR_KINDS).toContain(kind);
   expect(definition.overlay).toBe(kind!=='relvolume');expect(definition.provenance.length).toBeGreaterThan(0);expect(definition.unknownDefaults!.join(' ')).toMatch(/OpenCandle-defined/);
   expect(indicatorAlertBlock(kind),kind).toBeNull();
   const visible=[definition.name,definition.acronym,...definition.plots.map(row=>row.label),...definition.inputs.map(row=>row.title),...definition.policies,...definition.unknownDefaults!].join(' ');
   expect(visible).not.toMatch(/—|TradingView/);
  }
  expect(catalogDefinition('avwap')!.name).toBe('Anchored VWAP');expect(catalogDefinition('orb')!.name).toBe('Opening range breakout');
 });
 it('search finds each kind by its common names',()=>{
  const catalog=[...INDICATOR_KINDS];
  for(const [query,kind] of [['anchored vwap','avwap'],['AVWAP','avwap'],['session vwap','sessionvwap'],['London','sessionvwap'],['ORB','orb'],['opening range','orb'],['Crabel','orb'],['RVOL','relvolume'],['relative volume','relvolume']])
   expect(filterIndicatorCatalog(catalog,'All',[],query).rows,query).toContain(kind);
 });
});

describe('Anchored VWAP (SYNTHETIC)',()=>{
 const days=weekdays.slice(0,4).map((time,i)=>flat(time,[10,12,11,13][i],[100,300,0,200][i]));
 it('anchored on the first bar: VWAP and the 1 SD band by hand',()=>{
  const result=run('avwap',days,{anchor:'2024-01-01'},{resolution:'1D',calendar:'utc'});expect(result.diagnostics).toEqual([]);
  // VWAP: 10; (1000 + 3600) / 400 = 11.5; zero volume keeps 11.5; (4600 + 2600) / 600 = 12.
  expect(values(result,'vwap')).toEqual([10,11.5,11.5,12]);
  // Bar 1 deviation: sqrt((100 x 1.5^2 + 300 x 0.5^2) / 400) = sqrt(0.75).
  expect(values(result,'upper1')[1]).toBeCloseTo(11.5+Math.sqrt(0.75),12);expect(values(result,'lower1')[1]).toBeCloseTo(11.5-Math.sqrt(0.75),12);
  expect(values(result,'upper1')[0]).toBe(10);// one bar: zero deviation
  for(const id of ['upper2','lower2','upper3','lower3'])expect(values(result,id).every(value=>value===null),id).toBe(true);// bands 2 and 3 off
 });
 it('Percentage bands are VWAP +/- |VWAP| x multiplier / 100',()=>{
  const result=run('avwap',days,{anchor:'2024-01-01',bandMode:'Percentage',band2Enabled:true},{resolution:'1D',calendar:'utc'});
  expect(values(result,'upper1')[3]).toBeCloseTo(12.12,12);expect(values(result,'lower2')[3]).toBeCloseTo(11.76,12);
 });
 it('the anchor bar holds the anchor instant, or is the first bar after a gap; earlier bars are unavailable',()=>{
  const bars=weekdays.map((time,i)=>flat(time,100+i));
  const vwapOf=(anchor:string,calendar:'utc'|'us-equity'='utc')=>values(run('avwap',bars,{anchor},{resolution:'1D',calendar}),'vwap');
  expect(vwapOf('2024-01-03').slice(0,4)).toEqual([N,N,102,102.5]);
  // 15:00 New York on 3 January lies inside the 3 January 00:00 UTC daily bar.
  expect(vwapOf('2024-01-03 15:00','us-equity').slice(0,3)).toEqual([N,N,102]);
  // Saturday 6 January falls in the weekend gap: Monday 8 January (bar 5) is the anchor bar.
  expect(vwapOf('2024-01-06').slice(4,7)).toEqual([N,105,105.5]);
  expect(vwapOf('2030-01-01').every(value=>value===null)).toBe(true);// after the last bar: nothing yet
  expect(run('avwap',bars,{anchor:'3 Jan'},{resolution:'1D'}).diagnostics[0]).toMatch(/YYYY-MM-DD/);
 });
 it('intraday anchors read the New York clock across the DST change',()=>{
  expect(anchorInstant('2024-11-01 09:30','America/New_York')).toBe(at('2024-11-01T13:30:00Z'));
  expect(anchorInstant('2024-11-04 09:30','America/New_York')).toBe(at('2024-11-04T14:30:00Z'));
  const result=run('avwap',halfHours,{anchor:'2024-11-04 09:30'},{resolution:'30m',calendar:'us-equity'}),value=byTime(halfHours,result,'vwap');
  expect(value('2024-11-04T14:00:00Z')).toBeNull();expect(value('2024-11-04T14:30:00Z')).toBe(173);expect(value('2024-11-04T15:00:00Z')).toBe(173.5);
 });
 it('anchored at the UTC day open it equals the VWAP built-in session values on the crypto fixture',()=>{
  const bars=BARS.crypto1h,options={resolution:'60m',calendar:'utc' as const};
  const anchored=values(run('avwap',bars,{anchor:'2024-03-10'},options),'vwap'),session=values(run('vwap',bars,{anchor:'Session',timezone:'UTC',source:'hlc3'},options),'vwap');
  const day=bars.map((bar,i)=>[i,new Date(bar.time*1000).toISOString().slice(0,10)] as const).filter(([,date])=>date==='2024-03-10').map(([i])=>i);
  expect(day.length).toBe(24);for(const i of day)expect(anchored[i],'bar '+i).toBe(session[i]);
 });
 it('a bar with missing volume is a gap at that bar only',()=>{
  const bars=days.map((bar,i)=>i===1?{...bar,volume:NaN}:bar);
  // Bar 1 is skipped: 10; gap; (1000 + 0) / 100 = 10; (1000 + 2600) / 300 = 12.
  expect(values(run('avwap',bars,{anchor:'2024-01-01'},{resolution:'1D'}),'vwap')).toEqual([10,N,10,12]);
 });
});

describe('Anchored VWAP placement and stability (SYNTHETIC)',()=>{
 /** 1-minute bars from 2024-11-04 13:00 UTC; price and volume vary with the index so every bar moves the sums. */
 const minutes=Array.from({length:600},(_,i)=>({time:at('2024-11-04T13:00:00Z')+i*60,open:100+i%7,high:102+i%11,low:98-i%5,close:100+i%13,volume:1+(i*37)%17}));
 const options={resolution:'1',calendar:'utc' as const};
 const series=(bars:readonly Bar[],anchor:string,opts:Options=options)=>{const result=run('avwap',bars,{anchor,band2Enabled:true,band3Enabled:true},opts);return Object.fromEntries(result.series.map(row=>[row.id,row.values]));};
 const byTimeOf=(bars:readonly Bar[],rows:Record<string,readonly (number|null)[]>)=>new Map(bars.map((bar,i)=>[bar.time,Object.keys(rows).map(id=>rows[id][i])]));
 it('an instance without an anchor draws nothing and asks for a click; there is no first-bar fallback',()=>{
  const result=run('avwap',minutes,{},options);
  expect(result.diagnostics).toEqual([AVWAP_UNANCHORED_MESSAGE]);
  for(const row of result.series)expect(row.values.every(value=>value===null),row.id).toBe(true);
  expect(anchoredVwapIndex(minutes,null,'1')).toBe(minutes.length);
  expect(catalogDefinition('avwap')!.inputs.find(row=>row.key==='anchor')!.defval).toBe('');
 });
 it('the text stored by a click reads back to the clicked bar (exchange clock, DST, seconds bars)',()=>{
  for(const [bars,zone,resolution] of [[halfHours,'America/New_York','30'],[halfHours,'UTC','30'],[BARS.crypto1h,'UTC','60']] as const)
   bars.forEach((bar,i)=>expect(anchoredVwapIndex(bars,anchorInstant(anchorTextAt(bar.time,zone),zone),resolution),zone+' bar '+i).toBe(i));
  expect(anchorTextAt(at('2024-11-04T14:30:00Z'),'America/New_York')).toBe('2024-11-04 09:30');
  expect(anchorTextAt(at('2024-11-01T13:30:00Z'),'America/New_York')).toBe('2024-11-01 09:30');
  // 01:00 to 02:00 New York repeats on 3 November 2024: the second 01:00 (06:00 UTC) is written in UTC so it reads back exactly.
  expect(anchorTextAt(at('2024-11-03T05:00:00Z'),'America/New_York')).toBe('2024-11-03 01:00');expect(anchorTextAt(at('2024-11-03T06:00:00Z'),'America/New_York')).toBe('2024-11-03 06:00Z');
  const seconds=Array.from({length:120},(_,i)=>flat(at('2024-11-04T14:30:00Z')+i*5,100+i));
  expect(anchorTextAt(seconds[7].time,'UTC')).toBe('2024-11-04 14:30:35');
  seconds.forEach((bar,i)=>expect(anchoredVwapIndex(seconds,anchorInstant(anchorTextAt(bar.time,'UTC'),'UTC'),'5S'),'5S bar '+i).toBe(i));
 });
 it('older history loaded in front of the chart keeps every value from the anchor on',()=>{
  const anchor=anchorTextAt(minutes[400].time,'UTC'),tail=minutes.slice(300),full=byTimeOf(minutes,series(minutes,anchor)),paged=byTimeOf(tail,series(tail,anchor));
  for(const bar of tail)expect(paged.get(bar.time),String(bar.time)).toEqual(full.get(bar.time));
  expect(full.get(minutes[400].time)![0]).not.toBeNull();expect(full.get(minutes[399].time)![0]).toBeNull();
 });
 it('a capped live window that drops its oldest bar and appends a new one keeps the anchored values',()=>{
  const anchor=anchorTextAt(minutes[450].time,'UTC'),before=minutes.slice(100,500),after=minutes.slice(101,501);
  const a=byTimeOf(before,series(before,anchor)),b=byTimeOf(after,series(after,anchor));
  for(const bar of after.slice(0,-1))expect(b.get(bar.time),String(bar.time)).toEqual(a.get(bar.time));
 });
 it('forming-bar updates through the incremental session equal the full calculation',()=>{
  const session=createIncrementalIndicatorSession(),anchor=anchorTextAt(minutes[200].time,'UTC'),inputs={anchor,band2Enabled:true} as never;
  let bars=minutes.slice(0,300);
  for(let tick=0;tick<12;tick++){
   const last=bars.at(-1)!;bars=tick%4===3?[...bars,{...last,time:last.time+60,volume:2}]:[...bars.slice(0,-1),{...last,close:last.close+0.5,high:Math.max(last.high,last.close+0.5),volume:last.volume+3}];
   const live=session.calculate('avwap',bars,inputs,options),reference=calculateIndicator('avwap',bars,inputs,options);
   expect(live.series.map(row=>[row.id,[...row.values]])).toEqual(reference.series.map(row=>[row.id,[...row.values]]));
  }
 });
 it('a 1-minute anchor lands on the hour that holds it after an interval switch',()=>{
  const hours=Array.from({length:10},(_,h)=>{const slice=minutes.slice(h*60,h*60+60);return {time:slice[0].time,open:slice[0].open,high:Math.max(...slice.map(bar=>bar.high)),low:Math.min(...slice.map(bar=>bar.low)),close:slice.at(-1)!.close,volume:slice.reduce((sum,bar)=>sum+bar.volume,0)};});
  const anchor=anchorTextAt(minutes[250].time,'UTC'),vwap=series(hours,anchor,{resolution:'60',calendar:'utc'}).vwap;
  expect(vwap.slice(0,5)).toEqual([N,N,N,N,expect.any(Number)]);// minute 250 is in hour 4 (minutes 240 to 299)
  expect(anchorInstant(anchor,'UTC')).toBe(minutes[250].time);
 });
 it('the legend menu offers Change anchor only where the host connects it',()=>{
  const ids=(anchor:boolean)=>legendMoreMenu('indicator',{surface:'legend',title:'AVWAP',value:null,hidden:false,favorite:false,routes:{anchor}}).flatMap(row=>row.kind==='item'?[row.id]:[]);
  expect(ids(true)).toContain('anchor');expect(ids(false)).not.toContain('anchor');
 });
});

describe('Session VWAPs (SYNTHETIC)',()=>{
 const result=run('sessionvwap',halfHours,{showBands:true},{resolution:'30m',calendar:'us-equity'});
 it('the windows are the Trading sessions defaults',()=>{
  expect(TRADING_SESSION_DEFAULT_WINDOWS.map(row=>`${row.name} ${row.start}-${row.end} ${row.zone}`)).toEqual(['Tokyo 09:00-15:00 Asia/Tokyo','London 08:00-16:30 Europe/London','New York 09:30-16:00 America/New_York']);
  expect(result.diagnostics).toEqual([]);
 });
 it('New York restarts at its open and stops at its close, following the 2024-11-03 DST change',()=>{
  const ny=byTime(halfHours,result,'newYork');
  // 1 November (EDT, UTC-4): 09:30-16:00 = 13:30-20:00 UTC. Bar 27 is 13:30 UTC; volume 1, so VWAP = mean price so far.
  expect([ny('2024-11-01T13:00:00Z'),ny('2024-11-01T13:30:00Z'),ny('2024-11-01T14:00:00Z'),ny('2024-11-01T19:30:00Z'),ny('2024-11-01T20:00:00Z')]).toEqual([N,27,27.5,(27+39)/2,N]);
  // 4 November (EST, UTC-5): 14:30-21:00 UTC. Bar 173 is 14:30 UTC.
  expect([ny('2024-11-04T14:00:00Z'),ny('2024-11-04T14:30:00Z'),ny('2024-11-04T20:30:00Z'),ny('2024-11-04T21:00:00Z')]).toEqual([N,173,(173+185)/2,N]);
  // Band: two equal-weight prices 27 and 28 have a population deviation of 0.5.
  expect(byTime(halfHours,result,'newYorkUpper')('2024-11-01T14:00:00Z')).toBe(28);expect(byTime(halfHours,result,'newYorkLower')('2024-11-01T14:00:00Z')).toBe(27);
 });
 it('London (GMT after 27 October) and Tokyo (no DST) use their own clocks',()=>{
  const london=byTime(halfHours,result,'london'),tokyo=byTime(halfHours,result,'tokyo');
  expect([london('2024-11-01T07:30:00Z'),london('2024-11-01T08:00:00Z'),london('2024-11-01T16:00:00Z'),london('2024-11-01T16:30:00Z')]).toEqual([N,16,(16+32)/2,N]);
  // 09:00-15:00 Tokyo = 00:00-06:00 UTC; the 00:00 UTC bar of 2 November starts a new session.
  expect([tokyo('2024-11-01T00:00:00Z'),tokyo('2024-11-01T05:30:00Z'),tokyo('2024-11-01T06:00:00Z'),tokyo('2024-11-02T00:00:00Z')]).toEqual([0,5.5,N,48]);
 });
 it('a session switched off is unavailable; daily charts show the not-available notice',()=>{
  expect(values(run('sessionvwap',halfHours,{londonEnabled:false},{resolution:'30m'}),'london').every(value=>value===null)).toBe(true);
  const daily=run('sessionvwap',weekdays.map(time=>flat(time,100)),{},{resolution:'1D'});
  expect(daily.series).toEqual([]);expect(daily.diagnostics).toEqual(['Session VWAPs works on intraday charts only and is not available on this interval.']);
 });
 it('missing volume is a gap at that bar only and the session continues',()=>{
  const bars=halfHours.map((bar,i)=>i===28?{...bar,volume:NaN}:bar),ny=byTime(bars,run('sessionvwap',bars,{},{resolution:'30m'}),'newYork');
  expect([ny('2024-11-01T13:30:00Z'),ny('2024-11-01T14:00:00Z'),ny('2024-11-01T14:30:00Z')]).toEqual([27,N,(27+29)/2]);
 });
 it('no look-ahead: every prefix equals the full series (bands on)',()=>{expectCausal('sessionvwap',halfHours.slice(20,200),{showBands:true},{resolution:'30m'});},60000);
});

describe('Opening range breakout (SYNTHETIC)',()=>{
 // 5-minute bars 08:00-17:00 New York on Friday 1 November (UTC-4) and Monday 4 November (UTC-5), flat at 100 except:
 // 09:30 range bar high 101 / low 99; 09:40 high 103 (only inside a 15-minute range); 10:00 closes 101.5; 10:30 closes 102;
 // 11:00 closes 98.5. Both days are the same, shifted by the DST change.
 const day=(open:string)=>Array.from({length:109},(_,k)=>{const time=at(open)+k*300,minute=8*60+k*5,bar=flat(time,100);
  if(minute===570)return {...bar,high:101,low:99};if(minute===580)return {...bar,high:103};if(minute===600)return {...bar,close:101.5,high:101.6};
  if(minute===630)return {...bar,close:102,high:102};if(minute===660)return {...bar,close:98.5,low:98.4};return bar;});
 const bars=[...day('2024-11-01T12:00:00Z'),...day('2024-11-04T13:00:00Z')],options={resolution:'5m',calendar:'us-equity' as const};
 const result=run('orb',bars,{showTargets:true},options);
 it('lines start after the 5-minute range completes and stop at the session end',()=>{
  expect(result.diagnostics).toEqual([]);const high=byTime(bars,result,'high'),low=byTime(bars,result,'low'),mid=byTime(bars,result,'mid');
  expect([high('2024-11-01T13:25:00Z'),high('2024-11-01T13:30:00Z'),high('2024-11-01T13:35:00Z'),high('2024-11-01T19:55:00Z'),high('2024-11-01T20:00:00Z')]).toEqual([N,N,101,101,N]);
  expect([low('2024-11-01T13:35:00Z'),mid('2024-11-01T13:35:00Z')]).toEqual([99,100]);
  // After the DST change the 09:30 open is 14:30 UTC.
  expect([high('2024-11-04T14:30:00Z'),high('2024-11-04T14:35:00Z'),high('2024-11-04T20:55:00Z'),high('2024-11-04T21:00:00Z')]).toEqual([N,101,101,N]);
 });
 it('targets are the range high plus 1 and 2 ranges and the low minus 1 and 2 ranges',()=>{
  expect(['up1','up2','down1','down2'].map(id=>byTime(bars,result,id)('2024-11-01T14:00:00Z'))).toEqual([103,105,97,95]);
  expect(values(run('orb',bars,{},options),'up1').every(value=>value===null)).toBe(true);// targets off by default
  expect(values(run('orb',bars,{showMid:false},options),'mid').every(value=>value===null)).toBe(true);
 });
 it('breakout markers sit on the first close beyond the range, once per side per session',()=>{
  const up=values(result,'breakUp'),down=values(result,'breakDown'),marks=(series:readonly (number|null)[])=>series.flatMap((value,i)=>value===null?[]:[[new Date(bars[i].time*1000).toISOString().slice(0,16),value]]);
  expect(marks(up)).toEqual([['2024-11-01T14:00',101.5],['2024-11-04T15:00',101.5]]);// 10:30 closes higher again: no second marker
  expect(marks(down)).toEqual([['2024-11-01T15:00',98.5],['2024-11-04T16:00',98.5]]);
 });
 it('a 15-minute range covers the 09:30, 09:35 and 09:40 bars and its lines start at 09:45',()=>{
  const high=byTime(bars,run('orb',bars,{duration:'15'},options),'high');
  expect([high('2024-11-01T13:40:00Z'),high('2024-11-01T13:45:00Z')]).toEqual([N,103]);
 });
 it('lines appear only once the range is complete: every prefix equals the full series',()=>{expectCausal('orb',bars.slice(0,140),{showTargets:true,duration:'15'},options);},60000);
 it('24/7 sources use 00:00 UTC; a 1-hour bar longer than the range is the whole range',()=>{
  const hours=Array.from({length:48},(_,i)=>({...flat(at('2024-03-09T00:00:00Z')+i*3600,100),high:i%24===0?110:100,low:i%24===0?90:100}));
  const high=values(run('orb',hours,{},{resolution:'60m',calendar:'utc'}),'high');
  expect([high[0],high[1],high[23],high[24],high[25]]).toEqual([N,110,110,N,110]);
  expect(run('orb',hours,{},{resolution:'60m'}).diagnostics[0]).toMatch(/unknown, so the range starts at 00:00 UTC/);
 });
 it('a custom session uses its own start and time zone',()=>{
  const high=byTime(bars,run('orb',bars,{session:'Custom',start:'09:40',end:'12:00',zone:'America/New_York'},options),'high');
  expect([high('2024-11-01T13:40:00Z'),high('2024-11-01T13:45:00Z'),high('2024-11-01T16:00:00Z')]).toEqual([N,103,N]);
 });
 it('daily charts show the not-available notice',()=>{
  const daily=run('orb',weekdays.map(time=>flat(time,100)),{},{resolution:'1D',calendar:'us-equity'});
  expect(daily.series).toEqual([]);expect(daily.diagnostics).toEqual(['Opening range breakout works on intraday charts only and is not available on this interval.']);
 });
});

describe('Relative volume (SYNTHETIC)',()=>{
 const bars=(volumes:readonly number[])=>volumes.map((volume,i)=>flat(i*DAY,100,volume));
 it('RVOL = volume / the average of the previous length bars; Above threshold is 1 at or over the threshold',()=>{
  const result=run('relvolume',bars([10,10,10,40,5]),{length:3});expect(result.diagnostics).toEqual([]);
  // The baseline leaves the current bar out (it is the average of the preceding bars): bar 3 reads SMA(10, 10, 10) = 10,
  // bar 4 reads SMA(10, 10, 40) = 20. RVOL: -, -, -, 40 / 10 = 4, 5 / 20 = 0.25. (An average including the current bar
  // gave 2 at bar 3 and capped RVOL at the length.)
  expect(values(result,'ma')).toEqual([N,N,N,10,20]);
  expect(values(result,'rvol')).toEqual([N,N,N,4,0.25]);expect(values(result,'high')).toEqual([N,N,N,1,0]);
  const state=catalogDefinition('relvolume')!.pointPalette!.state(id=>values(result,id));expect(state).toEqual([N,N,N,0,N]);
 });
 it('defaults are length 20 and threshold 2; a 10x spike after 20 even bars reads 10',()=>{
  const definition=catalogDefinition('relvolume')!;expect(definition.inputs.map(row=>[row.key,row.defval])).toEqual([['length',20],['threshold',2]]);
  expect(definition.warmup(key=>({length:20} as Record<string,number>)[key])).toBe(21);
  expect(values(run('relvolume',bars([...new Array(20).fill(100),1000])),'rvol')[20]).toBe(10);
 });
 it('missing volume leaves a gap at that bar only',()=>{
  // The bar with no volume is skipped: bar 4's baseline is SMA(3) over bars 0, 2 and 3 = 10, so RVOL = 40 / 10.
  const result=run('relvolume',bars([10,NaN,10,10,40]),{length:3});
  expect(values(result,'volume')).toEqual([10,N,10,10,40]);expect(values(result,'ma')).toEqual([N,N,N,N,10]);expect(values(result,'rvol')).toEqual([N,N,N,N,4]);
 });
});

describe('intraday guardrail for the intraday-only kinds (reference fixtures)',()=>{
 for(const [name,bars,options] of [['US 30m',BARS.us30m,{resolution:'30m',calendar:'us-equity'}],['crypto 1h',BARS.crypto1h,{resolution:'60m',calendar:'utc'}]] as const)
  for(const kind of ['sessionvwap','orb'])it(`${name}: ${kind} produces values`,()=>{
   const result=run(kind,bars,{},options as Options);expect(result.series.some(row=>row.values.some(value=>value!==null)),kind).toBe(true);
  });
});

describe('presentation (SYNTHETIC)',()=>{
 it('Relative volume colors the volume bars at or over the threshold; the RVOL plots stay in the legend while hidden',()=>{
  const bars=[10,10,10,40,5].map((volume,i)=>flat(i*DAY,100,volume)),result=run('relvolume',bars,{length:3});
  const drawn=renderIndicatorPresentation(settings('relvolume',{length:3}),result,bars,{resolution:'1D'});expect(drawn.diagnostics).toEqual([]);
  const volume=drawn.output.series!.find(row=>row.title==='Volume') as {points:{color?:string}[]};
  expect(volume.points.map(point=>point.color!==undefined)).toEqual([false,false,false,true,false]);
  const rvol=drawn.output.series!.find(row=>row.title==='RVOL') as {visible:boolean;display:{legend:boolean;dataWindow:boolean}};
  expect([rvol.visible,rvol.display.legend,rvol.display.dataWindow]).toEqual([false,true,true]);
 });
 it('Opening range breakout and Session VWAPs draw their lines on intraday charts',()=>{
  for(const kind of ['orb','sessionvwap']){
   const bars=BARS.us30m,context={resolution:'30m',calendar:'us-equity' as const},result=run(kind,bars,{},context);
   const drawn=renderIndicatorPresentation(settings(kind),result,bars,context);expect(drawn.diagnostics,kind).toEqual([]);
   expect(drawn.output.series!.filter(row=>row.visible&&(row as {points:{value:number|null}[]}).points.some(point=>point.value!==null)).length,kind).toBeGreaterThan(1);
  }
 });
});
