// TPO session model (Sessions, Split by blocks, Merge points) and the Session volume profile chart type.
// Every fixture is SYNTHETIC (hand-made bars, not market data); expectations are hand worked in the comments.
import {describe,it,expect} from 'vitest';
import {rendererLayers,chartTypes,type RendererLayerArgs} from '@luxalgo/vela';
import type {Bar} from '../../src/domain/types';
import {tpoProfiles,tpoProfilesForSettings,tpoSplitApplies,tpoToggleMergePoint,TPO_LV_DEFAULTS,type TpoBar,type TpoOptions} from '../../src/chart/tpo';
import {svpProfilesForSettings,svpRowSegments,SVP_LV_DEFAULTS} from '../../src/chart/session-vp';
import {registerTemporalChartTypes,TIME_AXIS_STYLES} from '../../src/chart/chart-types';
import {chartSettingsSchema,settingsDefaults,validateTypeSettings,validatedSettingsBook} from '../../src/chart/chart-settings';
import {calculationBarsForStyle} from '../../src/chart/calculation-bars';
import {factoryAppearance,factoryPriceScale,findRow,tabView,writeRow,typeRowUnused,type ChartSettingsSources} from '../../src/chart/chart-settings-bindings';
import {defaultChartSettingsDocument} from '../../src/chart/chart-settings-document';
import {sessionRuns,sessionSlot,zoneWallTime} from '../../src/domain/profile-sessions';
import {calculateIndicator} from '../../src/domain/indicators';
import {REPLAY_UNSUPPORTED_CHART_TYPES} from '../../src/domain/replay-session';

/** New York wall clock on 2026-03-<day>: EST (UTC-5) up to 03-08, EDT (UTC-4) from 03-08 02:00 (DST change). */
const ny=(day:number,h:number,m=0)=>Date.UTC(2026,2,day,h+(day>=9?4:5),m)/1000;
const bar=(time:number,low:number,high:number,volume=100,open=low,close=high):TpoBar&Bar=>({time,open,high,low,close,volume});
const US={calendar:'us-equity' as const};
const sources=(style:string,patch:Record<string,unknown>={}):ChartSettingsSources=>({appearance:factoryAppearance(),document:defaultChartSettingsDocument(),documentConnected:true,priceScale:factoryPriceScale(),ratio:null,style,typeSettings:{...settingsDefaults(style),...patch},timezone:'UTC',exchangeTimezone:null});
const keys=(s:ChartSettingsSources)=>tabView('symbol',s)[0].rows.map(row=>row.key);

// Friday 03-06 (EST) and Monday 03-09 (EDT), 30m bars: 0 Fri 09:30, 1 Fri 10:30, 2 Fri 19:00 (= Sat 00:00 UTC), 3 Fri 19:30,
// 4 Mon 04:00 (pre-market), 5 Mon 09:30, 6 Mon 10:00, 7 Mon 10:30, 8 Mon 11:00.
const DST=[bar(ny(6,9,30),10,10.5),bar(ny(6,10,30),11,11.5),bar(ny(6,19),12,12.5),bar(ny(6,19,30),12,12.5),bar(ny(9,4),13,13.5),bar(ny(9,9,30),14,14.5),bar(ny(9,10),14,14.5),bar(ny(9,10,30),15,15.5),bar(ny(9,11),15,15.5)];
const base:TpoOptions={profilePeriod:'Day',blockMinutes:30,rowSize:1,valueAreaPercent:70,initialBalanceBlocks:2,intervalSeconds:1800};
const grouping=(mode:'All'|'Regular'|'Custom',extra:Record<string,unknown>={})=>({mode,calendar:'us-equity' as const,...extra});

