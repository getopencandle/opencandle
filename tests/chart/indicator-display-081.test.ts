import {describe,expect,it,vi} from 'vitest';
import {volumeDeltaCandleSeries} from '../../src/chart/volume-delta-presentation';
import type {IndicatorResult} from '../../src/domain/indicators';
import type {Bar} from '../../src/domain/types';

// SYNTHETIC bars. The renderer reads an indicator candle series by chart bar index (bars[i - offset]).
const T=1767225600,bar=(i:number):Bar=>({time:T+i*300,open:10,high:11,low:9,close:10,volume:100});
const settings=(kind:string)=>({id:'vi-test',kind,offset:0,plots:{}}) as never;
const result=(rows:Record<string,(number|null)[]>):IndicatorResult=>({id:'volumedelta',series:Object.entries(rows).map(([id,values])=>({id,label:id,values})),diagnostics:[],policies:[]}) as unknown as IndicatorResult;
/** What the pane autoscale folds in at chart bars i0..i1 (vela considerSeries for candle series). */
const scaleOf=(bars:{high:number;low:number}[],i0:number,i1:number)=>{let min=Infinity,max=-Infinity;for(let i=i0;i<=i1;i++){const b=bars[i];if(!b)continue;for(const v of [b.high,b.low])if(Number.isFinite(v)){min=Math.min(min,v);max=Math.max(max,v);}}return {min,max};};

describe('volume delta candles stay on their own bars',()=>{
 it('keeps one row per chart bar so known candles are drawn and autoscaled where they belong',()=>{
  const bars=[0,1,2,3,4].map(bar);
  const out=volumeDeltaCandleSeries(settings('volumedelta'),result({open:[null,null,null,0,0],high:[null,null,null,779261,10],low:[null,null,null,0,-8580000],close:[null,null,null,383042,-8580000]}),bars);
  expect(out.bars).toHaveLength(5);
  expect(out.bars.map(row=>row.time)).toEqual(bars.map(row=>row.time*1000));
  expect(out.bars[3]).toEqual({time:bars[3].time*1000,open:0,high:779261,low:0,close:383042});
  expect([0,1,2].every(i=>Number.isNaN(out.bars[i].close))).toBe(true);
  // The visible window is the last two bars: its scale holds both candles' full ranges.
  expect(scaleOf(out.bars,3,4)).toEqual({min:-8580000,max:779261});
 });
 it('emits no rows at all while no candle is known',()=>{
  expect(volumeDeltaCandleSeries(settings('cvd'),result({open:[null,null],high:[null,null],low:[null,null],close:[null,null]}),[0,1].map(bar)).bars).toEqual([]);
 });
});

import {calculateIndicator} from '../../src/domain/indicators';
describe('Trading sessions draw Tokyo, London and New York by default',()=>{
 it('a fresh study on a 5m chart finds all three sessions without any setup',()=>{
  // SYNTHETIC 5m bars over one full UTC weekday (2025-06-03).
  const start=Date.UTC(2025,5,3)/1000,bars:Bar[]=Array.from({length:288},(_,i)=>({time:start+i*300,open:10,high:11,low:9,close:10,volume:100}));
  const result=calculateIndicator('tradingsessions',bars,{},{resolution:'5m',style:'candles',tickSize:0.01} as never);
  expect(result.diagnostics).toEqual([]);
  const names=new Set((result.sessions??[]).map(row=>(row as {name:string}).name));
  expect([...names].sort()).toEqual(['London','New York','Tokyo']);
  expect(result.series.every(plot=>plot.values.some(value=>value!==null))).toBe(true);
 });
});

import {setDemoDataMode} from '../../src/domain/demo-mode';
import {demoDataset,exampleComponentDataset} from '../../src/ui/workspace-grid';
import {alignSecondCloses} from '../../src/domain/second-symbol';
describe('two-symbol studies read example symbols on the example screen',()=>{
 it('SPY on a GME daily example chart has a full aligned series; other modes and unknown symbols stay null',()=>{
  setDemoDataMode('example');
  try{
   const spy=exampleComponentDataset('spy','1D')!,gme=demoDataset('GME');
   expect(spy.bars.length).toBeGreaterThan(100);
   const aligned=alignSecondCloses(gme.bars,spy.bars);
   expect(aligned.slice(-50).every(value=>typeof value==='number')).toBe(true);
   expect(exampleComponentDataset('SPY','5m')?.bars.length).toBeGreaterThan(0);
   expect(exampleComponentDataset('MSFT','1D')).toBeNull();
   setDemoDataMode('off');expect(exampleComponentDataset('SPY','1D')).toBeNull();
  }finally{setDemoDataMode('legacy');}
 });
});

