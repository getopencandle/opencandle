import source from '../../research/theme-sources.json';
import {HA_REAL_LAST_PRICE_SETTING} from '../chart/appearance-price';

export interface ChartAppearance {
  /** LV display controls. Absent legacy fields mean true. */
  indicatorLabelsVisible?:boolean;indicatorValuesVisible?:boolean;
  /** Heikin Ashi "Show real last price" (default
   *  false), saved as mainSeriesProperties.haStyle.showRealLastPrice. Absent means off, so earlier appearances load unchanged. */
  haShowRealLastPrice?:boolean;
  colorPreviousClose: boolean;
  bodyVisible: boolean; upColor: string; downColor: string;
  borderVisible: boolean; borderUpColor: string; borderDownColor: string;
  wickVisible: boolean; wickUpColor: string; wickDownColor: string;
  countdownVisible: boolean;
  priceLineVisible: boolean; priceLineColor: string; priceLineWidth: number;
  highLowVisible: boolean; highLowColor: string; highLowWidth: number;
  backgroundType: 'solid' | 'gradient'; background: string; gradientStart: string; gradientEnd: string;
  gridMode: 'both' | 'vertical' | 'horizontal' | 'none'; verticalGrid: string; horizontalGrid: string;
  separatorColor: string; crosshairColor: string; crosshairWidth: number; crosshairStyle: number;
  textColor: string; fontSize: number; scaleLineColor: string; topMargin: number; bottomMargin: number;
}
export interface ThemePreset { id:string; name:string; sourceUrl:string; author:string|null; observedAt:string; appearance:ChartAppearance; originalSettings:Record<string,string|boolean>; }
/** The optional Heikin Ashi setting stays outside themeFieldMap, so recorded presets need not carry it. */
export {HA_REAL_LAST_PRICE_SETTING};
export const themeFieldMap = {
  'mainSeriesProperties.showCountdown':'countdownVisible',
  'mainSeriesProperties.candleStyle.barColorsOnPrevClose':'colorPreviousClose',
  'mainSeriesProperties.candleStyle.drawBody':'bodyVisible',
  'mainSeriesProperties.candleStyle.upColor':'upColor',
  'mainSeriesProperties.candleStyle.downColor':'downColor',
  'mainSeriesProperties.candleStyle.drawBorder':'borderVisible',
  'mainSeriesProperties.candleStyle.borderUpColor':'borderUpColor',
  'mainSeriesProperties.candleStyle.borderDownColor':'borderDownColor',
  'mainSeriesProperties.candleStyle.drawWick':'wickVisible',
  'mainSeriesProperties.candleStyle.wickUpColor':'wickUpColor',
  'mainSeriesProperties.candleStyle.wickDownColor':'wickDownColor',
  'mainSeriesProperties.showPriceLine':'priceLineVisible',
  'mainSeriesProperties.priceLineColor':'priceLineColor',
  'mainSeriesProperties.priceLineWidth':'priceLineWidth',
  'mainSeriesProperties.highLowAvgPrice.highLowPriceLinesVisible':'highLowVisible',
  'mainSeriesProperties.highLowAvgPrice.highLowPriceLinesColor':'highLowColor',
  'mainSeriesProperties.highLowAvgPrice.highLowPriceLinesWidth':'highLowWidth',
  'paneProperties.background':'background',
  'paneProperties.backgroundType':'backgroundType',
  'paneProperties.backgroundGradientStartColor':'gradientStart',
  'paneProperties.backgroundGradientEndColor':'gradientEnd',
  'paneProperties.vertGridProperties.color':'verticalGrid',
  'paneProperties.horzGridProperties.color':'horizontalGrid',
  'paneProperties.gridLinesMode':'gridMode',
  'paneProperties.separatorColor':'separatorColor',
  'paneProperties.crossHairProperties.color':'crosshairColor',
  'paneProperties.crossHairProperties.width':'crosshairWidth',
  'paneProperties.crossHairProperties.style':'crosshairStyle',
  'scalesProperties.textColor':'textColor',
  'scalesProperties.fontSize':'fontSize',
  'scalesProperties.lineColor':'scaleLineColor',
  'paneProperties.topMargin':'topMargin',
  'paneProperties.bottomMargin':'bottomMargin',
} as const;
const names:Record<string,string>={
  'mengthea229-theme-1':'Sea Glass & Terracotta', basic:'Midnight Teal', 'forex-theme':'Porcelain Blue',
  'aletosca819-theme-1':'Neon Lime & Violet', 'soothing-eyes':'Glacier & Sunlight', martin:'Limestone & Graphite', 'slow-and-clean':'Silver & Charcoal',
};
const booleanFields=new Set(['countdownVisible','colorPreviousClose','bodyVisible','borderVisible','wickVisible','priceLineVisible','highLowVisible']);
const numberFields=new Set(['priceLineWidth','highLowWidth','crosshairWidth','crosshairStyle','fontSize','topMargin','bottomMargin']);
export function normalizeAppearance(settings:Record<string,unknown>):ChartAppearance {
  const result:Record<string,unknown>={};
  for(const [key,field] of Object.entries(themeFieldMap)){
    if(!(key in settings))throw new Error(`Missing theme setting: ${key}`);
    const value=settings[key];
    if(booleanFields.has(field)){
      if(![true,false,0,1,'0','1','true','false'].includes(value as any))throw new Error(`Invalid boolean: ${key}`);
      result[field]=value===true||value===1||value==='1'||value==='true';
    }else if(numberFields.has(field)){
      const number=Number(value);if(!Number.isFinite(number)||number<0)throw new Error(`Invalid number: ${key}`);result[field]=number;
    }else {if(typeof value!=='string')throw new Error(`Invalid text: ${key}`);result[field]=value;}
  }
  if(!['solid','gradient'].includes(String(result.backgroundType)))throw new Error('Invalid background type');
  const modes:Record<string,string>={both:'both',vertical:'vertical',horizontal:'horizontal',vert:'vertical',horz:'horizontal',none:'none'};
  if(!modes[String(result.gridMode)])throw new Error('Invalid grid mode');result.gridMode=modes[String(result.gridMode)];
  if(Number(result.topMargin)+Number(result.bottomMargin)>=100)throw new Error('Theme margins must leave space for prices');
  for(const field of ['indicatorLabelsVisible','indicatorValuesVisible'] as const){const key='lv.'+field;if(Object.hasOwn(settings,key)){if(typeof settings[key]!=='boolean')throw Error('Invalid indicator display option: '+key);result[field]=settings[key];}}
  if(Object.hasOwn(settings,HA_REAL_LAST_PRICE_SETTING)){const value=settings[HA_REAL_LAST_PRICE_SETTING];if(![true,false,0,1,'0','1','true','false'].includes(value as any))throw new Error('Invalid boolean: '+HA_REAL_LAST_PRICE_SETTING);result.haShowRealLastPrice=value===true||value===1||value==='1'||value==='true';}
  return result as unknown as ChartAppearance;
}
/** The seven user-supplied presets, in research/theme-sources.json order. */
/** Shape of one record in research/theme-sources.json. Typed explicitly so an empty preset list (the public source
 *  ships `records: []`) still compiles. */
