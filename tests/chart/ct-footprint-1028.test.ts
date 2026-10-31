// Volume footprint chart type, model and alert sources.
// Every fixture is SYNTHETIC (hand-made bars, not market data); expectations are hand worked in the comments.
import {describe,it,expect} from 'vitest';
import {rendererLayers,chartTypes,type RendererLayerArgs} from '@luxalgo/vela';
import type {Bar} from '../../src/domain/types';
import {footprintBar,footprintBuySell,footprintImbalances,footprintRowSize,footprintSessionCvd,footprintAtr,FOOTPRINT_MODEL_DEFAULTS} from '../../src/domain/footprint';
import {footprintAlertValue,footprintAlertSource,validateFootprintAlertSource,FOOTPRINT_ALERT_METRICS} from '../../src/domain/alert-footprint';
import {footprintAlertChoices} from '../../src/chart/footprint-alerts';
import {footprintDetail,footprintVolumeText,footprintAlpha,FOOTPRINT_LV_DEFAULTS} from '../../src/chart/footprint';
import {registerTemporalChartTypes,TIME_AXIS_STYLES} from '../../src/chart/chart-types';
import {chartSettingsSchema,settingsDefaults,validateTypeSettings,validatedSettingsBook} from '../../src/chart/chart-settings';
import {calculationBarsForStyle} from '../../src/chart/calculation-bars';
import {typeRowUnused} from '../../src/chart/chart-settings-bindings';
import {REPLAY_UNSUPPORTED_CHART_TYPES} from '../../src/domain/replay-session';
import {validateTechnicalAlertSource,alertConditionMemberRefusal} from '../../src/domain/alert-observation';
import {evaluateTechnicalAlertSources,technicalSourceLabel} from '../../src/domain/technical-alerts';
import {alertSourceType} from '../../src/domain/alert-manager-view';

const options={...FOOTPRINT_MODEL_DEFAULTS,rowSize:1};
// Up bar O 10 H 12 L 9 C 11, volume 600. Path 10->9 (down 1), 9->12 (up 3), 12->11 (down 1): 5 units, 120 per unit.
const UP={open:10,high:12,low:9,close:11,volume:600};

describe('FP-1/2 path split and rows (SYNTHETIC)',()=>{
 it('splits volume along the bar path: up legs buy, down legs sell',()=>{
  expect(footprintBuySell(UP)).toEqual({buy:360,sell:240});
  // Down bar O 11 H 12 L 9 C 10: 11->12 up 1, 12->9 down 3, 9->10 up 1: buy 2/5, sell 3/5.
  expect(footprintBuySell({open:11,high:12,low:9,close:10,volume:500})).toEqual({buy:200,sell:300});
  // No range: half and half. No volume: unavailable.
  expect(footprintBuySell({open:5,high:5,low:5,close:5,volume:10})).toEqual({buy:5,sell:5});
  expect(footprintBuySell({open:5,high:6,low:4,close:5})).toBeNull();
 });
 it('rows by overlap; POC tie to the lower row; value area; imbalances; unfinished auction',()=>{
  const fp=footprintBar(UP,options);
  // Row 9: 10->9 sell 120 + 9->10 buy 120. Row 10: buy 120. Row 11: buy 120 + 12->11 sell 120. High 12 opens no row 12.
  expect(fp.rows).toEqual([{index:9,low:9,high:10,buy:120,sell:120},{index:10,low:10,high:11,buy:120,sell:0},{index:11,low:11,high:12,buy:120,sell:120}]);
  expect([fp.buy,fp.sell,fp.volume,fp.delta]).toEqual([360,240,600,120]);
  // Rows 9 and 11 tie (240) and are equally far from the middle 10.5: the lower row wins.
  expect([fp.poc,fp.pocPrice]).toEqual([0,9.5]);
  // VA 70% of 600 = 420: POC 240, then the pair above (360) -> 600. VAH 12, VAL 9.
  expect([fp.vaFrom,fp.vaTo,fp.vah,fp.val]).toEqual([0,2,12,9]);
  // Buy row 11 (120) vs sell row 10 (0): a zero opposite side counts. Row 10 buy 120 vs row 9 sell 120 is 100%, under 300%.
  expect(fp.buyImbalance).toEqual([false,false,true]);expect(fp.sellImbalance).toEqual([false,false,false]);
  expect(footprintBar(UP,{...options,ignoreZeroVolume:true}).buyImbalance).toEqual([false,false,false]);
  expect(footprintBar(UP,{...options,minimalImbalanceVolume:121}).buyImbalance).toEqual([false,false,false]);
  expect([fp.unfinishedHigh,fp.unfinishedLow]).toEqual([true,true]);
  // Row sums equal the closed form.
  expect(fp.buy).toBeCloseTo(footprintBuySell(UP)!.buy,9);
  // Too many rows is refused, not drawn.
  expect(()=>footprintBar(UP,{...options,rowSize:0.001})).toThrow(/too small/);
 });
 it('stacked imbalance: a run of at least the stacked count',()=>{
  const rows=[0,10,10,10,0].map(buy=>({buy,sell:1}));
  const flags=footprintImbalances(rows,{...FOOTPRINT_MODEL_DEFAULTS,stackedImbalanceCount:3});
  expect(flags.buy).toEqual([false,true,true,true,false]);expect(flags.stackedBuy).toEqual([false,true,true,true,false]);
  expect(footprintImbalances(rows,{...FOOTPRINT_MODEL_DEFAULTS,stackedImbalanceCount:4}).stackedBuy.some(Boolean)).toBe(false);
  // Sell side: row k sell vs row k+1 buy. Sell 4 vs buy 1 above at rows 0..1.
  const sells=footprintImbalances([{buy:0,sell:4},{buy:1,sell:4},{buy:1,sell:0}],FOOTPRINT_MODEL_DEFAULTS);
  expect(sells.sell).toEqual([true,true,false]);expect(sells.stackedSell).toEqual([false,false,false]);
 });
 it('lower-timeframe bars inside a bar replace its path',()=>{
  // Two inner bars: up 9->10 (vol 100, all buy) and down 11->10 with range 10..11 (vol 50: 11->11 up 0? path 11->11->10->10: down 1).
  const inner=[{open:9,high:10,low:9,close:10,volume:100},{open:11,high:11,low:10,close:10,volume:50}];
  const fp=footprintBar({open:9,high:11,low:9,close:10,volume:150},options,inner);
  expect(fp.rows.map(r=>[r.index,r.buy,r.sell])).toEqual([[9,100,0],[10,0,50]]);
 });
});

