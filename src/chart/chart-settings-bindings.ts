// Chart Settings bindings: where each dialog control reads and writes its value.
// Stores: the workspace appearance (src/ui/themes.ts ChartAppearance), the price scale
// settings (price-scale-state.ts), the chart type settings
// book (chart-settings.ts), the chart timezone (chart options) and the Chart Settings
// document (chart-settings-document.ts).
import {defaultTheme,type ChartAppearance} from '../ui/themes';
import {supportedColor} from './color-validation';
import {defaultPriceScaleSettings,type PriceScaleSettings} from './price-scale-state';
import {chartSettingsSchema,settingsDefaults,type ChartSettingField} from './chart-settings';
import {CHART_TYPES} from './chart-types';
import {footprintRowUnused} from './footprint';
import {defaultChartSettingsDocument,type ChartSettingsDocument} from './chart-settings-document';
import {RIGHT_MARGIN_MAX_BARS} from './right-margin';
import {
 CHART_SETTINGS_TAB_IDS,DATE_FORMAT_OPTIONS,DATE_FORMAT_WEEKDAY_PREFIX,PRECISION_OPTIONS,SCALE_FONT_SIZES,SYMBOL_CANDLE_FACTS,SYMBOL_DATA_FACTS,SYMBOL_DATA_GROUP_ID,SYMBOL_STYLE_GROUP_ID,TAB_FACTS,TIMEZONE_EXCHANGE,
 multiCheckSummary,timezoneOptions,type ChartSettingsControlFact,type ChartSettingsControlType,type ChartSettingsEntryFact,type ChartSettingsOption,type ChartSettingsTabId,
} from './chart-settings-facts';

/** Everything the dialog edits. Null members are not connected for this chart; their controls are unavailable. */
/** Scale type, invert and auto scale of the main price scale (the chart options the old Chart options dialog edited). */
export interface ScaleModeSettings {scale:'linear'|'percent'|'indexed'|'logarithmic';invert:boolean;auto:boolean}
export interface ChartSettingsSources {
 appearance:ChartAppearance;
 document:ChartSettingsDocument;
 /** False when the host has no place to save the document; its controls are then unavailable. */
 documentConnected:boolean;
 priceScale:PriceScaleSettings|null;
 /** Current computed price-to-bar ratio of the main scale (shown while the lock is off). */
 ratio:number|null;
 style:string;
 /** Settings of the current chart type when it is not appearance-backed (candles and Heikin Ashi are). */
 typeSettings:Record<string,unknown>|null;
 timezone:string|null;
 exchangeTimezone:string|null;
 /** Scale type, invert and auto scale; null or absent when the host has no chart options to edit (the rows are then left out). */
 scaleMode?:ScaleModeSettings|null;
}
/** One control's value; each control type uses the parts it shows. */
export interface ControlValue {
 checked?:boolean;
 colors?:(string|null)[];
 selected?:string;
 number?:number|null;
 /** Slider position: 0..1 for volume sliders, background transparency 0..100 for the status line background. */
 level?:number;
 items?:Record<string,boolean>;
 thickness?:number;
 lineStyle?:number;
 sub?:string;
 nested?:boolean;
}
export type ChartSettingsAvailability={state:'live'}|{state:'stored';reason:string}|{state:'unavailable';reason:string};
export type ControlPart='check'|'colors'|'select'|'number'|'slider'|'items'|'thickness'|'sub'|'nested';
export interface ChartSettingsRowView {
 key:string;
 /** The row's fact id; null for rows. */
 factId:string|null;
 label:string;
 type:ChartSettingsControlType;
 options?:readonly ChartSettingsOption[];
 optionDisabled?:Readonly<Record<string,string>>;
 items?:readonly ChartSettingsOption[];
 itemAvailability?:Readonly<Record<string,ChartSettingsAvailability>>;
 sub?:{label:string;options:readonly ChartSettingsOption[]};
 nested?:string;
 swatches:number;
 /** Thickness picker; `lineStyle` adds the line style choice inside it. */
 thickness:boolean;
 lineStyle:boolean;
 unitSuffix?:string;
 min?:number;max?:number;step?:number;
 indent:boolean;
 help:boolean;
 value:ControlValue;
 availability:ChartSettingsAvailability;
 disabledParts:readonly ControlPart[];
 /** Multi-check button text. */
 summary?:string;
}
export interface ChartSettingsGroupView {key:string;factId:string|null;label:string;rows:ChartSettingsRowView[];note?:string}

/** LV thickness picker choices (the reference picker contents were not observed). */
export const THICKNESS_OPTIONS:readonly number[]=Object.freeze([1,2,3,4]);
/** LV line style choices inside the crosshair picker; the numbers follow the common line style enum (0 solid, 1 dotted, 2 dashed). */
export const LINE_STYLE_OPTIONS:readonly ChartSettingsOption[]=Object.freeze([{value:'0',label:'Solid'},{value:'1',label:'Dotted'},{value:'2',label:'Dashed'}]);
/** LV bound already used by the renderer and the previous theme dialog. */
export const MARGIN_PERCENT_MAX=40;

const LIVE:ChartSettingsAvailability=Object.freeze({state:'live'});
const stored=(reason:string):ChartSettingsAvailability=>({state:'stored',reason});
const unavailable=(reason:string):ChartSettingsAvailability=>({state:'unavailable',reason});
export const CHART_SETTINGS_REASONS=Object.freeze({
 priceScale:'This chart is not connected to its price scale settings.',
 typeSettings:'This chart is not connected to its chart type settings.',
 timezone:'This chart is not connected to its timezone setting.',
 exchange:'The exchange timezone of this symbol is not known.',
 document:'This chart is not connected to its saved Chart Settings.',
 dividends:'Saved with the chart. Live US stock charts reload adjusted for splits and dividends when this is on, and for splits only when it is off. Local and example bars carry no dividend history, so their prices are not adjusted.',
 precision:'Saved with the chart. The price scale follows 1 to 8 decimals; Integer, fractions and 9 or more decimals show on the legend and data window only.',
 buySell:'Saved with the chart. Paper trading has no buy and sell buttons on the chart yet.',
 currency:'Saved with the chart. The price scale shows no currency or unit label yet.',
 scaleButtons:'Saved with the chart. The A and L scale buttons do not follow this setting yet.',
 placement:'Saved with the chart. OpenCandle does not stack scales by this setting yet; use Move scale to left on the price scale.',
 overlap:'Saved with the chart. OpenCandle does not change scale label overlap yet.',
 valueMode:'Saved with the chart. The last price label follows the scale mode for now.',
 prePost:'Saved with the chart. Local sources have no pre-market, post-market or overnight prices.',
 bidAsk:'Shown on live charts that stream quotes (IEX on the free data plan, all exchanges on paid; Coinbase best bid and ask). Local and synthetic bars have no bid and ask prices.',
 timeScale:'Saved with the chart. The time scale does not follow this setting yet.',
 watermark:'Saved with the chart. OpenCandle does not draw a watermark yet.',
 buttons:'Saved with the chart. Chart buttons do not follow this setting yet.',
 rightMargin:'Saved with the chart. The right margin is not applied to the chart yet.',
 trading:'Saved with the chart. Paper trading does not draw this on the chart yet.',
 oneClick:'Saved with the chart. Paper orders still ask for confirmation.',
 sound:'Saved with the chart. Paper fills play no sound yet.',
 alertLines:'Saved with the chart. Alert lines do not follow this setting yet.',
 alertNotify:'Saved with the chart. Alert notifications do not follow this setting yet.',
 events:'Saved with the chart. OpenCandle does not mark these events on the chart yet.',
 // Alpaca documents no earnings data (only corporate actions), and no other permitted earnings source is configured.
 earnings:'Marks earnings from your calendar (imports and SEC auto-fill). Your Alpaca data has no earnings dates. Earnings breaks are saved with the chart but not drawn yet.',
 news:'Saved with the chart. OpenCandle does not mark news on the chart yet.',
 ideas:'Published ideas need an online account, which OpenCandle does not use.',
 noTypeSettings:'This chart type has no style options.',
 scaleMode:'This chart is not connected to its scale settings.',
});

/** Factory appearance: the workspace default theme (LV Medium Dark, an LV design) for every
 * color, with the fact value of every non-color control the dialog shows (visibility toggles, widths, crosshair style). */
export function factoryAppearance():ChartAppearance{
 const theme=defaultTheme.appearance;
 return{...structuredClone(theme),
  colorPreviousClose:false,bodyVisible:true,borderVisible:true,wickVisible:true,
  indicatorLabelsVisible:true,indicatorValuesVisible:true,countdownVisible:true,priceLineVisible:true,priceLineWidth:1,highLowVisible:false,highLowWidth:1,
  backgroundType:'solid',gridMode:'both',
  crosshairWidth:1,crosshairStyle:2,fontSize:12,topMargin:10,bottomMargin:8};
}
/** Factory Price scale settings (the price scale defaults). */
export function factoryPriceScale():PriceScaleSettings{return defaultPriceScaleSettings();}
/** Fallback chart timezone: Etc/UTC, stored as UTC. It is used
 * when the factory choice (Exchange) has no known exchange zone, and as the stored zone of the synthetic and imported sources. */
