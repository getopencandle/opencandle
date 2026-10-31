import {supportedColor} from './color-validation';
import {CHART_TYPES,LV_TEMPORAL_DEFAULTS,type TemporalChartSettings} from './chart-types';
import {LV_STYLE_FIELDS,STYLE_FACT_DEFAULTS,DERIVED_FACT_DEFAULTS,DERIVED_INTERVAL_DEFAULTS,DERIVED_LV_FIELDS} from './chart-settings-style-defaults';
import {DERIVED_SETTING_FIELDS,DERIVED_UNRESOLVED,validateDerivedSettings} from './derived/derived-settings';
import {isDerivedStyle} from './derived/common';
import type {AppearanceSettings} from './appearance';
import {TPO_LV_DEFAULTS,TPO_SETTING_FIELDS,TPO_UNRESOLVED} from './tpo';
import {SVP_LV_DEFAULTS,SVP_SETTING_FIELDS,SVP_UNRESOLVED} from './session-vp';
import {FOOTPRINT_LV_DEFAULTS,FOOTPRINT_SETTING_FIELDS,FOOTPRINT_UNRESOLVED} from './footprint';
export interface ChartSettingField {key:string;label:string;kind:'boolean'|'number'|'color'|'select'|'list';min?:number;max?:number;step?:number;options?:string[]}
export type ChartSettingsBook=Record<string,Record<string,unknown>>;
const field=(key:string,label:string,kind:ChartSettingField['kind'],extra:Partial<ChartSettingField>={}):ChartSettingField=>({key,label,kind,...extra});
const source=field('source','Price source','select',{options:['open','high','low','close','hl2','hlc3','ohlc4']});
const color=(key:string,label:string)=>field(key,label,'color');const toggle=(key:string,label:string)=>field(key,label,'boolean');const width=(key:string,label:string)=>field(key,label,'number',{min:0.5,max:8,step:0.5});const opacity=(key:string,label:string)=>field(key,label,'number',{min:0,max:1,step:0.05});
const body=[toggle('bodyVisible','Body'),color('color','Up body color'),color('downColor','Down body color'),toggle('borderVisible','Borders'),color('borderUpColor','Up border color'),color('borderDownColor','Down border color'),toggle('wickVisible','Wick'),color('wickUpColor','Up wick color'),color('wickDownColor','Down wick color')];
const line=[source,color('color','Line color'),width('width','Line thickness'),opacity('opacity','Line opacity')];const gradient=[toggle('gradient','Gradient line'),color('gradientColor','Second line color')];
/** Line types keep a solid color and a separate gradient pair (colorType, gradientStartColor, gradientEndColor). */
/** The Line row is a Solid | Gradient select followed by one swatch (Solid) or two (Gradient);
 * it replaces LV's former "Gradient line" toggle. Saved books with the
 * old boolean migrate in migrateTypeSettings (true -> gradient). */
