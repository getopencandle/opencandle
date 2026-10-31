import {describe,expect,it} from 'vitest';
import {calculateIndicator,indicatorActivePlotIds} from '../../src/domain/indicators';
import {rsiDivergence,rsiDivergenceSettings} from '../../src/domain/rsi-divergence';
import {applyIndicatorInputEdit,defaultIndicatorPresentation,indicatorFillIds,indicatorFillLabel,indicatorGuideIds,indicatorGuideLabel,indicatorInputSchema,indicatorPlotIds,validateFrozenIndicatorInputs,validateIndicatorInputs,validateIndicatorPresentation,LV_HISTOGRAM_COLORS} from '../../src/chart/indicator-settings';
import {renderIndicatorPresentation} from '../../src/chart/indicator-presentation';
import type {Bar} from '../../src/domain/types';

// SYNTHETIC hand-built fixtures (not market data).
function build(rsi:(number|null)[],low:number[],high:number[]):Bar[]{return rsi.map((_,i)=>({time:1700000000+i*60,open:105,high:high[i],low:low[i],close:105,volume:10}));}
function fixture(){
 const N=120,rsi:(number|null)[]=Array(N).fill(50),low=Array(N).fill(100),high=Array(N).fill(110);
 const dip=(i:number,v:number,p:number)=>{rsi[i]=v;low[i]=p;},peak=(i:number,v:number,p:number)=>{rsi[i]=v;high[i]=p;};
 dip(10,20,90);dip(20,30,85);// regular bullish: lower low, higher RSI low
 dip(30,25,95);// hidden bullish (20 -> 30): higher price low, lower RSI low
 peak(40,80,120);peak(50,70,125);// regular bearish: higher high, lower RSI high
 peak(60,75,118);// hidden bearish (50 -> 60): lower price high, higher RSI high
 return {rsi,bars:build(rsi,low,high)};
}
const ALL={kinds:['bullish','bearish','hiddenBullish','hiddenBearish'] as const};
const kinds=(segments:readonly {kind:string;fromIndex:number;toIndex:number;confirmIndex:number}[])=>segments.map(row=>[row.kind,row.fromIndex,row.toIndex,row.confirmIndex]);

describe('RSI-1028 divergence (four kinds)',()=>{
 it('detects each of the four kinds on hand-built series, confirmed after the right pivot window',()=>{
  const {rsi,bars}=fixture(),result=rsiDivergence(rsi,bars,undefined,ALL);
  expect(kinds(rsiDivergence(rsi,bars).segments)).toEqual([['bullish',10,20,25],['bearish',40,50,55]]);// absent kinds: regular only
  expect(kinds(result.segments)).toEqual([['bullish',10,20,25],['hiddenBullish',20,30,35],['bearish',40,50,55],['hiddenBearish',50,60,65]]);
  expect(result.hiddenBullish[35]).toBe(25);expect(result.hiddenBullish[30]).toBeNull();expect(result.hiddenBearish[65]).toBe(75);
 });
 it('no lookahead: every prefix sees exactly the segments confirmed inside it',()=>{
  const {rsi,bars}=fixture(),full=rsiDivergence(rsi,bars,undefined,ALL);
  for(let m=1;m<=rsi.length;m++){
   const prefix=rsiDivergence(rsi.slice(0,m),bars.slice(0,m),undefined,ALL);
   expect(prefix.segments,`prefix ${m}`).toEqual(full.segments.filter(row=>row.confirmIndex<m));
   expect(prefix.hiddenBearish).toEqual(full.hiddenBearish.slice(0,m));
  }
 });
 it('pivot lookback and range inputs drive the rule; candle body only uses open/close',()=>{
  const {rsi,bars}=fixture();
  expect(kinds(rsiDivergence(rsi,bars,{left:5,right:2,minBetween:5,maxBetween:60}).segments)[0]).toEqual(['bullish',10,20,22]);
  expect(rsiDivergence(rsi,bars,{left:5,right:5,minBetween:10,maxBetween:60}).segments).toEqual([]);// 9 bars between
  expect(rsiDivergence(rsi,bars,{left:5,right:5,minBetween:0,maxBetween:8}).segments).toEqual([]);
  // Body only: open = close = 105 on every bar, so no price difference and no divergence.
  expect(rsiDivergence(rsi,bars,undefined,{...ALL,bodyOnly:true}).segments).toEqual([]);
 });
 it('settings: defaults match the owner RSI (5/5/60/5, regular on, hidden off); bad values refused',()=>{
  expect(rsiDivergenceSettings({})).toEqual({policy:{left:5,right:5,minBetween:5,maxBetween:60},kinds:['bullish','bearish'],bodyOnly:false,labels:true,pricePane:false,background:false});
  expect(()=>rsiDivergenceSettings({divergenceLeft:0})).toThrow(/Pivot lookback left/);
  expect(()=>rsiDivergenceSettings({divergenceRangeMin:70})).toThrow(/must not exceed/);
  expect(()=>validateIndicatorInputs('rsi',{divergenceRangeMin:70},true)).toThrow(/must not exceed/);
 });
 it('the calculator emits only the enabled kinds as plots, in plot order',()=>{
  const {bars}=fixture(),inputs={length:3,divergence:true,divergenceHiddenBullish:true,divergenceHiddenBearish:true,divergenceRegularBearish:false};
  expect(indicatorActivePlotIds('rsi',inputs)).toEqual(['rsi','divergenceBullish','divergenceHiddenBullish','divergenceHiddenBearish']);
  const out=calculateIndicator('rsi',bars,inputs);
  expect(out.diagnostics).toEqual([]);expect(out.series.map(row=>row.id)).toEqual(['rsi','divergenceBullish','divergenceHiddenBullish','divergenceHiddenBearish']);
 });
 it('alert conditions: every divergence kind is an RSI alert plot, valid only when captured enabled',()=>{
  for(const plot of ['divergenceBullish','divergenceBearish','divergenceHiddenBullish','divergenceHiddenBearish'])expect(indicatorPlotIds.rsi).toContain(plot);
  expect(()=>validateFrozenIndicatorInputs('rsi',{length:14,source:'close',divergence:true,divergenceHiddenBearish:true},'divergenceHiddenBearish')).not.toThrow();
  expect(()=>validateFrozenIndicatorInputs('rsi',{length:14,source:'close',divergence:true},'divergenceHiddenBearish')).toThrow(/disabled/);
 });
 it('edits never materialize an option at its default; a changed option is stored',()=>{
  expect(applyIndicatorInputEdit('rsi',{length:14,source:'close'},{divergenceLeft:5,divergenceHiddenBullish:false})).toEqual({length:14,source:'close'});
  expect(applyIndicatorInputEdit('rsi',{length:14,source:'close'},{divergenceHiddenBullish:true})).toEqual({length:14,source:'close',divergenceHiddenBullish:true});
  expect(indicatorInputSchema('rsi').find(row=>row.key==='divergenceRangeMax')).toMatchObject({title:'Max bars between pivots',type:'int',defval:60});
 });
});

