import {describe,expect,it} from 'vitest';
import {calculateIndicator,indicatorActivePlotIds} from '../../src/domain/indicators';
import {rsiDivergenceSettings,rsiDivergencePivotPrice} from '../../src/domain/rsi-divergence';
import {defaultIndicatorPresentation,indicatorCreationInputs,indicatorDefaults,indicatorInputSchema,validateIndicatorPresentation,RSI_MA_PALETTE_DEFAULTS,INDICATOR_KINDS,indicatorEstimatedSlots,type IndicatorInstanceSettings} from '../../src/chart/indicator-settings';
import {renderIndicatorPresentation} from '../../src/chart/indicator-presentation';
import {factoryIndicatorDefault} from '../../src/ui/indicator-library';
import type {Bar} from '../../src/domain/types';

// RSI2. SYNTHETIC hand-built closes (not market data); the same shape as the RSI zone test.
function bars():Bar[]{
 const closes:number[]=[];for(let i=0;i<25;i++)closes.push(120+Math.sin(i/2)*0.5);for(let i=0;i<10;i++)closes.push(120-i*3.5);for(let i=1;i<=14;i++)closes.push(88.5+i*1.5);for(let i=0;i<18;i++)closes.push(108-i*1.25);for(let i=1;i<=20;i++)closes.push(86.75+i*0.9);
 return closes.map((close,i)=>({time:1700000000+i*86400,open:close+0.2,high:close+1,low:close-1,close,volume:1000}));
}
const settingsOf=(inputs:Record<string,unknown>,presentation=defaultIndicatorPresentation('rsi')):IndicatorInstanceSettings=>({id:'i',kind:'rsi',inputs:inputs as IndicatorInstanceSettings['inputs'],plots:{},offset:0,visible:true,presentation});

describe('RSI2 creation seed: RSI-based MA SMA 21 and Candle body only on for new RSIs only',()=>{
 it('the factory default of a new RSI carries Candle body only on; absent still means off',()=>{
  expect(factoryIndicatorDefault('rsi').inputs.divergenceBodyOnly).toBe(true);
  expect(indicatorCreationInputs('rsi')).toEqual({...indicatorDefaults.rsi,smoothingType:'SMA',smoothingLength:21,divergenceBodyOnly:true});
  expect(indicatorDefaults.rsi.smoothingType).toBe('None');
  expect(Object.hasOwn(indicatorDefaults.rsi,'divergenceBodyOnly')).toBe(false);
  expect(rsiDivergenceSettings({}).bodyOnly).toBe(false);
  expect(indicatorInputSchema('rsi').find(row=>row.key==='divergenceBodyOnly')).toMatchObject({defval:false});
  for(const kind of INDICATOR_KINDS.filter(kind=>kind!=='rsi'))expect(factoryIndicatorDefault(kind).inputs,kind).toEqual(indicatorDefaults[kind]);
 });
 it('a saved RSI without the new keys keeps identical plots and values',()=>{
  const data=bars(),legacy={length:14,source:'close',divergence:true},explicit={...legacy,divergenceBodyOnly:false,divergencePricePane:false,divergenceBackground:false};
  expect(indicatorActivePlotIds('rsi',legacy)).toEqual(['rsi','divergenceBullish','divergenceBearish']);
  const a=calculateIndicator('rsi',data,legacy),b=calculateIndicator('rsi',data,explicit);
  expect(a.diagnostics).toEqual([]);expect(a.series).toEqual(b.series);expect(a.divergence).toEqual(b.divergence);
  const legacyOut=renderIndicatorPresentation(settingsOf(legacy,defaultIndicatorPresentation('rsi',true)),a,data);
  expect(legacyOut.output.lines).toBeUndefined();expect(legacyOut.output.backgrounds).toBeUndefined();
 });
});

describe('RSI2 RSI-based MA: rising and falling colors',()=>{
 it('new RSIs carry the OpenCandle palette; legacy drafts do not; other kinds refuse it',()=>{
  expect(defaultIndicatorPresentation('rsi').maPalette).toEqual(RSI_MA_PALETTE_DEFAULTS);
  expect(defaultIndicatorPresentation('rsi',true).maPalette).toBeUndefined();
  expect(()=>validateIndicatorPresentation('rsi',defaultIndicatorPresentation('rsi'))).not.toThrow();
  expect(()=>validateIndicatorPresentation('sma',{...defaultIndicatorPresentation('sma'),maPalette:RSI_MA_PALETTE_DEFAULTS})).toThrow(/only supported for RSI/);
  expect(()=>validateIndicatorPresentation('rsi',{...defaultIndicatorPresentation('rsi'),maPalette:{rising:'#3fbf8f'}})).toThrow();
 });
 it('each MA point takes the rising color above its previous value and the falling color otherwise',()=>{
  const data=bars(),inputs={length:14,source:'close',smoothingType:'SMA',smoothingLength:21,smoothingMultiplier:2},result=calculateIndicator('rsi',data,inputs);
  const index=result.series.findIndex(row=>row.id==='smooth'),values=result.series[index].values;expect(index).toBeGreaterThan(0);
  const out=renderIndicatorPresentation(settingsOf(inputs),result,data),points=(out.output.series![index] as {points:{color?:string}[]}).points;
  let rising=0,falling=0;
  values.forEach((value,i)=>{
   if(value===null){expect(points[i].color).toBeUndefined();return;}
   const previous=values[i-1],up=previous!==null&&previous!==undefined&&value>previous;
   expect(points[i].color,`bar ${i}`).toBe(up?RSI_MA_PALETTE_DEFAULTS.rising:RSI_MA_PALETTE_DEFAULTS.falling);up?rising++:falling++;
  });
  expect(rising).toBeGreaterThan(0);expect(falling).toBeGreaterThan(0);
  // A legacy RSI (no palette) keeps the single Style color.
  const plain=renderIndicatorPresentation(settingsOf(inputs,defaultIndicatorPresentation('rsi',true)),result,data);
  expect((plain.output.series![index] as {points:{color?:string}[]}).points.every(point=>point.color===undefined)).toBe(true);
 });
});