interface ThemeSourceRecord { slug:string; url:string; author:string|null; observedAt:string; settings:Record<string,string|boolean>; }
export const recordedThemePresets:ThemePreset[]=(source.records as ThemeSourceRecord[]).map(record=>({id:record.slug,name:names[record.slug],sourceUrl:record.url,author:record.author,observedAt:record.observedAt,appearance:normalizeAppearance(record.settings),originalSettings:record.settings}));

/** LV-owned default preset (LV Dark).
 * Fields this preset does not set keep
 * the previous default's value (preset `basic`) and are listed in lvDarkProvenance; nothing is invented. */
export const LV_DARK_THEME_ID='lv-dark';
const lvDarkSettings:Record<string,string|boolean>={
  'mainSeriesProperties.showCountdown':true,
  'mainSeriesProperties.candleStyle.barColorsOnPrevClose':false,
  'mainSeriesProperties.candleStyle.drawBody':true,
  'mainSeriesProperties.candleStyle.upColor':'#089981',
  'mainSeriesProperties.candleStyle.downColor':'#F23645',
  'mainSeriesProperties.candleStyle.drawBorder':true,
  'mainSeriesProperties.candleStyle.borderUpColor':'#089981',
  'mainSeriesProperties.candleStyle.borderDownColor':'#F23645',
  'mainSeriesProperties.candleStyle.drawWick':true,
  'mainSeriesProperties.candleStyle.wickUpColor':'#089981',
  'mainSeriesProperties.candleStyle.wickDownColor':'#F23645',
  'mainSeriesProperties.showPriceLine':true,
  'mainSeriesProperties.priceLineColor':'',
  'mainSeriesProperties.priceLineWidth':'1',
  'mainSeriesProperties.highLowAvgPrice.highLowPriceLinesVisible':false,
  'mainSeriesProperties.highLowAvgPrice.highLowPriceLinesColor':'#8b8ba7',
  'mainSeriesProperties.highLowAvgPrice.highLowPriceLinesWidth':'1',
  'paneProperties.background':'#0F0F0F',
  'paneProperties.backgroundType':'solid',
  'paneProperties.backgroundGradientStartColor':'#1F1F1F',
  'paneProperties.backgroundGradientEndColor':'#0F0F0F',
  'paneProperties.vertGridProperties.color':'rgba(242, 242, 242, 0.2)',
  'paneProperties.horzGridProperties.color':'rgba(242, 242, 242, 0.2)',
  'paneProperties.gridLinesMode':'both',
  'paneProperties.separatorColor':'#2E2E2E',
  'paneProperties.crossHairProperties.color':'#9C9C9C',
  'paneProperties.crossHairProperties.width':'1',
  'paneProperties.crossHairProperties.style':'2',
  'scalesProperties.textColor':'#B8B8B8',
  'scalesProperties.fontSize':'12',
  'scalesProperties.lineColor':'rgba(242, 242, 242, 0)',
  'paneProperties.topMargin':'10',
  'paneProperties.bottomMargin':'8',
};
/** Where each LV Dark value comes from. `recorded` = a recorded default value; `inherited` =
 * not recorded, kept from the previous default (`basic`); `lvDecision` = inactive
 * field set by LV; `notRepresentable` = recorded value the ChartAppearance schema/renderer cannot hold yet. */