describe('TPO-SVP-1 sessions (SYNTHETIC, across the 2026-03-08 DST change)',()=>{
 it('All groups by New York trading date; the rule (no session) splits Friday evening at UTC midnight',()=>{
  const sessions=tpoProfiles(DST,{...base,session:grouping('All')});
  expect(sessions.map(p=>[p.firstIndex,p.lastIndex,p.start])).toEqual([[0,3,Date.UTC(2026,2,6,5)/1000],[4,8,Date.UTC(2026,2,9,4)/1000]]);
  const legacy=tpoProfiles(DST,base);
  expect(legacy.map(p=>[p.firstIndex,p.lastIndex])).toEqual([[0,1],[2,3],[4,8]]);
 });
 it('Regular keeps the regular session and counts blocks from the open in EST and in EDT alike',()=>{
  // 60m blocks from 09:30: Mon 09:30 and 10:00 are block 0 (A), 10:30 and 11:00 block 1 (B). Fri 09:30 A, 10:30 B. Evening and pre-market excluded.
  const regular=tpoProfiles(DST,{...base,blockMinutes:60,session:grouping('Regular')});
  expect(regular.map(p=>[p.firstIndex,p.lastIndex,p.columns.map(c=>c.letter+c.firstIndex+'-'+c.lastIndex).join(' ')])).toEqual([[0,1,'A0-0 B1-1'],[5,8,'A5-6 B7-8']]);
  expect(regular[1].start).toBe(Date.UTC(2026,2,9,13,30)/1000);expect(regular[0].start).toBe(Date.UTC(2026,2,6,14,30)/1000);
  // All anchors at midnight: Mon 04:00 block 4 is A; 09:30 block 9 (F), 10:00 and 10:30 block 10 (G), 11:00 block 11 (H).
  expect(tpoProfiles(DST,{...base,blockMinutes:60,session:grouping('All')})[1].columns.map(c=>c.letter).join('')).toBe('AFGH');
 });
 it('Custom: an exchange-clock range, and an overnight range belongs to the date it ends',()=>{
  // 10:00-11:00: Fri 10:30 and Mon 10:00, 10:30.
  expect(sessionRuns(DST,grouping('Custom',{customStart:600,customEnd:660}))).toEqual([{from:1,to:1,day:Date.UTC(2026,2,6)/86_400_000},{from:6,to:7,day:Date.UTC(2026,2,9)/86_400_000}]);
  // 18:00-09:30: Thu 19:00 and Fri 04:00 are one session of Friday; Fri 09:30 is outside. Anchor Thu 18:00 EST.
  const night=[bar(ny(5,19),10,11),bar(ny(6,4),10,11),bar(ny(6,9,30),10,11)],g=grouping('Custom',{customStart:1080,customEnd:570});
  expect(sessionRuns(night,g)).toEqual([{from:0,to:1,day:Date.UTC(2026,2,6)/86_400_000}]);
  expect(tpoProfiles(night,{...base,session:g})[0].start).toBe(Date.UTC(2026,2,5,23)/1000);
  expect(sessionSlot(ny(6,9,30),g)).toBeNull();
  // A generic zone uses its own clock: 09:00 London on 2026-03-30 (BST, UTC+1) is 08:00 UTC.
  expect(zoneWallTime(Date.UTC(2026,2,30)/86_400_000,540,'Europe/London')).toBe(Date.UTC(2026,2,30,8)/1000);
 });
 it('settings path: reference defaults, and a UTC feed keeps the profiles exactly',()=>{
  expect(settingsDefaults('tpo')).toMatchObject({profilesSessions:'All',customSessionStart:'09:30',customSessionEnd:'16:00',splitByBlocks:false,splitByBlocksMode:'All',mergePoints:[]});
  // A Sunday bar makes the calendar UTC (pivotCalendar): defaults equal the call.
  const utc=[0,1,2,49,50].map(i=>bar(10*86_400+i*1800,10+i%3,11+i%3));
  const old=tpoProfiles(utc,{...base,rowSize:1});
  expect(tpoProfilesForSettings(utc,{...TPO_LV_DEFAULTS,rowSizeMode:'Ticks per row',ticksPerRow:1},1)).toEqual(old);
  // Declared US equity: Friday evening joins Friday.
  expect(tpoProfilesForSettings(DST,{rowSizeMode:'Ticks per row',ticksPerRow:1},1,US).map(p=>[p.firstIndex,p.lastIndex])).toEqual([[0,3],[4,8]]);
  expect(tpoProfilesForSettings(DST,{profilesSessions:'Regular',rowSizeMode:'Ticks per row',ticksPerRow:1},1,US).map(p=>[p.firstIndex,p.lastIndex])).toEqual([[0,1],[5,8]]);
 });
});