export const FACTORY_TIMEZONE='UTC';
/** Factory timezone choice. New charts and Reset settings use Exchange, so US stocks show New York time, the most common choice for
 * US stock traders, and crypto shows UTC. This overrides the UTC factory fact above. The app-level "Default chart timezone"
 * setting (src/ui/app-preferences.ts) starts at this value; a chart's own timezone setting still overrides it. */
export const FACTORY_TIMEZONE_CHOICE=TIMEZONE_EXCHANGE;
export function factoryScaleMode():ScaleModeSettings{return{scale:'linear',invert:false,auto:true};}

/** Sources reset to factory values; templates and the chart type stay. */
export function factorySources(current:ChartSettingsSources):ChartSettingsSources{
 const document={...defaultChartSettingsDocument(),templates:structuredClone(current.document.templates)};
 return{...current,appearance:factoryAppearance(),document,
  priceScale:current.priceScale?factoryPriceScale():null,
  typeSettings:current.typeSettings?typeDefaults(current.style):null,
  timezone:current.timezone===null?null:current.exchangeTimezone||FACTORY_TIMEZONE,
  scaleMode:current.scaleMode?factoryScaleMode():null};
}

// ---------------------------------------------------------------------------
// Fact control bindings.
interface Binding {
 read(s:ChartSettingsSources):ControlValue;
 write(s:ChartSettingsSources,next:ControlValue,previous:ControlValue):ChartSettingsSources;
 availability(s:ChartSettingsSources):ChartSettingsAvailability;
 items?(s:ChartSettingsSources):Record<string,ChartSettingsAvailability>;
 disabled?(s:ChartSettingsSources,value:ControlValue):ControlPart[];
 optionDisabled?(s:ChartSettingsSources):Record<string,string>;
 options?(s:ChartSettingsSources):readonly ChartSettingsOption[];
 /** Thickness picker also offers the line style. */
 lineStyle?:boolean;
 /** Every value of the row lives in the Chart Settings document. */
 store?:'document';
}
const appearance=(s:ChartSettingsSources,patch:Partial<ChartAppearance>):ChartSettingsSources=>({...s,appearance:{...s.appearance,...patch}});
const doc=(s:ChartSettingsSources,edit:(d:ChartSettingsDocument)=>void):ChartSettingsSources=>{if(!s.documentConnected)throw Error(CHART_SETTINGS_REASONS.document);const document=structuredClone(s.document);edit(document);return{...s,document};};
const scale=(s:ChartSettingsSources,edit:(p:PriceScaleSettings)=>void):ChartSettingsSources=>{if(!s.priceScale)throw Error(CHART_SETTINGS_REASONS.priceScale);const priceScale=structuredClone(s.priceScale);edit(priceScale);return{...s,priceScale};};
const color=(value:unknown,what:string):string=>{if(!supportedColor(value))throw Error(`Choose a supported color for ${what}.`);return value;};
const bool=(value:unknown,what:string):boolean=>{if(typeof value!=='boolean')throw Error(`${what} must be on or off.`);return value;};
const choice=<T extends string>(value:unknown,options:readonly T[],what:string):T=>{if(typeof value!=='string'||!options.includes(value as T))throw Error(`Choose one of the listed values for ${what}.`);return value as T;};
const level=(value:unknown,min:number,max:number,what:string):number=>{if(typeof value!=='number'||!Number.isFinite(value)||value<min||value>max)throw Error(`${what} must be between ${min} and ${max}.`);return value;};
const changed=(next:ControlValue,previous:ControlValue,part:keyof ControlValue)=>JSON.stringify(next[part])!==JSON.stringify(previous[part]);
const changedItem=(next:ControlValue,previous:ControlValue,item:string)=>(next.items?.[item]??false)!==(previous.items?.[item]??false);
const scaleAvailability=(s:ChartSettingsSources,ready:ChartSettingsAvailability)=>s.priceScale?ready:unavailable(CHART_SETTINGS_REASONS.priceScale);

/** Stored document checkbox at a path. */
function docCheck(read:(d:ChartSettingsDocument)=>boolean,write:(d:ChartSettingsDocument,value:boolean)=>void,reason:string|null):Binding{
 return{read:s=>({checked:read(s.document)}),write:(s,next)=>doc(s,d=>write(d,bool(next.checked,'This setting'))),availability:()=>reason===null?LIVE:stored(reason),store:'document'};
}
const visibilityValues=['mouseover','always','never'] as const;
function docSelect<T extends string>(read:(d:ChartSettingsDocument)=>T,write:(d:ChartSettingsDocument,value:T)=>void,values:readonly T[],reason:string):Binding{
 return{read:s=>({selected:read(s.document)}),write:(s,next)=>doc(s,d=>write(d,choice(next.selected,values,'this setting'))),availability:()=>stored(reason),store:'document'};
}
function candleRow(visible:keyof ChartAppearance,up:keyof ChartAppearance,down:keyof ChartAppearance,what:string):Binding{
 return{read:s=>({checked:Boolean(s.appearance[visible]),colors:[String(s.appearance[up]),String(s.appearance[down])]}),
  write:(s,next)=>appearance(s,{[visible]:bool(next.checked,what),[up]:color(next.colors?.[0],what+' up color'),[down]:color(next.colors?.[1],what+' down color')} as Partial<ChartAppearance>),
  availability:()=>LIVE};
}
function zoneOption(s:ChartSettingsSources):string{
 const zone=s.timezone;if(zone===null)return 'UTC';
 if(zone==='UTC'||zone==='Etc/UTC')return 'UTC';
 return zone;
}

