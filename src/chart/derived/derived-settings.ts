// Settings rows for the derived chart types. Defaults live in chart-settings-style-defaults.ts
// (STYLE_FACT_DEFAULTS). Numeric bounds and the
// option lists marked LV below are OpenCandle settings, not reference facts. Input labels use
// LV wording: Box size method, ATR length, Box size,
// Percentage, Source, Wick, Reversal amount, Number of line, Range, Phantom bars.
import type {ChartSettingField} from '../chart-settings';
import {STEP_METHODS,type DerivedStyle} from './common';
import {DERIVED_INTERVAL_DEFAULTS,DERIVED_LV_FIELDS,themedStyleFactDefaults} from '../chart-settings-style-defaults';
import {supportedColor} from '../color-validation';

const f=(key:string,label:string,kind:ChartSettingField['kind'],extra:Partial<ChartSettingField>={}):ChartSettingField=>({key,label,kind,...extra});
const color=(key:string,label:string)=>f(key,label,'color');
const method=(key:string,label:string)=>f(key,label,'select',{options:[...STEP_METHODS]});
/** The box size method row on Renko, Kagi and Point & figure (ATR | Traditional | Percentage). The stored ids stay ATR / Traditional / Percentage. */
const BOX_METHOD_LABEL='Box size method';
const atrLength=f('atrLength','ATR length','number',{min:1,max:500,step:1});
const percentage=f('percentage','Percentage','number',{min:0.01,max:100,step:0.01});
const projection=[color('upProjectionColor','Up projection color'),color('downProjectionColor','Down projection color')];
const borderProjection=[color('borderUpProjectionColor','Up projection border color'),color('borderDownProjectionColor','Down projection border color')];

export const DERIVED_SETTING_FIELDS:Readonly<Record<DerivedStyle,readonly ChartSettingField[]>>=Object.freeze({
  renko:[method('boxMethod',BOX_METHOD_LABEL),atrLength,f('boxSize','Box size','number',{min:0.000001,max:1e9}),percentage,
    // LV option list: the fact gives only the default ("Close"); "ohlc" is the LV path approximation.
    f('source','Source','select',{options:['close','ohlc']}),f('wicks','Wick','boolean'),
    // LV additions; construction in renko.ts.
    f('basePrice','Base price (0 = first price)','number',{min:0,max:1e12}),f('oneStepBackBuilding','One step back building','boolean'),
    color('color','Up color'),color('downColor','Down color'),color('borderUpColor','Up border color'),color('borderDownColor','Down border color'),color('wickUpColor','Up wick color'),color('wickDownColor','Down wick color'),...projection,...borderProjection],
  kagi:[method('reversalMethod',BOX_METHOD_LABEL),atrLength,f('reversalAmount','Reversal amount','number',{min:0.000001,max:1e9}),percentage,
    // LV addition: a price source input. The default 'close' is the classic close-only construction; 'highlow' walks the OHLC path.
    f('source','Source','select',{options:['close','highlow']}),
    color('color','Up color'),color('downColor','Down color'),...projection],
  pointfigure:[method('boxMethod',BOX_METHOD_LABEL),atrLength,f('boxSize','Box size','number',{min:0.000001,max:1e9}),percentage,f('reversalAmount','Reversal amount','number',{min:1,max:100,step:1}),
    // LV option list: the fact gives only the default ("Close"); "highlow" is the LV high/low approximation.
    f('source','Source','select',{options:['close','highlow']}),
    // inputs.oneStepBackBuilding ("One step back building", default false); construction in pointfigure.ts.
    f('oneStepBackBuilding','One step back building','boolean'),
    color('color','Up color (X)'),color('downColor','Down color (O)'),...projection],
  linebreak:[f('lines','Number of lines','number',{min:1,max:100,step:1}),color('color','Up color'),color('downColor','Down color'),color('borderUpColor','Up border color'),color('borderDownColor','Down border color'),...projection,...borderProjection],
  range:[f('range','Range','number',{min:1,max:100000,step:1}),f('phantomBars','Phantom bars','boolean'),
    // LV option list: the fact gives only the default name (RangeBarStyle.Bars); its enum value is unresolved.
    f('rangeStyle','Bar style','select',{options:['bars','candles']}),f('thinBars','Thin bars','boolean'),
    color('color','Up color'),color('downColor','Down color'),...projection,
    // Range candles have Body, Borders and Wick colors with no toggles; borders and wicks always draw.
    color('candlesBorderUpColor','Up border color'),color('candlesBorderDownColor','Down border color'),
    color('candlesWickUpColor','Up wick color'),color('candlesWickDownColor','Down wick color'),
    color('candlesUpColor','Up candle color'),color('candlesDownColor','Down candle color')],
});
/** Calculation keys per style (the rest are presentation). */
export const DERIVED_CALCULATION_KEYS:Readonly<Record<DerivedStyle,readonly string[]>>=Object.freeze({
  renko:['boxMethod','atrLength','boxSize','percentage','source','wicks','basePrice','oneStepBackBuilding'],
  kagi:['reversalMethod','atrLength','reversalAmount','percentage','source'],
  pointfigure:['boxMethod','atrLength','boxSize','percentage','reversalAmount','source','oneStepBackBuilding'],
  linebreak:['lines'],
  range:['range','phantomBars'],
});
export function derivedCalculationSettings(style:DerivedStyle,values:Record<string,unknown>):Record<string,unknown>{return Object.fromEntries(DERIVED_CALCULATION_KEYS[style].map(key=>[key,values[key]]));}