describe('TPO-SVP-2/3 merge points and split by blocks (SYNTHETIC)',()=>{
 it('a merge point joins a profile to the one before it; toggling removes it',()=>{
  const monday=Date.UTC(2026,2,9,4)/1000,patch=tpoToggleMergePoint({},monday);expect(patch).toEqual({mergePoints:[monday]});
  const merged=tpoProfilesForSettings(DST,{...patch,rowSizeMode:'Ticks per row',ticksPerRow:1},1,US);
  // One profile 0..8 from Friday midnight; blocks keep counting from Friday (Mon 04:00 is far later, so letters skip ahead).
  expect(merged.map(p=>[p.firstIndex,p.lastIndex,p.start])).toEqual([[0,8,Date.UTC(2026,2,6,5)/1000]]);
  expect(merged[0].rows.map(row=>row.index)).toEqual([10,11,12,13,14,15]);
  expect(tpoToggleMergePoint(patch,monday)).toEqual({mergePoints:[]});
  // Unknown points are ignored.
  expect(tpoProfilesForSettings(DST,{mergePoints:[123],rowSizeMode:'Ticks per row',ticksPerRow:1},1,US)).toHaveLength(2);
  expect(()=>validateTypeSettings('tpo',{mergePoints:[monday]})).not.toThrow();
  expect(()=>validateTypeSettings('tpo',{mergePoints:['x']})).toThrow(/Merge points/);
  expect(validatedSettingsBook({tpo:{mergePoints:[monday]}}).applicable.tpo.mergePoints).toEqual([monday]);
 });
 it('split by blocks: one column per block with its own bars; mode Last splits only the latest profile',()=>{
  const [friday]=tpoProfiles(DST,{...base,session:grouping('All')});
  // Blocks from Friday midnight: 09:30 (19), 10:30 (21), 19:00 (38), 19:30 (39): A, C, T, U.
  expect(friday.columns).toEqual([{block:19,letter:'A',firstIndex:0,lastIndex:0,lowRow:10,highRow:10},{block:21,letter:'C',firstIndex:1,lastIndex:1,lowRow:11,highRow:11},{block:38,letter:'T',firstIndex:2,lastIndex:2,lowRow:12,highRow:12},{block:39,letter:'U',firstIndex:3,lastIndex:3,lowRow:12,highRow:12}]);
  expect([0,1,2].map(i=>tpoSplitApplies({splitByBlocks:true,splitByBlocksMode:'All'},i,3))).toEqual([true,true,true]);
  expect([0,1,2].map(i=>tpoSplitApplies({splitByBlocks:true,splitByBlocksMode:'Last'},i,3))).toEqual([false,false,true]);
  expect(tpoSplitApplies({splitByBlocks:false},2,3)).toBe(false);
 });
 it('Symbol tab rows: custom range rows only for Custom, split mode needs Split, Merge points clears',()=>{
  const all=keys(sources('tpo'));
  expect(all).toEqual(expect.arrayContaining(['type.tpo.profilesSessions','type.tpo.splitByBlocks','type.tpo.splitByBlocksMode','type.tpo.mergePoints']));
  expect(all).not.toContain('type.tpo.customSessionStart');
  expect(keys(sources('tpo',{profilesSessions:'Custom'}))).toEqual(expect.arrayContaining(['type.tpo.customSessionStart','type.tpo.customSessionEnd']));
  expect(typeRowUnused('tpo','splitByBlocksMode',{splitByBlocks:false})).toBe(true);
  const saved=sources('tpo',{mergePoints:[1,2]});
  expect(findRow('symbol',saved,'type.tpo.mergePoints')).toMatchObject({type:'select',value:{selected:'keep'},options:[{value:'none',label:'None'},{value:'keep',label:'2 merge points'}]});
  expect(writeRow(saved,'type.tpo.mergePoints',{selected:'none'}).typeSettings!.mergePoints).toEqual([]);
  expect(writeRow(saved,'type.tpo.mergePoints',{selected:'keep'}).typeSettings!.mergePoints).toEqual([1,2]);
 });
});