const BINDINGS:Record<string,Binding>={
 // Symbol, candles (appearance).
 'symbol.mainSeriesSymbolCandleStyleBarColorsOnPrevClose':{read:s=>({checked:s.appearance.colorPreviousClose}),write:(s,next)=>appearance(s,{colorPreviousClose:bool(next.checked,'Color bars based on previous close')}),availability:()=>LIVE},
 'symbol.mainSeriesSymbolcandleCandlesColor':candleRow('bodyVisible','upColor','downColor','Body'),
 'symbol.mainSeriesSymbolcandleBordersColor':candleRow('borderVisible','borderUpColor','borderDownColor','Borders'),
 'symbol.mainSeriesSymbolcandleWickColors':candleRow('wickVisible','wickUpColor','wickDownColor','Wick'),
 // Symbol, data modification.
 // Live. App passes the field to preferAlpacaDividendAdjustment, which reloads every open
 // Alpaca feed on the new basis; local and synthetic bars carry no dividend history (CHART_SETTINGS_REASONS.dividends).
 'symbol.candleSymbolDividendsAdjustment':docCheck(d=>d.symbol.dividendsAdjustment,(d,v)=>{d.symbol.dividendsAdjustment=v;},null),
 'symbol.candleSymbolMinTick':{read:s=>({selected:s.document.symbol.precision}),write:(s,next)=>doc(s,d=>{d.symbol.precision=choice(next.selected,PRECISION_OPTIONS.map(row=>row.value),'Precision');}),availability:()=>LIVE},
 'symbol.candleSymbolTimezone':{
  read:s=>({selected:zoneOption(s)}),
  options:s=>{const options=timezoneOptions(),current=zoneOption(s);return options.some(row=>row.value===current)?options:[...options,{value:current,label:current}];},
  optionDisabled:(s):Record<string,string>=>s.exchangeTimezone?{}:{[TIMEZONE_EXCHANGE]:CHART_SETTINGS_REASONS.exchange},
  write:(s,next)=>{if(s.timezone===null)throw Error(CHART_SETTINGS_REASONS.timezone);const value=next.selected;if(typeof value!=='string'||!value)throw Error('Choose a timezone.');
   const zone=value===TIMEZONE_EXCHANGE?s.exchangeTimezone:value;if(!zone)throw Error(CHART_SETTINGS_REASONS.exchange);
   try{new Intl.DateTimeFormat('en',{timeZone:zone});}catch{throw Error('This timezone is not available on this computer.');}
   return{...s,timezone:zone};},
  availability:s=>s.timezone===null?unavailable(CHART_SETTINGS_REASONS.timezone):LIVE},
 // Status line.
 'legend.showLogo':docCheck(d=>d.statusLine.logo,(d,v)=>{d.statusLine.logo=v;},null),
 'legend.symbolTextSource':{read:s=>({checked:s.document.statusLine.title.visible,selected:s.document.statusLine.title.source}),write:(s,next)=>doc(s,d=>{d.statusLine.title={visible:bool(next.checked,'Title'),source:choice(next.selected,['name','symbol','symbolAndName'] as const,'Title')};}),availability:()=>LIVE},
 'legend.ohlcTitle':docCheck(d=>d.statusLine.chartValues,(d,v)=>{d.statusLine.chartValues=v;},null),
 'legend.barChange':docCheck(d=>d.statusLine.barChange,(d,v)=>{d.statusLine.barChange=v;},null),
 'legend.barVolume':docCheck(d=>d.statusLine.volume,(d,v)=>{d.statusLine.volume=v;},null),
 'legend.lastDayChange':docCheck(d=>d.statusLine.lastDayChange,(d,v)=>{d.statusLine.lastDayChange=v;},null),
 // Live (App gates ChartTradingButtons on trading.buySellButtons). Shown once, on the Trading tab (HIDDEN_IN_VIEW).
 'legend.tradingSellBuyPanel':docCheck(d=>d.trading.buySellButtons,(d,v)=>{d.trading.buySellButtons=v;},null),
 'legend.studyTitles':docCheck(d=>d.statusLine.indicatorTitles,(d,v)=>{d.statusLine.indicatorTitles=v;},null),
 'legend.studyArguments':docCheck(d=>d.statusLine.indicatorInputs,(d,v)=>{d.statusLine.indicatorInputs=v;},null),
 // Indicator legend values are drawn: appearance lv.indicatorValuesVisible (absent means shown).
 'legend.studyValues':{read:s=>({checked:s.appearance.indicatorValuesVisible??true}),write:(s,next)=>appearance(s,{indicatorValuesVisible:bool(next.checked,'Values')}),availability:()=>LIVE},
 'legend.legendBgTransparency':{read:s=>({checked:s.document.statusLine.background.visible,level:s.document.statusLine.background.transparency}),write:(s,next)=>doc(s,d=>{const value=level(next.level,0,100,'Background transparency');d.statusLine.background={visible:bool(next.checked,'Background'),transparency:Math.round(value)};}),availability:()=>LIVE},
 // Scales and lines: price scale.
 'scales.scalesCurrencyUnit':{...docSelect(d=>d.scales.currencyAndUnit,(d,v)=>{d.scales.currencyAndUnit=v;},visibilityValues,CHART_SETTINGS_REASONS.currency),availability:()=>LIVE},
 'scales.autoLogButtonsVisibility':{...docSelect(d=>d.scales.scaleModesButtons,(d,v)=>{d.scales.scaleModesButtons=v;},visibilityValues,CHART_SETTINGS_REASONS.scaleButtons),availability:()=>LIVE},
 'scales.lockScale':{
  read:s=>({checked:s.priceScale?.lockRatio??false,number:s.priceScale?.lockRatio?s.priceScale.ratio:s.ratio}),
  write:(s,next,previous)=>scale(s,p=>{
   const on=bool(next.checked,'Lock price to bar ratio');
   if(!on){p.lockRatio=false;p.ratio=null;return;}
   if(!previous.checked){const ratio=s.ratio;if(ratio===null||!Number.isFinite(ratio)||ratio<=0)throw Error('The price to bar ratio is unavailable until the chart shows bars.');p.lockRatio=true;p.ratio=ratio;return;}
   const ratio=next.number;if(typeof ratio!=='number'||!Number.isFinite(ratio)||ratio<=0)throw Error('Enter a price to bar ratio greater than zero.');p.lockRatio=true;p.ratio=ratio;}),
  availability:s=>scaleAvailability(s,LIVE),
  disabled:(_s,value)=>value.checked?[]:['number']},
 // Live. Stack on the left or right puts the main price scale on that side (mainSide, the same field as Move
 // scale to left), and App's Ok stacks every extra indicator scale there too (indicators.stackScales). Auto moves nothing.
 'scales.scalesPlacement':{read:s=>({selected:s.priceScale?.placement??'auto'}),write:(s,next)=>scale(s,p=>{const value=choice(next.selected,['left','right','auto'] as const,'Scales placement');p.placement=value;if(value==='left')p.mainSide='left';else if(value==='right')delete p.mainSide;}),availability:s=>scaleAvailability(s,LIVE)},
 'scales.noOverlappingLabels':{read:s=>({checked:s.priceScale?.labels.noOverlap??true}),write:(s,next)=>scale(s,p=>{p.labels.noOverlap=bool(next.checked,'No overlapping labels');}),availability:s=>scaleAvailability(s,LIVE)},
 'scales.addPlusButton':{read:s=>({checked:s.priceScale?.plusButton??true}),write:(s,next)=>scale(s,p=>{p.plusButton=bool(next.checked,'Plus button');}),availability:s=>scaleAvailability(s,LIVE)},
 // Countdown is drawn from the appearance (the price scale port reads the same key).
 'scales.countdown':{read:s=>({checked:s.appearance.countdownVisible}),write:(s,next)=>appearance(s,{countdownVisible:bool(next.checked,'Countdown to bar close')}),availability:()=>LIVE},
 'scales.symbolLabelsLines':{
  read:s=>({items:{name:s.priceScale?.labels.symbolName??false,value:s.priceScale?.labels.symbolLast??true,line:s.appearance.priceLineVisible},thickness:s.appearance.priceLineWidth,sub:s.document.scales.symbolValueMode,colors:[s.appearance.priceLineColor||null]}),
  write:(s,next,previous)=>{let out=s;
   if(changedItem(next,previous,'name'))out=scale(out,p=>{p.labels.symbolName=bool(next.items?.name,'Name');});
   if(changedItem(next,previous,'value'))out=scale(out,p=>{p.labels.symbolLast=bool(next.items?.value,'Value');});
   if(changedItem(next,previous,'line'))out=appearance(out,{priceLineVisible:bool(next.items?.line,'Line')});
   if(changed(next,previous,'thickness')){choice(String(next.thickness),THICKNESS_OPTIONS.map(String),'Line thickness');out=appearance(out,{priceLineWidth:Number(next.thickness)});}
   if(changed(next,previous,'sub'))out=doc(out,d=>{d.scales.symbolValueMode=choice(next.sub,['scale','pricePercent'] as const,'the last value display');});
   // Empty means automatic (the bar color).
   if(changed(next,previous,'colors')){const value=next.colors?.[0];out=appearance(out,{priceLineColor:value===null||value===undefined||value===''?'':color(value,'the last price line')});}
   return out;},
  availability:()=>LIVE,
  items:s=>({name:scaleAvailability(s,LIVE),value:scaleAvailability(s,LIVE),line:LIVE}),
  // The second-line select is live. Price and percentage value adds the change percentage row under the last
  // price chip (adapter setLastValueMode, appearance-painters lastChange); Value according to scale is the chip alone.
 },
 'scales.indicatorsLabelsLines':{
  // Value: indicator labels on the price scale are drawn from appearance lv.indicatorLabelsVisible; the price scale document mirrors it.
  read:s=>({items:{name:s.priceScale?.labels.indName??false,value:s.appearance.indicatorLabelsVisible??true}}),
  write:(s,next,previous)=>{let out=s;
   if(changedItem(next,previous,'name'))out=scale(out,p=>{p.labels.indName=bool(next.items?.name,'Name');});
   if(changedItem(next,previous,'value')){const on=bool(next.items?.value,'Value');out=appearance(out,{indicatorLabelsVisible:on});if(out.priceScale)out=scale(out,p=>{p.labels.indValue=on;});}
   return out;},
  availability:()=>LIVE,
  // Name draws the indicator name chips (indicator-display setNameLabels).
  items:s=>({name:scaleAvailability(s,LIVE),value:LIVE})},
 'scales.prePostLabelsLines':{
  read:s=>({items:{value:s.priceScale?.labels.prePost??true,line:s.priceScale?.lines.prePostLine??true},colors:[...s.document.scales.prePostColors]}),
  write:(s,next,previous)=>{let out=s;
   if(changedItem(next,previous,'value'))out=scale(out,p=>{p.labels.prePost=bool(next.items?.value,'Value');});
   if(changedItem(next,previous,'line'))out=scale(out,p=>{p.lines.prePostLine=bool(next.items?.line,'Line');});
   if(changed(next,previous,'colors'))out=doc(out,d=>{d.scales.prePostColors=[color(next.colors?.[0],'pre-market'),color(next.colors?.[1],'post-market'),color(next.colors?.[2],'overnight')];});
   return out;},
  // The label and line paint the latest pre-market or post-market price of US equity charts that carry one.
  availability:s=>scaleAvailability(s,LIVE),
  items:s=>({value:scaleAvailability(s,LIVE),line:scaleAvailability(s,LIVE)})},
 'scales.highLowLabelsLines':{
  read:s=>({items:{value:s.priceScale?.labels.highLow??false,line:s.appearance.highLowVisible},thickness:s.appearance.highLowWidth,colors:[s.appearance.highLowColor]}),
  write:(s,next,previous)=>{let out=s;
   if(changedItem(next,previous,'value'))out=scale(out,p=>{p.labels.highLow=bool(next.items?.value,'Value');});
   if(changedItem(next,previous,'line'))out=appearance(out,{highLowVisible:bool(next.items?.line,'Line')});
   if(changed(next,previous,'colors'))out=appearance(out,{highLowColor:color(next.colors?.[0],'the high and low lines')});
   if(changed(next,previous,'thickness')){choice(String(next.thickness),THICKNESS_OPTIONS.map(String),'Line thickness');out=appearance(out,{highLowWidth:Number(next.thickness)});}
   return out;},
  availability:()=>LIVE,
  items:s=>({value:scaleAvailability(s,LIVE),line:LIVE}),
  // Observed: color/thickness disabled while neither Value nor Line is checked.
  disabled:(_s,value)=>value.items?.value||value.items?.line?[]:['thickness','colors']},
 'scales.bidAskLabelsLines':{
  read:s=>({items:{value:s.priceScale?.labels.bidAsk??false,line:s.priceScale?.lines.bidAskLines??false},colors:[...s.document.scales.bidAskColors]}),
  write:(s,next,previous)=>{let out=s;
   if(changedItem(next,previous,'value'))out=scale(out,p=>{p.labels.bidAsk=bool(next.items?.value,'Value');});
   if(changedItem(next,previous,'line'))out=scale(out,p=>{p.lines.bidAskLines=bool(next.items?.line,'Line');});
   if(changed(next,previous,'colors'))out=doc(out,d=>{d.scales.bidAskColors=[color(next.colors?.[0],'bid'),color(next.colors?.[1],'ask')];});
   return out;},
  // The label and line paint the live best bid and ask of charts that stream quotes.
  availability:s=>scaleAvailability(s,LIVE),
  items:s=>({value:scaleAvailability(s,LIVE),line:scaleAvailability(s,LIVE)}),
  // Observed: the color swatch is disabled while neither Value nor Line is checked.
  disabled:(_s,value)=>value.items?.value||value.items?.line?[]:['colors']},
 // Scales and lines: time scale.
 'scales.showWeekdayOnTimeScaleLabels':{...docCheck(d=>d.scales.dayOfWeek,(d,v)=>{d.scales.dayOfWeek=v;},CHART_SETTINGS_REASONS.timeScale),availability:()=>LIVE},
 'scales.dateFormat':{read:s=>({selected:s.document.scales.dateFormat}),
  options:s=>DATE_FORMAT_OPTIONS.map(row=>({value:row.value,label:(s.document.scales.dayOfWeek?DATE_FORMAT_WEEKDAY_PREFIX:'')+row.label})),
  write:(s,next)=>doc(s,d=>{d.scales.dateFormat=choice(next.selected,DATE_FORMAT_OPTIONS.map(row=>row.value),'Date format');}),availability:()=>LIVE},
 'scales.timeHoursFormat':{...docSelect(d=>d.scales.timeHours,(d,v)=>{d.scales.timeHours=v;},['24','12'] as const,CHART_SETTINGS_REASONS.timeScale),availability:()=>LIVE}, // 12-hours drives the crosshair chip and the time-axis ticks
 'scales.saveLeftChartEdge':{...docCheck(d=>d.scales.saveLeftEdge,(d,v)=>{d.scales.saveLeftEdge=v;},CHART_SETTINGS_REASONS.timeScale),availability:()=>LIVE},
 // Canvas (appearance unless noted).
 'canvas.chartBackground':{
  read:s=>s.appearance.backgroundType==='gradient'?{selected:'gradient',colors:[s.appearance.gradientStart,s.appearance.gradientEnd]}:{selected:'solid',colors:[s.appearance.background]},
  write:(s,next,previous)=>{const type=choice(next.selected,['solid','gradient'] as const,'Background');
   if(type!==previous.selected)return appearance(s,{backgroundType:type});
   return type==='gradient'?appearance(s,{gradientStart:color(next.colors?.[0],'the gradient start'),gradientEnd:color(next.colors?.[1],'the gradient end')}):appearance(s,{background:color(next.colors?.[0],'the background')});},
  availability:()=>LIVE},
 'canvas.vertGridLines':{read:s=>({checked:s.appearance.gridMode==='both'||s.appearance.gridMode==='vertical',colors:[s.appearance.verticalGrid]}),
  write:(s,next)=>{const vertical=bool(next.checked,'Vertical grid lines'),horizontal=s.appearance.gridMode==='both'||s.appearance.gridMode==='horizontal';return appearance(s,{gridMode:vertical?horizontal?'both':'vertical':horizontal?'horizontal':'none',verticalGrid:color(next.colors?.[0],'vertical grid lines')});},availability:()=>LIVE},
 'canvas.horzGridLines':{read:s=>({checked:s.appearance.gridMode==='both'||s.appearance.gridMode==='horizontal',colors:[s.appearance.horizontalGrid]}),
  write:(s,next)=>{const horizontal=bool(next.checked,'Horizontal grid lines'),vertical=s.appearance.gridMode==='both'||s.appearance.gridMode==='vertical';return appearance(s,{gridMode:vertical?horizontal?'both':'vertical':horizontal?'horizontal':'none',horizontalGrid:color(next.colors?.[0],'horizontal grid lines')});},availability:()=>LIVE},
 'canvas.crossHair':{read:s=>({colors:[s.appearance.crosshairColor],thickness:s.appearance.crosshairWidth,lineStyle:s.appearance.crosshairStyle}),
  write:(s,next)=>{const width=Number(next.thickness),style=Number(next.lineStyle);if(!THICKNESS_OPTIONS.includes(width)&&width!==s.appearance.crosshairWidth)throw Error('Choose a listed crosshair thickness.');if(![0,1,2].includes(style))throw Error('Choose a listed crosshair line style.');return appearance(s,{crosshairColor:color(next.colors?.[0],'the crosshair'),crosshairWidth:width,crosshairStyle:style});},
  availability:()=>LIVE,lineStyle:true},
 'canvas.watermark':{read:s=>{const w=s.document.canvas.watermark;return{items:{ticker:w.ticker,interval:w.interval,description:w.description,replay:w.replay},colors:[w.color]};},
  write:(s,next)=>doc(s,d=>{const items=next.items??{};d.canvas.watermark={ticker:bool(items.ticker,'Ticker'),interval:bool(items.interval,'Interval'),description:bool(items.description,'Description'),replay:bool(items.replay,'Replay mode'),color:color(next.colors?.[0],'the watermark')};}),
  // Live. MultiChartGrid draws the watermark of each chart (src/chart/chart-watermark.ts).
  availability:()=>LIVE},
 'canvas.scalesText':{read:s=>({colors:[s.appearance.textColor],selected:String(s.appearance.fontSize)}),
  write:(s,next)=>{const size=Number(next.selected);if(!SCALE_FONT_SIZES.includes(size)&&size!==s.appearance.fontSize)throw Error('Choose a listed text size.');return appearance(s,{textColor:color(next.colors?.[0],'scale text'),fontSize:size});},availability:()=>LIVE},
 'canvas.scalesLine':{read:s=>({colors:[s.appearance.scaleLineColor]}),write:(s,next)=>appearance(s,{scaleLineColor:color(next.colors?.[0],'scale lines')}),availability:()=>LIVE},
 // The chart navigation buttons (ChartNavigationButtons) follow this row.
 'canvas.navButtons':{...docSelect(d=>d.canvas.navigationButtons,(d,v)=>{d.canvas.navigationButtons=v;},visibilityValues,CHART_SETTINGS_REASONS.buttons),availability:()=>LIVE},
 'canvas.paneButtons':{...docSelect(d=>d.canvas.paneButtons,(d,v)=>{d.canvas.paneButtons=v;},visibilityValues,CHART_SETTINGS_REASONS.buttons),availability:()=>LIVE},
 'canvas.paneTopMargin':{read:s=>({number:s.appearance.topMargin}),write:(s,next)=>appearance(s,{topMargin:margin(next.number,'Top',s.appearance.bottomMargin)}),availability:()=>LIVE},
 'canvas.paneBottomMargin':{read:s=>({number:s.appearance.bottomMargin}),write:(s,next)=>appearance(s,{bottomMargin:margin(next.number,'Bottom',s.appearance.topMargin)}),availability:()=>LIVE},
 // Limited to the renderer's 200-bar cap (applyRightMargin), so the row never holds a margin the chart does not
  // draw; an older saved value above it reads as the cap, which is what the chart shows.
 'canvas.paneRightMargin':{read:s=>({number:Math.min(s.document.canvas.rightMarginBars,RIGHT_MARGIN_MAX_BARS)}),write:(s,next)=>doc(s,d=>{const value=next.number;if(typeof value!=='number'||!Number.isInteger(value)||value<0||value>RIGHT_MARGIN_MAX_BARS)throw Error(`Enter a right margin from 0 to ${RIGHT_MARGIN_MAX_BARS} bars.`);d.canvas.rightMarginBars=value;}),
  // Live (MultiChartGrid setRightMargin, Scroll to the most recent bar, reset time scale).
  availability:()=>LIVE},
 // Trading (document; paper trading only).
 // Live (App: <ChartTradingButtons visible={trading.buySellButtons}>).
 'trading.tradingSellBuyPanel':docCheck(d=>d.trading.buySellButtons,(d,v)=>{d.trading.buySellButtons=v;},null),
 // Live. One switch with the paper account's One-click setting: App shows the account's
 // value here and an Ok that changes it sets the account (src/ui/paper-one-click-link.ts).
 'trading.tradingConfirmEnabled':docCheck(d=>d.trading.oneClick,(d,v)=>{d.trading.oneClick=v;},null),
 'trading.tradingSoundVolume':{read:s=>({checked:s.document.trading.executionSound.enabled,level:s.document.trading.executionSound.volume}),
  write:(s,next)=>doc(s,d=>{d.trading.executionSound={...d.trading.executionSound,enabled:bool(next.checked,'Execution sound'),volume:level(next.level,0,1,'Execution sound volume')};}),
  availability:()=>LIVE,disabled:(_s,value)=>value.checked?[]:['slider']},
 'trading.tradingSoundMelody':{read:s=>({selected:s.document.trading.executionSound.melody}),write:(s,next)=>doc(s,d=>{d.trading.executionSound.melody=choice(next.selected,['Alarm Clock'],'the execution sound');}),
  availability:()=>LIVE,disabled:s=>s.document.trading.executionSound.enabled?[]:['select']},
 // Live (App: <PaperTradingToasts rejectionOnly={trading.rejectionOnly}>, virtual order notifications).
 'trading.tradingNotifications':docCheck(d=>d.trading.rejectionOnly,(d,v)=>{d.trading.rejectionOnly=v;},null),
 // Live (App: <PaperChartLines visible={trading.positionsAndOrders}>).
 'trading.tradingPositionsAndOrders':docCheck(d=>d.trading.positionsAndOrders,(d,v)=>{d.trading.positionsAndOrders=v;},null),
 // Live (App: <PaperChartLines showReverse={trading.reverseButton}>, the Reverse button on the position line).
 'trading.reverseButton':docCheck(d=>d.trading.reverseButton,(d,v)=>{d.trading.reverseButton=v;},null),
 // Live (App: <PaperChartLines projectMarketOrders={trading.projectMarketOrders}>, a
 // working market order drawn at the last price and cancellable from its line).
 'trading.marketProjectOrderVisibility':docCheck(d=>d.trading.projectMarketOrders,(d,v)=>{d.trading.projectMarketOrders=v;},null),
 // Profit and loss value, Positions and Brackets drive the P&L text of the virtual position and exit lines
 // (PaperChartLines paperLineProfitText). The child rows are disabled while Profit and loss value is off, and their display
 // select while the child is unchecked.
 'trading.positionAndBracketsPL':docCheck(d=>d.trading.profitLoss,(d,v)=>{d.trading.profitLoss=v;},null),
 'trading.positionPL':{read:s=>({checked:s.document.trading.positionPL.visible,selected:s.document.trading.positionPL.display}),write:(s,next)=>doc(s,d=>{d.trading.positionPL={visible:bool(next.checked,'Positions'),display:choice(next.selected,['money','ticks','percent'] as const,'Positions')};}),availability:()=>LIVE,
  disabled:(s,value)=>!s.document.trading.profitLoss?['check','select']:value.checked?[]:['select']},
 'trading.bracketsPLDisplay':{read:s=>({checked:s.document.trading.bracketsPL.visible,selected:s.document.trading.bracketsPL.display}),write:(s,next)=>doc(s,d=>{d.trading.bracketsPL={visible:bool(next.checked,'Brackets'),display:choice(next.selected,['money','ticks','percent'] as const,'Brackets')};}),availability:()=>LIVE,
  disabled:(s,value)=>!s.document.trading.profitLoss?['check','select']:value.checked?[]:['select']},
 // Virtual fills paint buy/sell markers (and optional labels) at their bar and price; the sound plays on new fills.
 'trading.tradingExecutions':docCheck(d=>d.trading.executionMarks,(d,v)=>{d.trading.executionMarks=v;},null),
 'trading.tradingExecutionsLables':docCheck(d=>d.trading.executionLabels,(d,v)=>{d.trading.executionLabels=v;},null),
 'trading.extendLeftTradingLine':docCheck(d=>d.trading.extendLines,(d,v)=>{d.trading.extendLines=v;},null), // PaperChartLines extendLines
 // Live. The order and position labels sit at the left, center or right of the price pane (PaperChartLines).
 'trading.positionAlign':{...docSelect(d=>d.trading.alignment,(d,v)=>{d.trading.alignment=v;},['left','center','right'] as const,CHART_SETTINGS_REASONS.trading),availability:()=>LIVE},
 // Live (App: the chart image export paints the virtual lines and marks, src/chart/paper-snapshot.ts).
 'trading.visibilityOnScreenshotTitle':docCheck(d=>d.trading.inSnapshots,(d,v)=>{d.trading.inSnapshots=v;},null),
 // Alerts.
 'alerts.colorAlertsLine':{read:s=>({checked:s.document.alerts.lines.visible,colors:[s.document.alerts.lines.color]}),
  write:(s,next)=>doc(s,d=>{const value=next.colors?.[0]??null;d.alerts.lines={visible:bool(next.checked,'Alert lines'),color:value===null||value===''?null:color(value,'alert lines')};}),
  // Live (App: alertLineRows({settings:{lines,activeOnly}}) feeds AlertChartLines).
  availability:()=>LIVE},
 'alerts.showActiveOnly':docCheck(d=>d.alerts.activeOnly,(d,v)=>{d.alerts.activeOnly=v;},null),
 'alerts.alertVolume':{read:s=>({checked:s.document.alerts.volume.enabled,level:s.document.alerts.volume.level}),write:(s,next)=>doc(s,d=>{d.alerts.volume={enabled:bool(next.checked,'Alert volume'),level:level(next.level,0,1,'Alert volume')};}),availability:()=>LIVE}, // Alert-sound.ts setAlertSoundVolume
 'alerts.hideToasts':docCheck(d=>d.alerts.hideToasts,(d,v)=>{d.alerts.hideToasts=v;},null),
 // Events.
 'events.ideasFilter':{read:s=>({checked:s.document.events.ideas.visible,selected:s.document.events.ideas.filter}),write:()=>{throw Error(CHART_SETTINGS_REASONS.ideas);},availability:()=>unavailable(CHART_SETTINGS_REASONS.ideas),disabled:(_s,value)=>value.checked?[]:['select']},
 // Live. App passes both to <ChartEventMarkers settings> (Alpaca corporate actions, src/domain/chart-events.ts).
 'events.symbolDividends':docCheck(d=>d.events.dividends,(d,v)=>{d.events.dividends=v;},null),
 'events.symbolSplits':docCheck(d=>d.events.splits,(d,v)=>{d.events.splits=v;},null),
 'events.earnings':{read:s=>({checked:s.document.events.earnings.visible,nested:s.document.events.earnings.breaks}),write:(s,next)=>doc(s,d=>{d.events.earnings={visible:bool(next.checked,'Earnings'),breaks:bool(next.nested,'Earnings breaks')};}),availability:()=>LIVE,disabled:()=>['nested']}, // App passes events.earnings.visible to <CalendarChartMarkers>; breaks not drawn
 // App passes events.economic to <CalendarChartMarkers> (economic entries of the local calendar documents).
 'events.economicEvents':{read:s=>({checked:s.document.events.economic.visible,nested:s.document.events.economic.futureOnly}),write:(s,next)=>doc(s,d=>{d.events.economic={visible:bool(next.checked,'Economic events'),futureOnly:bool(next.nested,'Future events only')};}),availability:()=>LIVE,disabled:(_s,value)=>value.checked?[]:['nested']},
 // Live. App passes both to <NewsChartMarkers settings> (local news documents, src/domain/news-chart-markers.ts).
 'events.lastNews':docCheck(d=>d.events.latestNews,(d,v)=>{d.events.latestNews=v;},null),
 'events.notificationAboutNews':docCheck(d=>d.events.newsNotification,(d,v)=>{d.events.newsNotification=v;},null),
};
function margin(value:unknown,what:string,other:number):number{
 if(typeof value!=='number'||!Number.isFinite(value)||value<0||value>MARGIN_PERCENT_MAX)throw Error(`${what} margin must be between 0% and ${MARGIN_PERCENT_MAX}% in this renderer.`);
 if(value+other>=100)throw Error('Top and bottom margins must leave space for prices.');
 return value;
}
export function hasBinding(factId:string):boolean{return Object.hasOwn(BINDINGS,factId);}
/** Rows written only to the document besides the docCheck/docSelect rows. */
const DOCUMENT_ROWS=new Set(['symbol.candleSymbolMinTick','legend.symbolTextSource','legend.legendBgTransparency','scales.dateFormat','canvas.watermark','canvas.paneRightMargin','trading.tradingSoundVolume','trading.tradingSoundMelody','trading.positionPL','trading.bracketsPLDisplay','alerts.colorAlertsLine','alerts.alertVolume','events.earnings','events.economicEvents']);
/** Parts of mixed rows that live in the document. */
const DOCUMENT_PARTS:Record<string,ControlPart[]>={'scales.symbolLabelsLines':['sub'],'scales.prePostLabelsLines':['colors'],'scales.bidAskLabelsLines':['colors']};
export function isDocumentRow(factId:string):boolean{return BINDINGS[factId]?.store==='document'||DOCUMENT_ROWS.has(factId);}
const ALL_PARTS:ControlPart[]=['check','colors','select','number','slider','items','thickness','sub','nested'];
function effectiveAvailability(factId:string,binding:Binding,s:ChartSettingsSources):ChartSettingsAvailability{return !s.documentConnected&&isDocumentRow(factId)?unavailable(CHART_SETTINGS_REASONS.document):binding.availability(s);}

