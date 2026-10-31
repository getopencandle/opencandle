// Time price opportunity profiles. Synthetic fixtures only (labelled synthetic); every expectation is hand
// worked in the comments. The construction rules are our own choice (src/chart/tpo.ts header).
import {describe,it,expect} from 'vitest';
import {rendererLayers,chartTypes,type RendererLayerArgs} from '@luxalgo/vela';
import {tpoProfiles,tpoProfileStart,tpoLetter,tpoRowSize,tpoValueArea,niceStep,tpoProfilesForSettings,TPO_LV_DEFAULTS,type TpoBar} from '../../src/chart/tpo';
import {registerTemporalChartTypes,TIME_AXIS_STYLES} from '../../src/chart/chart-types';
import {chartSettingsSchema,settingsDefaults,validateTypeSettings} from '../../src/chart/chart-settings';
import {calculationBarsForStyle,calculationTransformId} from '../../src/chart/calculation-bars';
import {typeRowUnused} from '../../src/chart/chart-settings-bindings';
import {latestPricePresentation} from '../../src/chart/appearance-price';

const DAY0=10*86_400;// 1970-01-11 00:00 UTC, a Sunday.
const block=(index:number,low:number,high:number,open=low,close=high):TpoBar=>({time:DAY0+index*1800,open,high,low,close});
const options={profilePeriod:'Day' as const,blockMinutes:30,rowSize:1,valueAreaPercent:70,initialBalanceBlocks:2,intervalSeconds:1800};

describe(' TPO profile (hand worked)',()=>{
 // Blocks (30 minute bars): A 10.0-12.5 rows 10,11,12; B 11.2-13.4 rows 11,12,13; C 12.1-12.9 row 12; D 9.5-11.9 rows 9,10,11;
 // E 11.0-11.6 row 11. Counts: 9:1 (D), 10:2 (A D), 11:4 (A B D E), 12:3 (A B C), 13:1 (B); 11 TPOs.
 // POC row 11 (price 11.5). Value area 70% of 11 = 7.7: start 4; above 12+13 = 4, below 10+9 = 3, so add 12 and 13: 8. VA rows 11..13,
 // VAL 11, VAH 14. Initial balance (A, B): 10.0 to 13.4. No single prints (9 and 13 are the edges); top and bottom hold one TPO.
 const bars=[block(0,10,12.5),block(1,11.2,13.4),block(2,12.1,12.9),block(3,9.5,11.9),block(4,11,11.6)];
 it('rows, letters, POC, value area and initial balance',()=>{
  const [profile,...rest]=tpoProfiles(bars,options);expect(rest).toEqual([]);
  expect(profile.rows.map(row=>[row.index,row.letters.join('')])).toEqual([[9,'D'],[10,'AD'],[11,'ABDE'],[12,'ABC'],[13,'B']]);
  expect(profile).toMatchObject({start:DAY0,firstIndex:0,lastIndex:4,blocks:5,poc:11,pocPrice:11.5,val:11,vah:14,valueRows:[11,13],ibHigh:13.4,ibLow:10,singlePrints:[],poorHigh:false,poorLow:false,open:10,close:11.6});
 });
 it('POC ties go to the row nearest the middle, then the lower row; single prints and poor extremes',()=>{
  // A 10.2-13.8 rows 10..13; B 10.1-10.9 row 10; C 13.1-13.5 row 13. Counts 10:2 11:1 12:1 13:2; rows 10 and 13 are equally far
  // from the middle, so POC is row 10. VA: 6 TPOs, target 4.2: start 2, below none, add 11+12 (4), then 13 (6): rows 10..13.
  const [profile]=tpoProfiles([block(0,10.2,13.8),block(1,10.1,10.9),block(2,13.1,13.5)],options);
  expect(profile).toMatchObject({poc:10,valueRows:[10,13],val:10,vah:14,singlePrints:[11,12],poorHigh:true,poorLow:true});
  // Counts 1,3,1,1,1 from POC 1: 7 TPOs, target 4.9; above 1+1 = 2 beats below 1, so rows 2 and 3 join (5): rows 1..3.
  expect(tpoValueArea([1,3,1,1,1],1,70)).toEqual([1,3]);
 });
 it('profile periods, block letters and a chart interval longer than the block',()=>{
  // 1970-01-08 12:00 (Thursday) belongs to the week starting Monday 1970-01-05; 1970-01-04 (Sunday) to Monday 1969-12-29.
  expect(tpoProfileStart(7*86_400+43_200,'Week')).toBe(4*86_400);expect(tpoProfileStart(3*86_400,'Week')).toBe(-3*86_400);
  expect(tpoProfileStart(DAY0+5000,'Day')).toBe(DAY0);
  expect([0,25,26,51,52].map(tpoLetter)).toEqual(['A','Z','a','z','A']);
  // The first block with bars is A; an empty block skips its letter (blocks 1 and 3 read A and C).
  expect(tpoProfiles([block(1,10,10.5),block(3,10,10.5)],options)[0].rows[0].letters).toEqual(['A','C']);
  // Daily bars with Week profiles and 30 minute blocks: every bar is its own block (A, B, C ...).
  const daily=[0,1,2].map(day=>({time:5*86_400+day*86_400,open:10,high:10.5,low:10,close:10.2}));
  const [week]=tpoProfiles(daily,{...options,profilePeriod:'Week',intervalSeconds:86_400});
  expect(week.rows.map(row=>row.letters.join(''))).toEqual(['ABC']);
  // Two days make two profiles.
  expect(tpoProfiles([...bars,{...block(0,10,11),time:DAY0+86_400}],options).map(profile=>[profile.start,profile.firstIndex,profile.lastIndex])).toEqual([[DAY0,0,4],[DAY0+86_400,5,5]]);
 });
 it('row size: Ticks per row with a tick, Auto over the median profile range',()=>{
  expect(tpoRowSize(bars,'Day','Ticks per row',5,0.01)).toBeCloseTo(0.05,12);
  // One profile, range 13.4 - 9.5 = 3.9; 3.9 / 30 = 0.13: 13 ticks of 0.01, or the 1-2-5 step 0.2 without a tick.
  expect(tpoRowSize(bars,'Day','Auto',1,0.01)).toBeCloseTo(0.13,12);expect(tpoRowSize(bars,'Day','Auto',1,null)).toBeCloseTo(0.2,12);
  expect(tpoRowSize(bars,'Day','Ticks per row',5,null)).toBeCloseTo(0.2,12);
  expect(tpoRowSize([],'Day','Auto',1,0.01)).toBeNull();
  expect([0.13,1,0.0031,7].map(niceStep)).toEqual([0.2,1,0.005,10]);
  expect(()=>tpoProfiles(bars,{...options,rowSize:0})).toThrow('row size');
 });
});