import {assertIndicatorBatchBudget,indicatorCreationInputs} from '../../src/chart/indicator-settings';
import {tradingSessionShapes} from '../../src/chart/trading-sessions-presentation';
describe('default Trading sessions fit long intraday histories',()=>{
 it('three default windows on 20,000 bars pass the batch budget',()=>{
  expect(()=>assertIndicatorBatchBudget([{kind:'tradingsessions',inputs:indicatorCreationInputs('tradingsessions'),plots:{},offset:0}] as never,20000)).not.toThrow();
 });
 it('draws the latest 500 sessions of each window',()=>{
  const records=Array.from({length:1200},(_,i)=>({window:i%2,day:String(i),from:i*86400,to:i*86400+3600,high:2,low:1,open:1,close:2,average:1.5,name:'S',color:'#2962ff',available:true,count:4,rangeTicks:null}));
  const out=tradingSessionShapes(records as never,{showNames:false,showOpenClose:false,showRange:false,showAverage:false,visible:()=>true,labelInverted:false},role=>role);
  expect(out.boxes).toHaveLength(1000);expect(out.boxes.at(-1)!.left).toBe(1199*86400*1000);
 });
});

import {renderIndicatorPresentation} from '../../src/chart/indicator-presentation';
import type {IndicatorId} from '../../src/domain/indicators';
import {defaultIndicatorPresentation,indicatorDefaults} from '../../src/chart/indicator-settings';
const full=(kind:string,inputs:Record<string,unknown>={})=>({id:'vi',kind:kind as IndicatorId,inputs:{...indicatorDefaults[kind as IndicatorId],...inputs} as never,plots:{},offset:0,visible:true,presentation:defaultIndicatorPresentation(kind as IndicatorId)});
// SYNTHETIC 1h bars over two UTC days, price stepping up so each day's average differs.
const hourly:Bar[]=Array.from({length:48},(_,i)=>({time:Date.UTC(2025,5,3)/1000+i*3600,open:10+i,high:11+i,low:9+i,close:10+i,volume:100}));
describe('VWAP and TWAP break at the anchor reset',()=>{
 it('TWAP (1D anchor) draws no stroke into the first bar of the second day',()=>{
  const settings=full('twap'),result=calculateIndicator('twap',hourly,settings.inputs,{resolution:'1h',calendar:'utc'});
  const line=renderIndicatorPresentation(settings as never,result,hourly,{resolution:'1h',calendar:'utc'}).output.series![0] as {points:{value:number|null;color?:string}[]};
  expect(line.points[24].color).toBe('rgba(0,0,0,0)');
  expect(line.points.filter(point=>point.color==='rgba(0,0,0,0)')).toHaveLength(1);
 });
 it('VWAP (Session anchor, UTC) breaks at the session start',()=>{
  const settings=full('vwap',{anchor:'Session',timezone:'UTC'}),result=calculateIndicator('vwap',hourly,settings.inputs,{resolution:'1h',calendar:'utc'});
  const line=renderIndicatorPresentation(settings as never,result,hourly,{resolution:'1h',calendar:'utc'}).output.series!.find(row=>(row as {points?:unknown}).points) as {points:{color?:string}[]};
  expect(line.points[24].color).toBe('rgba(0,0,0,0)');
 });
});

describe('Average daily range on an intraday chart uses completed daily ranges',()=>{
 it('steps once per day and ignores the developing day',()=>{
  // SYNTHETIC 1h bars, 24 per UTC day; day d spans a range of 2 + d.
  const bars:Bar[]=Array.from({length:24*4},(_,i)=>{const d=Math.floor(i/24),mid=100;return {time:Date.UTC(2025,5,2)/1000+i*3600,open:mid,high:mid+(i%24===5?1+d/2:0.1),low:mid-(i%24===7?1+d/2:0.1),close:mid,volume:1};});
  const adr=calculateIndicator('adr',bars,{length:2},{resolution:'1h',calendar:'utc'}).series[0].values;
  expect(adr.slice(0,48).every(value=>value===null)).toBe(true);
  expect(new Set(adr.slice(48,72))).toEqual(new Set([2.5]));// days 0 and 1: ranges 2 and 3
  expect(new Set(adr.slice(72,96))).toEqual(new Set([3.5]));// days 1 and 2
 });
});