describe('FP-3 row size and FP-8 session CVD (SYNTHETIC)',()=>{
 const flat=Array.from({length:20},(_,i)=>({time:86_400*10+i*3600,open:100,high:101,low:99,close:100,volume:10}));
 it('Ticks per row needs a tick size; Auto is ATR / 8 rounded to ticks or a 1-2-5 step',()=>{
  expect(footprintAtr(flat,14)).toBeCloseTo(2,9);
  expect(footprintRowSize(flat,{rowSize:'Ticks per row',ticksPerRow:100},0.01)).toEqual({rowSize:1,note:null});
  const noTick=footprintRowSize(flat,{rowSize:'Ticks per row',ticksPerRow:100},null);
  expect(noTick.note).toMatch(/tick size/);expect(noTick.rowSize).toBe(0.5);// ATR 2 / 8 = 0.25 -> step 0.5
  expect(footprintRowSize(flat,{rowSize:'Auto',atrLength:14},0.01).rowSize).toBeCloseTo(0.25,9);
  expect(footprintRowSize(flat,{rowSize:'Ticks per row',ticksPerRow:1},0.0001).note).toMatch(/too small/);
  expect(footprintRowSize([],{},0.01)).toEqual({rowSize:null,note:null});
 });
 it('session CVD resets at each trading date (UTC feed)',()=>{
  // Day 10: up bars (+120 each: 600 vol, as UP); day 11: one down bar (-100).
  const bars:Bar[]=[{time:864_000,...UP},{time:867_600,...UP},{time:950_400,open:11,high:12,low:9,close:10,volume:500}];
  const {delta,cvd}=footprintSessionCvd(bars);
  expect(delta).toEqual([120,120,-100]);expect(cvd).toEqual([120,240,-100]);
 });
});

