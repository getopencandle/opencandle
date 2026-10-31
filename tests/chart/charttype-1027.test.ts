// Chart type settings structure aligned with the live the reference app dialog
// Behavior and structure only; LV keeps its own palette.
import {describe,expect,it} from 'vitest';
import {rendererLayers,chartTypes,type RendererLayerArgs} from '@luxalgo/vela';
import {CHART_TYPES,TIME_AXIS_STYLES,registerTemporalChartTypes} from '../../src/chart/chart-types';
import {chartSettingsSchema,settingsDefaults,validatedSettingsBook,migrateTypeSettings,heikinAshiTypeSettings,candleAppearanceForStyle,appearanceTypeSettings} from '../../src/chart/chart-settings';
import {factoryAppearance,factoryPriceScale,findRow,hasTypeSettings,tabView,writeRow,LV_ROW_KEYS,type ChartSettingsSources} from '../../src/chart/chart-settings-bindings';
import {defaultChartSettingsDocument} from '../../src/chart/chart-settings-document';
import {serializeAppearance} from '../../src/ui/themes';
import {orderChartTypes} from '../../src/ui/top-toolbar-model';
import {latestPricePresentation} from '../../src/chart/appearance-price';
import {DERIVED_SETTING_FIELDS} from '../../src/chart/derived/derived-settings';
import {TPO_LV_DEFAULTS} from '../../src/chart/tpo';

const sources=(style:string,patch:Record<string,unknown>|null={}):ChartSettingsSources=>({appearance:factoryAppearance(),document:defaultChartSettingsDocument(),documentConnected:true,priceScale:factoryPriceScale(),ratio:null,style,typeSettings:patch===null?null:{...settingsDefaults(style),...patch},timezone:'UTC',exchangeTimezone:null});
const labels=(s:ChartSettingsSources)=>tabView('symbol',s)[0].rows.map(row=>row.label);
const keys=(s:ChartSettingsSources)=>tabView('symbol',s)[0].rows.map(row=>row.key);
function recordingCanvas(){
 const calls:{op:string;args:number[];alpha:number}[]=[];const ctx:Record<string,any>={globalAlpha:1,clearRect(){},save(){},restore(){},scale(){},beginPath(){},rect(){},clip(){},setLineDash(){},stroke(){},strokeRect(){},fillText(){},fill(){},closePath(){},arc(){},
  moveTo(...args:number[]){calls.push({op:'moveTo',args,alpha:ctx.globalAlpha});},lineTo(...args:number[]){calls.push({op:'lineTo',args,alpha:ctx.globalAlpha});},fillRect(...args:number[]){calls.push({op:'fillRect',args,alpha:ctx.globalAlpha});},createLinearGradient:()=>({addColorStop(){}})};
 return{calls,canvas:{width:400,height:400,dataset:{} as Record<string,string>,getContext:()=>ctx} as unknown as HTMLCanvasElement};
}