const lineColorMode=field('colorType','Line color mode','select',{options:['solid','gradient']});
const lineTypeRows=[source,lineColorMode,color('color','Line color'),color('gradientStartColor','Gradient start color'),color('gradientColor','Gradient end color'),width('width','Line thickness'),opacity('opacity','Line opacity'),field('lineStyle','Line style','select',{options:['solid','dashed','dotted']})];
export const LINE_GRADIENT_STYLES:readonly string[]=Object.freeze(['line','linemarkers','step']);
const fields:Record<string,ChartSettingField[]>={
 line:[...lineTypeRows],linemarkers:[...lineTypeRows,toggle('markersVisible','Markers')],step:[...lineTypeRows],
 area:[...line,...gradient,color('highFill','Top fill color'),color('lowFill','Bottom fill color')],
 baseline:[source,field('baseLevel','Base level (%)','number',{min:0,max:100,step:1}),color('baselineColor','Base level line color'),color('highColor','Above line color'),width('highWidth','Above line thickness'),opacity('highOpacity','Above line opacity'),color('lowColor','Below line color'),width('lowWidth','Below line thickness'),opacity('lowOpacity','Below line opacity'),color('highFill','Above fill color'),color('highFill2','Second above fill color'),color('lowFill','Below fill color'),color('lowFill2','Second below fill color')],
 hlcarea:[toggle('highLineVisible','High line'),toggle('lowLineVisible','Low line'),...['high','low','close'].flatMap(key=>{/* Row labels start upper case like every other row. */const name=key[0].toUpperCase()+key.slice(1);return[color(key+'Color',name+' line color'),width(key+'Width',name+' line thickness'),opacity(key+'Opacity',name+' line opacity')];}),color('highFill','High to close fill'),color('lowFill','Close to low fill')],
 columns:[source,color('color','Up color'),field('upWidthPercent','Up thickness (% bar pitch)','number',{min:1,max:100,step:1}),opacity('upOpacity','Up opacity'),color('downColor','Down color'),field('downWidthPercent','Down thickness (% bar pitch)','number',{min:1,max:100,step:1}),opacity('downOpacity','Down opacity'),toggle('previousClose','Color based on previous close')],
 // High-low: drawBody, showBorders, showLabels, color, borderColor, labelColor.
 // LV addition: Color based on previous
 // close paints a bar whose close is below the previous close in Down color (body and border); off, every bar keeps Body color.
 highlow:[toggle('bodyVisible','Body'),color('color','Body color'),toggle('borderVisible','Borders'),color('borderColor','Border color'),toggle('labelsVisible','High and low price labels'),color('labelColor','Label color'),toggle('previousClose','Color based on previous close'),color('downColor','Down color')],
 hollow:body,volumecandles:[toggle('previousClose','Color based on previous close'),...body],
 bars:[toggle('previousClose','Color based on previous close'),toggle('openVisible','Opening price tick'),toggle('thinBars','Thin bars'),color('color','Up color'),color('downColor','Down color')],
 // HLC bars type (Bars color / Thin bars).
 hlcbars:[color('color','Color'),toggle('thinBars','Thin bars')],
 // Heikin Ashi keeps its own book entry (haStyle); Candles keep the workspace appearance.
 candles:[toggle('previousClose','Color based on previous close'),...body],heikinashi:[toggle('previousClose','Color based on previous close'),...body],
 // Derived (non-time) chart types (src/chart/derived/derived-settings.ts).
 ...Object.fromEntries(Object.entries(DERIVED_SETTING_FIELDS).map(([style,rows])=>[style,[...rows]])),
 // Time price opportunity (src/chart/tpo.ts; Schema).
 tpo:[...TPO_SETTING_FIELDS],
 // Session volume profile (src/chart/session-vp.ts).
 sessionvp:[...SVP_SETTING_FIELDS],
 // Volume footprint (src/chart/footprint.ts).
 footprint:[...FOOTPRINT_SETTING_FIELDS],
};
export function chartSettingsSchema(style:string){const controls=fields[style];if(!controls)throw new Error('This chart type has no available settings renderer');return {style,label:CHART_TYPES.find(row=>row[0]===style)?.[1]??style,fields:structuredClone(controls),sharedAppearance:style==='candles',unresolved:isDerivedStyle(style)?[...DERIVED_UNRESOLVED[style]]:style==='tpo'?[...TPO_UNRESOLVED]:style==='sessionvp'?[...SVP_UNRESOLVED]:style==='footprint'?[...FOOTPRINT_UNRESOLVED]:style==='heikinashi'?['Real prices on price scale moves the last price line and its price scale label to the raw close; the scale range stays fitted to the Heikin Ashi bars. Until Heikin Ashi colors are first saved they follow the candle appearance; the first save keeps them separate.']:['Reference defaults, exact widgets and dialog lifecycle are not independently compared.']};}
/** Factory values per style: the fact defaults where they exist (STYLE_FACT_DEFAULTS), LV values otherwise. */
export function settingsDefaults(style:string):Record<string,unknown>{const values:Record<string,unknown>={...LV_TEMPORAL_DEFAULTS,...LV_STYLE_FIELDS,...DERIVED_LV_FIELDS,...STYLE_FACT_DEFAULTS[style],...DERIVED_FACT_DEFAULTS[style],...DERIVED_INTERVAL_DEFAULTS[style],...(style==='tpo'?TPO_LV_DEFAULTS:style==='sessionvp'?SVP_LV_DEFAULTS:style==='footprint'?FOOTPRINT_LV_DEFAULTS:{})};return Object.fromEntries(chartSettingsSchema(style).fields.map(field=>[field.key,values[field.key]]));}
export const colorValid=supportedColor;
export function validateTypeSettings(style:string,patch:Record<string,unknown>){if(isDerivedStyle(style))return validateDerivedSettings(style,patch);const schema=chartSettingsSchema(style);for(const [key,value] of Object.entries(patch)){const field=schema.fields.find(field=>field.key===key);if(!field)throw new Error(`Setting is not supported by ${style}: ${key}`);if(field.kind==='boolean'&&typeof value!=='boolean'||field.kind==='color'&&!colorValid(value)||field.kind==='select'&&(!field.options?.includes(String(value))||typeof value!=='string')||field.kind==='list'&&(!Array.isArray(value)||value.length>500||!value.every(item=>typeof item==='number'&&Number.isFinite(item)))||field.kind==='number'&&(typeof value!=='number'||!Number.isFinite(value)||field.min!==undefined&&value<field.min||field.max!==undefined&&value>field.max))throw new Error(`Invalid ${field.label}`);}return structuredClone(patch);}
const appearanceMap:Record<string,string>={previousClose:'barColorsOnPrevClose',bodyVisible:'drawBody',color:'upColor',downColor:'downColor',borderVisible:'drawBorder',borderUpColor:'borderUpColor',borderDownColor:'borderDownColor',wickVisible:'drawWick',wickUpColor:'wickUpColor',wickDownColor:'wickDownColor'};
export function appearanceTypeSettings(settings:AppearanceSettings|null){const result:Record<string,unknown>={};for(const [key,value] of Object.entries(appearanceMap)){const actual=settings?.['mainSeriesProperties.candleStyle.'+value];if(actual!==undefined)result[key]=['previousClose','bodyVisible','borderVisible','wickVisible'].includes(key)?actual===true||actual===1||actual==='1':actual;}return result;}
export function appearanceWithTypeSettings(original:AppearanceSettings,patch:Record<string,unknown>):AppearanceSettings{const next={...original};for(const [key,value] of Object.entries(patch))next['mainSeriesProperties.candleStyle.'+appearanceMap[key]]=value as string|number|boolean;return next;}
/** Upgrades a saved type entry to the current structure (one stored truth): the line types' former "Gradient line"
 * boolean becomes the color mode (true -> gradient, false -> solid). Unknown keys are left for the caller to report. */