// ---------------------------------------------------------------------------
// Chart type rows (Symbol tab for chart types other than candles; LV schema and labels).
// Only Candles edit the workspace appearance; Heikin Ashi has its own book entry (haStyle).
const APPEARANCE_STYLES=new Set(['candles']);
const CANDLE_LIKE=new Set(['hollow','volumecandles','heikinashi']);
// The Renko and P&F source ids ohlc and highlow and the Range bar style ids read as words (LV wording).
const SOURCE_LABELS:Record<string,string>={open:'Open',high:'High',low:'Low',close:'Close',hl2:'(High + Low) / 2',hlc3:'(High + Low + Close) / 3',ohlc4:'(Open + High + Low + Close) / 4',ohlc:'OHLC',highlow:'High/Low'};
// The line color mode reads Solid / Gradient; the box size method's Percentage id reads "Percentage (last traded price)".
const LINE_STYLE_LABELS:Record<string,string>={solid:'Solid',gradient:'Gradient',Percentage:'Percentage (last traded price)',dashed:'Dashed',dotted:'Dotted',bars:'Bars',candles:'Candles','5':'5 minutes','10':'10 minutes','15':'15 minutes','30':'30 minutes','60':'1 hour'};
export function isAppearanceStyle(style:string):boolean{return APPEARANCE_STYLES.has(style);}
export function hasTypeSettings(style:string):boolean{try{chartSettingsSchema(style);return !APPEARANCE_STYLES.has(style);}catch{return false;}}
export function typeDefaults(style:string):Record<string,unknown>|null{return hasTypeSettings(style)?settingsDefaults(style):null;}
/** invert: the checkbox shows the opposite of the stored boolean (Bars "HLC bars" over the stored openVisible). */
interface TypeRow {key:string;label:string;type:ChartSettingsControlType;fields:string[];field?:ChartSettingField;invert?:boolean}
function typeRows(style:string):TypeRow[]{
 const schema=chartSettingsSchema(style),byKey=new Map(schema.fields.map(field=>[field.key,field])),rows:TypeRow[]=[],used=new Set<string>();
 const composite=(key:string,label:string,check:string,up:string,down:string)=>{if(byKey.has(check)&&byKey.has(up)&&byKey.has(down)){rows.push({key:`type.${style}.${key}`,label,type:'checkbox+color+color',fields:[check,up,down]});used.add(check);used.add(up);used.add(down);}};
 if(CANDLE_LIKE.has(style)){
  if(byKey.has('previousClose')){rows.push({key:`type.${style}.previousClose`,label:'Color bars based on previous close',type:'checkbox',fields:['previousClose'],field:byKey.get('previousClose')});used.add('previousClose');}
  composite('body','Body','bodyVisible','color','downColor');composite('borders','Borders','borderVisible','borderUpColor','borderDownColor');composite('wick','Wick','wickVisible','wickUpColor','wickDownColor');
 }
 for(const field of schema.fields){if(used.has(field.key))continue;
  // Bars show an "HLC bars" checkbox (default off, checked hides the open tick) over the one stored
  // truth, LV's openVisible ("Opening price tick"): checked = openVisible false.
  if(style==='bars'&&field.key==='openVisible'){rows.push({key:`type.${style}.${field.key}`,label:'HLC bars',type:'checkbox',fields:[field.key],field,invert:true});continue;}
  // A list setting (TPO Merge points) is a select over None and the saved list.
  const type:ChartSettingsControlType=field.kind==='boolean'?'checkbox':field.kind==='color'?'color':field.kind==='select'||field.kind==='list'?'select':'number';
  rows.push({key:`type.${style}.${field.key}`,label:field.label,type,fields:[field.key],field});}
 return rows;
}
/** List rows (TPO Merge points) offer None (clears the list) and the saved list, labelled by its size. */
const LIST_NONE='none',LIST_KEEP='keep';
const listCount=(value:unknown)=>Array.isArray(value)?value.length:0;
const listOptions=(value:unknown)=>{const n=listCount(value);return [{value:LIST_NONE,label:'None'},...(n?[{value:LIST_KEEP,label:n===1?'1 merge point':n+' merge points'}]:[])];};
function typeRowView(row:TypeRow,s:ChartSettingsSources):ChartSettingsRowView{
 const values=s.typeSettings??typeDefaults(s.style)??{},field=row.field,availability=s.typeSettings?LIVE:unavailable(CHART_SETTINGS_REASONS.typeSettings);
 let value:ControlValue;
 if(row.type==='checkbox+color+color')value={checked:Boolean(values[row.fields[0]]),colors:[String(values[row.fields[1]]??''),String(values[row.fields[2]]??'')]};
 else if(row.type==='checkbox')value={checked:row.invert?values[row.fields[0]]===false:Boolean(values[row.fields[0]])};
 else if(row.type==='color')value={colors:[String(values[row.fields[0]]??'')]};
 else if(field?.kind==='list')value={selected:listCount(values[row.fields[0]])?LIST_KEEP:LIST_NONE};
 else if(row.type==='select')value={selected:String(values[row.fields[0]]??'')};
 else value={number:typeof values[row.fields[0]]==='number'?values[row.fields[0]] as number:null};
 const options=field?.kind==='list'?listOptions(values[row.fields[0]]):field?.kind==='select'?(field.options??[]).map(option=>({value:option,label:field.key==='source'?SOURCE_LABELS[option]??option:LINE_STYLE_LABELS[option]??option})):undefined;
 return{key:row.key,factId:null,label:row.label,type:row.type,...(options?{options}:{}),swatches:row.type==='checkbox+color+color'?2:row.type==='color'?1:0,thickness:false,lineStyle:false,
  ...(field?.kind==='number'?{min:field.min,max:field.max,step:field.step}:{}),indent:false,help:false,value,availability,disabledParts:typeRowUnused(s.style,row.fields[0],values)?['check','colors','select','number']:[]};
}
/** Presentation: a color or detail input whose own toggle is off is shown disabled and keeps its
 * value (Renko wick colors need Wicks; TPO and High-low details need their toggles). Inputs of another mode are hidden instead
 * (typeRowHidden). */