describe('RSI-1028 bull and bear zones',()=>{
 it('zone guides and fills exist with the owner levels and OpenCandle colors; legacy drafts keep them hidden',()=>{
  expect(indicatorGuideIds('rsi')).toEqual(['upper','middle','lower','bullStart','bullEnd','bearStart','bearEnd']);
  expect(indicatorFillIds('rsi')).toEqual(['band','smoothing','bullZone','bearZone']);
  const p=defaultIndicatorPresentation('rsi');
  expect([p.guides.bullStart!.value,p.guides.bullEnd!.value,p.guides.bearStart!.value,p.guides.bearEnd!.value]).toEqual([65,80,35,20]);
  expect(p.fills.bullZone).toEqual({visible:true,color:LV_HISTOGRAM_COLORS.up,opacity:12});
  expect(p.fills.bearZone).toEqual({visible:true,color:LV_HISTOGRAM_COLORS.down,opacity:12});
  expect(defaultIndicatorPresentation('rsi',true).fills.bullZone!.visible).toBe(false);
  expect(()=>validateIndicatorPresentation('rsi',p)).not.toThrow();
  expect(()=>validateIndicatorPresentation('stochastic',{...defaultIndicatorPresentation('stochastic'),fills:{bullZone:p.fills.bullZone}})).toThrow(/Unsupported indicator fill/);
  expect([indicatorGuideLabel('bullStart'),indicatorGuideLabel('upper'),indicatorFillLabel('rsi','bearZone')]).toEqual(['Bull zone start','upper guide','Bear zone fill']);
 });
 it('zone fills follow the user-set boundaries; turning a zone off removes its fill; divergence labels are drawn',()=>{
  const closes:number[]=[];for(let i=0;i<25;i++)closes.push(120+Math.sin(i/2)*0.5);for(let i=0;i<10;i++)closes.push(120-i*3.5);for(let i=1;i<=14;i++)closes.push(88.5+i*1.5);for(let i=0;i<18;i++)closes.push(108-i*1.25);for(let i=1;i<=20;i++)closes.push(86.75+i*0.9);
  const bars:Bar[]=closes.map((close,i)=>({time:1700000000+i*86400,open:close+0.2,high:close+1,low:close-1,close,volume:1000}));
  const inputs={length:14,source:'close',divergence:true},result=calculateIndicator('rsi',bars,inputs);
  const presentation=defaultIndicatorPresentation('rsi');presentation.guides.bullStart={...presentation.guides.bullStart!,value:60};presentation.guides.bullEnd={...presentation.guides.bullEnd!,value:90};
  const settings={id:'i',kind:'rsi' as const,inputs,plots:{},offset:0,visible:true,presentation};
  const out=renderIndicatorPresentation(settings,result,bars);
  // Each zone is one native box between its two levels, extended both ways (no per-bar fill anchors).
  const zone=(id:string,output=out.output)=>output.boxes?.find(box=>box.id.includes('fill:'+id));
  expect([zone('bullZone')!.bottom,zone('bullZone')!.top,zone('bullZone')!.extend]).toEqual([60,90,'both']);
  expect([zone('bearZone')!.bottom,zone('bearZone')!.top]).toEqual([20,35]);
  expect(out.output.fills!.some(fill=>/fill:(bull|bear)Zone/.test(fill.id))).toBe(false);
  const off=renderIndicatorPresentation({...settings,presentation:{...presentation,fills:{...presentation.fills,bullZone:{...presentation.fills.bullZone!,visible:false}}}},result,bars);
  expect(zone('bullZone',off.output)).toBeUndefined();expect(zone('bearZone',off.output)).toBeDefined();
  expect(result.divergence!.segments.length).toBeGreaterThan(0);
  expect((out.output.labels??[]).map(label=>label.text)).toEqual(result.divergence!.segments.map(row=>({bullish:'Bull',bearish:'Bear',hiddenBullish:'H Bull',hiddenBearish:'H Bear'})[row.kind]));
  const noLabels=renderIndicatorPresentation({...settings,inputs:{...inputs,divergenceLabels:false}},calculateIndicator('rsi',bars,{...inputs,divergenceLabels:false}),bars);
  expect(noLabels.output.labels).toBeUndefined();
 });
});