describe('HLC bars chart type (items 6 and 9)',()=>{
 it('is in the catalog, the time axis styles, the menu (after Bars) and has its own settings and defaults',()=>{
  expect(CHART_TYPES.find(row=>row[0]==='hlcbars')?.[1]).toBe('HLC bars');expect(TIME_AXIS_STYLES).toContain('hlcbars');
  registerTemporalChartTypes();expect(chartTypes().some(type=>type.id==='hlcbars')).toBe(true);
  expect(orderChartTypes([{value:'candles',label:'Candles'},{value:'hlcbars',label:'HLC bars'},{value:'bars',label:'Bars'}]).map(row=>row.value)).toEqual(['bars','hlcbars','candles']);
  expect(chartSettingsSchema('hlcbars').fields.map(field=>field.key)).toEqual(['color','thinBars']);
  expect(settingsDefaults('hlcbars')).toEqual({color:'#2962FF',thinBars:true});
  expect(validatedSettingsBook({hlcbars:{thinBars:false}}).applicable.hlcbars).toEqual({color:'#2962FF',thinBars:false});
  expect(latestPricePresentation({priceStyle:'hlcbars',bars:[{open:1,high:3,low:0.5,close:2}],style:{chartTypes:{hlcbars:{color:'#123456'}}}},{},{},{})).toEqual({value:2,color:'#123456'});
 });
 it('paints the high-low stroke and the close tick, never an open tick',()=>{
  registerTemporalChartTypes();const {calls,canvas}=recordingCanvas(),layer=rendererLayers().find(row=>row.id==='hlcbars')!.create();layer.mount(canvas);
  const bars=[{time:1000,open:10,high:12,low:8,close:11,volume:1}];
  layer.render({priceStyle:'hlcbars',bars,settings:settingsDefaults('hlcbars'),bounds:{top:0,height:100},scale:{min:1,max:20,log:false},coords:{dpr:1,width:150,visibleLogicalRange:()=>({from:0,to:0}),bodySpacing:()=>20,pxPerBar:()=>20,logicalToX:()=>50,priceToY:(price:number)=>100-price},theme:{fontFamily:'sans-serif'}} as unknown as RendererLayerArgs);
  const moves=calls.filter(call=>call.op==='moveTo').map(call=>call.args);
  expect(moves).toEqual([[50,88],[50,89]]);expect(calls.some(call=>call.op==='lineTo'&&call.args[0]<50)).toBe(false);
 });
 it('Bars show "HLC bars" (default off) over the one stored truth openVisible',()=>{
  const bars=sources('bars');expect(labels(bars)).toEqual(['Color based on previous close','HLC bars','Thin bars','Up color','Down color']);
  const row=findRow('symbol',bars,'type.bars.openVisible')!;expect(row.value.checked).toBe(false);
  const next=writeRow(bars,'type.bars.openVisible',{checked:true});expect(next.typeSettings!.openVisible).toBe(false);
  expect(findRow('symbol',next,'type.bars.openVisible')!.value.checked).toBe(true);
  expect(chartSettingsSchema('bars').fields.map(field=>field.key)).toContain('openVisible');expect(chartSettingsSchema('bars').fields.map(field=>field.key)).not.toContain('hlcBars');
 });
});

describe('Line color mode select (item 5)',()=>{
 it('Line, Line with markers and Step line have a Solid/Gradient select and no Gradient line toggle; each mode shows its own swatches',()=>{
  for(const style of ['line','linemarkers','step']){
   const schema=chartSettingsSchema(style).fields;expect(schema.map(field=>field.key)).not.toContain('gradient');
   expect(schema.find(field=>field.key==='colorType')).toMatchObject({kind:'select',options:['solid','gradient']});
   const gradient=sources(style);expect(findRow('symbol',gradient,`type.${style}.colorType`)).toMatchObject({type:'select',value:{selected:'gradient'},options:[{value:'solid',label:'Solid'},{value:'gradient',label:'Gradient'}]});
   expect(keys(gradient)).toContain(`type.${style}.gradientStartColor`);expect(keys(gradient)).not.toContain(`type.${style}.color`);
   const solid=sources(style,{colorType:'solid'});expect(keys(solid)).toContain(`type.${style}.color`);expect(keys(solid)).not.toContain(`type.${style}.gradientColor`);
  }
  expect(chartSettingsSchema('area').fields.map(field=>field.key)).toContain('gradient');
 });
 it('saved books and templates migrate the old toggle once: on -> Gradient, off -> Solid',()=>{
  expect(migrateTypeSettings('line',{gradient:true,width:3})).toEqual({colorType:'gradient',width:3});
  expect(migrateTypeSettings('step',{gradient:false})).toEqual({colorType:'solid'});
  expect(migrateTypeSettings('line',{gradient:false,colorType:'gradient'})).toEqual({colorType:'gradient'});
  expect(migrateTypeSettings('area',{gradient:true})).toEqual({gradient:true});
 });
});