describe('RSI2 price pane and background divergences (off by default)',()=>{
 const data=bars(),base={length:14,source:'close',divergence:true};
 it('price pane lines join the two price pivots on the price pane, wick or body',()=>{
  for(const body of [false,true]){
   const inputs={...base,divergencePricePane:true,divergenceBodyOnly:body},result=calculateIndicator('rsi',data,inputs),segments=result.divergence!.segments;
   expect(segments.length).toBeGreaterThan(0);
   const lines=renderIndicatorPresentation(settingsOf(inputs),result,data).output.lines!;
   expect(lines.map(line=>[line.overlay,line.x1,line.y1,line.x2,line.y2])).toEqual(segments.map(row=>{const low=row.kind==='bullish'||row.kind==='hiddenBullish';return [true,data[row.fromIndex].time*1000,rsiDivergencePivotPrice(data[row.fromIndex],low,body),data[row.toIndex].time*1000,rsiDivergencePivotPrice(data[row.toIndex],low,body)];}));
  }
  const off=calculateIndicator('rsi',data,base);
  expect(renderIndicatorPresentation(settingsOf(base),off,data).output.lines).toBeUndefined();
  const inputs={...base,divergencePricePane:true},result=calculateIndicator('rsi',data,inputs),hidden=renderIndicatorPresentation({...settingsOf(inputs),plots:{divergenceBullish:{visible:false,color:'#3fbf8f',width:1,lineStyle:'solid',kind:'line',priceScale:true,legend:true,dataWindow:true},divergenceBearish:{visible:false,color:'#e8605a',width:1,lineStyle:'solid',kind:'line',priceScale:true,legend:true,dataWindow:true}}},result,data);
  expect(hidden.output.lines).toBeUndefined();
 });
 it('a background marks the later pivot bar on the RSI pane',()=>{
  const inputs={...base,divergenceBackground:true},result=calculateIndicator('rsi',data,inputs),segments=result.divergence!.segments;
  const rows=renderIndicatorPresentation(settingsOf(inputs),result,data).output.backgrounds!;
  expect(rows.map(row=>[row.overlay,row.from,row.to])).toEqual(segments.map(row=>[undefined,data[row.toIndex].time*1000,data[row.toIndex+1].time*1000]));
  expect(renderIndicatorPresentation(settingsOf(base),calculateIndicator('rsi',data,base),data).output.backgrounds).toBeUndefined();
 });
});

describe('RSI2 naming and zone cost',()=>{
 it('the RSI smoothing reads as the RSI-based MA in inputs and the legend; keys unchanged',()=>{
  const schema=indicatorInputSchema('rsi');
  expect(schema.filter(row=>row.key.startsWith('smoothing')).map(row=>[row.key,row.title])).toEqual([['smoothingType','RSI-based MA type'],['smoothingLength','RSI-based MA length'],['smoothingMultiplier','RSI-based MA BB standard deviations']]);
  expect(indicatorInputSchema('sma').find(row=>row.key==='smoothingType')!.title).toBe('Smoothing type');
  const data=bars();
  expect(calculateIndicator('rsi',data,{length:14,source:'close',smoothingType:'SMA',smoothingLength:21,smoothingMultiplier:2}).series.map(row=>row.label)).toEqual(['RSI','RSI-based MA']);
  expect(calculateIndicator('rsi',data,{length:14,source:'close',smoothingType:'SMA+BB',smoothingLength:21,smoothingMultiplier:2}).series.map(row=>row.label)).toEqual(['RSI','RSI-based MA','RSI-based MA upper band','RSI-based MA lower band']);
  expect(calculateIndicator('sma',data,{length:9,source:'close',smoothingType:'SMA',smoothingLength:3,smoothingMultiplier:2}).series[1].label).toBe('Smoothing SMA');
 });
 it('visible zone fills are native boxes: no per-bar anchor slots',()=>{
  const p=defaultIndicatorPresentation('rsi'),off={...p,fills:{...p.fills,bullZone:{...p.fills.bullZone!,visible:false},bearZone:{...p.fills.bearZone!,visible:false}}},inputs={length:14,source:'close'};
  expect(indicatorEstimatedSlots('rsi',100000,inputs,p)-indicatorEstimatedSlots('rsi',100000,inputs,off)).toBe(0);
 });
});