/** SYNTHETIC US equity 30m bars for three dates (EST): pre-market 08:00, regular 09:30-15:30, after-hours 16:00-17:30. */
function usBars():Bar[]{
 const out:Bar[]=[];
 for(const day of [3,4,5])for(const [h,m] of [[8,0],[9,30],[10,0],[11,30],[13,0],[15,30],[16,0],[17,30]]){const i=out.length,mid=20+day+Math.sin(i)*2;out.push({time:ny(day,h,m),open:mid-0.3*(i%2?1:-1),high:mid+0.4+(i%3)*0.1,low:mid-0.5,close:mid+0.3*(i%2?1:-1),volume:100+(i*37)%250});}
 return out;
}
describe('TPO-SVP-4 Session volume profile chart type (SYNTHETIC)',()=>{
 const bars=usBars(),ctx={resolution:'30m',calendar:'us-equity' as const};
 const strip=(p:{from:number;to:number;rows:unknown;pocPrice:number;vah:number;val:number;poc:number;vaFrom:number;vaTo:number})=>({from:p.from,to:p.to,rows:p.rows,poc:p.poc,vaFrom:p.vaFrom,vaTo:p.vaTo,pocPrice:p.pocPrice,vah:p.vah,val:p.val});
 for(const [label,chart,indicator] of [
  ['All = indicator Extended, 24 rows',{},{}],
  ['Regular, 10 rows, VA 60',{profilesSessions:'Regular',rows:10,vaVolume:60},{session:'Regular',rowSize:10,valueAreaVolume:60}],
  ['Ticks Per Row 25 (tick 0.01)',{rowsLayout:'Ticks Per Row',rows:25},{rowsLayout:'Ticks Per Row',rowSize:25}],
 ] as const)it(`rows equal the Session volume profile indicator: ${label}`,()=>{
  const ind=calculateIndicator('svp',bars,{session:'Extended',...indicator},{...ctx,tickSize:0.01});
  expect(ind.diagnostics).toEqual([]);
  const own=svpProfilesForSettings(bars,chart,{...ctx,tickSize:0.01});
  expect(own.error).toBeNull();expect(own.profiles.length).toBe(3);
  expect(own.profiles.map(row=>strip(row.profile))).toEqual(ind.profiles!.map(strip));
 });
 it('developing POC equals the indicator developing plot; Ticks Per Row without a tick size reports, not throws',()=>{
  const ind=calculateIndicator('svp',bars,{session:'Extended',developingPoc:true},ctx),own=svpProfilesForSettings(bars,{developingPoc:true},ctx);
  const dev=ind.series.find(row=>row.id==='devPoc')!.values,mine:(number|null)[]=[];
  for(const {profile,developing} of own.profiles)for(let i=profile.from;i<=profile.to;i++)mine[i]=developing!.poc[i-profile.from];
  expect(mine).toEqual(dev);
  expect(svpProfilesForSettings(bars,{rowsLayout:'Ticks Per Row'},ctx).error).toMatch(/tick size/);
 });
 it('row segments: Up/Down stacks, Total one bar, Delta the larger side',()=>{
  const s={...SVP_LV_DEFAULTS};
  expect(svpRowSegments({up:30,down:10},40,'Up/Down',false,s)).toEqual([{share:0.75,color:'#2962FF40'},{share:0.25,color:'#FBC02D40'}]);
  expect(svpRowSegments({up:30,down:10},40,'Total',true,s)).toEqual([{share:1,color:'#2962FFB3'}]);
  expect(svpRowSegments({up:10,down:30},40,'Delta',false,s)).toEqual([{share:0.5,color:'#FBC02D40'}]);
 });
 it('is a time-axis candle type with reference-default settings, standard calculation bars and replay',()=>{
  expect(TIME_AXIS_STYLES).toContain('sessionvp');
  expect(settingsDefaults('sessionvp')).toMatchObject({profilesSessions:'All',customSessionStart:'09:30',rowsLayout:'Number Of Rows',rows:24,volume:'Up/Down',vaVolume:70,percentWidth:100,placement:'Left to right',showValues:false,poc:true,vah:false,val:false,developingPoc:false,developingVA:false,extendPocRight:false,extendVAHRight:false,extendVALRight:false});
  expect(()=>validateTypeSettings('sessionvp',settingsDefaults('sessionvp'))).not.toThrow();expect(()=>validateTypeSettings('sessionvp',{vaVolume:101})).toThrow();
  expect(chartSettingsSchema('sessionvp').unresolved.join(' ')).toMatch(/finer bars/);
  expect(calculationBarsForStyle(bars,'sessionvp')).toEqual(bars);
  expect(REPLAY_UNSUPPORTED_CHART_TYPES.sessionvp).toBeUndefined();
  expect(keys(sources('sessionvp'))).not.toContain('type.sessionvp.customSessionStart');
  expect(typeRowUnused('sessionvp','extendVAHRight',{vah:false})).toBe(true);expect(typeRowUnused('sessionvp','pocColor',{poc:true})).toBe(false);
 });
 it('the registered layer paints the visible session profiles, only for its style',()=>{
  registerTemporalChartTypes();
  expect(chartTypes().find(type=>type.id==='sessionvp')).toMatchObject({basePainting:'candles'});
  let fills=0;const ctx2:Record<string,unknown>={clearRect(){},save(){},restore(){},scale(){},beginPath(){},rect(){},clip(){},setLineDash(){},moveTo(){},lineTo(){},stroke(){},fillRect(){fills++;},fillText(){}};
  const canvas={width:800,height:400,dataset:{} as Record<string,string>,getContext:()=>ctx2} as unknown as HTMLCanvasElement;
  const layer=rendererLayers().find(row=>row.id==='sessionvp')!.create();layer.mount(canvas);
  const ms=bars.map(row=>({...row,time:row.time*1000}));
  const args=(priceStyle:string,from=0,to=23)=>({priceStyle,bars:ms,data:ctx,settings:{},bounds:{top:0,height:400},scale:{min:0,max:40,log:false},theme:{fontFamily:'sans-serif',textColor:'#000'},
   coords:{dpr:1,width:800,visibleLogicalRange:()=>({from,to}),bodySpacing:()=>30,pxPerBar:()=>30,logicalToX:(index:number)=>15+index*30,priceToY:(price:number)=>400-price*10}}) as unknown as RendererLayerArgs;
  layer.render(args('candles'));expect(canvas.dataset.lvPaintedProfiles).toBe('0');expect(fills).toBe(0);
  layer.render(args('sessionvp'));expect(canvas.dataset.lvPaintedProfiles).toBe('3');expect(fills).toBeGreaterThan(24);
  layer.render(args('sessionvp',17,23));expect(canvas.dataset.lvPaintedProfiles).toBe('1');
 });
});