export function migrateTypeSettings(style:string,values:Record<string,unknown>):Record<string,unknown>{
 const next={...values};
 if(LINE_GRADIENT_STYLES.includes(style)&&Object.hasOwn(next,'gradient')){if(next.colorType===undefined&&typeof next.gradient==='boolean')next.colorType=next.gradient?'gradient':'solid';delete next.gradient;}
 return next;
}
/** Book styles applied with their defaults even when the book has no entry. Heikin Ashi is applied only when saved: without an
 * entry it inherits the candle appearance (adapter getChartSettings). Candles live in the appearance. */
const BOOK_DEFAULT_STYLES=()=>Object.keys(fields).filter(style=>style!=='candles'&&style!=='heikinashi');
export function validatedSettingsBook(book:ChartSettingsBook){if(!book||typeof book!=='object'||Array.isArray(book))throw new Error('Type settings must be an object');const retained=structuredClone(book),applicable:ChartSettingsBook=Object.fromEntries(BOOK_DEFAULT_STYLES().map(style=>[style,settingsDefaults(style)])),unavailable:string[]=[];for(const [style,raw] of Object.entries(book)){if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new Error('Invalid chart type settings');if(!fields[style]||style==='candles'){unavailable.push(style);continue;}const values=migrateTypeSettings(style,raw);const supported=Object.fromEntries(Object.entries(values).filter(([key])=>fields[style].some(field=>field.key===key)));if(LINE_GRADIENT_STYLES.includes(style)&&supported.colorType==='gradient'&&supported.gradientStartColor===undefined)supported.gradientStartColor=supported.color??settingsDefaults(style).color;validateTypeSettings(style,supported);applicable[style]={...(applicable[style]??settingsDefaults(style)),...supported};for(const key of Object.keys(values))if(!fields[style].some(field=>field.key===key))unavailable.push(`${style}.${key}`);}return{retained,applicable,unavailable};}
/** Heikin Ashi values (haStyle, separate from Candles): the saved book entry when there is one, otherwise the
 * current candle appearance, which a book without the entry inherits until Heikin Ashi is first saved. */
export function heikinAshiTypeSettings(saved:Record<string,unknown>|null|undefined,appearance:AppearanceSettings|null):Record<string,unknown>{return{...settingsDefaults('heikinashi'),...(saved??appearanceTypeSettings(appearance))};}
/** The candle appearance the renderer paints a style with: Heikin Ashi swaps in its own colors and previous-close choice. */
export function candleAppearanceForStyle(style:string,appearance:AppearanceSettings,heikinAshi:Record<string,unknown>):AppearanceSettings{return style==='heikinashi'?appearanceWithTypeSettings(appearance,heikinAshi):appearance;}