describe(' TPO as a chart type',()=>{
 it('is a time-axis type with OpenCandle settings, computing indicators on the standard bars',()=>{
  expect(TIME_AXIS_STYLES).toContain('tpo');expect(TIME_AXIS_STYLES).not.toContain('renko');
  expect(chartSettingsSchema('tpo').fields.map(field=>field.key)).toContain('valueAreaPercent');
  expect(settingsDefaults('tpo')).toMatchObject({profilePeriod:'Day',blockSize:'30m',rowSizeMode:'Auto',valueAreaPercent:70,initialBalanceBlocks:2});
  expect(()=>validateTypeSettings('tpo',settingsDefaults('tpo'))).not.toThrow();expect(()=>validateTypeSettings('tpo',{valueAreaPercent:0})).toThrow();
  expect(chartSettingsSchema('tpo').unresolved.join(' ')).toMatch(/OpenCandle-defined/);
  const source=[{time:DAY0,open:10,high:11,low:9,close:10.5,volume:3}];
  expect(calculationBarsForStyle(source,'tpo')).toEqual(source);expect(calculationTransformId('tpo')).toBe('standard');
  expect(typeRowUnused('tpo','ticksPerRow',{rowSizeMode:'Auto'})).toBe(true);expect(typeRowUnused('tpo','ticksPerRow',{rowSizeMode:'Ticks per row'})).toBe(false);
  expect(typeRowUnused('tpo','pocColor',{poc:false})).toBe(true);
  expect(latestPricePresentation({priceStyle:'tpo',bars:[{open:10,high:11,low:9,close:10.5}],style:{chartTypes:{}}},{priceToY:()=>0},{upColor:'#0a0',downColor:'#a00'},{bounds:{top:0,height:1},scale:{}})).toEqual({value:10.5,color:'#0a0'});
 });
 it('the registered layer paints the profiles of the visible bars, and only for the tpo style',()=>{
  registerTemporalChartTypes();
  expect(chartTypes().some(type=>type.id==='tpo')).toBe(true);
  const texts:string[]=[];
  const ctx:Record<string,unknown>={clearRect(){},save(){},restore(){},scale(){},beginPath(){},rect(){},clip(){},setLineDash(){},moveTo(){},lineTo(){},stroke(){},fillRect(){},strokeRect(){},fillText(text:string){texts.push(text);}};
  const canvas={width:400,height:400,dataset:{} as Record<string,string>,getContext:()=>ctx} as unknown as HTMLCanvasElement;
  const layer=rendererLayers().find(row=>row.id==='tpo')!.create();layer.mount(canvas);
  const bars=[block(0,10,12.5),block(1,11.2,13.4),block(2,12.1,12.9)].map(bar=>({...bar,time:bar.time*1000,volume:1}));
  const args=(priceStyle:string)=>({priceStyle,bars,data:{tickSize:1},settings:{rowSizeMode:'Ticks per row',ticksPerRow:1,volumeProfile:false},bounds:{top:0,height:400},scale:{min:0,max:20,log:false},theme:{fontFamily:'sans-serif'},
   coords:{dpr:1,width:400,visibleLogicalRange:()=>({from:0,to:2}),bodySpacing:()=>60,pxPerBar:()=>60,logicalToX:(index:number)=>50+index*60,priceToY:(price:number)=>400-price*20}}) as unknown as RendererLayerArgs;
  layer.render(args('candles'));expect(texts).toEqual([]);
  layer.render(args('tpo'));
  expect(canvas.dataset.lvPaintedProfiles).toBe('1');
  // Rows 10..13 with letters A / AB / ABC / B, drawn bottom to top.
  expect(texts.join('')).toBe('AABABCB');
  // Live: the forming bar is revised in place (same array, same object) and then a new block opens; both repaint the profile.
  const live=bars as {time:number;open:number;high:number;low:number;close:number;volume:number}[];
  live[2].high=13.2;texts.length=0;layer.render(args('tpo'));expect(texts.join('')).toBe('AABABCBC');
  live.push({...block(3,9.2,9.8),time:(DAY0+3*1800)*1000,volume:1});texts.length=0;layer.render(args('tpo'));expect(texts.join('')).toBe('DAABABCBC');
  expect(tpoProfilesForSettings(bars.map(bar=>({...bar,time:bar.time/1000})),{...TPO_LV_DEFAULTS,rowSizeMode:'Ticks per row',ticksPerRow:1},1)[0].poc).toBe(12);
 });
});