describe('Renko, Kagi and Point & figure box size method (items 2 to 4)',()=>{
 it('names the row "Box size method" and shows exactly one input per method; Kagi ATR has no Reversal amount',()=>{
  for(const [style,method,fixed] of [['renko','boxMethod','boxSize'],['kagi','reversalMethod','reversalAmount'],['pointfigure','boxMethod','boxSize']] as const){
   expect(DERIVED_SETTING_FIELDS[style].find(field=>field.key===method)!.label).toBe('Box size method');
   const shown=(value:string)=>keys(sources(style,{[method]:value})).filter(key=>[`type.${style}.atrLength`,`type.${style}.${fixed}`,`type.${style}.percentage`].includes(key));
   expect(shown('ATR')).toEqual([`type.${style}.atrLength`]);expect(shown('Traditional')).toEqual([`type.${style}.${fixed}`]);expect(shown('Percentage')).toEqual([`type.${style}.percentage`]);
  }
  expect(keys(sources('pointfigure'))).toContain('type.pointfigure.reversalAmount');
  expect(keys(sources('kagi'))).not.toContain('type.kagi.reversalAmount');
 });
 it('labels: Renko "Wick" as the reference app; Point & figure keeps both sources (the reference app offers HL and Close)',()=>{
  expect(DERIVED_SETTING_FIELDS.renko.find(field=>field.key==='wicks')!.label).toBe('Wick');
  expect(DERIVED_SETTING_FIELDS.pointfigure.find(field=>field.key==='source')!.options).toEqual(['close','highlow']);
 });
});

describe('Range candles mode (item 12)',()=>{
 it('candles mode shows no Borders or Wicks toggles and no Thin bars; bars mode shows no candle colors',()=>{
  const candles=labels(sources('range',{rangeStyle:'candles'}));expect(candles).not.toContain('Borders');expect(candles).not.toContain('Wicks');expect(candles).not.toContain('Thin bars');expect(candles).toContain('Up wick color');
  const bars=labels(sources('range'));expect(bars).toContain('Thin bars');expect(bars).not.toContain('Up candle color');
  expect(validatedSettingsBook({range:{bordersVisible:false}}).unavailable).toEqual(['range.bordersVisible']);
 });
});

describe('Heikin Ashi (items 7 and 8)',()=>{
 it('has its own settings with "Real prices on price scale" first, default off, writing the appearance haStyle field',()=>{
  expect(hasTypeSettings('heikinashi')).toBe(true);expect(chartSettingsSchema('heikinashi').sharedAppearance).toBe(false);expect(chartSettingsSchema('candles').sharedAppearance).toBe(true);
  const ha=sources('heikinashi');expect(labels(ha)).toEqual(['Real prices on price scale','Color bars based on previous close','Body','Borders','Wick']);
  expect(findRow('symbol',ha,LV_ROW_KEYS.haRealLastPrice)!.value.checked).toBe(false);
  const on=writeRow(ha,LV_ROW_KEYS.haRealLastPrice,{checked:true});expect(serializeAppearance(on.appearance)['mainSeriesProperties.haStyle.showRealLastPrice']).toBe(true);
  // Heikin Ashi color rows write its own type settings, not the candle appearance.
  const recolored=writeRow(ha,'type.heikinashi.body',{checked:true,colors:['#111111','#222222']});expect(recolored.typeSettings).toMatchObject({color:'#111111',downColor:'#222222'});expect(recolored.appearance).toEqual(ha.appearance);
 });
 it('the price scale label and last price line read the real close when on (the HA bar close otherwise)',()=>{
  const scene={priceStyle:'heikinashi',bars:[{open:10,high:11,low:9,close:10.25}],style:{chartTypes:{}},candleOverride:{upColor:'#00aa00',downColor:'#aa0000'}};
  expect(latestPricePresentation(scene,{},{},{})?.value).toBe(10.25);
  expect(latestPricePresentation(scene,{},{},{},{bar:{open:10,high:12,low:9,close:11.5},previousClose:undefined})).toEqual({value:11.5,color:'#00aa00'});
 });
 it('colors are separate from Candles: a book without an entry inherits the candle appearance once, a saved entry wins',()=>{
  const appearance=serializeAppearance({...factoryAppearance(),upColor:'#0000ff',downColor:'#ff00ff'}),inherited=heikinAshiTypeSettings(null,appearance);
  expect(inherited).toMatchObject(appearanceTypeSettings(appearance));expect(inherited.color).toBe('#0000ff');
  const saved=heikinAshiTypeSettings({...inherited,color:'#abcdef'},{...appearance,'mainSeriesProperties.candleStyle.upColor':'#999999'});expect(saved.color).toBe('#abcdef');
  const painted=candleAppearanceForStyle('heikinashi',appearance,saved);expect(painted['mainSeriesProperties.candleStyle.upColor']).toBe('#abcdef');expect(appearance['mainSeriesProperties.candleStyle.upColor']).toBe('#0000ff');
  expect(candleAppearanceForStyle('candles',appearance,saved)).toBe(appearance);
  expect(validatedSettingsBook({}).applicable).not.toHaveProperty('heikinashi');
  expect(validatedSettingsBook({heikinashi:{color:'#abcdef'}}).applicable.heikinashi).toMatchObject({color:'#abcdef',downColor:'#F23645'});
  expect(validatedSettingsBook({heikinashi:{}}).unavailable).toEqual([]);
 });
});