const STEP_METHOD_FIELD:Readonly<Record<string,{method:string;fixed:string}>>={renko:{method:'boxMethod',fixed:'boxSize'},kagi:{method:'reversalMethod',fixed:'reversalAmount'},pointfigure:{method:'boxMethod',fixed:'boxSize'}};
const RANGE_CANDLE_FIELDS=new Set(['candlesBorderUpColor','candlesBorderDownColor','candlesWickUpColor','candlesWickDownColor','candlesUpColor','candlesDownColor']);
/** Rows that belong to another choice are HIDDEN and keep their stored values: the box size method shows only its own input (ATR length, the fixed amount
 * (Renko and P&F Box size, Kagi Reversal amount) or Percentage), so Kagi in ATR mode has no Reversal amount; Range shows the Bars
 * rows (Up/Down color, Thin bars) or the Candles rows (body, border and wick colors); the line color mode shows the one solid
 * swatch or the gradient pair. */
export function typeRowHidden(style:string,key:string,values:Record<string,unknown>):boolean{
 const step=STEP_METHOD_FIELD[style];
 if(step){const method=values[step.method];
  if(key==='atrLength')return method!=='ATR';
  if(key===step.fixed)return method!=='Traditional';
  if(key==='percentage')return method!=='Percentage';}
 if(style==='range'){const candles=values.rangeStyle==='candles';
  // The range size is set through the interval (100R); the stored value stays (range-interval.ts).
  if(key==='range')return true;
  if(RANGE_CANDLE_FIELDS.has(key))return !candles;
  if(key==='thinBars'||key==='color'||key==='downColor')return candles;}
 // The custom session range rows belong to Sessions: Custom.
 if((style==='tpo'||style==='sessionvp')&&(key==='customSessionStart'||key==='customSessionEnd'))return values.profilesSessions!=='Custom';
 if(LINE_COLOR_MODE_STYLES.has(style)){const gradient=values.colorType==='gradient';
  if(key==='color')return gradient;
  if(key==='gradientStartColor'||key==='gradientColor')return !gradient;}
 return false;
}
const LINE_COLOR_MODE_STYLES=new Set(['line','linemarkers','step']);
export function typeRowUnused(style:string,key:string,values:Record<string,unknown>):boolean{
 if(style==='renko'&&(key==='wickUpColor'||key==='wickDownColor'))return values.wicks===false;
 // Time price opportunity inputs that the current choices do not use (same rule).
 if(style==='tpo'){
  if(key==='ticksPerRow')return values.rowSizeMode!=='Ticks per row';
  if(key==='pocColor')return values.poc===false;
  if(key==='valueAreaLineColor')return values.vah===false&&values.val===false;
  if(key==='initialBalanceBlocks'||key==='initialBalanceColor')return values.initialBalance===false;
  if(key==='singlePrintColor')return values.singlePrints===false;
  if(key==='midpointColor')return values.midpoint!==true;
  if(key==='openLevelColor')return values.openLevel!==true;
  if(key==='closeLevelColor')return values.closeLevel!==true;
  if(key==='poorColor')return values.poorHigh===false&&values.poorLow===false;
  if(key==='volumeProfileValues'||key==='volumeProfileColor')return values.volumeProfile===false;
  if(key==='splitByBlocksMode')return values.splitByBlocks!==true;
 }
 // Session volume profile details need their toggles.
 if(style==='sessionvp'){
  if(key==='pocColor'||key==='extendPocRight')return values.poc===false;
  if(key==='valueAreaLineColor')return values.vah!==true&&values.val!==true;
  if(key==='extendVAHRight')return values.vah!==true;
  if(key==='extendVALRight')return values.val!==true;
  if(key==='developingPocColor')return values.developingPoc!==true;
  if(key==='developingVAColor')return values.developingVA!==true;
 }
 // Volume footprint rows its toggles do not use (src/chart/footprint.ts).
 if(style==='footprint')return footprintRowUnused(key,values);
 if(style==='highlow'&&key==='borderColor')return values.borderVisible===false;
 if(style==='highlow'&&key==='labelColor')return values.labelsVisible===false;
 // The High-low Down color is used only with previous-close coloring on.
 if(style==='highlow'&&key==='downColor')return values.previousClose!==true;
 return false;
}
function writeTypeRow(row:TypeRow,s:ChartSettingsSources,next:ControlValue):ChartSettingsSources{
 if(!s.typeSettings)throw Error(CHART_SETTINGS_REASONS.typeSettings);
 const patch:Record<string,unknown>={};
 if(row.type==='checkbox+color+color'){patch[row.fields[0]]=bool(next.checked,row.label);patch[row.fields[1]]=color(next.colors?.[0],row.label+' up color');patch[row.fields[2]]=color(next.colors?.[1],row.label+' down color');}
 else if(row.type==='checkbox'){const checked=bool(next.checked,row.label);patch[row.fields[0]]=row.invert?!checked:checked;}
 else if(row.type==='color')patch[row.fields[0]]=color(next.colors?.[0],row.label);
 else if(row.field?.kind==='list'){const selected=choice(next.selected,[LIST_NONE,LIST_KEEP],row.label);if(selected===LIST_NONE)patch[row.fields[0]]=[];}
 else if(row.type==='select'){const options=row.field?.options??[];patch[row.fields[0]]=choice(next.selected,options,row.label);}
 else{const value=next.number,field=row.field!;if(typeof value!=='number'||!Number.isFinite(value)||field.min!==undefined&&value<field.min||field.max!==undefined&&value>field.max)throw Error(`Enter ${row.label.toLowerCase()} from ${field.min} to ${field.max}.`);patch[row.fields[0]]=value;}
 return{...s,typeSettings:{...s.typeSettings,...patch}};
}