/** Reference facts that are missing, shown in the settings dialog and the runtime report. */
export const DERIVED_UNRESOLVED:Readonly<Record<DerivedStyle,readonly string[]>>=Object.freeze({
  renko:['Base price and One step back building are OpenCandle additions: a base price anchors the brick grid, and one step back lets a reversal brick form one box from the last close.','The non-default source options, ATR evaluation point and tick rounding of the brick size are OpenCandle construction choices.'],
  kagi:['Kagi price source is an OpenCandle addition: it defaults to closes and offers a high/low option that walks the OHLC path.','Line thickness for yang and yin segments is an OpenCandle choice.'],
  pointfigure:['One step back building is off by default; the OpenCandle construction starts the reversal column in the row of the previous extreme.','Box grid anchor, the box row rule and the high/low source option are OpenCandle construction choices.'],
  linebreak:['Projection line semantics are OpenCandle: a line completed by a still-forming source bar is shown in projection colors.'],
  range:['The range size is set through the interval (for example 100R) and is read as instrument ticks; Range bars are built from the loaded time bars, not ticks; the bar-style enum value, border and wick defaults and gap handling are OpenCandle choices.'],
});

/** Factory values for a derived style: the fact table (light, or dark projection colors) plus declared LV fields. */
export function derivedSettingsDefaults(style:DerivedStyle,theme:'light'|'dark'='light'):Record<string,unknown>{
  const values={...DERIVED_LV_FIELDS,...themedStyleFactDefaults(style,theme),...DERIVED_INTERVAL_DEFAULTS[style]};
  return Object.fromEntries(DERIVED_SETTING_FIELDS[style].map(field=>[field.key,values[field.key]]));
}
/** Same acceptance rule as chart-settings validateTypeSettings, plus whole numbers where the field step is 1. */
export function validateDerivedSettings(style:DerivedStyle,patch:Record<string,unknown>):Record<string,unknown>{
  for(const [key,value] of Object.entries(patch)){
    const field=DERIVED_SETTING_FIELDS[style].find(row=>row.key===key);
    if(!field)throw new Error(`Setting is not supported by ${style}: ${key}`);
    const bad=field.kind==='boolean'?typeof value!=='boolean':field.kind==='color'?!supportedColor(value):field.kind==='select'?typeof value!=='string'||!field.options?.includes(value):typeof value!=='number'||!Number.isFinite(value)||field.min!==undefined&&value<field.min||field.max!==undefined&&value>field.max||field.step===1&&!Number.isInteger(value);
    if(bad)throw new Error(`Invalid ${field.label}`);
  }
  return structuredClone(patch);
}