export const lvDarkProvenance=Object.freeze({
  source:'Measured dark chart defaults (observed 2026-10-15), including the background gradient start and end',
  recorded:Object.freeze(['countdownVisible','upColor','downColor','borderVisible','borderUpColor','borderDownColor','wickVisible','wickUpColor','wickDownColor','priceLineVisible','priceLineColor','priceLineWidth','backgroundType','background','gridMode','verticalGrid','horizontalGrid','separatorColor','crosshairColor','crosshairWidth','crosshairStyle','textColor','fontSize','scaleLineColor','gradientStart','gradientEnd'] as const),
  inherited:Object.freeze(['colorPreviousClose','bodyVisible','highLowVisible','highLowColor','highLowWidth','topMargin','bottomMargin'] as const),
  lvDecision:Object.freeze({priceLineColor:'empty = automatic bar color, which is the recorded behavior'}),
  notRepresentable:Object.freeze({gridLineStyle:'dotted (line style 1); no grid style field in ChartAppearance or the renderer mapping',canvasFontFamily:'UI font stack; renderer font family is set in src/chart (Phase B)',priceLineStyle:'dotted (visual)',legendBackground:'rgba(15,15,15,0.5)'}),
});
/** Recorded LV Dark values outside the ChartAppearance schema, for the renderer/legend lanes. */
export const lvDarkChartExtras=Object.freeze({gridLineStyle:'dotted' as const,priceLineStyle:'dotted' as const,legendBackground:'rgba(15,15,15,0.5)',canvasFontFamily:'-apple-system, BlinkMacSystemFont, "Trebuchet MS", Roboto, Ubuntu, sans-serif',timeScaleHeight:28,priceScaleTextColor:'#B8B8B8'});
export const lvDarkTheme:ThemePreset={id:LV_DARK_THEME_ID,name:'OpenCandle Dark',sourceUrl:'src/ui/themes.ts (OpenCandle design, 2026-10-15)',author:null,observedAt:'2026-10-15',appearance:normalizeAppearance(lvDarkSettings),originalSettings:lvDarkSettings};
/** LV Medium Dark: OpenCandle's own standard look ("our own theme... a medium-dark theme for
 * the standard"). Every value is a design decision, not a measured reference: slate-blue medium-dark surfaces
 * (chart #232734), LV jade/coral candles, a soft slate grid and crosshair. The shell tokens in styles.css :root carry
 * the same palette; LV Dark keeps the previous graphite shell (styles.css, data-theme="lv-dark"). */