describe('CT-FOOTPRINT chart type wiring (SYNTHETIC)',()=>{
 it('is a time-axis type with reference-default settings, standard calculation bars, and replay refused',()=>{
  expect(TIME_AXIS_STYLES).toContain('footprint');
  expect(settingsDefaults('footprint')).toMatchObject({rowSize:'Auto',atrLength:14,ticksPerRow:100,type:'Buy and sell',deltaAdjust:true,pointOfControl:true,showVA:true,vaPercent:70,imbalancePercent:300,calcStackedImbalance:false,stackedImbalanceCount:3,showUnfinishedAuction:false,ignoreZeroVolume:false,minimalImbalanceVolume:0,showSummary:true,summaryDelta:true,summaryVolume:true,summarySessionCvd:true,summaryPoc:true});
  expect(()=>validateTypeSettings('footprint',settingsDefaults('footprint'))).not.toThrow();
  expect(()=>validateTypeSettings('footprint',{type:'Delta'})).not.toThrow();
  expect(()=>validateTypeSettings('footprint',{type:'Heatmap'})).toThrow();expect(()=>validateTypeSettings('footprint',{vaPercent:101})).toThrow();
  expect(validatedSettingsBook({footprint:{imbalancePercent:400}}).applicable.footprint.imbalancePercent).toBe(400);
  expect(chartSettingsSchema('footprint').unresolved.join(' ')).toMatch(/OpenCandle-defined/);
  const bars=[{time:1,open:1,high:2,low:0.5,close:1.5,volume:5}];
  expect(calculationBarsForStyle(bars,'footprint')).toEqual(bars);
  expect(REPLAY_UNSUPPORTED_CHART_TYPES.footprint).toBeDefined();
  expect(typeRowUnused('footprint','ticksPerRow',{rowSize:'Auto'})).toBe(true);expect(typeRowUnused('footprint','atrLength',{rowSize:'Auto'})).toBe(false);
  expect(typeRowUnused('footprint','stackedImbalanceCount',{calcStackedImbalance:false})).toBe(true);
  expect(typeRowUnused('footprint','summaryDelta',{showSummary:false})).toBe(true);
 });
 it('text and cells follow the zoom; helpers',()=>{
  expect(footprintDetail(8,20,'Buy and sell')).toEqual({cells:false,text:false,summaryText:false});
  expect(footprintDetail(30,20,'Buy and sell')).toEqual({cells:true,text:false,summaryText:false});
  expect(footprintDetail(60,20,'Buy and sell')).toEqual({cells:true,text:true,summaryText:true});
  expect(footprintDetail(60,6,'Total').text).toBe(false);
  expect([footprintVolumeText(950),footprintVolumeText(12_345),footprintVolumeText(-3_400_000)]).toEqual(['950','12.3K','-3.4M']);
  expect(footprintAlpha('#38b486',0.5)).toBe('#38b48680');
 });
 const build=(n:number):(Bar&{time:number})[]=>Array.from({length:n},(_,i)=>{const mid=100+Math.sin(i/7)*3,up=i%3!==0;return {time:(1_700_000_000+i*300)*1000,open:up?mid-0.4:mid+0.4,high:mid+0.8,low:mid-0.8,close:up?mid+0.4:mid-0.4,volume:1000+(i*53)%900};});
 const mockCanvas=()=>{const calls={fillRect:0,fillText:0};const ctx:Record<string,unknown>={clearRect(){},save(){},restore(){},scale(){},beginPath(){},rect(){},clip(){},setLineDash(){},moveTo(){},lineTo(){},stroke(){},strokeRect(){},fillRect(){calls.fillRect++;},fillText(){calls.fillText++;}};
  return {calls,canvas:{width:800,height:400,dataset:{} as Record<string,string>,getContext:()=>ctx} as unknown as HTMLCanvasElement};};
 const args=(bars:readonly Bar[],priceStyle:string,from:number,to:number,spacing:number,settings:Record<string,unknown>={})=>({priceStyle,bars,data:{tickSize:0.01},settings,bounds:{top:0,height:400},scale:{min:90,max:110,log:false},theme:{fontFamily:'sans-serif',textColor:'#a0a7b8',upColor:'#38b486',downColor:'#e8605a',background:'#232734'},
  coords:{dpr:1,width:800,visibleLogicalRange:()=>({from,to}),bodySpacing:()=>spacing,pxPerBar:()=>spacing,logicalToX:(index:number)=>(index-from)*spacing+spacing/2,priceToY:(price:number)=>400-(price-96)*60}}) as unknown as RendererLayerArgs;
 it('the registered layer paints only visible bars, text only when zoomed in, and the summary table',()=>{
  registerTemporalChartTypes();
  expect(chartTypes().find(type=>type.id==='footprint')).toMatchObject({basePainting:'none'});
  const bars=build(200),{calls,canvas}=mockCanvas(),layer=rendererLayers().find(row=>row.id==='footprint')!.create();layer.mount(canvas);
  layer.render(args(bars,'candles',0,10,60));expect(canvas.dataset.lvPaintedBars).toBe('0');expect(calls.fillRect).toBe(0);
  layer.render(args(bars,'footprint',190,199,60));
  // Visible 190..199 plus one bar of margin on the left: 11 bars. Rows of about ATR / 8 (0.2) at 60 px per price unit: about 12 px each, room for text.
  expect(canvas.dataset.lvPaintedBars).toBe('11');expect(Number(canvas.dataset.lvFootprintCells)).toBeGreaterThan(40);
  expect(Number(canvas.dataset.lvFootprintText)).toBeGreaterThan(40);expect(canvas.dataset.lvFootprintSummaryRows).toBe('4');expect(calls.fillText).toBeGreaterThan(80);
  const before=calls.fillText;layer.render(args(bars,'footprint',100,199,8));
  // 8 px per bar: plain candles, no cells, no text.
  expect(canvas.dataset.lvPaintedBars).toBe('101');expect(canvas.dataset.lvFootprintCells).toBe('0');expect(calls.fillText).toBe(before);
  for(const type of ['Delta','Total','Ladder']){layer.render(args(bars,'footprint',190,199,60,{type,calcStackedImbalance:true,showUnfinishedAuction:true}));expect(Number(canvas.dataset.lvFootprintCells)).toBeGreaterThan(40);}
  // No volume: candles only, no invented rows.
  layer.render(args(bars.map(({volume:_v,...bar})=>bar) as Bar[],'footprint',190,199,60));expect(canvas.dataset.lvFootprintCells).toBe('0');
 });
 it('performance: 5,000 bars switch and a cached repaint stay inside the PERF budgets (median of 3)',()=>{
  const bars=build(5000);registerTemporalChartTypes();
  const median=(run:()=>void)=>{const samples:number[]=[];for(let k=0;k<3;k++){const t=performance.now();run();samples.push(performance.now()-t);}return samples.sort((a,b)=>a-b)[1];};
  const first=median(()=>{const {canvas}=mockCanvas(),layer=rendererLayers().find(row=>row.id==='footprint')!.create();layer.mount(canvas);layer.render(args(bars,'footprint',4850,4999,20));});
  const {canvas}=mockCanvas(),layer=rendererLayers().find(row=>row.id==='footprint')!.create();layer.mount(canvas);layer.render(args(bars,'footprint',4850,4999,20));
  const repaint=median(()=>layer.render(args(bars,'footprint',4850,4999,20)));
  console.log(`CT-FOOTPRINT bench ms: first paint 5000 bars / 150 visible ${first.toFixed(1)}, cached repaint ${repaint.toFixed(2)}`);
  expect(first).toBeLessThan(50);expect(repaint).toBeLessThan(16);
 });
});