describe('TPO-SVP performance (SYNTHETIC 5,000 5m bars)',()=>{
 // 5m bars 04:00-19:55 New York (192 a day) over weekdays from 2026-01-05 (EST): 5,000 bars, about 26 dates.
 const bars:Bar[]=[];
 for(let d=0;bars.length<5000;d++){const date=new Date(Date.UTC(2026,0,5+d));if(date.getUTCDay()%6===0)continue;for(let k=0;k<192&&bars.length<5000;k++){const i=bars.length,mid=100+Math.sin(i/40)*5;bars.push({time:Date.UTC(2026,0,5+d,9,0)/1000+k*300,open:mid,high:mid+0.3+(i%5)*0.05,low:mid-0.3,close:mid+((i%2)?0.1:-0.1),volume:1000+(i*53)%900});}}
 const time=(run:()=>unknown)=>{run();const samples:number[]=[];for(let k=0;k<3;k++){const t=performance.now();run();samples.push(performance.now()-t);}return samples.sort((a,b)=>a-b)[1];};
 it('each profile build stays under 50 ms (median of 3 after a warm-up)',()=>{
  expect(bars.length).toBe(5000);
  const tpo=time(()=>tpoProfilesForSettings(bars,{profilesSessions:'Regular',splitByBlocks:true},0.01,US));
  const tpoAll=time(()=>tpoProfilesForSettings(bars,{},0.01,US));
  const svp=time(()=>svpProfilesForSettings(bars,{developingPoc:true,developingVA:true},{...US,resolution:'5m'}));
  const svpTicks=time(()=>svpProfilesForSettings(bars,{rowsLayout:'Ticks Per Row',rows:5},{...US,resolution:'5m',tickSize:0.01}));
  console.log(`TPO-SVP bench ms: tpo regular+split ${tpo.toFixed(1)}, tpo all ${tpoAll.toFixed(1)}, svp developing ${svp.toFixed(1)}, svp ticks ${svpTicks.toFixed(1)}`);
  for(const ms of [tpo,tpoAll,svp,svpTicks])expect(ms).toBeLessThan(50);
 });
});