export const LV_MEDIUM_DARK_THEME_ID='lv-medium-dark';
export const LV_CANDLE_UP='#38B486',LV_CANDLE_DOWN='#E8605A';
const lvMediumDarkSettings:Record<string,string|boolean>={
  ...lvDarkSettings,
  'mainSeriesProperties.candleStyle.upColor':LV_CANDLE_UP,
  'mainSeriesProperties.candleStyle.downColor':LV_CANDLE_DOWN,
  'mainSeriesProperties.candleStyle.borderUpColor':LV_CANDLE_UP,
  'mainSeriesProperties.candleStyle.borderDownColor':LV_CANDLE_DOWN,
  'mainSeriesProperties.candleStyle.wickUpColor':LV_CANDLE_UP,
  'mainSeriesProperties.candleStyle.wickDownColor':LV_CANDLE_DOWN,
  'mainSeriesProperties.highLowAvgPrice.highLowPriceLinesColor':'#9AA2B4',
  'paneProperties.background':'#232734',
  'paneProperties.backgroundGradientStartColor':'#2A2F3E',
  'paneProperties.backgroundGradientEndColor':'#1E2230',
  'paneProperties.vertGridProperties.color':'rgba(154, 164, 190, 0.13)',
  'paneProperties.horzGridProperties.color':'rgba(154, 164, 190, 0.13)',
  'paneProperties.separatorColor':'#363C4C',
  'paneProperties.crossHairProperties.color':'#8C95AA',
  'scalesProperties.textColor':'#B7BDCC',
  'scalesProperties.lineColor':'rgba(154, 164, 190, 0)',
};
export const lvMediumDarkTheme:ThemePreset={id:LV_MEDIUM_DARK_THEME_ID,name:'OpenCandle Medium Dark',sourceUrl:'src/ui/themes.ts (OpenCandle design, 2026-10-27)',author:null,observedAt:'2026-10-27',appearance:normalizeAppearance(lvMediumDarkSettings),originalSettings:lvMediumDarkSettings};
/** Every selectable preset: the recorded seven keep their order and ids; LV Dark and LV Medium Dark are appended. */
export const themePresets:ThemePreset[]=[...recordedThemePresets,lvDarkTheme,lvMediumDarkTheme];
/** New profiles, workspace reset and newly added chart cells start from LV Medium Dark. Saved theme choices (themeId and
 * appearance stored in the workspace) are untouched, so existing LV Dark profiles stay LV Dark. */
export const defaultTheme=themePresets.find(theme=>theme.id===LV_MEDIUM_DARK_THEME_ID)!;
export function appearanceBackground(appearance:ChartAppearance){return appearance.backgroundType==='gradient'?`linear-gradient(${appearance.gradientStart}, ${appearance.gradientEnd})`:appearance.background;}
export function serializeAppearance(appearance:ChartAppearance):Record<string,string|number|boolean>{const result:Record<string,string|number|boolean>=Object.fromEntries(Object.entries(themeFieldMap).map(([source,field])=>[source,appearance[field]]));for(const key of ['indicatorLabelsVisible','indicatorValuesVisible'] as const)if(Object.hasOwn(appearance,key)){if(typeof appearance[key]!=='boolean')throw Error('Invalid indicator display option');result['lv.'+key]=appearance[key];}if(Object.hasOwn(appearance,'haShowRealLastPrice')){if(typeof appearance.haShowRealLastPrice!=='boolean')throw Error('Invalid Heikin Ashi real last price option');result[HA_REAL_LAST_PRICE_SETTING]=appearance.haShowRealLastPrice;}return result;}