describe('ALERT.FOOTPRINT.* sources (SYNTHETIC)',()=>{
 const prefix:Bar[]=[{time:864_000,open:100,high:101,low:99,close:100.5,volume:400},{time:864_300,...UP}];
 it('a footprint chart offers the seven metrics with frozen settings; no volume refuses them',()=>{
  const choices=footprintAlertChoices(prefix,{rowSize:'Ticks per row',ticksPerRow:100},0.01);
  expect(choices.map(c=>c.id)).toEqual(FOOTPRINT_ALERT_METRICS.map(m=>'footprint:'+m));
  expect(choices.map(c=>c.label)).toEqual(['Volume footprint: New buy imbalance','Volume footprint: New sell imbalance','Volume footprint: Stacked buy imbalance','Volume footprint: Stacked sell imbalance','Volume footprint: Volume delta','Volume footprint: Total buy volume','Volume footprint: Total sell volume']);
  expect(choices[0].source!.inputs).toEqual({rowSize:1,imbalancePercent:300,stackedImbalanceCount:3,ignoreZeroVolume:false,minimalImbalanceVolume:0});
  expect(choices.filter(c=>c.signal).length).toBe(4);
  for(const c of choices){expect(()=>validateTechnicalAlertSource(c.source)).not.toThrow();expect(alertSourceType(c.source!)).toBe('indicator');expect(alertConditionMemberRefusal(c.source!)).toBeNull();}
  expect(footprintAlertChoices(prefix.map(({volume:_v,...b})=>b),{},0.01).every(c=>c.source===null&&/volume/.test(c.disabledReason!))).toBe(true);
  expect(()=>validateFootprintAlertSource({...choices[0].source!,extra:1})).toThrow();
  expect(()=>validateFootprintAlertSource({...choices[0].source!,inputs:{...choices[0].source!.inputs,rowSize:-1}})).toThrow();
 });
 it('evaluates the endpoint bar with the frozen settings through the technical alert pipeline',async()=>{
  const inputs={rowSize:1,imbalancePercent:300,stackedImbalanceCount:3,ignoreZeroVolume:false,minimalImbalanceVolume:0};
  const sources=FOOTPRINT_ALERT_METRICS.map(metric=>footprintAlertSource(metric,inputs,'snap-'+metric));
  const batch=await evaluateTechnicalAlertSources(prefix,sources,'USD');
  const values=sources.map(source=>[...batch.results.values()].find(row=>row.sample.source.kind==='footprint'&&(row.sample.source as {metric:string}).metric===source.metric)!.sample.value);
  // Endpoint = UP: one buy imbalance (row 11), no sell imbalance, no stacks; delta 120, buy 360, sell 240.
  expect(values).toEqual([1,0,0,0,120,360,240]);
  const row=[...batch.results.values()][4];expect(row.sample.operands!.left.basis).toMatch(/approximated/);expect(row.diagnostics).toEqual([]);
  expect(technicalSourceLabel(sources[4])).toBe('Volume footprint: Volume delta');
  expect(footprintAlertValue([{open:1,high:2,low:1,close:2}],sources[0]).value).toBeNull();
 });
});