// ---------------------------------------------------------------------------
// LV rows outside the recorded facts: scale type / invert / auto (from the retired Chart options dialog) and the pane separator color.
const LV_SWATCHES:Record<string,number>={'scales.symbolLabelsLines':1,'scales.highLowLabelsLines':1};
export const SCALE_TYPE_OPTIONS:readonly ChartSettingsOption[]=Object.freeze([{value:'linear',label:'Regular'},{value:'percent',label:'Percent'},{value:'indexed',label:'Indexed to 100'},{value:'logarithmic',label:'Logarithmic'}]);
export const LV_ROW_KEYS=Object.freeze({scaleType:'lv.scales.scaleType',invert:'lv.scales.invert',auto:'lv.scales.auto',separators:'lv.canvas.paneSeparators',session:'lv.symbol.session',sessionBreaks:'lv.canvas.sessionBreaks',haRealLastPrice:'lv.symbol.haRealLastPrice',alertLabels:'lv.alerts.labels'});
const scaleModeOf=(s:ChartSettingsSources):ScaleModeSettings=>{if(!s.scaleMode)throw Error(CHART_SETTINGS_REASONS.scaleMode);return s.scaleMode;};
const scaleModeAvailability=(s:ChartSettingsSources):ChartSettingsAvailability=>s.scaleMode?LIVE:unavailable(CHART_SETTINGS_REASONS.scaleMode);
const LV_BINDINGS:Record<string,Binding>={
 [LV_ROW_KEYS.scaleType]:{read:s=>({selected:s.scaleMode?.scale??'linear'}),write:(s,next)=>({...s,scaleMode:{...scaleModeOf(s),scale:choice(next.selected,SCALE_TYPE_OPTIONS.map(row=>row.value) as ScaleModeSettings['scale'][],'Scale type')}}),availability:scaleModeAvailability,options:()=>SCALE_TYPE_OPTIONS},
 [LV_ROW_KEYS.invert]:{read:s=>({checked:s.scaleMode?.invert??false}),write:(s,next)=>({...s,scaleMode:{...scaleModeOf(s),invert:bool(next.checked,'Invert scale')}}),availability:scaleModeAvailability},
 [LV_ROW_KEYS.auto]:{read:s=>({checked:s.scaleMode?.auto??true}),write:(s,next)=>({...s,scaleMode:{...scaleModeOf(s),auto:bool(next.checked,'Auto scale')}}),availability:scaleModeAvailability},
 [LV_ROW_KEYS.separators]:{read:s=>({colors:[s.appearance.separatorColor]}),write:(s,next)=>appearance(s,{separatorColor:color(next.colors?.[0],'pane separators')}),availability:()=>LIVE},
 // Extended trading hours, saved in the Chart Settings document (symbol.session); the bottom toolbar ETH button writes the same field.
 // Session breaks (no recorded reference fact): dashed vertical lines between sessions of intraday US equity charts; saved in the Chart Settings document (canvas.sessionBreaks).
 [LV_ROW_KEYS.sessionBreaks]:{read:s=>({checked:s.document.canvas.sessionBreaks??false}),write:(s,next)=>doc(s,d=>{d.canvas.sessionBreaks=bool(next.checked,'Session breaks');}),availability:s=>s.documentConnected?LIVE:unavailable(CHART_SETTINGS_REASONS.document),store:'document'},
 // Heikin Ashi "Show real last price" (default false; the row sits last in the Heikin Ashi group). The last price line and label then read the raw close.
 [LV_ROW_KEYS.haRealLastPrice]:{read:s=>({checked:s.appearance.haShowRealLastPrice??false}),write:(s,next)=>appearance(s,{haShowRealLastPrice:bool(next.checked,'Real prices on price scale')}),availability:()=>LIVE},
 // Alert labels, the price chips on alert lines (default true). The row sits under Alert lines. Saved in the Chart
 // Settings document (alerts.labelsVisible); AlertChartLines and the snapshot scene hide the chips when it is off.
 [LV_ROW_KEYS.alertLabels]:{read:s=>({checked:s.document.alerts.labelsVisible??true}),write:(s,next)=>doc(s,d=>{d.alerts.labelsVisible=bool(next.checked,'Alert labels');}),availability:s=>s.documentConnected?LIVE:unavailable(CHART_SETTINGS_REASONS.document),store:'document'},
 [LV_ROW_KEYS.session]:{read:s=>({checked:(s.document.symbol.session??'extended')==='extended'}),write:(s,next)=>doc(s,d=>{d.symbol.session=bool(next.checked,'Extended trading hours')?'extended':'regular';}),availability:s=>s.documentConnected?LIVE:unavailable(CHART_SETTINGS_REASONS.document),store:'document'},
};
const LV_ROW_FACTS:Record<string,{label:string;type:ChartSettingsControlType;swatches:number}>={
 [LV_ROW_KEYS.scaleType]:{label:'Scale type',type:'select',swatches:0},
 [LV_ROW_KEYS.invert]:{label:'Invert scale',type:'checkbox',swatches:0},
 [LV_ROW_KEYS.auto]:{label:'Auto scale',type:'checkbox',swatches:0},
 [LV_ROW_KEYS.separators]:{label:'Pane separators',type:'color',swatches:1},
 [LV_ROW_KEYS.session]:{label:'Extended trading hours',type:'checkbox',swatches:0},
 [LV_ROW_KEYS.sessionBreaks]:{label:'Session breaks',type:'checkbox',swatches:0},
 [LV_ROW_KEYS.haRealLastPrice]:{label:'Real prices on price scale',type:'checkbox',swatches:0},
 [LV_ROW_KEYS.alertLabels]:{label:'Alert labels',type:'checkbox',swatches:0},
};
function lvRowView(key:string,s:ChartSettingsSources):ChartSettingsRowView{
 const binding=LV_BINDINGS[key],fact=LV_ROW_FACTS[key],value=binding.read(s),availability=binding.availability(s);
 return{key,factId:null,label:fact.label,type:fact.type,...(binding.options?{options:binding.options(s)}:{}),swatches:fact.swatches,thickness:false,lineStyle:false,indent:false,help:false,value,availability,disabledParts:availability.state==='unavailable'?ALL_PARTS:[]};
}
const SCALES_PRICE_GROUP='scales.group.scalesPriceScaleGroup',CANVAS_BASIC_GROUP='canvas.group.chartBasicStylesAppearanceGroup',ALERTS_LINES_GROUP='alerts.group.alertsLinesGroup';
function withLvRows(tab:ChartSettingsTabId,groups:ChartSettingsGroupView[],s:ChartSettingsSources):ChartSettingsGroupView[]{
 if(tab==='scales'){const price=groups.find(group=>group.factId===SCALES_PRICE_GROUP);if(price)price.rows=[lvRowView(LV_ROW_KEYS.scaleType,s),lvRowView(LV_ROW_KEYS.invert,s),lvRowView(LV_ROW_KEYS.auto,s),...price.rows];}
 if(tab==='symbol'){const data=groups.find(group=>group.factId===SYMBOL_DATA_GROUP_ID);if(data)data.rows.push(lvRowView(LV_ROW_KEYS.session,s));}
 if(tab==='canvas'){const basic=groups.find(group=>group.factId===CANVAS_BASIC_GROUP);if(basic){const at=basic.rows.findIndex(row=>row.key==='canvas.crossHair');basic.rows.splice(at<0?basic.rows.length:at+1,0,lvRowView(LV_ROW_KEYS.separators,s),lvRowView(LV_ROW_KEYS.sessionBreaks,s));}}
 if(tab==='alerts'){const lines=groups.find(group=>group.factId===ALERTS_LINES_GROUP);if(lines){const at=lines.rows.findIndex(row=>row.key==='alerts.colorAlertsLine');lines.rows.splice(at<0?lines.rows.length:at+1,0,lvRowView(LV_ROW_KEYS.alertLabels,s));}}
 return groups;
}