import {indicatorPlotTextAt} from '../../src/ui/data-window-model';
describe('volume-unit studies read abbreviated like Volume',()=>{
 it('EFI, OBV, A/D, Chaikin osc, Klinger and CVD use K/M/B in the shared legend and data window reader',()=>{
  for(const kind of ['efi','obv','ad','chaikinosc','klinger','cvd'])expect(indicatorPlotTextAt([-8584922],null,{kind:kind as never,precision:'auto'},0.01)).toBe('-8.58 M');
  expect(indicatorPlotTextAt([67850.5],null,{kind:'sma' as never,precision:'auto'},0.01)).toBe('67850.50');
 });
});

describe('Pivot points standard names its levels and keeps far levels off by default',()=>{
 it('labels P, R1, S1, R2, S2 at each period start; R3-R5 and S3-S5 start hidden',()=>{
  // SYNTHETIC daily bars across three months (monthly pivots on 1D Auto).
  const bars:Bar[]=Array.from({length:90},(_,i)=>({time:Date.UTC(2025,0,1)/1000+i*86400,open:100+i%7,high:104+i%7,low:96+i%7,close:101+i%7,volume:1}));
  const settings=full('pivots'),result=calculateIndicator('pivots',bars,settings.inputs,{resolution:'1D',calendar:'utc'});
  const out=renderIndicatorPresentation(settings as never,result,bars,{resolution:'1D',calendar:'utc'}).output;
  const texts=new Set((out.labels??[]).map(label=>label.text));
  expect([...texts].sort()).toEqual(['P','R1','R2','S1','S2']);
  const shown=(out.series??[]).filter(row=>(row as {display?:{pane?:boolean}}).display?.pane!==false&&(row as {visible?:boolean}).visible!==false).map(row=>(row as {title?:string}).title);
  for(const far of ['R3','S3','R4','S4','R5','S5'])expect(shown.some(title=>title?.endsWith(far))).toBe(false);
 });
});