describe('TPO rows (item 11)',()=>{
 it('adds Midpoint, Open price and Close price levels (default off) and outside value area opacity (default 30)',()=>{
  expect(settingsDefaults('tpo')).toMatchObject({outsideOpacity:30,midpoint:false,openLevel:false,closeLevel:false});expect(TPO_LV_DEFAULTS.outsideOpacity).toBe(30);
  const tpo=sources('tpo');expect(labels(tpo)).toEqual(expect.arrayContaining(['Outside value area opacity (%)','Midpoint','Open price','Close price']));
  expect(findRow('symbol',tpo,'type.tpo.midpointColor')!.disabledParts).toContain('colors');expect(findRow('symbol',sources('tpo',{midpoint:true}),'type.tpo.midpointColor')!.disabledParts).toEqual([]);
 });
 it('the layer fades rows outside the value area and draws the chosen levels',()=>{
  registerTemporalChartTypes();const DAY0=10*86_400,block=(index:number,low:number,high:number)=>({time:(DAY0+index*1800)*1000,open:low,high,low,close:high,volume:1});
  const bars=[block(0,10,12.5),block(1,11.2,13.4),block(2,12.1,12.9)],paint=(settings:Record<string,unknown>)=>{const {calls,canvas}=recordingCanvas(),layer=rendererLayers().find(row=>row.id==='tpo')!.create();layer.mount(canvas);
   layer.render({priceStyle:'tpo',bars,data:{tickSize:1},settings:{rowSizeMode:'Ticks per row',ticksPerRow:1,volumeProfile:false,letters:false,poc:false,vah:false,val:false,initialBalance:false,...settings},bounds:{top:0,height:400},scale:{min:0,max:20,log:false},theme:{fontFamily:'sans-serif'},
    coords:{dpr:1,width:400,visibleLogicalRange:()=>({from:0,to:2}),bodySpacing:()=>60,pxPerBar:()=>60,logicalToX:(index:number)=>50+index*60,priceToY:(price:number)=>400-price*20}} as unknown as RendererLayerArgs);return calls;};
  const alphas=[...new Set(paint({}).filter(call=>call.op==='fillRect').map(call=>call.alpha))].sort();expect(alphas).toEqual([0.3,1]);
  expect([...new Set(paint({outsideOpacity:100}).filter(call=>call.op==='fillRect').map(call=>call.alpha))]).toEqual([1]);
  const levelY=(calls:ReturnType<typeof paint>)=>calls.filter(call=>call.op==='moveTo').map(call=>call.args[1]);
  expect(levelY(paint({}))).toEqual([]);
  expect(levelY(paint({midpoint:true,openLevel:true,closeLevel:true}))).toEqual([Math.round(400-(10+13.4)/2*20)+0.5,Math.round(400-10*20)+0.5,Math.round(400-12.9*20)+0.5]);
 });
});