// ---------------------------------------------------------------------------
// Views.
function factRowView(fact:ChartSettingsControlFact,s:ChartSettingsSources):ChartSettingsRowView{
 const binding=BINDINGS[fact.factId];if(!binding)throw Error('Chart settings control has no binding: '+fact.factId);
 const value=binding.read(s),availability=effectiveAvailability(fact.factId,binding,s);
 const disabledParts=availability.state==='unavailable'?ALL_PARTS:[...new Set([...(binding.disabled?.(s,value)??[]),...(!s.documentConnected?DOCUMENT_PARTS[fact.factId]??[]:[])])];
 const options=binding.options?.(s)??fact.options;
 return{key:fact.factId,factId:fact.factId,label:fact.label,type:fact.type,...(options?{options}:{}),...(binding.optionDisabled?{optionDisabled:binding.optionDisabled(s)}:{}),
  ...(fact.items?{items:fact.items,itemAvailability:binding.items?.(s)??{},summary:multiCheckSummary(fact.items,value.items??{})}:{}),
  ...(fact.sub?{sub:fact.sub}:{}),...(fact.nested?{nested:fact.nested}:{}),
  swatches:LV_SWATCHES[fact.factId]??fact.swatches??(fact.type.includes('color')?1:0),thickness:!!fact.thickness,lineStyle:!!binding.lineStyle,
  ...(fact.unitSuffix?{unitSuffix:fact.unitSuffix}:{}),...(fact.min!==undefined?{min:fact.min}:{}),...(fact.max!==undefined?{max:fact.max}:{}),
  indent:!!fact.indent,help:!!fact.help,value,availability,disabledParts};
}
function groupViews(entries:readonly ChartSettingsEntryFact[],s:ChartSettingsSources):ChartSettingsGroupView[]{
 const groups:ChartSettingsGroupView[]=[];
 for(const entry of entries){
  if(entry.kind==='group'){groups.push({key:entry.factId,factId:entry.factId,label:entry.label,rows:[]});continue;}
  const view=factRowView(entry,s);
  // The background row shows two swatches while Gradient is selected.
  if(entry.factId==='canvas.chartBackground')view.swatches=view.value.selected==='gradient'?2:1;
  groups.at(-1)!.rows.push(view);
 }
 return groups;
}
/** The Symbol tab for the current chart type. Candles use the observed rows; other types use LV rows. */
function symbolGroups(s:ChartSettingsSources):ChartSettingsGroupView[]{
 const label=CHART_TYPES.find(row=>row[0]===s.style)?.[1]??s.style;
 let style:ChartSettingsGroupView[];
 if(s.style==='candles')style=groupViews(SYMBOL_CANDLE_FACTS,s);
 else if(hasTypeSettings(s.style)){
  const values=s.typeSettings??typeDefaults(s.style)??{},rows=typeRows(s.style).filter(row=>!typeRowHidden(s.style,row.fields[0],values)).map(row=>typeRowView(row,s));
  // The first Heikin Ashi row is "Real prices on price scale (instead of Heikin-Ashi price)" (haStyle.showRealLastPrice).
  style=[{key:SYMBOL_STYLE_GROUP_ID+':'+s.style,factId:null,label,rows:s.style==='heikinashi'?[lvRowView(LV_ROW_KEYS.haRealLastPrice,s),...rows]:rows}];
 }
 else style=[{key:SYMBOL_STYLE_GROUP_ID+':'+s.style,factId:null,label,rows:[],note:CHART_SETTINGS_REASONS.noTypeSettings}];
 return[...style,...groupViews(SYMBOL_DATA_FACTS,s)];
}
export function tabView(tab:ChartSettingsTabId,s:ChartSettingsSources):ChartSettingsGroupView[]{
 if(!CHART_SETTINGS_TAB_IDS.includes(tab))throw Error('Unknown chart settings tab.');
 if(tab==='datasources'||tab==='general')return[];
 return withLvRows(tab,tab==='symbol'?symbolGroups(s):groupViews(TAB_FACTS[tab],s),s);
}
/** Facts whose document field another row already edits (the status line copy of Buy/sell buttons). */
const HIDDEN_IN_VIEW=new Set(['legend.tradingSellBuyPanel']);
/** Rows that do something: stored-only and unavailable rows, non-live menu items and refused options are left out of the view
 * (the facts and bindings stay, so saved documents and templates still round-trip every value). */