import {patternMarksNative} from '../../src/chart/indicator-presentation';
import {bubbleRect,clipLineToWindow,insetPx,installPatternLabelLayout,layoutPatternBubbles,LEGEND_GAP,LEGEND_RECHECK_MS,placePlainCount,priceAtPixel,scaleDrawingSet,type LayoutBubble} from '../../src/chart/indicator-pattern-layout';
import {readFileSync,writeFileSync,mkdirSync,unlinkSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {resolve,dirname} from 'node:path';
import {randomUUID} from 'node:crypto';
/** The installed (patched) renderer's drawing scene, whose priceRange is the drawing part of the pane autoscale. */
async function renderedScene():Promise<any>{
 const path=resolve('node_modules/@luxalgo/vela/dist/chunk-UNUVPQFW.js'),temporary=resolve('.cache',`lv-pattern-scale-${randomUUID()}.mjs`);mkdirSync(dirname(temporary),{recursive:true});
 try{writeFileSync(temporary,readFileSync(path,'utf8').replace(/(from\s+['"])(\.\/[^'"]+)(['"])/g,(_all,before,relative,after)=>before+pathToFileURL(resolve(dirname(path),relative)).href+after)+'\nexport { DrawingSceneRenderer as LVScene };\n');return await import(/* @vite-ignore */ pathToFileURL(temporary).href);}
 finally{try{unlinkSync(temporary);}catch{/* already gone */}}
}
describe('pattern labels do not pile up',()=>{
 const NL=String.fromCharCode(10);
 const bars:Bar[]=Array.from({length:30},(_,i)=>({time:1700000000+i*86400,open:10,high:11,low:9,close:10,volume:1}));
 const style=()=>({visible:true,color:'#089981',width:1,lineStyle:'solid',priceScale:true,legend:true,dataWindow:true}) as never;
 const marks=(markers:object[])=>({marks:{markers,lines:[]}}) as never;
 it('one bar and side share one label; bubbles stay anchored at their bar (laid out at paint); bare counts are plain small text',()=>{
  const out=patternMarksNative('p',marks([
   {index:5,plot:'bullish',text:'EG',tooltip:'Bullish engulfing'},{index:5,plot:'bullish',text:'H',tooltip:'Hammer'},
   {index:7,plot:'bullish',text:'TB',tooltip:'Tweezer bottom'},{index:14,plot:'bullish',text:'LLS',tooltip:'Long lower shadow'},
   {index:20,plot:'bearish',text:'3',tooltip:'Count 3'},
  ]),bars,style);
  expect(out.labels.map(label=>label.text)).toEqual(['EG'+NL+'H','TB','LLS','3']);
  expect(out.labels[0].tooltip).toBe('Bullish engulfing'+NL+'Hammer');
  // No price-space lanes: an outer lane label would widen the price scale. Collisions are resolved in pixels at paint.
  for(const label of out.labels.slice(0,3))expect(label).toMatchObject({yloc:'belowbar',style:'label_up'});
  expect(out.labels[3]).toMatchObject({style:'none',size:'tiny',textColor:out.labels[3].color});
 });
 it('paint-time layout: overlapping bubbles stack outward, the legend is avoided, and nothing leaves the pane',()=>{
  const above=(key:number,px:number,py=100):LayoutBubble=>({key,px,py,width:30,height:20,side:'above',flipPy:py+60});
  const result=layoutPatternBubbles([above(0,100),above(1,110),above(2,120),above(3,300)],400);
  const rects=result.map((row,i)=>bubbleRect([100,110,120,300][i],row.py,30,20,row.side));
  for(let i=0;i<rects.length;i++)for(let j=i+1;j<rects.length;j++){const a=rects[i],b=rects[j];expect(a.left<b.right&&b.left<a.right&&a.top<b.bottom&&b.top<a.bottom,`${i}/${j}`).toBe(false);}
  expect(result[0].moved).toBe(false);expect(result[1].py).toBeLessThan(result[0].py);expect(result[2].py).toBeLessThan(result[1].py);expect(result[3].moved).toBe(false);
  // A bubble under the legend box moves to the other side of its bar when there is no room above.
  const legend={left:0,top:0,right:200,bottom:60};const near=layoutPatternBubbles([above(0,50,40)],400,[legend])[0];
  expect(near.side).toBe('below');const rect=bubbleRect(50,near.py,30,20,near.side);expect(rect.top).toBeGreaterThanOrEqual(legend.bottom);expect(rect.bottom).toBeLessThanOrEqual(400);
 });
 it('pixel-to-price inversion and window clipping for the autoscale',()=>{
  const linear=(price:number)=>400-price*4;expect(priceAtPixel(linear,200,10)).toBeCloseTo(50,8);expect(priceAtPixel(linear,380,60)).toBeCloseTo(5,8);
  const log=(price:number)=>400-Math.log(price)*50;expect(priceAtPixel(log,400-Math.log(80)*50,20)).toBeCloseTo(80,6);
  // A ray from an old pivot (bar 0, price 100) down to bar 10 (price 90): only bars 50..60 are visible, so only 50..40 count.
  expect(clipLineToWindow(0,10,100,90,'right',50,60)).toEqual({x1:50,x2:60,y1:50,y2:40});
  expect(clipLineToWindow(0,10,100,90,'none',50,60)).toBeNull();
  const set={lines:[{id:'lv-decoration:["a","pattern:line:0"]',xloc:'bar_index',x1:0,x2:10,y1:100,y2:90,extend:'right',invisible:false},{id:'script-line',xloc:'bar_index',x1:0,x2:10,y1:100,y2:90,extend:'right'}],labels:[]};
  // The autoscale reads only the visible part of the anchored segment: a ray whose pivots are off screen adds nothing, and
  // its projection never counts; other (script) drawings are untouched.
  expect(scaleDrawingSet(set,50,60,0,(_xloc,x)=>x).lines).toEqual([set.lines[1]]);
  // A pattern line counts only its pivots on visible bars (0.8.2): with bar 0 off screen only the bar 10 pivot (90) counts,
  // not the stretch rising toward the old pivot.
  const shown=scaleDrawingSet(set,5,60,0,(_xloc,x)=>x);expect(shown.lines[0]).toMatchObject({x1:10,x2:10,y1:90,y2:90,extend:'none'});expect(shown.lines[1]).toBe(set.lines[1]);
  expect(scaleDrawingSet(set,0,60,0,(_xloc,x)=>x).lines[0]).toMatchObject({x1:0,x2:10,y1:100,y2:90});
  // Other decoration lines (levels, divergence lines) still count the visible part of their segment.
  const level={lines:[{id:'lv-decoration:["a","divergence:line:0"]',xloc:'bar_index',x1:0,x2:10,y1:100,y2:90,extend:'none',invisible:false}],labels:[]};
  expect(scaleDrawingSet(level,5,60,0,(_xloc,x)=>x).lines[0]).toMatchObject({x1:5,x2:10,y1:95,y2:90});
 });
 it('left and right edge labels move inward whole; a bar off the pane is left as it is',()=>{
  expect(insetPx(3,30,800)).toBe(17);expect(insetPx(798,30,800)).toBe(783);expect(insetPx(400,30,800)).toBe(400);
  expect(insetPx(-10,30,800)).toBe(-10);expect(insetPx(810,30,800)).toBe(810);
 });
 it('plain counts keep clear of the legend: outward first, then the other side of the bar, never off the pane',()=>{
  const legend={left:0,top:0,right:200,bottom:60};
  // Free natural place: unchanged.
  expect(placePlainCount(300,8,12,true,100,140,400,[legend])).toBeNull();
  // Above a bar whose high is under the legend: no room above (the pane top), so below the bar.
  const below=placePlainCount(50,8,12,true,40,70,400,[legend])!;expect(below.above).toBe(false);expect(below.cy-6).toBeGreaterThanOrEqual(legend.bottom);
  // A bar wholly inside the legend band: the count moves down past the legend, clear of it.
  const past=placePlainCount(50,8,12,false,20,45,400,[legend])!;expect(past.above).toBe(false);expect(past.cy-6).toBeGreaterThan(legend.bottom+LEGEND_GAP/2);
  // A count under a legend box low on the pane moves up past it on its own side.
  const up=placePlainCount(50,8,12,true,300,340,400,[{left:0,top:270,right:200,bottom:295}])!;expect(up.above).toBe(true);expect(up.cy+6).toBeLessThan(270);
 });
 it('Sequential counts painted by the installed renderer: whole at the left edge, clear of the legend, scale unchanged',async()=>{
  const {LVScene}=await renderedScene();
  const rows=Array.from({length:40},(_,i)=>({high:i<3?96:60,low:i<3?90:50}));// bars 0-2 reach up under the legend
  const scene=new LVScene({timeToLogical:(ms:number)=>ms,barAt:(at:number)=>rows[Math.round(at)]??null,theme:{textColor:'#fff',fontFamily:'sans-serif'}});
  const chrome=Object.assign(Object.create({drawingsRange(){return null;}}),{drawScene:scene});
  const legend={left:0,top:0,right:300,bottom:40};
  const dispose=installPatternLabelLayout({indicatorSlices:{drawScene:scene},chrome} as never,()=>[legend]);
  try{
   const id=(n:number)=>`lv-decoration:${JSON.stringify(['seq','pattern:marker:'+n])}`;
   const labels=[
    {id:id(0),xloc:'bar_time',x:0,yloc:'abovebar',text:'7',style:'none',size:'tiny',color:'#f00',textColor:'#f00',textAlign:'center'},
    {id:id(1),xloc:'bar_time',x:20,yloc:'belowbar',text:'4',style:'none',size:'tiny',color:'#0f0',textColor:'#0f0',textAlign:'center'},
    {id:id(2),xloc:'bar_time',x:0,yloc:'belowbar',text:'9▲',style:'label_up',size:'small',color:'#0f0',textColor:'#fff',textAlign:'center'},
   ];
   const set={lines:[],boxes:[],labels,polylines:[],linefills:[]};scene.setSet(set,0);
   const texts:{text:string;x:number;y:number}[]=[];
   const ctx=new Proxy({font:'10px sans-serif',textAlign:'center',measureText:(t:string)=>({width:String(t).length*6}),getTransform:()=>({a:1,f:0}),fillText:(text:string,x:number,y:number)=>texts.push({text,x,y})} as Record<string,any>,{get:(target,key)=>typeof key==="string"&&key in target?target[key]:()=>{},set:(target,key,value)=>{target[key as string]=value;return true;}});
   const xOf=(logical:number)=>2+logical*10,yOf=(price:number)=>400-price*4;// 400 px pane, price 100 at the top
   scene.render(ctx,600,400,xOf,yOf);
   const seven=texts.find(row=>row.text==='7')!,nine=texts.find(row=>row.text==='9▲')!,four=texts.find(row=>row.text==='4')!;
   // The bar 0 count is drawn whole (its center at least half its width from the left edge) and clear of the legend.
   expect(seven.x).toBeGreaterThanOrEqual(3);expect(seven.y-6).toBeGreaterThanOrEqual(legend.bottom);
   expect(nine.x-(2*6+12)/2).toBeGreaterThanOrEqual(0);
   // A count away from the edge and the legend stays at its bar.
   expect(four.x).toBe(xOf(20));expect(four.y).toBeCloseTo(yOf(50)+14,6);
   // The stored labels are untouched (the autoscale reads them, not the painted places).
   expect(scene.set.labels).toBe(labels);expect(labels[0]).toMatchObject({xloc:'bar_time',x:0,yloc:'abovebar'});
  }finally{dispose();}
  // A legend row that mounts after the paint (a newly added study) asks for one repaint; unchanged boxes ask for none.
  vi.useFakeTimers();
  try{
   let boxes=[legend],repaints=0;const again=installPatternLabelLayout({indicatorSlices:{drawScene:scene},chrome} as never,()=>boxes,()=>{repaints++;});
   const ctx=new Proxy({measureText:(t:string)=>({width:String(t).length*6}),getTransform:()=>({a:1,f:0})} as Record<string,any>,{get:(target,key)=>typeof key==='string'&&key in target?target[key]:()=>{},set:(target,key,value)=>{target[key as string]=value;return true;}});
   const paint=()=>scene.render(ctx,600,400,(l:number)=>2+l*10,(p:number)=>400-p*4);
   try{
    paint();vi.advanceTimersByTime(LEGEND_RECHECK_MS);expect(repaints).toBe(0);
    paint();boxes=[legend,{left:0,top:40,right:240,bottom:62}];vi.advanceTimersByTime(LEGEND_RECHECK_MS);expect(repaints).toBe(1);
    paint();vi.advanceTimersByTime(LEGEND_RECHECK_MS);expect(repaints).toBe(1);
   }finally{again();}
  }finally{vi.useRealTimers();}
 });
 it('Auto trendlines on the example data: off-screen pivots never lift the scale above the visible bars',async()=>{
  const {LVScene}=await renderedScene();
  const bars=demoDataset('GME').bars,settings=full('autotrendlines'),result=calculateIndicator('autotrendlines',bars,settings.inputs,{resolution:'1D'});
  const out=renderIndicatorPresentation(settings as never,result,bars,{resolution:'1D'}).output as {lines?:unknown[];labels?:unknown[]};
  expect(out.lines?.length).toBeGreaterThan(0);
  const index=new Map(bars.map((row,i)=>[row.time*1000,i])),scene=new LVScene({timeToLogical:(ms:number)=>index.get(ms)??NaN,barAt:(at:number)=>bars[Math.round(at)]??null,theme:{}});
  const set={lines:out.lines??[],boxes:[],labels:out.labels??[],polylines:[],linefills:[]};
  for(const width of [60,120,250]){
   const hi=bars.length+4,lo=bars.length-width;let top=-Infinity,bottom=Infinity;for(let i=lo;i<bars.length;i++){top=Math.max(top,bars[i].high);bottom=Math.min(bottom,bars[i].low);}
   scene.setSet(scaleDrawingSet(set,lo,hi,0,(xloc,x)=>scene.logicalOf(xloc,x)),0);const range=scene.priceRange(lo,hi);
   if(range){expect(range.max,String(width)).toBeLessThanOrEqual(top);expect(range.min,String(width)).toBeGreaterThanOrEqual(bottom);}
   // Unfiltered, the renderer folds both pivots of every line crossing the window: the old pivots lift the top.
   scene.setSet(set,0);expect(scene.priceRange(lo,hi).max).toBeGreaterThan(top);
  }
 });
});

describe('Auto trendlines projections do not drive the price scale',()=>{
 it('unbroken lines are rays through two pivots inside the price range; broken lines end at the breakout',()=>{
  const bars=demoDataset('GME').bars.slice(-300),settings=full('autotrendlines'),result=calculateIndicator('autotrendlines',bars,settings.inputs,{resolution:'1D'});
  const lines=renderIndicatorPresentation(settings as never,result,bars,{resolution:'1D'}).output.lines??[];
  expect(lines.length).toBeGreaterThan(0);
  const low=Math.min(...bars.map(bar=>bar.low)),high=Math.max(...bars.map(bar=>bar.high));
  for(const line of lines){expect(line.y1).toBeGreaterThanOrEqual(low);expect(line.y1).toBeLessThanOrEqual(high);if(line.extend==='right'){expect(line.y2).toBeGreaterThanOrEqual(low);expect(line.y2).toBeLessThanOrEqual(high);}}
  expect(lines.some(line=>line.extend==='right')).toBe(true);
 });
});