function visibleRow(row:ChartSettingsRowView):ChartSettingsRowView|null{
 if(row.availability.state!=='live'||row.factId!==null&&HIDDEN_IN_VIEW.has(row.factId))return null;
 let out=row;
 if(row.items){const items=row.items.filter(item=>(row.itemAvailability?.[item.value]??LIVE).state==='live');if(!items.length)return null;if(items.length!==row.items.length)out={...out,items,summary:multiCheckSummary(items,row.value.items??{})};}
 if(row.options&&row.optionDisabled){const disabled=row.optionDisabled,options=row.options.filter(option=>!disabled[option.value]||option.value===row.value.selected);if(!options.length)return null;out={...out,options};}
 return out;
}
export function visibleTabView(tab:ChartSettingsTabId,s:ChartSettingsSources):ChartSettingsGroupView[]{
 const groups:ChartSettingsGroupView[]=[];
 for(const group of tabView(tab,s)){
  // An indented row whose parent row is hidden (Ideas on the Events tab) is not indented under nothing.
  let parentShown=true;
  const rows=group.rows.flatMap(row=>{const shown=visibleRow(row);if(!row.indent)parentShown=shown!==null;if(!shown)return[];return[shown.indent&&!parentShown?{...shown,indent:false}:shown];});
  if(rows.length||group.note)groups.push({...group,rows});
 }
 return groups;
}
/** Tabs worth showing: those with at least one working row. Data sources is the host's and shows when the host supplies it. */
export function visibleTabs(s:ChartSettingsSources,hasDataSources:boolean,hasGeneral=false):ChartSettingsTabId[]{
 return CHART_SETTINGS_TAB_IDS.filter(tab=>tab==='datasources'?hasDataSources:tab==='general'?hasGeneral:visibleTabView(tab,s).length>0);
}
export function findRow(tab:ChartSettingsTabId,s:ChartSettingsSources,key:string):ChartSettingsRowView|null{
 for(const group of tabView(tab,s))for(const row of group.rows)if(row.key===key)return row;
 return null;
}
/** Applies one control's new value. Throws a user-facing message when the value or the connection is refused. */
export function writeRow(s:ChartSettingsSources,key:string,next:ControlValue):ChartSettingsSources{
 if(key.startsWith('type.')){
  const row=hasTypeSettings(s.style)?typeRows(s.style).find(item=>item.key===key):undefined;
  if(!row)throw Error('This setting is not available for the current chart type.');
  return writeTypeRow(row,s,next);
 }
 if(Object.hasOwn(LV_BINDINGS,key)){const lv=LV_BINDINGS[key],state=lv.availability(s);if(state.state==='unavailable')throw Error(state.reason);return lv.write(s,next,lv.read(s));}
 const binding=BINDINGS[key];if(!binding)throw Error('Unknown chart settings control.');
 const availability=effectiveAvailability(key,binding,s);if(availability.state==='unavailable')throw Error(availability.reason);
 return binding.write(s,next,binding.read(s));
}
/** Symbol tab group id of the data-modification group (stable for every chart type). */
export const DATA_GROUP_KEY=SYMBOL_DATA_GROUP_ID;
